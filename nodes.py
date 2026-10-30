import json
import math

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont

from .model import EMPTY_STATE, outputs, resolve_state, instruction, complete_prompt, elements as edit_rows, assign_ids, incoming_boxes
from .aspect import fit_box_aspect


class AnyInput(str):
    """Standard ComfyUI wildcard socket; the parser validates the actual value."""
    def __ne__(self, other):
        return False


def _font(size):
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size)
    except OSError:
        try:
            return ImageFont.load_default(size=size)
        except TypeError:
            return ImageFont.load_default()


def render_arrays(box_frames, backgrounds):
    """Return a full-canvas binary union mask and RGB preview for every frame."""
    batch, height, width, _ = backgrounds.shape
    mask = np.zeros((batch, height, width), dtype=np.float32)
    previews = []
    font = _font(max(12, min(32, round(height / 55))))
    colors = ["#79c8ff", "#ffbd73", "#bc9bff", "#7ee0b8", "#ff90b5"]
    identities = list(dict.fromkeys(b["metadata"].get("id", f"legacy-{i}") for i, b in enumerate(box_frames[0] if box_frames else [])))
    for background in backgrounds:
        image = Image.fromarray(np.uint8(np.clip(background, 0, 1) * 255), "RGB")
        draw = ImageDraw.Draw(image)
        for i, box in enumerate(box_frames[0] if box_frames else []):
            x, y, w, h = [box[k] for k in ("x", "y", "width", "height")]
            mask[:, y:y+h, x:x+w] = 1.0
            color = colors[identities.index(box["metadata"].get("id", f"legacy-{i}")) % len(colors)]
            if box["metadata"].get("part") == "source":
                for start in range(0, w, 10):
                    for yy in (y, y+h-1):
                        draw.line((x+start, yy, x+min(start+5, w-1), yy), fill=color, width=2)
                for start in range(0, h, 10):
                    for xx in (x, x+w-1):
                        draw.line((xx, y+start, xx, y+min(start+5, h-1)), fill=color, width=2)
            else:
                draw.rectangle((x, y, x+w-1, y+h-1), outline=color, width=max(1, width // 500))
            body = str(box["metadata"]["desc"])
            # Clip labels to the box; very small boxes still get an outline.
            if w > 12 and h > 12:
                label = Image.new("RGBA", (w, h), (0, 0, 0, 0))
                ld = ImageDraw.Draw(label)
                line, lines = "", []
                for char in body:
                    if char == "\n" or (line and ld.textlength(line + char, font=font) > w - 8):
                        lines.append(line)
                        line = "" if char == "\n" else char
                    else:
                        line += char
                lines.append(line)
                step = getattr(font, "size", 14) + 4
                for j, line in enumerate(lines[:max(1, h // step)]):
                    ld.text((4, 2+j*step), line, font=font, fill="white", stroke_width=1,
                            stroke_fill="black")
                image.paste(label, (x, y), label)
        pairs = {}
        for b in box_frames[0] if box_frames else []:
            if b["metadata"].get("action") == "move":
                pairs.setdefault(b["metadata"]["id"], {})[b["metadata"].get("part")] = b
        for pair in pairs.values():
            if "source" not in pair or "target" not in pair:
                continue
            a, b = pair["source"], pair["target"]
            start = (a["x"]+a["width"]/2, a["y"]+a["height"]/2)
            end = (b["x"]+b["width"]/2, b["y"]+b["height"]/2)
            angle = math.atan2(end[1]-start[1], end[0]-start[0])
            draw.line((start, end), fill="#79c8ff", width=2)
            draw.polygon((end, (end[0]-8*math.cos(angle-.5), end[1]-8*math.sin(angle-.5)),
                          (end[0]-8*math.cos(angle+.5), end[1]-8*math.sin(angle+.5))), fill="#79c8ff")
        previews.append(np.asarray(image, dtype=np.float32) / 255.0)
    return mask, np.stack(previews)


class FontBox:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "width": ("INT", {"default": 1024, "min": 64, "max": 16384, "step": 1,
                              "tooltip": "Canvas width without a background. Background dimensions take priority."}),
            "height": ("INT", {"default": 1024, "min": 64, "max": 16384, "step": 1}),
            "editor_state": ("LORA_BBOX_EDITOR", {"default": json.dumps(EMPTY_STATE)}),
        }, "optional": {
            "background": ("IMAGE",),
            "bboxes": (AnyInput("*"), {"tooltip": "Native BOUNDING_BOX, ARRAY elements, or JSON string. Queue once to synchronize."}),
        }}

    RETURN_TYPES = ("ARRAY", "BOUNDING_BOX", "MASK", "IMAGE", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("elements", "bbox", "mask", "preview", "prompt", "instruction", "elements_json")
    FUNCTION = "execute"
    CATEGORY = "FontBox"
    DESCRIPTION = "Draw FLUX 3 text-edit regions and compile instructions, editing rows, masks and previews."
    OUTPUT_NODE = True

    def execute(self, width=1024, height=1024, editor_state=None, background=None, bboxes=None):
        if background is not None:
            if background.ndim != 4 or background.shape[0] < 1 or background.shape[-1] not in (1, 3, 4):
                raise ValueError("background must be a nonempty ComfyUI IMAGE batch (BHWC).")
            height, width = int(background.shape[1]), int(background.shape[2])
            array = background.detach().cpu().float().numpy()
            if array.shape[-1] == 1:
                array = np.repeat(array, 3, axis=-1)
            elif array.shape[-1] == 4:
                array = array[..., :3] * array[..., 3:4] + (1-array[..., 3:4])
        else:
            width, height = int(width), int(height)
            if not (64 <= width <= 16384 and 64 <= height <= 16384):
                raise ValueError("Canvas width and height must be between 64 and 16384.")
            array = np.full((1, height, width, 3), 0.16, dtype=np.float32)
        state = resolve_state(editor_state, bboxes, width, height)
        elements, pixels = outputs(state["boxes"], width, height)
        mask, preview = render_arrays(pixels, array)
        ui = {"lora_bbox_state": [state], "lora_bbox_dims": [width, height],
              "background_images": []}
        if background is not None:
            # Use ComfyUI's own temporary image writer and authenticated /view API.
            from nodes import PreviewImage
            ui["background_images"] = PreviewImage().save_images(
                torch.from_numpy(np.ascontiguousarray(array[:1])), "lora_bbox_background"
            )["ui"]["images"]
        text = instruction(state["boxes"])
        return {"ui": ui, "result": (elements, pixels, torch.from_numpy(mask), torch.from_numpy(preview),
                                     complete_prompt(text, elements), text, json.dumps(elements, ensure_ascii=False, indent=2))}


class FontBoxFitBoxAspect:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "elements": (AnyInput("*"), {"tooltip": "Connect FontBox elements, or supply an elements JSON string."}),
            "image": ("IMAGE", {"tooltip": "Image whose width-to-height ratio the boxes should match. Only its dimensions are used."}),
            "canvas_width": ("INT", {"default": 1024, "min": 1, "max": 16384,
                                      "tooltip": "Original FontBox canvas width. The optional canvas image overrides this."}),
            "canvas_height": ("INT", {"default": 1024, "min": 1, "max": 16384,
                                       "tooltip": "Original FontBox canvas height. The optional canvas image overrides this."}),
        }, "optional": {
            "canvas": ("IMAGE", {"tooltip": "Original FontBox background. Supplies the original dimensions and the preview background."}),
            "instruction": ("STRING", {"forceInput": True}),
        }}

    RETURN_TYPES = ("ARRAY", "BOUNDING_BOX", "MASK", "IMAGE", "STRING", "STRING")
    RETURN_NAMES = ("elements", "bbox", "mask", "preview", "elements_json", "prompt")
    FUNCTION = "execute"
    CATEGORY = "FontBox"
    DESCRIPTION = ("Keep each element's top-left corner and width; adjust its height to match the input image's aspect ratio. "
                   "Coordinates stay relative to the original canvas. Bottom overflow is clipped; prompts are preserved.")

    def execute(self, elements, image, canvas_width=1024, canvas_height=1024, canvas=None, instruction=""):
        def validate_image(value, name):
            if value.ndim != 4 or min(value.shape[:3]) < 1 or value.shape[-1] not in (1, 3, 4):
                raise ValueError(f"{name} must be a nonempty ComfyUI IMAGE batch (BHWC).")

        validate_image(image, "image")
        if canvas is not None:
            validate_image(canvas, "canvas")
            canvas_height, canvas_width = int(canvas.shape[1]), int(canvas.shape[2])
            array = canvas.detach().cpu().float().numpy()
            if array.shape[-1] == 1:
                array = np.repeat(array, 3, axis=-1)
            elif array.shape[-1] == 4:
                array = array[..., :3] * array[..., 3:4] + (1-array[..., 3:4])
        else:
            canvas_width, canvas_height = int(canvas_width), int(canvas_height)
            if not (1 <= canvas_width <= 16384 and 1 <= canvas_height <= 16384):
                raise ValueError("Canvas width and height must be between 1 and 16384.")
            array = np.full((1, canvas_height, canvas_width, 3), 0.16, dtype=np.float32)
        fitted, pixels = fit_box_aspect(elements, int(image.shape[2]), int(image.shape[1]),
                                       canvas_width, canvas_height)
        mask, preview = render_arrays(pixels, array)
        rows = fitted if fitted and "tgt_bbox" in fitted[0] else edit_rows(assign_ids({"boxes": incoming_boxes(fitted, canvas_width, canvas_height)})["boxes"])
        return (fitted, pixels, torch.from_numpy(mask), torch.from_numpy(preview),
                json.dumps(fitted, ensure_ascii=False, indent=2), complete_prompt(instruction or "In <ref_image_0>, apply the edits described by the rows.", rows))


# Compatibility for scripts that imported the previous Python class directly.
LoRABoundingBoxEditor = FontBox
