"""Editable state and FLUX 3 instruction/row compiler."""
import copy
import hashlib
import json
import math
import re

EMPTY_STATE = {"version": 2, "revision": 0, "boxes": [], "guides": [], "next_object_id": 2, "incoming_signature": None}
MODES = {"plain", "change", "bold", "italic", "move", "size", "vertical", "tracking"}
ACTIONS = {"new", "keep", "move", "remove"}
ALIGNMENTS = {"left": "Left align.", "center": "Center align.", "right": "Right align."}
PRESERVE = "Keep the rest of the image completely unchanged, preserving the backdrop, art, and all other text <obj_1>."
FULL = [0, 0, 1000, 1000]


def number(value):
    try:
        result = float(value)
    except (ValueError, TypeError) as exc:
        raise ValueError("Coordinates must be numbers.") from exc
    if not math.isfinite(result):
        raise ValueError("Coordinates must be finite.")
    return result


def clamp(value):
    return max(0., min(1., value))


def geometry(box):
    if not isinstance(box, dict):
        raise ValueError("A box must be an object.")
    x, y, w, h = (number(box.get(k, 0)) for k in ("x", "y", "w", "h"))
    x1, x2 = sorted((clamp(x), clamp(x+w)))
    y1, y2 = sorted((clamp(y), clamp(y+h)))
    return {"x": x1, "y": y1, "w": x2-x1, "h": y2-y1}


def grid(box):
    return [math.floor(clamp(v)*1000+.5) for v in (box["y"], box["x"], box["y"]+box["h"], box["x"]+box["w"])]


def from_grid(value):
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ValueError("bbox must be [top, left, bottom, right].")
    y1, x1, y2, x2 = map(number, value)
    if not (0 <= y1 < y2 <= 1000 and 0 <= x1 < x2 <= 1000):
        raise ValueError("Box coordinates must be nonempty, ordered and within 0..1000.")
    return geometry({"x": x1/1000, "y": y1/1000, "w": (x2-x1)/1000, "h": (y2-y1)/1000})


def clean_box(box, index=0):
    result = geometry(box)
    mode = box.get("mode") if box.get("mode") in MODES else "plain"
    action = box.get("action") if box.get("action") in ACTIONS else ("move" if mode == "move" else "new")
    result.update(id=str(box.get("id", f"box-{index}")), object_id=box.get("object_id"),
                  origin="input" if box.get("origin") == "input" else "local", type="text" if box.get("type") == "text" else "obj",
                  mode=mode, action=action, align=box.get("align") if action == "new" and mode in ("plain", "change") and box.get("align") in ALIGNMENTS else None,
                  reference=box.get("reference") if re.fullmatch(r"ref_image_\d+", str(box.get("reference", ""))) else "ref_image_0")
    for key in ("content", "source", "replacement", "text", "free_instruction", "extra_instruction"):
        result[key] = str(box.get(key, "") or "")
    result["src"] = geometry(box.get("src") or result) if action == "move" else None
    if action in ("keep", "remove"):
        if mode == "change":
            result["content"] = result["source"] or result["replacement"]
        result.update(mode="plain", align=None)
    return result


def clean_guides(guides):
    if guides is None:
        return []
    if not isinstance(guides, list):
        raise ValueError("Editor guides must be an array.")
    result, ids = [], set()
    for i, g in enumerate(guides):
        if not isinstance(g, dict) or g.get("axis") not in ("x", "y"):
            raise ValueError("Each guide needs axis x or y.")
        pos = number(g.get("position"))
        if not 0 <= pos <= 1:
            raise ValueError("Guide position must be within 0..1.")
        identity = str(g.get("id", f"guide-{i}"))
        while identity in ids:
            identity += "-copy"
        ids.add(identity)
        result.append({"id": identity, "axis": g["axis"], "position": pos})
    return result


def assign_ids(state):
    previous = [b.get("object_id") for b in state["boxes"]]
    mapping = {}
    for i, b in enumerate(state["boxes"]):
        b["object_id"] = f"obj_{i+2}"
        if isinstance(previous[i], str) and previous[i] != "obj_1":
            mapping.setdefault(previous[i], b["object_id"])
    for i, b in enumerate(state["boxes"]):
        own = dict(mapping)
        if isinstance(previous[i], str) and previous[i] != "obj_1":
            own[previous[i]] = b["object_id"]
        for key in ("free_instruction", "extra_instruction"):
            b[key] = re.sub(r"<obj_\d+>", lambda m: f'<{own[m[0][1:-1]]}>' if m[0][1:-1] in own else m[0], b.get(key, ""))
    state["next_object_id"] = len(state["boxes"])+2
    return state


