"""Fit normalized element boxes to an image aspect, without editing prompts."""
import copy
import json
import math
import re

from .model import number, from_grid, backdrop_row, pixels_from_rows


def fit_box_aspect(elements, image_width, image_height, canvas_width, canvas_height):
    """Keep top/left/width; set pixel height to pixel width * image H/W.

    Elements use [ymin, xmin, ymax, xmax] on the native 0..1000 scale.
    The lower edge is clipped to the canvas. Input metadata is deep-copied.
    """
    dimensions = [number(v) for v in (image_width, image_height, canvas_width, canvas_height)]
    if any(v <= 0 for v in dimensions):
        raise ValueError("Image and canvas dimensions must be positive.")
    image_width, image_height, canvas_width, canvas_height = dimensions
    if isinstance(elements, str):
        try:
            elements = json.loads(elements)
        except json.JSONDecodeError as exc:
            raise ValueError(f"elements is invalid JSON: {exc}") from exc
    if not isinstance(elements, (list, tuple)):
        raise ValueError("elements must be a FontBox elements array or its JSON string.")
    if elements and any(isinstance(e, dict) and ("src_bbox" in e or "tgt_bbox" in e) for e in elements):
        fitted, seen = [], set()
        for row in elements:
            if not isinstance(row, dict) or "src_bbox" not in row or "tgt_bbox" not in row:
                raise ValueError("Do not mix edit rows and legacy boxes.")
            if not isinstance(row.get("id"), str) or row["id"] in seen:
                raise ValueError("Editing rows need unique string IDs.")
            seen.add(row["id"])
            if row["id"] == "obj_1":
                continue
            for key in ("src_bbox", "tgt_bbox"):
                if row[key] is not None:
                    from_grid(row[key])
            if row.get("from") is None and (row["src_bbox"] is not None or row["tgt_bbox"] is None):
                raise ValueError("New rows need a target and no source.")
            if row.get("from") is not None and row["src_bbox"] is None:
                raise ValueError("Reference rows need a source.")
            if row.get("from") is not None and not re.fullmatch(r"ref_image_\d+", str(row["from"])):
                raise ValueError("Reference rows need ref_image_N.")
            out = copy.deepcopy(row)
            if row["tgt_bbox"] is not None and (row.get("from") is None or row["src_bbox"] != row["tgt_bbox"]):
                y1, x1, _, x2 = row["tgt_bbox"]
                height = (x2-x1)*(canvas_width/canvas_height)*(image_height/image_width)
                out["tgt_bbox"] = [y1, x1, min(1000, max(y1+1, math.floor(y1+height+.5))), x2]
            fitted.append(out)
        fitted.append(backdrop_row())
        return fitted, pixels_from_rows(fitted, int(canvas_width), int(canvas_height))
    result, pixels = [], []
    for index, element in enumerate(elements):
        if not isinstance(element, dict):
            raise ValueError(f"Element {index + 1} must be an object.")
        bbox = element.get("bbox")
        if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
            raise ValueError(f"Element {index + 1} bbox must be [ymin, xmin, ymax, xmax].")
        y1, x1, y2, x2 = [number(v) for v in bbox]
        if not (0 <= y1 <= y2 <= 1000 and 0 <= x1 <= x2 <= 1000):
            raise ValueError(f"Element {index + 1} bbox must be ordered and within 0..1000.")
        if y2 <= y1 or x2 <= x1:
            continue
        y1, x1, x2 = round(y1), round(x1), round(x2)
        if y1 >= 1000 or x2 <= x1:
            continue
        height = (x2 - x1) * (canvas_width / canvas_height) * (image_height / image_width)
        bottom = min(1000, max(y1 + 1, round(y1 + height)))
        fitted = copy.deepcopy(element)
        fitted["bbox"] = [y1, x1, bottom, x2]
        result.append(fitted)
        # Cover fractional edge pixels so a valid, thin region still has a mask.
        px1, py1 = math.floor(x1 * canvas_width / 1000), math.floor(y1 * canvas_height / 1000)
        px2, py2 = math.ceil(x2 * canvas_width / 1000), math.ceil(bottom * canvas_height / 1000)
        pixels.append({"x": px1, "y": py1, "width": px2 - px1, "height": py2 - py1,
                       "metadata": {"type": fitted.get("type", "obj"),
                                    "desc": fitted.get("desc", ""), "text": fitted.get("text", "")}})
    return result, [pixels] if pixels else []