def result_text(box):
    return box.get("replacement", "") if box.get("mode") == "change" and box.get("action") not in ("keep", "remove") else box.get("content", "")


def is_backdrop(box):
    return grid(box) == FULL and result_text(box).strip().rstrip(".").lower() == "backdrop"


def parse_state(value):
    if isinstance(value, str):
        try:
            value = json.loads(value or "{}")
        except json.JSONDecodeError as exc:
            raise ValueError(f"Editor state is invalid JSON: {exc}") from exc
    value = value or {}
    if not isinstance(value, dict) or value.get("version", 1) not in (1, 2) or not isinstance(value.get("boxes", []), list):
        raise ValueError("Expected editor state version 1 or 2 with a boxes array.")
    boxes = [clean_box(b, i) for i, b in enumerate(value.get("boxes", []))]
    return assign_ids({**copy.deepcopy(EMPTY_STATE), "revision": int(value.get("revision", 0)), "incoming_signature": value.get("incoming_signature"),
                       "boxes": [b for b in boxes if not is_backdrop(b)], "guides": clean_guides(value.get("guides"))})


def prompt(box):
    tag, ref = f'<{box.get("object_id") or "obj_2"}>', f'<{box.get("reference", "ref_image_0")}>'
    text = json.dumps(result_text(box), ensure_ascii=False)
    action, mode = box.get("action", "new"), box.get("mode", "plain")
    other = "and preserve its font family, colors, and all other styling."
    if action == "keep":
        body = f'keep {text} {tag} exactly unchanged.'
    elif action == "remove":
        body = f'remove {text} {tag} from its source box and reconstruct the area it occupied.'
    elif action == "move":
        body = f'move the text {text} {tag} from its source box to its target box, {other}'
    elif mode == "change":
        original = json.dumps(box.get("source", ""), ensure_ascii=False)
        align = f' and {box["align"]} align it' if box.get("align") in ALIGNMENTS else ""
        body = f'change the text {original} {tag} to {text}{align}, and maintain the exact font typographic style, character spacing, colors, and style.'
    elif mode in ("bold", "italic", "size", "vertical", "tracking"):
        command = {"bold": "bold", "italic": "italicize", "size": "adjust the size of", "vertical": "adjust the vertical scale of", "tracking": "adjust tracking of"}[mode]
        fit = " to fit its target box" if mode in ("size", "vertical", "tracking") else ""
        body = f'{command} the text {text} {tag}{fit}, {other}'
    else:
        custom = box.get("free_instruction", "").replace(PRESERVE, "").strip().rstrip(".")
        body = f'{custom} {tag}.' if custom else f'place the text {text} {tag} in its target box.'
        if box.get("align") in ALIGNMENTS:
            body = body.rstrip(".")+f' and {box["align"]} align it.'
    return f'In {ref}, {body}'


def backdrop_row():
    return {"id": "obj_1", "from": "ref_image_0", "src_bbox": FULL.copy(), "tgt_bbox": FULL.copy(), "desc": "backdrop"}


def elements(boxes):
    rows = []
    for b in boxes:
        tgt, action = grid(b), b.get("action", "new")
        if tgt[0] >= tgt[2] or tgt[1] >= tgt[3]:
            continue
        src = grid(b.get("src") or b) if action == "move" else tgt
        if src[0] >= src[2] or src[1] >= src[3]:
            raise ValueError("Move source must have a nonzero area on the 0..1000 grid.")
        rows.append({"id": b["object_id"], "from": None if action == "new" else b.get("reference", "ref_image_0"),
                     "src_bbox": None if action == "new" else src, "tgt_bbox": None if action == "remove" else tgt, "desc": result_text(b)})
    return rows+[backdrop_row()]


def instruction(boxes):
    ids = {r["id"] for r in elements(boxes) if r["id"] != "obj_1"}
    parts = []
    for b in boxes:
        if b["object_id"] in ids:
            parts.append(prompt(b))
            extra = b.get("extra_instruction", "").strip()
            if extra:
                parts.append(extra)
    return " ".join(parts+[PRESERVE])


def complete_prompt(text, rows):
    text = str(text or "").strip()
    if text.endswith(PRESERVE):
        text = text[:-len(PRESERVE)].rstrip()
    return (text+" " if text else "")+PRESERVE+" "+json.dumps(rows, ensure_ascii=False, separators=(",", ":"))


def pixels_from_rows(rows, width, height):
    result = []
    for r in rows:
        src, tgt = r.get("src_bbox"), r.get("tgt_bbox")
        if r["id"] == "obj_1" or (r.get("from") is not None and src == tgt):
            continue
        regions = [("target", tgt)] if src is None else [("source", src)] if tgt is None else [("source", src), ("target", tgt)]
        for part, value in regions:
            y1, x1, y2, x2 = value
            x, y = math.floor(x1*width/1000), math.floor(y1*height/1000)
            right, bottom = math.ceil(x2*width/1000), math.ceil(y2*height/1000)
            result.append({"x": x, "y": y, "width": right-x, "height": bottom-y,
                           "metadata": {"id": r["id"], "desc": r["desc"], "part": part, "flux_row": copy.deepcopy(r),
                                        "action": "new" if src is None else "remove" if tgt is None else "move"}})
    return [result] if result else []


def outputs(boxes, width, height):
    rows = elements(boxes)
    return rows, pixels_from_rows(rows, width, height)


def decode_description(value):
    body, align = str(value or "").strip(), None
    for key, suffix in ALIGNMENTS.items():
        if body.endswith(suffix):
            align, body = key, body[:-len(suffix)].rstrip()
            break
    result = {"mode": "plain", "content": body, "align": align}
    for mode, pattern in (("bold", r'Bold the text "(.*)"\s*\.'), ("italic", r'Italicize "(.*)"\.'), ("italic", r'Italicize (.*)\.'),
                          ("move", r'Move "(.*)" to here\.'), ("size", r'Adjust the size of "(.*)"\.?'), ("vertical", r'Adjust the vertical scale of "(.*)"\.?'),
                          ("tracking", r'Adjust tracking of "(.*)"\.?')):
        match = re.fullmatch(pattern, body, re.DOTALL)
        if match:
            return {**result, "mode": mode, "content": match[1]}
    match = re.fullmatch(r'Change "(.*)" to "(.*)"\.', body, re.DOTALL)
    return {**result, "mode": "change", "content": "", "source": match[1], "replacement": match[2]} if match else result


def incoming_boxes(data, width, height):
    if data is None or data == "":
        return []
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError as exc:
            raise ValueError(f"bboxes is invalid JSON: {exc}") from exc
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, (list, tuple)):
        raise ValueError("Expected native boxes, elements or FLUX editing rows.")
    if data and isinstance(data[0], (list, tuple)):
        data = data[0]
    expanded, seen = [], set()
    for item in data:
        meta = item.get("metadata") if isinstance(item, dict) else None
        row = meta.get("flux_row") if isinstance(meta, dict) else None
        if isinstance(row, dict):
            if row.get("id") in seen:
                continue
            seen.add(row.get("id"));expanded.append(row)
        else:
            expanded.append(item)
    result = []
    for i, item in enumerate(expanded):
        if not isinstance(item, dict):
            raise ValueError("Every box must be an object.")
        if item.get("id") == "obj_1":
            continue
        if "src_bbox" in item or "tgt_bbox" in item:
            src, tgt, ref = item.get("src_bbox"), item.get("tgt_bbox"), item.get("from")
            if ref is None:
                if src is not None or tgt is None:
                    raise ValueError("New rows need a target and no source.")
                action = "new"
            else:
                if src is None or not re.fullmatch(r"ref_image_\d+", str(ref)):
                    raise ValueError("Reference rows need a source box and ref_image_N.")
                action = "remove" if tgt is None else "keep" if tgt == src else "move"
            g = from_grid(tgt if tgt is not None else src)
            meta = {"action": action, "mode": "move" if action == "move" else "plain", "content": str(item.get("desc", "")),
                    "reference": ref or "ref_image_0", "object_id": item.get("id"), "src": from_grid(src) if action == "move" else None}
        elif "bbox" in item:
            g = from_grid(item["bbox"])
            meta = {**decode_description(item.get("desc", "")), "object_id": item.get("id"), "type": item.get("type"), "text": item.get("text", "")}
        elif all(k in item for k in ("x", "y", "width", "height")):
            g = geometry({"x": number(item["x"])/width, "y": number(item["y"])/height, "w": number(item["width"])/width, "h": number(item["height"])/height})
            meta = decode_description((item.get("metadata") or {}).get("desc", ""))
        else:
            raise ValueError("Box has no supported coordinates.")
        b = clean_box({**g, **meta, "id": f"input-{i}", "origin": "input"}, i)
        if not is_backdrop(b):
            result.append(b)
    return result


def resolve_state(editor_state, bboxes, width, height):
    state = parse_state(editor_state)
    incoming = incoming_boxes(bboxes, width, height)
    signature = hashlib.sha256(json.dumps(incoming, sort_keys=True, ensure_ascii=False).encode()).hexdigest() if bboxes is not None else None
    if signature != state["incoming_signature"]:
        state["boxes"] = [b for b in state["boxes"] if b["origin"] != "input"]+incoming
        state["incoming_signature"] = signature
    return assign_ids(state)
