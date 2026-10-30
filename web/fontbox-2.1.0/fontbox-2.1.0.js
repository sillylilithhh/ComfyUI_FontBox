// FontBox 2.1.0: self-contained frontend and embedded styles.

// ComfyUI-FontBox/frontend/comfy.js
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// ComfyUI-FontBox/frontend/model.js
var EMPTY = { version: 2, revision: 0, boxes: [], guides: [], next_object_id: 2, incoming_signature: null };
var ALIGN = { left: "Left align.", center: "Center align.", right: "Right align." };
var MODES = ["plain", "change", "bold", "italic", "move", "size", "vertical", "tracking"];
var ACTIONS = ["new", "keep", "move", "remove"];
var PRESERVE = "Keep the rest of the image completely unchanged, preserving the backdrop, art, and all other text <obj_1>.";
var clone = (v) => JSON.parse(JSON.stringify(v));
var clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
var uid = () => {
  var _a, _b, _c;
  return (_c = (_b = (_a = globalThis.crypto) == null ? void 0 : _a.randomUUID) == null ? void 0 : _b.call(_a)) != null ? _c : `box-${Date.now()}-${Math.random()}`;
};
var supportsAlignment = (mode) => mode === "plain" || mode === "change";
var grid = (b) => [b.y, b.x, b.y + b.h, b.x + b.w].map((v) => Math.round(clamp(v) * 1e3));
var resultText = (b) => b.mode === "change" && !["keep", "remove"].includes(b.action) ? b.replacement || "" : b.content || "";
function geometry(b) {
  if (!b || typeof b !== "object") throw new Error("A box must be an object.");
  const [x, y, w, h] = ["x", "y", "w", "h"].map((k) => {
    var _a;
    return Number((_a = b[k]) != null ? _a : 0);
  });
  if (![x, y, w, h].every(Number.isFinite)) throw new Error("Coordinates must be finite.");
  const [x1, x2] = [clamp(x), clamp(x + w)].sort((a, b2) => a - b2), [y1, y2] = [clamp(y), clamp(y + h)].sort((a, b2) => a - b2);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
function fromGrid(v) {
  if (!Array.isArray(v) || v.length !== 4) throw new Error("bbox must be [top,left,bottom,right].");
  const [y1, x1, y2, x2] = v.map(Number);
  if (![y1, x1, y2, x2].every(Number.isFinite) || !(0 <= y1 && y1 < y2 && y2 <= 1e3 && 0 <= x1 && x1 < x2 && x2 <= 1e3)) throw new Error("Box must be nonempty, ordered and within 0..1000.");
  return geometry({ x: x1 / 1e3, y: y1 / 1e3, w: (x2 - x1) / 1e3, h: (y2 - y1) / 1e3 });
}
function cleanBox(b, i = 0) {
  var _a;
  const g = geometry(b), mode = MODES.includes(b.mode) ? b.mode : "plain", action = ACTIONS.includes(b.action) ? b.action : mode === "move" ? "move" : "new";
  const r = { ...g, id: String((_a = b.id) != null ? _a : `box-${i}`), object_id: b.object_id || null, origin: b.origin === "input" ? "input" : "local", type: b.type === "text" ? "text" : "obj", mode, action, align: action === "new" && supportsAlignment(mode) && ALIGN[b.align] ? b.align : null, reference: /^ref_image_\d+$/.test(b.reference || "") ? b.reference : "ref_image_0" };
  for (const key of ["content", "source", "replacement", "text", "free_instruction", "extra_instruction"]) r[key] = String(b[key] || "");
  r.src = action === "move" ? geometry(b.src || g) : null;
  if (["keep", "remove"].includes(action)) {
    if (mode === "change") r.content = r.source || r.replacement;
    r.mode = "plain";
    r.align = null;
  }
  return r;
}
function cleanGuides(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error("Guides must be an array.");
  const ids = /* @__PURE__ */ new Set();
  return value.map((g, i) => {
    var _a;
    const position = Number(g == null ? void 0 : g.position);
    if (!["x", "y"].includes(g == null ? void 0 : g.axis) || g.position == null || !Number.isFinite(position) || position < 0 || position > 1) throw new Error("Invalid guide.");
    let id = String((_a = g.id) != null ? _a : `guide-${i}`);
    while (ids.has(id)) id += "-copy";
    ids.add(id);
    return { id, axis: g.axis, position };
  });
}
function assignIds(state) {
  const old = state.boxes.map((b) => b.object_id), map = /* @__PURE__ */ new Map();
  state.boxes.forEach((b, i) => {
    b.object_id = `obj_${i + 2}`;
    if (typeof old[i] === "string" && old[i] !== "obj_1" && !map.has(old[i])) map.set(old[i], b.object_id);
  });
  state.boxes.forEach((b, i) => {
    const own = new Map(map);
    if (typeof old[i] === "string" && old[i] !== "obj_1") own.set(old[i], b.object_id);
    for (const key of ["free_instruction", "extra_instruction"]) b[key] = (b[key] || "").replace(/<obj_\d+>/g, (t) => own.has(t.slice(1, -1)) ? `<${own.get(t.slice(1, -1))}>` : t);
  });
  state.next_object_id = state.boxes.length + 2;
  return state;
}
var allocateId = (s) => {
  assignIds(s);
  return `obj_${s.next_object_id++}`;
};
var isBackdrop = (b) => JSON.stringify(grid(b)) === "[0,0,1000,1000]" && resultText(b).trim().replace(/\.$/, "").toLowerCase() === "backdrop";
function parseState(value) {
  var _a, _b;
  const d = typeof value === "string" ? JSON.parse(value || "{}") : value || {};
  if (!d || Array.isArray(d) || typeof d !== "object" || ![1, 2].includes((_a = d.version) != null ? _a : 1) || !Array.isArray((_b = d.boxes) != null ? _b : [])) throw new Error("Expected editor state version 1 or 2.");
  return assignIds({ ...clone(EMPTY), ...d, version: 2, boxes: (d.boxes || []).map(cleanBox).filter((b) => !isBackdrop(b)), guides: cleanGuides(d.guides) });
}
function setMode(b, mode) {
  const text = b.mode === "change" ? b.replacement || b.source : b.content || "";
  if (b.mode !== mode) {
    b.content = mode === "change" ? "" : text;
    b.source = mode === "change" ? text : "";
    b.replacement = "";
    b.free_instruction = "";
  }
  b.mode = mode;
  b.action = mode === "move" ? "move" : "new";
  b.src = mode === "move" ? b.src || geometry(b) : null;
  if (!supportsAlignment(mode)) b.align = null;
  else if (mode === "change" && !b.align) b.align = "left";
}
function setAction(b, action) {
  if (action === "move") {
    setMode(b, "move");
    return;
  }
  if (["keep", "remove"].includes(action)) {
    b.content = b.mode === "change" ? b.source || b.replacement : b.content;
    b.mode = "plain";
    b.source = "";
    b.replacement = "";
    b.free_instruction = "";
    b.align = null;
  } else if (b.mode === "move") b.mode = "plain";
  b.action = action;
  b.src = null;
}
function description(b) {
  const tag = `<${b.object_id || "obj_2"}>`, ref = `<${b.reference || "ref_image_0"}>`, text = JSON.stringify(resultText(b)), other = "and preserve its font family, colors, and all other styling.";
  let body;
  if (b.action === "keep") body = `keep ${text} ${tag} exactly unchanged.`;
  else if (b.action === "remove") body = `remove ${text} ${tag} from its source box and reconstruct the area it occupied.`;
  else if (b.action === "move") body = `move the text ${text} ${tag} from its source box to its target box, ${other}`;
  else if (b.mode === "change") body = `change the text ${JSON.stringify(b.source || "")} ${tag} to ${text}${ALIGN[b.align] ? ` and ${b.align} align it` : ""}, and maintain the exact font typographic style, character spacing, colors, and style.`;
  else if (["bold", "italic", "size", "vertical", "tracking"].includes(b.mode)) {
    const command = { bold: "bold", italic: "italicize", size: "adjust the size of", vertical: "adjust the vertical scale of", tracking: "adjust tracking of" }[b.mode];
    body = `${command} the text ${text} ${tag}${["size", "vertical", "tracking"].includes(b.mode) ? " to fit its target box" : ""}, ${other}`;
  } else {
    const custom = (b.free_instruction || "").split(PRESERVE).join("").trim().replace(/\.+$/, "");
    body = custom ? `${custom} ${tag}.` : `place the text ${text} ${tag} in its target box.`;
    if (ALIGN[b.align]) body = body.slice(0, -1) + ` and ${b.align} align it.`;
  }
  return `In ${ref}, ${body}`;
}
var boxInstruction = (b) => description(b) + ((b.extra_instruction || "").trim() ? " " + b.extra_instruction.trim() : "");
function elements(boxes) {
  const rows = [];
  for (const b of boxes) {
    const target = grid(b), action = b.action || "new";
    if (target[0] >= target[2] || target[1] >= target[3]) continue;
    const source = action === "move" ? grid(b.src || b) : target;
    if (source[0] >= source[2] || source[1] >= source[3]) throw new Error("Move source must have area.");
    rows.push({ id: b.object_id, from: action === "new" ? null : b.reference || "ref_image_0", src_bbox: action === "new" ? null : source, tgt_bbox: action === "remove" ? null : target, desc: resultText(b) });
  }
  return [...rows, { id: "obj_1", from: "ref_image_0", src_bbox: [0, 0, 1e3, 1e3], tgt_bbox: [0, 0, 1e3, 1e3], desc: "backdrop" }];
}
var instruction = (boxes) => {
  const ids = new Set(elements(boxes).map((r) => r.id));
  return [...boxes.filter((b) => ids.has(b.object_id)).map(boxInstruction), PRESERVE].join(" ");
};
var completePrompt = (boxes) => instruction(boxes) + " " + JSON.stringify(elements(boxes));
function decodeDescription(value) {
  let body = String(value || "").trim(), align = null;
  for (const [k, suffix] of Object.entries(ALIGN)) if (body.endsWith(suffix)) {
    align = k;
    body = body.slice(0, -suffix.length).trimEnd();
    break;
  }
  const r = { mode: "plain", content: body, align };
  for (const [mode, pattern] of [["bold", /^Bold the text "(.*)"\s*\.$/s], ["italic", /^Italicize "(.*)"\.$/s], ["italic", /^Italicize (.*)\.$/s], ["move", /^Move "(.*)" to here\.$/s], ["size", /^Adjust the size of "(.*)"\.?$/s], ["vertical", /^Adjust the vertical scale of "(.*)"\.?$/s], ["tracking", /^Adjust tracking of "(.*)"\.?$/s]]) {
    const m2 = body.match(pattern);
    if (m2) return { ...r, mode, content: m2[1] };
  }
  const m = body.match(/^Change "(.*)" to "(.*)"\.$/s);
  return m ? { ...r, mode: "change", content: "", source: m[1], replacement: m[2] } : r;
}
function importBoxes(value, width, height) {
  let d = typeof value === "string" ? JSON.parse(value) : value;
  if ([1, 2].includes(d == null ? void 0 : d.version) && Array.isArray(d.boxes)) return parseState(d).boxes.map((b) => ({ ...b, id: uid(), origin: "local" }));
  if (d && !Array.isArray(d) && typeof d === "object") d = [d];
  if (!Array.isArray(d)) throw new Error("Expected boxes or FLUX edit rows.");
  if (Array.isArray(d[0])) d = d[0];
  const seen = /* @__PURE__ */ new Set();
  d = d.flatMap((item) => {
    var _a;
    const r = (_a = item == null ? void 0 : item.metadata) == null ? void 0 : _a.flux_row;
    if (!r) return [item];
    if (seen.has(r.id)) return [];
    seen.add(r.id);
    return [r];
  });
  return d.filter((i) => i.id !== "obj_1").map((item, i) => {
    var _a;
    let g, meta;
    if ("src_bbox" in item || "tgt_bbox" in item) {
      const src = item.src_bbox, tgt = item.tgt_bbox, ref = item.from;
      if (ref == null && (src != null || tgt == null) || ref != null && (!/^ref_image_\d+$/.test(ref) || src == null)) throw new Error("Invalid edit row.");
      const action = ref == null ? "new" : tgt == null ? "remove" : JSON.stringify(src) === JSON.stringify(tgt) ? "keep" : "move";
      g = fromGrid(tgt != null ? tgt : src);
      meta = { action, mode: action === "move" ? "move" : "plain", content: String(item.desc || ""), reference: ref || "ref_image_0", object_id: item.id, src: action === "move" ? fromGrid(src) : null };
    } else if ("bbox" in item) {
      g = fromGrid(item.bbox);
      meta = { ...decodeDescription(item.desc), object_id: item.id, type: item.type, text: item.text };
    } else if (["x", "y", "width", "height"].every((k) => k in item)) {
      g = geometry({ x: Number(item.x) / width, y: Number(item.y) / height, w: Number(item.width) / width, h: Number(item.height) / height });
      meta = decodeDescription((_a = item.metadata) == null ? void 0 : _a.desc);
    } else throw new Error("Missing coordinates.");
    return cleanBox({ ...g, ...meta, id: uid(), origin: "local" }, i);
  }).filter((b) => !isBackdrop(b));
}

// ComfyUI-FontBox/frontend/icons.js
var ICONS = {
  select: '<path d="m5 3 13 9-6 1-3 6z"/>',
  draw: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 8v8m-4-4h8"/>',
  plain: '<path d="M4 5h16M12 5v15m-4 0h8"/>',
  bold: '<path stroke-width="2.8" d="M7 4h6a4 4 0 0 1 0 8H7m0 0h7a4 4 0 0 1 0 8H7V4"/>',
  italic: '<path stroke-width="2.2" d="M10 4h9M5 20h9M15 4 9 20"/>',
  labels: '<path d="m3 3 18 18M10 5a11 11 0 0 1 11 7 16 16 0 0 1-4 5M6 6a15 15 0 0 0-5 6c2 5 7 8 12 7M10 10a3 3 0 0 0 4 4"/>',
  grip: '<path d="M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01" stroke-width="3"/>',
  resetTaskbar: '<path d="M4 9a8 8 0 1 1 0 7M4 9V3m0 6h6"/>',
  move: '<path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4"/>',
  change: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
  left: '<path d="M4 4h16M4 9h10M4 14h16M4 19h10"/>',
  right: '<path d="M4 4h16M10 9h10M4 14h16M10 19h10"/>',
  center: '<path d="M4 4h16M7 9h10M4 14h16M7 19h10"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  undo: '<path d="M4 10h10a6 6 0 0 1 0 12M4 10l5-5m-5 5 5 5"/>',
  redo: '<path d="M20 10H10a6 6 0 0 0 0 12m14-12-5-5m5 5-5 5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  expand: '<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/>',
  pan: '<path d="M8 12V5a2 2 0 0 1 4 0v7m0-6a2 2 0 0 1 4 0v6m0-4a2 2 0 0 1 4 0v7c0 4-3 7-7 7h-1c-2 0-4-2-5-4l-4-6a2 2 0 0 1 3-2l2 2"/>',
  zoomIn: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',
  zoomOut: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6"/>',
  fit: '<path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
};
Object.assign(ICONS, {
  size: '<path d="M4 9V4h5M4 4l6 6m10 5v5h-5m5 0-6-6M4 15v5h5m6-16h5v5"/>',
  vertical: '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
  tracking: '<path d="m8 14 4-11 4 11M10 10h4M3 20h18M6 17l-3 3 3 3m12-6 3 3-3 3"/>',
  snap: '<path d="M5 3v9a7 7 0 0 0 14 0V3h-4v9a3 3 0 0 1-6 0V3zM5 7h4m6 0h4"/>',
  cloneBox: '<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V3H3v13h5"/>',
  clearBoxes: '<path d="M3 15V3h12M8 8h13v13H8zM12 12l5 5m0-5-5 5"/>',
  addPrompt: '<path d="M4 4h16v12H9l-5 4zM8 10h8m-4-4v8"/>',
  keep: '<path d="m4 12 5 5L20 5"/>',
  new: '<path d="M12 4v16M4 12h16"/>',
  remove: '<path d="M4 12h16"/>',
  source: '<path d="M4 4h10v16H4zM9 12h12m-4-4 4 4-4 4"/>',
  target: '<path d="M10 4h10v16H10zM2 12h12m-4-4 4 4-4 4"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>'
});
var svg = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.plain}</svg>`;

// ComfyUI-FontBox/frontend/positioning.js
function placeTaskbar(box, width, height, barWidth, barHeight, margin = 8, gap = 8) {
  if (width <= 0 || height <= 0 || box.right <= 0 || box.bottom <= 0 || box.left >= width || box.top >= height)
    return { visible: false };
  const above = box.top - gap - barHeight, below = box.bottom + gap;
  let top, side;
  if (above >= margin) {
    top = above;
    side = "above";
  } else if (below + barHeight <= height - margin) {
    top = below;
    side = "below";
  } else {
    const aboveSpace = clamp(box.top, 0, height) - margin;
    const belowSpace = height - margin - clamp(box.bottom, 0, height);
    side = aboveSpace >= belowSpace ? "above" : "below";
    top = side === "above" ? above : below;
  }
  return {
    visible: true,
    side,
    left: clamp((box.left + box.right - barWidth) / 2, margin, Math.max(margin, width - barWidth - margin)),
    top: clamp(top, margin, Math.max(margin, height - barHeight - margin))
  };
}

// ComfyUI-FontBox/frontend/geometry.js
var clamp2 = (v, a, b) => Math.max(a, Math.min(b, v));
var regionKey = (id, part = "target") => `${id}|${part}`;
function regions(boxes) {
  return boxes.flatMap((b) => (b.action === "move" ? [{ id: b.id, part: "source", g: b.src }, { id: b.id, part: "target", g: b }] : [{ id: b.id, part: "target", g: b }]).filter((r) => r.g).map((r) => ({ ...r, key: regionKey(r.id, r.part) })));
}
function targetsFor(all, selected, guides, settings) {
  const result = { x: [], y: [] };
  if (settings.guides) for (const g of guides) result[g.axis].push({ axis: g.axis, position: g.position, kind: "guide", id: g.id });
  if (settings.boxes) {
    for (const r of all) if (!selected.has(r.key)) {
      for (const [axis, length] of [["x", "w"], ["y", "h"]]) for (const t of [0, 0.5, 1]) result[axis].push({ axis, position: r.g[axis] + r.g[length] * t, kind: "box", id: r.key });
    }
  }
  return result;
}
function moveGroup(before, dx, dy, targets, screen, tolerance = 6) {
  const limits = { x: [Math.max(...before.map((b) => -b.x)), Math.min(...before.map((b) => 1 - b.x - b.w))], y: [Math.max(...before.map((b) => -b.y)), Math.min(...before.map((b) => 1 - b.y - b.h))] };
  const delta = { x: clamp2(dx, ...limits.x), y: clamp2(dy, ...limits.y) }, snaps = [];
  for (const [axis, length] of [["x", "w"], ["y", "h"]]) {
    let best = null;
    for (const b of before) for (const t of [0, 0.5, 1]) for (const target of targets[axis] || []) {
      const d = target.position - (b[axis] + b[length] * t + delta[axis]), distance = Math.abs(d) * screen[axis], next = delta[axis] + d;
      if (distance <= tolerance && next >= limits[axis][0] - 1e-10 && next <= limits[axis][1] + 1e-10 && (!best || distance < best.distance)) best = { distance, delta: next, target };
    }
    if (best) {
      delta[axis] = clamp2(best.delta, ...limits[axis]);
      snaps.push(best.target);
    }
  }
  return { geometries: before.map((b) => ({ ...b, x: b.x + delta.x, y: b.y + delta.y })), snaps };
}
var active = (handle, axis) => axis === "x" ? /[we]/.test(handle) : /[ns]/.test(handle);
var negative = (handle, axis) => handle.includes(axis === "x" ? "w" : "n");
function normal(before, h, dx, dy, min) {
  const delta = { x: dx, y: dy };
  for (const [axis, length] of [["x", "w"], ["y", "h"]]) {
    if (!active(h, axis)) {
      delta[axis] = 0;
      continue;
    }
    const neg = negative(h, axis), low = Math.max(...before.map((b) => neg ? -b[axis] : min[length] - b[length])), high = Math.min(...before.map((b) => neg ? b[length] - min[length] : 1 - b[axis] - b[length]));
    delta[axis] = clamp2(delta[axis], low, high);
  }
  return { delta, geometries: before.map((b) => {
    const r = { ...b };
    for (const [axis, length] of [["x", "w"], ["y", "h"]]) if (active(h, axis)) {
      if (negative(h, axis)) {
        r[axis] += delta[axis];
        r[length] -= delta[axis];
      } else r[length] += delta[axis];
    }
    return r;
  }) };
}
function anchor(b, h) {
  return { x: h.includes("w") ? b.x + b.w : h.includes("e") ? b.x : b.x + b.w / 2, y: h.includes("n") ? b.y + b.h : h.includes("s") ? b.y : b.y + b.h / 2, cx: h.includes("w") ? 1 : h.includes("e") ? 0 : 0.5, cy: h.includes("n") ? 1 : h.includes("s") ? 0 : 0.5 };
}
function scaleLimits(before, h, min) {
  let low = 0, high = Infinity;
  for (const b of before) {
    const a = anchor(b, h);
    low = Math.max(low, min.w / Math.max(b.w, 1e-12), min.h / Math.max(b.h, 1e-12));
    for (const [axis, length, c] of [["x", "w", a.cx], ["y", "h", a.cy]]) {
      if (c > 0) high = Math.min(high, a[axis] / (b[length] * c));
      if (c < 1) high = Math.min(high, (1 - a[axis]) / (b[length] * (1 - c)));
    }
  }
  return [low, Math.max(low, high)];
}
var scaled = (before, h, s) => before.map((b) => {
  const a = anchor(b, h), w = b.w * s, height = b.h * s;
  return { ...b, x: a.x - w * a.cx, y: a.y - height * a.cy, w, h: height };
});
function resizeGroup(before, h, dx, dy, locked, targets, screen, min = { w: 1e-3, h: 1e-3 }, tolerance = 6) {
  if (!locked) {
    let current = normal(before, h, dx, dy, min), snaps = [];
    const desired = { ...current.delta };
    for (const [axis, length] of [["x", "w"], ["y", "h"]]) {
      if (!active(h, axis)) continue;
      let best2 = null;
      for (let i = 0; i < before.length; i++) {
        const b2 = current.geometries[i], edge = b2[axis] + (negative(h, axis) ? 0 : b2[length]);
        for (const target of targets[axis] || []) {
          const d = target.position - edge, distance = Math.abs(d) * screen[axis];
          if (distance <= tolerance && (!best2 || distance < best2.distance)) best2 = { distance, delta: current.delta[axis] + d, target };
        }
      }
      if (best2) {
        desired[axis] = best2.delta;
        snaps.push(best2.target);
      }
    }
    current = normal(before, h, desired.x, desired.y, min);
    snaps = snaps.filter((t) => current.geometries.some((b2) => Math.abs(b2[t.axis] + (negative(h, t.axis) ? 0 : b2[t.axis === "x" ? "w" : "h"]) - t.position) < 1e-8));
    return { geometries: current.geometries, snaps };
  }
  const b = before[0], useX = active(h, "x"), useY = active(h, "y"), sx = (negative(h, "x") ? -1 : 1) * dx, sy = (negative(h, "y") ? -1 : 1) * dy;
  const wx = b.w * screen.x, hy = b.h * screen.y;
  let s = 1 + (useX && useY ? (sx * screen.x * wx + sy * screen.y * hy) / Math.max(1e-12, wx * wx + hy * hy) : useX ? sx / Math.max(b.w, 1e-12) : sy / Math.max(b.h, 1e-12));
  const [low, high] = scaleLimits(before, h, min);
  s = clamp2(s, low, high);
  const initial = scaled(before, h, s);
  let best = null;
  for (let i = 0; i < before.length; i++) for (const [axis, length] of [["x", "w"], ["y", "h"]]) {
    if (!active(h, axis)) continue;
    const edge = initial[i][axis] + (negative(h, axis) ? 0 : initial[i][length]), a = anchor(before[i], h), derivative = (negative(h, axis) ? -1 : 1) * before[i][length];
    for (const target of targets[axis] || []) {
      const distance = Math.abs(target.position - edge) * screen[axis], factor = (target.position - a[axis]) / derivative;
      if (distance <= tolerance && factor >= low - 1e-10 && factor <= high + 1e-10 && (!best || distance < best.distance)) best = { distance, factor, target };
    }
  }
  if (best) s = clamp2(best.factor, low, high);
  return { geometries: scaled(before, h, s), snaps: best ? [best.target] : [] };
}

// ComfyUI-FontBox/frontend/guides.js
var el = (tag, cls) => {
  const n = document.createElement(tag);
  n.className = cls;
  return n;
};
function rulerTicks(dimension, origin, extent, visible) {
  if (!(dimension > 0 && extent > 0 && visible > 0)) return [];
  const ideal = 70 * dimension / extent, p = 10 ** Math.floor(Math.log10(ideal)), major = Math.max(1, ([1, 2, 5, 10].find((n) => n * p >= ideal) || 10) * p), minor = Math.max(1, major / 5), ticks = [];
  const start = Math.max(0, Math.ceil(-origin * dimension / extent / minor)), end = Math.min(Math.floor(dimension / minor), Math.floor((visible - origin) * dimension / extent / minor));
  for (let i = start; i <= end && ticks.length < 500; i++) {
    const value = Math.round(i * minor * 1e6) / 1e6;
    ticks.push({ value, offset: origin + value / dimension * extent, major: Math.abs(value / major - Math.round(value / major)) < 1e-6 });
  }
  return ticks;
}
var Guides = class {
  constructor(e) {
    this.e = e;
    const area = el("div", "canvas-area");
    e.viewport.replaceWith(area);
    e.canvasArea = area;
    const corner = el("div", "ruler-corner");
    corner.textContent = "px";
    area.append(corner);
    this.rulers = {};
    for (const axis of ["y", "x"]) {
      const r = el("div", `ruler ruler-${axis}`);
      r.title = axis === "y" ? "Drag a horizontal guide" : "Drag a vertical guide";
      r.setAttribute("aria-label", r.title);
      r.addEventListener("pointerdown", (event) => {
        if (event.button === 0) this.start(event, axis);
      });
      this.rulers[axis] = r;
      area.append(r);
    }
    area.append(e.viewport);
    this.layer = el("div", "guide-layer");
    e.viewport.insertBefore(this.layer, e.taskbar);
  }
  metrics() {
    const e = this.e, v = e.viewport.getBoundingClientRect(), s = e.stage.getBoundingClientRect(), sx = e.viewport.clientWidth / (v.width || 1), sy = e.viewport.clientHeight / (v.height || 1);
    return { left: (s.left - v.left) * sx, top: (s.top - v.top) * sy, width: s.width * sx, height: s.height * sy };
  }
  start(event, axis, g = null) {
    const e = this.e;
    event.preventDefault();
    event.stopPropagation();
    e.closePopovers();
    e.checkpoint();
    if (!g) {
      g = { id: uid(), axis, position: 0 };
      e.state.guides.push(g);
    }
    e.drag = { kind: "guide", id: g.id, pointerId: event.pointerId };
    e.viewport.setPointerCapture(event.pointerId);
    this.move(event);
  }
  pointerDown(event) {
    const line = event.target.closest(".guide");
    if (!line || event.button !== 0 || event.altKey) return false;
    const g = this.e.state.guides.find((g2) => g2.id === line.dataset.guideId);
    if (g) this.start(event, g.axis, g);
    return true;
  }
  move(event) {
    const e = this.e, g = e.state.guides.find((g2) => g2.id === e.drag.id);
    if (!g) return;
    const p = e.point(event, false), v = e.localPoint(event);
    e.drag.remove = p[g.axis] < 0 || p[g.axis] > 1 || v.x < 0 || v.y < 0 || v.x > e.viewport.clientWidth || v.y > e.viewport.clientHeight;
    g.position = clamp(p[g.axis]);
    this.render();
  }
  remove(id) {
    const e = this.e;
    e.checkpoint();
    e.state.guides = e.state.guides.filter((g) => g.id !== id);
    e.changed();
    this.render();
  }
  clear() {
    if (!this.e.state.guides.length) return;
    this.e.checkpoint();
    this.e.state.guides = [];
    this.e.changed();
    this.render();
  }
  render() {
    var _a, _b, _c;
    const e = this.e, m = this.metrics();
    for (const axis of ["x", "y"]) {
      const h = axis === "y", ticks = rulerTicks(h ? e.width : e.height, h ? m.left : m.top, h ? m.width : m.height, h ? e.viewport.clientWidth : e.viewport.clientHeight);
      this.rulers[axis].innerHTML = `<svg aria-hidden="true">${ticks.map((t) => h ? `<path d="M${t.offset} 22v-${t.major ? 9 : 4}"/>${t.major ? `<text x="${t.offset + 3}" y="10">${t.value}</text>` : ""}` : `<path d="M22 ${t.offset}h-${t.major ? 9 : 4}"/>${t.major ? `<text transform="translate(10 ${t.offset - 3}) rotate(-90)">${t.value}</text>` : ""}`).join("")}</svg>`;
    }
    const focused = (_b = (_a = e.root.getRootNode().activeElement) == null ? void 0 : _a.dataset) == null ? void 0 : _b.guideId;
    this.layer.replaceChildren();
    for (const g of e.state.guides) {
      const vertical = g.axis === "x", line = el("div", `guide guide-${g.axis}`), pixels = Math.round(g.position * (vertical ? e.width : e.height));
      line.style[vertical ? "left" : "top"] = `${(vertical ? m.left : m.top) + g.position * (vertical ? m.width : m.height) - 4}px`;
      line.dataset.guideId = g.id;
      line.tabIndex = 0;
      line.title = `${vertical ? "Vertical" : "Horizontal"} guide: ${pixels} px \xB7 double-click to remove`;
      line.setAttribute("role", "slider");
      line.setAttribute("aria-label", vertical ? "Vertical guide" : "Horizontal guide");
      line.setAttribute("aria-orientation", vertical ? "horizontal" : "vertical");
      line.setAttribute("aria-valuemin", "0");
      line.setAttribute("aria-valuemax", String(vertical ? e.width : e.height));
      line.setAttribute("aria-valuenow", String(pixels));
      line.classList.toggle("snapped", e.snapIndicators.some((s) => s.kind === "guide" && s.id === g.id));
      const dragging = ((_c = e.drag) == null ? void 0 : _c.kind) === "guide" && e.drag.id === g.id;
      line.classList.toggle("dragging", dragging);
      line.classList.toggle("remove", dragging && e.drag.remove);
      const readout = el("span", "guide-readout");
      readout.textContent = dragging && e.drag.remove ? "Release to remove" : `${pixels} px`;
      line.append(readout);
      line.addEventListener("dblclick", (ev) => {
        ev.stopPropagation();
        this.remove(g.id);
      });
      line.addEventListener("keydown", (ev) => {
        if (["Delete", "Backspace"].includes(ev.key)) {
          ev.preventDefault();
          ev.stopPropagation();
          this.remove(g.id);
        } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(ev.key)) {
          ev.preventDefault();
          ev.stopPropagation();
          const d = vertical ? ev.key === "ArrowRight" ? 1 : ev.key === "ArrowLeft" ? -1 : 0 : ev.key === "ArrowDown" ? 1 : ev.key === "ArrowUp" ? -1 : 0;
          if (d) {
            e.checkpoint();
            g.position = clamp(g.position + d * (ev.shiftKey ? 10 : 1) / (vertical ? e.width : e.height));
            e.changed();
            this.render();
          }
        }
      });
      this.layer.append(line);
      if (focused === g.id) line.focus({ preventScroll: true });
    }
    for (const snap of e.snapIndicators.filter((s) => s.kind === "box")) {
      const line = el("div", `snap-indicator snap-${snap.axis}`);
      line.style[snap.axis === "x" ? "left" : "top"] = `${(snap.axis === "x" ? m.left : m.top) + snap.position * (snap.axis === "x" ? m.width : m.height)}px`;
      this.layer.append(line);
    }
  }
};

// ComfyUI-FontBox/frontend/styles.js
var EDITOR_STYLES = ':host{display:block;width:100%;height:100%;min-width:300px;color:#e4e5e7;font:12px/1.4 system-ui,sans-serif;color-scheme:dark}\n*{box-sizing:border-box}[hidden]{display:none!important}button,input,textarea,select{font:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid #b8bec7;outline-offset:1px}\n.editor{height:100%;min-height:380px;display:flex;flex-direction:column;background:#202121;border:0;border-radius:8px;overflow:hidden}\n.toolbar{display:flex;align-items:center;gap:2px;flex-wrap:wrap;padding:5px 7px;border-bottom:0;position:relative;z-index:10;flex:none}\n.context-taskbar{position:absolute;display:flex;align-items:center;flex-wrap:nowrap;gap:1px;width:max-content;max-width:calc(100% - 16px);height:38px;padding:4px 6px;border:0;border-radius:8px;background:#262729f5;box-shadow:0 5px 16px #0007;z-index:12;overflow-x:auto;overflow-y:hidden;overscroll-behavior:contain;scrollbar-width:none;touch-action:manipulation}.context-taskbar::-webkit-scrollbar{display:none}.context-taskbar .divider{flex:none;margin:3px 1px}.context-taskbar .icon{flex:none;width:23px}.context-taskbar .taskbar-grip{width:16px;padding:0;cursor:grab;touch-action:none}.context-taskbar .taskbar-grip svg{width:12px;pointer-events:none}.context-taskbar.dragging,.context-taskbar.dragging *{cursor:grabbing!important}\n.icon{width:27px;height:28px;display:inline-flex;align-items:center;justify-content:center;background:transparent;color:#d0d2d6;border:0;border-radius:5px;padding:4px;flex:none}.icon:hover:not(:disabled){background:#3b3c3f}.icon.active{color:#fff;background:#62656b}.icon.active:hover:not(:disabled){color:#fff;background:#6b6f76}.icon:disabled{opacity:.3;cursor:default}.icon svg,.menu-item svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}.divider{height:19px;width:1px;background:#45474b;margin:3px}\n.menu-wrap{position:relative;margin-left:auto;display:flex}.file-menu{position:absolute;right:0;top:32px;min-width:190px;background:#262729;border:0;border-radius:6px;box-shadow:0 6px 20px #0008;padding:4px;z-index:20}.menu-item{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:0;background:transparent;color:#e4e5e7;border-radius:4px;padding:8px}.menu-item:hover,.menu-item:focus-visible{background:#3b3c3f}\n.inspector{padding:4px 8px;background:#262729;border-bottom:0;flex:0 0 52px;height:52px;min-width:0;overflow:hidden}.inspector-head{display:flex;align-items:center;gap:7px;height:25px;margin-bottom:1px}.selection{font-size:10px;color:#bfc1c6;white-space:nowrap}.inspector select{padding:2px 4px;height:24px;width:67px;flex:none;background:#202121;color:#e4e5e7;border:0;border-radius:4px;font-size:11px}.setting-summary{color:#bfc1c6;font-size:11px}.fields{display:flex;gap:5px;flex:1;min-width:0}.field{display:block;flex:1;min-width:0}.field textarea{display:block;resize:none;height:24px;min-height:24px;width:100%;color:#f0f1f2;background:#313235;border:0;border-radius:4px;padding:3px 5px;line-height:16px;font-size:11px;white-space:pre;overflow:auto}.generated{display:block;font-size:10px;line-height:16px;max-height:16px;overflow:hidden;text-overflow:ellipsis;color:#c7cbd2;white-space:nowrap}.hint{display:block;color:#9da0a6;font-size:10px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.viewport{flex:1;min-height:220px;position:relative;overflow:hidden;touch-action:none;overscroll-behavior:contain;background-color:#1c1d1f;background-image:linear-gradient(45deg,#27282a 25%,transparent 25%),linear-gradient(-45deg,#27282a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#27282a 75%),linear-gradient(-45deg,transparent 75%,#27282a 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}\n.stage{position:absolute;left:50%;top:50%;transform-origin:center center;background:#2b2c2f;touch-action:none;overflow:hidden;box-shadow:none}.stage.draw{cursor:crosshair}.viewport.pan,.stage.pan,.stage.pan .box,.stage.pan .tag{cursor:grab}.viewport.panning,.viewport.panning *{cursor:grabbing!important}.stage.pan .body *{pointer-events:none}.stage.pan .handle{display:none}.background{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;user-select:none}.empty{position:absolute;inset:0;display:grid;place-content:center;text-align:center;color:#a8abb1;pointer-events:none;padding:14px}.empty strong{display:block;color:#e0e2e5;font-size:14px}\n.box{position:absolute;border:1.5px solid var(--box);background:color-mix(in srgb,var(--box) 9%,transparent);color:white;min-width:2px;min-height:2px;cursor:default}.box.selected{border-width:2px;z-index:3;box-shadow:0 0 0 1px #111}.box .tag{position:absolute;left:-1px;top:-1px;max-width:100%;height:20px;padding:1px 5px;background:var(--box);color:#1c1d1f;font-size:10px;font-weight:750;white-space:nowrap;overflow:hidden;cursor:grab;user-select:none}.box .body{position:absolute;inset:22px 3px 3px;overflow:hidden}.box p{margin:0;font-size:11px;text-shadow:0 1px 3px #000;white-space:pre-wrap;word-break:break-word;pointer-events:none}.box textarea,.box input{width:100%;min-height:23px;resize:none;background:#313235e6;color:#fff;border:0;border-radius:3px;padding:3px;font-size:11px}.box textarea{height:100%}.box .body.change{display:flex;flex-direction:column;gap:2px}\n.handle{position:absolute;width:8px;height:8px;background:#fff;border:1px solid #46484d;z-index:5}.handle[data-h*=n]{top:-5px}.handle[data-h*=s]{bottom:-5px}.handle[data-h*=w]{left:-5px}.handle[data-h*=e]{right:-5px}.handle[data-h=n],.handle[data-h=s]{left:calc(50% - 4px)}.handle[data-h=e],.handle[data-h=w]{top:calc(50% - 4px)}.draft,.box.adjusting{border:2px dashed #d0d3d8;background:#c8ccd022;box-shadow:none}.draft{position:absolute;pointer-events:none;z-index:6}\n.box .tag{display:inline-flex;align-items:center;gap:3px;padding:2px 4px}.option-icon{display:inline-flex;pointer-events:none}.option-icon svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}.stage.draw .box{pointer-events:none}.stage.labels-hidden .box .body{top:3px}\n.notice{position:absolute;bottom:8px;left:8px;right:8px;width:fit-content;max-width:calc(100% - 16px);padding:5px 8px;border:0;background:#262729ed;color:#e4e5e7;font-size:11px;border-radius:5px;pointer-events:none;z-index:15}.notice.error{color:#ffb9b9;border-color:#a85e5e}.modal{position:fixed;inset:3vh 4vw;background:#202121;border:0;border-radius:10px;padding:5px;z-index:100000;box-shadow:0 0 0 100vmax #000b}.modal .editor{min-height:0;height:100%}.modal .viewport{min-height:180px}\n.canvas-area{flex:1;min-height:242px;min-width:0;display:grid;grid-template-columns:22px minmax(0,1fr);grid-template-rows:22px minmax(0,1fr);overflow:hidden}.canvas-area .viewport{grid-column:2;grid-row:2;min-width:0;min-height:0}.ruler-corner{grid-column:1;grid-row:1;background:#262729;color:#bfc1c6;font-size:9px;display:grid;place-items:center;user-select:none}.ruler{background:#262729;color:#aeb2ba;overflow:hidden;touch-action:none;user-select:none}.ruler-y{grid-column:2;grid-row:1;cursor:row-resize}.ruler-x{grid-column:1;grid-row:2;cursor:col-resize}.ruler svg{width:100%;height:100%;display:block;pointer-events:none}.ruler path{stroke:#8e939b;fill:none;stroke-width:1}.ruler text{fill:currentColor;font:9px system-ui,sans-serif}.guide-layer{position:absolute;inset:0;pointer-events:none;z-index:8;overflow:hidden}.guide{position:absolute;pointer-events:auto;touch-action:none;outline:none}.guide-x{top:0;bottom:0;width:9px;cursor:col-resize}.guide-y{left:0;right:0;height:9px;cursor:row-resize}.guide::after{content:"";position:absolute;background:#65d5ed;pointer-events:none;opacity:.8}.guide-x::after{top:0;bottom:0;left:4px;width:1px}.guide-y::after{left:0;right:0;top:4px;height:1px}.guide:hover::after,.guide:focus-visible::after,.guide.dragging::after,.guide.snapped::after{background:#c2f7ff;opacity:1;box-shadow:0 0 3px #65d5ed}.guide.remove::after{background:#ff9292}.guide-readout{display:none;position:absolute;top:8px;left:8px;white-space:nowrap;padding:2px 5px;border-radius:3px;background:#262729;color:#dcf9ff;font-size:10px;pointer-events:none}.guide.dragging .guide-readout{display:block}.snap-indicator{position:absolute;background:#ff9ed8;pointer-events:none;opacity:.85}.snap-x{width:1px;top:0;bottom:0}.snap-y{height:1px;left:0;right:0}.modal .canvas-area{min-height:202px}\n.move-arrows{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;overflow:visible}.box{z-index:2}.box.multi-selected{border-width:2px;z-index:3;box-shadow:0 0 0 1px #111}.box.selected{z-index:4}.source-box{border-style:dashed;background:transparent}.source-box .body{pointer-events:none}.keep-box{opacity:.7}.remove-box{background:repeating-linear-gradient(135deg,transparent,transparent 8px,#ff929215 8px,#ff929215 9px)}.pair-control{width:20px;height:24px;padding:3px}.pair-control svg{width:16px;height:16px}.inspector-head{gap:4px}.inspector select{width:72px}.selection{max-width:122px;overflow:hidden;text-overflow:ellipsis}.box .body.plain{display:flex;flex-direction:column;gap:2px}.box .body.plain textarea{min-height:22px;height:50%}.box .body.plain textarea:only-child{height:100%}\n.popover-layer{position:absolute;inset:0;z-index:30;pointer-events:none}.editor-popover{position:absolute;pointer-events:auto;background:#262729;border:0;border-radius:8px;box-shadow:0 6px 22px #0008;padding:5px;overflow:auto;overscroll-behavior:contain;min-width:150px}.editor-popover .menu-item{padding:7px 8px;gap:9px}.editor-popover .menu-item.active{color:#fff;background:#62656b}.editor-popover .menu-item:disabled{opacity:.3;cursor:default}.dropdown-tool{width:38px;gap:0}.context-taskbar .dropdown-tool{width:36px}.dropdown-tool .dropdown-arrow{width:10px;height:10px;flex:none;stroke-width:2}.context-taskbar{gap:2px}.extra-popover{padding:10px}.extra-label{display:block;font-size:11px;color:#d0d2d6}.extra-field{display:block;width:100%;min-height:84px;max-height:200px;resize:vertical;border:0;border-radius:5px;padding:7px;margin-top:7px;background:#313235;color:#f3f3f3;font:12px/1.5 system-ui,sans-serif}.switch-row{display:flex;align-items:center;justify-content:space-between;gap:15px;width:100%;border:0;border-radius:4px;background:transparent;color:#e4e5e7;padding:9px 6px;text-align:left;font-size:11px}.switch-row:hover{background:#3b3c3f}.switch-track{width:28px;height:16px;border-radius:9px;background:#414348;position:relative;flex:none}.switch-thumb{position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:#bfc1c6;transition:transform .1s}.switch-row[aria-checked=true] .switch-track{background:#75818e}.switch-row[aria-checked=true] .switch-thumb{background:#fff;transform:translateX(12px)}\n';

// ComfyUI-FontBox/frontend/editor.js
var COLORS = ["#79c8ff", "#ffbd73", "#bc9bff", "#7ee0b8", "#ff90b5"];
var el2 = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== void 0) n.textContent = text;
  return n;
};
var LABELS = { plain: "Free prompt", change: "Change text", bold: "Bold text", italic: "Italicize text", move: "Move text", size: "Adjust size of text", vertical: "Vertical scale", tracking: "Adjust tracking", left: "Left align", center: "Center align", right: "Right align" };
var BBoxEditor = class {
  constructor(host, { onChange = () => {
  }, dimensions = () => [1024, 1024] } = {}) {
    this.host = host;
    this.onChange = onChange;
    this.dimensions = dimensions;
    this.state = clone(EMPTY);
    this.selection = /* @__PURE__ */ new Map();
    this.selected = null;
    this.activePart = "target";
    this.tool = "draw";
    this.drawPart = null;
    this.defaults = { mode: "change", action: "new", align: "left" };
    this.past = [];
    this.future = [];
    this.view = { zoom: 1, panX: 0, panY: 0 };
    this.width = 1024;
    this.height = 1024;
    this.hasBackground = false;
    this.labelsHidden = false;
    this.snapSettings = { boxes: true, guides: true };
    this.snapIndicators = [];
    this.taskbarOffsets = /* @__PURE__ */ new Map();
    this.buttons = {};
    this.popovers = {};
    this.groupChoices = { text: "change", transform: "move", align: "left" };
    this.shadow = host.attachShadow({ mode: "open" });
    const style = el2("style");
    style.textContent = EDITOR_STYLES;
    this.root = el2("section", "editor");
    this.shadow.append(style, this.root);
    this.toolbar = el2("div", "toolbar");
    this.toolbar.setAttribute("role", "toolbar");
    this.toolbar.setAttribute("aria-label", "Bounding box tools");
    this.root.append(this.toolbar);
    this.taskbar = el2("div", "context-taskbar");
    this.taskbar.hidden = true;
    this.taskbar.setAttribute("role", "toolbar");
    this.taskbar.setAttribute("aria-label", "Selected box tools");
    this.inspector = el2("div", "inspector");
    this.root.append(this.inspector);
    this.viewport = el2("div", "viewport");
    this.stage = el2("div", "stage draw");
    this.stage.tabIndex = 0;
    this.stage.setAttribute("aria-label", "Bounding box drawing canvas");
    this.background = el2("img", "background");
    this.background.alt = "Background image";
    this.background.hidden = true;
    this.empty = el2("div", "empty");
    this.empty.append(el2("strong", null, "Draw a box. Press V to edit."), el2("span", null, "Connect Load Image for a live background."));
    this.layer = el2("div", "layer");
    this.arrows = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.arrows.classList.add("move-arrows");
    this.stage.append(this.background, this.empty, this.arrows, this.layer);
    this.popupLayer = el2("div", "popover-layer");
    this.viewport.append(this.stage, this.taskbar, this.popupLayer);
    this.root.append(this.viewport);
    this.message = el2("div", "notice");
    this.message.hidden = true;
    this.message.setAttribute("role", "status");
    this.viewport.append(this.message);
    this.buildControls();
    this.guides = new Guides(this);
    this.viewport.addEventListener("pointerdown", (e) => this.pointerDown(e), true);
    this.viewport.addEventListener("pointermove", (e) => this.pointerMove(e));
    this.viewport.addEventListener("pointerup", (e) => this.pointerUp(e));
    this.viewport.addEventListener("pointercancel", () => this.cancelDrag());
    this.viewport.addEventListener("wheel", (e) => {
      if (this.popupLayer.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.viewport.clientHeight : 1);
      this.zoomAt(Math.exp(-clamp(delta, -300, 300) * 2e-3), e);
    }, { passive: false });
    this.taskbar.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.taskbar.addEventListener("wheel", (e) => e.stopPropagation());
    this.popupLayer.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.popupLayer.addEventListener("wheel", (e) => e.stopPropagation());
    this.documentPointer = (e) => {
      const path = e.composedPath();
      if (!path.includes(this.root)) {
        if (!this.drag && this.selection.size) this.select(null);
        this.closePopovers();
        this.toggleMenu(false);
        return;
      }
      if (this.openPopover && !path.includes(this.popovers[this.openPopover]) && !path.includes(this.popoverAnchor)) this.closePopovers();
      if (!path.includes(this.menuWrap)) this.toggleMenu(false);
    };
    document.addEventListener("pointerdown", this.documentPointer, true);
    for (const event of ["pointerdown", "pointermove", "pointerup", "mousedown", "mouseup", "click", "wheel", "dblclick", "focusin", "focusout"]) this.root.addEventListener(event, (e) => e.stopPropagation());
    this.root.addEventListener("keydown", (e) => this.keyDown(e));
    this.observer = new ResizeObserver(() => this.fit());
    this.observer.observe(this.viewport);
    this.taskbarObserver = new ResizeObserver(() => {
      this.positionTaskbar();
      this.positionPopover();
    });
    this.taskbarObserver.observe(this.taskbar);
    this.render();
  }
  button(name, label, action, parent = this.toolbar, icon = name, withText = false) {
    const b = el2("button", withText ? "menu-item" : "icon");
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    b.innerHTML = svg(icon);
    if (withText) b.append(document.createTextNode(label));
    b.addEventListener("click", action);
    parent.append(b);
    this.buttons[name] = b;
    return b;
  }
  divider(parent) {
    parent.append(el2("span", "divider"));
  }
  popup(name, label) {
    const p = el2("div", "editor-popover");
    p.hidden = true;
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", label);
    this.popovers[name] = p;
    this.popupLayer.append(p);
    return p;
  }
  buildControls() {
    this.button("select", "Select / move boxes (V)", () => this.setTool("select"));
    this.button("draw", "Draw a box (N)", () => this.setTool("draw"));
    this.button("pan", "Pan canvas (H)", () => this.setTool("pan"));
    this.divider(this.toolbar);
    this.button("undo", "Undo (Ctrl/Cmd+Z)", () => this.undo());
    this.button("redo", "Redo (Ctrl/Cmd+Shift+Z)", () => this.redo());
    this.button("clearBoxes", "Remove all bounding boxes \xB7 Undo to restore", () => this.clearBoxes());
    this.divider(this.toolbar);
    this.button("zoomOut", "Zoom out", () => this.zoomAt(1 / 1.25));
    this.button("zoomIn", "Zoom in", () => this.zoomAt(1.25));
    this.button("fit", "Fit canvas", () => this.resetView());
    this.button("expand", "Expand / close editor (Esc)", () => this.expand());
    this.button("labels", "Hide box labels and text", () => {
      this.labelsHidden = !this.labelsHidden;
      if (this.labelsHidden && this.stage.contains(this.root.getRootNode().activeElement)) this.root.getRootNode().activeElement.blur();
      this.refreshButtons();
    });
    const snap = this.button("snap", "Snapping options", () => this.togglePopover("snapping", snap));
    snap.classList.add("dropdown-tool");
    snap.innerHTML = svg("snap") + svg("chevron", "dropdown-arrow");
    snap.setAttribute("aria-haspopup", "dialog");
    const settings = this.popup("snapping", "Snapping options");
    for (const [key, label] of [["boxes", "Snap to boxes"], ["guides", "Snap to guides"]]) {
      const row = el2("button", "switch-row");
      row.type = "button";
      row.setAttribute("role", "switch");
      row.setAttribute("aria-label", label);
      row.dataset.setting = key;
      row.append(el2("span", null, label));
      const track = el2("span", "switch-track");
      track.append(el2("span", "switch-thumb"));
      row.append(track);
      row.addEventListener("click", () => {
        this.snapSettings[key] = !this.snapSettings[key];
        this.refreshButtons();
      });
      settings.append(row);
    }
    this.menuWrap = el2("div", "menu-wrap");
    this.toolbar.append(this.menuWrap);
    const menuButton = this.button("menu", "File menu", () => this.toggleMenu(), this.menuWrap);
    menuButton.setAttribute("aria-haspopup", "menu");
    this.menu = el2("div", "file-menu");
    this.menu.hidden = true;
    this.menu.setAttribute("role", "menu");
    this.menuWrap.append(this.menu);
    for (const [name, label, action] of [["upload", "Import .json", () => this.importFile()], ["download", "Download elements.json", () => this.download(false)], ["download", "Download complete prompt.txt", () => this.download(true)], ["trash", "Clear guides", () => this.guides.clear()]]) {
      const b = el2("button", "menu-item");
      b.type = "button";
      b.innerHTML = svg(name);
      b.append(document.createTextNode(label));
      b.setAttribute("role", "menuitem");
      b.addEventListener("click", () => {
        this.toggleMenu(false);
        action();
      });
      this.menu.append(b);
    }
    const grip = this.button("grip", "Drag taskbar \xB7 double-click to reset", () => {
    }, this.taskbar);
    grip.classList.add("taskbar-grip");
    grip.addEventListener("pointerdown", (e) => this.startTaskbarDrag(e));
    grip.addEventListener("dblclick", () => this.resetTaskbar());
    grip.addEventListener("keydown", (e) => {
      if (e.key === "Home") {
        e.preventDefault();
        this.resetTaskbar();
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        const o = { ...this.taskbarOffsets.get(this.selected) || { x: 0, y: 0 } }, step = e.shiftKey ? 1 : 10;
        o.x += e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
        o.y += e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
        this.taskbarOffsets.set(this.selected, o);
        this.positionTaskbar();
      }
    });
    for (const [name, modes, label] of [["text", ["plain", "change"], "Text tools"], ["transform", ["move", "size", "vertical", "tracking"], "Text transform tools"], ["align", ["left", "center", "right"], "Alignment"]]) {
      if (name === "transform") {
        this.button("bold", LABELS.bold, () => this.chooseMode("bold"), this.taskbar);
        this.button("italic", LABELS.italic, () => this.chooseMode("italic"), this.taskbar);
      }
      const trigger = this.button(name + "Group", label, () => this.togglePopover(name, trigger), this.taskbar, this.groupChoices[name]);
      trigger.classList.add("dropdown-tool");
      trigger.setAttribute("aria-haspopup", "menu");
      const p2 = this.popup(name, label);
      p2.setAttribute("role", "menu");
      p2.addEventListener("keydown", (event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const items = [...p2.querySelectorAll("[role=menuitemradio]")].filter((b) => !b.disabled), current = items.indexOf(this.root.getRootNode().activeElement);
        if (items.length) {
          const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
          items[index].focus({ preventScroll: true });
        }
      });
      for (const mode of modes) {
        const b = this.button(mode, LABELS[mode], () => {
          if (name === "align") this.chooseAlignment(mode);
          else this.chooseMode(mode);
          this.groupChoices[name] = mode;
          this.closePopovers();
          this.refreshButtons();
        }, p2, mode, true);
        b.setAttribute("role", "menuitemradio");
      }
    }
    this.divider(this.taskbar);
    this.button("resetTaskbar", "Reset taskbar position", () => this.resetTaskbar(), this.taskbar);
    const extra = this.button("addPrompt", "Add prompt", () => this.togglePopover("extra", extra), this.taskbar);
    extra.setAttribute("aria-haspopup", "dialog");
    const p = this.popup("extra", "Additional instruction");
    p.classList.add("extra-popover");
    this.extraLabel = el2("label", "extra-label", "Additional instruction");
    this.extraField = el2("textarea", "extra-field");
    this.extraField.rows = 4;
    this.extraField.setAttribute("aria-label", "Additional instruction");
    this.extraField.placeholder = "Type an additional instruction\u2026";
    this.extraLabel.append(this.extraField);
    p.append(this.extraLabel);
    let started = false;
    this.extraField.addEventListener("focus", () => {
      started = false;
    });
    this.extraField.addEventListener("input", () => {
      const b = this.box();
      if (!b) return;
      if (!started) {
        this.checkpoint();
        started = true;
      }
      b.extra_instruction = this.extraField.value;
      this.changed();
      this.updateInstruction();
    });
    this.button("cloneBox", "Clone selected bounding boxes", () => this.cloneSelected(), this.taskbar);
    this.button("trash", "Delete selected boxes", () => this.deleteSelected(), this.taskbar);
  }
  serialize() {
    return JSON.stringify(this.state);
  }
  load(value) {
    try {
      this.state = parseState(value);
      this.selection.clear();
      this.selected = null;
      this.activePart = "target";
      this.drawPart = null;
      this.past = [];
      this.future = [];
      this.taskbarOffsets.clear();
      this.closePopovers();
      this.render();
    } catch (error) {
      this.notify(error.message, true);
    }
  }
  snapshot() {
    return clone(this.state);
  }
  checkpoint() {
    this.past.push(this.snapshot());
    if (this.past.length > 80) this.past.shift();
    this.future = [];
  }
  changed() {
    assignIds(this.state);
    this.state.revision++;
    this.onChange(this.serialize());
    this.refreshButtons();
  }
  box() {
    return this.state.boxes.find((b) => b.id === this.selected);
  }
  geometryFor(ref) {
    const b = this.state.boxes.find((b2) => b2.id === ref.id);
    return b && (ref.part === "source" ? b.action === "move" ? b.src : null : b);
  }
  activeGeometry() {
    return this.geometryFor({ id: this.selected, part: this.activePart });
  }
  selectedRegions() {
    return [...this.selection.values()].filter((r) => this.geometryFor(r));
  }
  selectedBoxes() {
    const ids = new Set(this.selectedRegions().map((r) => r.id));
    return this.state.boxes.filter((b) => ids.has(b.id));
  }
  select(id, part = "target", { toggle = false, preserve = false } = {}) {
    this.drawPart = null;
    this.closePopovers();
    if (!id) {
      this.selection.clear();
      this.selected = null;
    } else {
      const key = regionKey(id, part);
      if (toggle) {
        if (this.selection.has(key)) this.selection.delete(key);
        else this.selection.set(key, { id, part });
      } else {
        if (!preserve) this.selection.clear();
        this.selection.set(key, { id, part });
      }
      if (this.selection.has(key)) {
        this.selected = id;
        this.activePart = part;
      } else {
        const last = [...this.selection.values()].at(-1);
        this.selected = (last == null ? void 0 : last.id) || null;
        this.activePart = (last == null ? void 0 : last.part) || "target";
      }
    }
    this.render();
  }
  pruneSelection() {
    for (const [key, ref] of this.selection) if (!this.geometryFor(ref)) this.selection.delete(key);
    if (!this.selection.has(regionKey(this.selected, this.activePart))) {
      const ref = [...this.selection.values()].at(-1);
      this.selected = (ref == null ? void 0 : ref.id) || null;
      this.activePart = (ref == null ? void 0 : ref.part) || "target";
    }
  }
  selectOwners(boxes, primary = this.selected) {
    var _a;
    this.selection.clear();
    for (const b of boxes) this.selection.set(regionKey(b.id), { id: b.id, part: "target" });
    this.selected = boxes.some((b) => b.id === primary) ? primary : ((_a = boxes.at(-1)) == null ? void 0 : _a.id) || null;
    this.activePart = "target";
  }
  setTool(tool) {
    var _a;
    this.drawPart = null;
    this.tool = tool;
    this.closePopovers();
    if (tool !== "select" && this.stage.contains(this.root.getRootNode().activeElement)) (_a = this.root.getRootNode().activeElement) == null ? void 0 : _a.blur();
    this.refreshButtons();
  }
  toggleMenu(open = this.menu.hidden) {
    this.menu.hidden = !open;
    this.buttons.menu.setAttribute("aria-expanded", String(open));
    if (open) this.closePopovers();
  }
  togglePopover(name, anchor2) {
    var _a, _b;
    const opening = this.openPopover !== name;
    this.closePopovers();
    if (!opening) return;
    if (name !== "snapping" && !this.box()) return;
    this.toggleMenu(false);
    this.openPopover = name;
    this.popoverAnchor = anchor2;
    this.popovers[name].hidden = false;
    anchor2.setAttribute("aria-expanded", "true");
    if (name === "extra") {
      this.extraField.value = this.box().extra_instruction || "";
      ((_a = this.extraLabel.firstChild) == null ? void 0 : _a.nodeType) === 3 && (this.extraLabel.firstChild.textContent = `Additional instruction \xB7 ${this.box().object_id}`);
    }
    this.refreshButtons();
    this.positionPopover();
    if (name === "extra") this.extraField.focus({ preventScroll: true });
    else if (["text", "transform", "align"].includes(name)) (_b = this.popovers[name].querySelector("[aria-checked=true]:not(:disabled)") || this.popovers[name].querySelector("button:not(:disabled)")) == null ? void 0 : _b.focus({ preventScroll: true });
  }
  closePopovers({ restoreFocus = false } = {}) {
    var _a, _b, _c, _d;
    const anchor2 = this.popoverAnchor, active2 = this.root.getRootNode().activeElement;
    if (active2 && this.popovers && Object.values(this.popovers).some((p) => p.contains(active2))) (_a = active2.blur) == null ? void 0 : _a.call(active2);
    if (this.popovers) for (const p of Object.values(this.popovers)) p.hidden = true;
    if (this.popoverAnchor) this.popoverAnchor.setAttribute("aria-expanded", "false");
    this.openPopover = null;
    this.popoverAnchor = null;
    if (restoreFocus) anchor2 == null ? void 0 : anchor2.focus({ preventScroll: true });
    if ((_b = this.buttons) == null ? void 0 : _b.addPrompt) this.buttons.addPrompt.classList.toggle("active", !!((_d = (_c = this.box()) == null ? void 0 : _c.extra_instruction) == null ? void 0 : _d.trim()));
  }
  positionPopover() {
    if (!this.openPopover) return;
    const p = this.popovers[this.openPopover], anchor2 = this.popoverAnchor.getBoundingClientRect(), v = this.viewport.getBoundingClientRect(), sx = this.viewport.clientWidth / (v.width || 1), sy = this.viewport.clientHeight / (v.height || 1), rect = p.getBoundingClientRect();
    const width = Math.min(p.classList.contains("extra-popover") ? 270 : 205, this.viewport.clientWidth - 16), height = Math.min(rect.height * sy || 140, this.viewport.clientHeight - 16);
    p.style.width = `${width}px`;
    p.style.maxHeight = `${this.viewport.clientHeight - 16}px`;
    let top = (anchor2.bottom - v.top) * sy + 6;
    if (top + height > this.viewport.clientHeight - 8) top = (anchor2.top - v.top) * sy - height - 6;
    p.style.left = `${clamp((anchor2.left - v.left) * sx, 8, Math.max(8, this.viewport.clientWidth - width - 8))}px`;
    p.style.top = `${clamp(top, 8, Math.max(8, this.viewport.clientHeight - height - 8))}px`;
  }
  refreshButtons() {
    var _a;
    const b = this.box() || this.defaults;
    for (const name of ["select", "draw", "pan"]) this.setActive(this.buttons[name], this.tool === name);
    for (const mode of MODES) {
      this.setActive(this.buttons[mode], b.mode === mode);
      this.buttons[mode].disabled = ["keep", "remove"].includes(b.action);
    }
    for (const align of Object.keys(ALIGN)) {
      this.setActive(this.buttons[align], b.align === align);
      this.buttons[align].disabled = b.action !== "new" || !supportsAlignment(b.mode);
    }
    if (["plain", "change"].includes(b.mode)) this.groupChoices.text = b.mode;
    if (["move", "size", "vertical", "tracking"].includes(b.mode)) this.groupChoices.transform = b.mode;
    if (b.align) this.groupChoices.align = b.align;
    for (const name of ["text", "transform", "align"]) {
      const trigger = this.buttons[name + "Group"], choice = this.groupChoices[name], active2 = name === "align" ? !!b.align : name === "text" ? ["plain", "change"].includes(b.mode) : ["move", "size", "vertical", "tracking"].includes(b.mode);
      trigger.innerHTML = svg(choice) + svg("chevron", "dropdown-arrow");
      trigger.title = `${name === "align" ? "Alignment" : name === "text" ? "Text tools" : "Transform tools"}: ${LABELS[choice]}`;
      trigger.disabled = !this.box() || (name === "align" ? b.action !== "new" || !supportsAlignment(b.mode) : ["keep", "remove"].includes(b.action));
      this.setActive(trigger, active2);
      trigger.setAttribute("aria-expanded", String(this.openPopover === name));
    }
    this.buttons.bold.disabled = !this.box() || ["keep", "remove"].includes(b.action);
    this.buttons.italic.disabled = this.buttons.bold.disabled;
    this.buttons.trash.disabled = !this.selection.size;
    this.buttons.cloneBox.disabled = !this.selection.size;
    this.buttons.clearBoxes.disabled = !this.state.boxes.length;
    this.buttons.undo.disabled = !this.past.length;
    this.buttons.redo.disabled = !this.future.length;
    this.buttons.addPrompt.disabled = !this.box();
    this.setActive(this.buttons.addPrompt, !!((_a = b.extra_instruction) == null ? void 0 : _a.trim()) || this.openPopover === "extra");
    this.setActive(this.buttons.snap, this.snapSettings.boxes || this.snapSettings.guides);
    this.buttons.snap.setAttribute("aria-expanded", String(this.openPopover === "snapping"));
    for (const row of this.popovers.snapping.querySelectorAll('[role="switch"]')) row.setAttribute("aria-checked", String(this.snapSettings[row.dataset.setting]));
    this.setActive(this.buttons.labels, this.labelsHidden);
    this.buttons.labels.title = this.labelsHidden ? "Show box labels and text" : "Hide box labels and text";
    this.buttons.labels.setAttribute("aria-label", this.buttons.labels.title);
    this.stage.classList.toggle("draw", this.tool === "draw");
    this.stage.classList.toggle("pan", this.tool === "pan");
    this.viewport.classList.toggle("pan", this.tool === "pan");
    this.stage.classList.toggle("labels-hidden", this.labelsHidden);
    for (const f of this.stage.querySelectorAll("textarea,input")) {
      f.readOnly = this.tool !== "select";
      f.tabIndex = this.tool === "select" && !this.labelsHidden ? 0 : -1;
    }
    this.updateInteractionVisibility();
  }
  setActive(button, active2) {
    if (!button) return;
    button.classList.toggle("active", active2);
    button.setAttribute("aria-pressed", String(active2));
    if (button.getAttribute("role") === "menuitemradio") button.setAttribute("aria-checked", String(active2));
  }
  updateInteractionVisibility() {
    var _a;
    const adjusting = ["move", "resize"].includes((_a = this.drag) == null ? void 0 : _a.kind);
    for (const n of this.layer.children) {
      const selected = this.selection.has(regionKey(n.dataset.id, n.dataset.part));
      n.classList.toggle("adjusting", adjusting && selected);
      n.querySelector(".body").hidden = this.labelsHidden || adjusting && selected;
      n.querySelector(".tag").hidden = this.labelsHidden || adjusting && selected;
      for (const h of n.querySelectorAll(".handle")) h.hidden = adjusting;
    }
    this.positionTaskbar();
  }
  fieldsFor(b) {
    if (["keep", "remove"].includes(b.action)) return [["content", b.action === "keep" ? "Text / description to keep" : "Text / description to remove"]];
    if (b.mode === "change") return [["source", "Original text"], ["replacement", "Replacement text"]];
    if (b.mode === "plain") return [["content", "Result text / description"], ["free_instruction", "Instruction (optional)"]];
    return [["content", { bold: "Text to bold", italic: "Text to italicize", move: "Text to move", size: "Text to resize", vertical: "Text to scale vertically", tracking: "Text to adjust tracking" }[b.mode] || "Result text"]];
  }
  input(b, key, label, inside = false) {
    const f = el2(inside && b.mode === "change" ? "input" : "textarea");
    f.value = b[key] || "";
    f.placeholder = label;
    f.setAttribute("aria-label", label);
    f.dataset.key = key;
    f.dataset.boxId = b.id;
    if (inside) {
      f.readOnly = this.tool !== "select";
      f.tabIndex = this.tool === "select" && !this.labelsHidden ? 0 : -1;
    }
    f.addEventListener("pointerdown", (e) => {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && this.tool !== "pan" && e.button !== 1) e.stopPropagation();
    });
    let started = false;
    f.addEventListener("focus", () => {
      started = false;
    });
    f.addEventListener("input", () => {
      if (!started) {
        this.checkpoint();
        started = true;
      }
      b[key] = f.value;
      for (const other of this.root.querySelectorAll("[data-key]")) if (other !== f && other.dataset.boxId === b.id && other.dataset.key === key) other.value = f.value;
      this.changed();
      this.updateInstruction();
    });
    return f;
  }
  updateInstruction() {
    const b = this.box(), output = this.inspector.querySelector("output");
    if (b && output) {
      output.textContent = boxInstruction(b);
      output.title = output.textContent;
    }
  }
  renderBoxes() {
    this.layer.replaceChildren();
    this.empty.hidden = this.hasBackground || this.state.boxes.length > 0;
    for (const r of regions(this.state.boxes)) {
      const b = this.state.boxes.find((b2) => b2.id === r.id), primary = r.id === this.selected && r.part === this.activePart, selected = this.selection.has(r.key), n = el2("div", `box${primary ? " selected" : selected ? " multi-selected" : ""}${r.part === "source" ? " source-box" : ""}${b.action === "keep" ? " keep-box" : ""}${b.action === "remove" ? " remove-box" : ""}`);
      n.dataset.id = r.id;
      n.dataset.part = r.part;
      n.style.setProperty("--box", COLORS[this.state.boxes.indexOf(b) % COLORS.length]);
      this.position(n, r.g);
      const tag = el2("div", "tag");
      tag.title = `${b.object_id}: ${b.action}${b.action === "move" ? ` \xB7 ${r.part}` : ""} \xB7 ${b.mode}${b.align ? ` \xB7 ${b.align} align` : ""}`;
      tag.setAttribute("aria-label", tag.title);
      const options = b.action === "move" ? [r.part, "move"] : [b.action, b.mode, ...b.align ? [b.align] : []];
      for (const option of [...new Set(options)]) {
        const icon = el2("span", "option-icon");
        icon.dataset.option = option;
        icon.innerHTML = svg(option);
        tag.append(icon);
      }
      n.append(tag);
      const body = el2("div", `body ${b.mode}`);
      if (r.part !== "source") {
        if (primary) for (const [key, label] of this.fieldsFor(b)) body.append(this.input(b, key, label, true));
        else body.append(el2("p", null, resultText(b) || "Click to edit"));
      }
      n.append(body);
      if (primary) for (const handle of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
        const h = el2("div", "handle");
        h.dataset.h = handle;
        h.style.cursor = `${handle}-resize`;
        n.append(h);
      }
      this.layer.append(n);
    }
    this.updateInteractionVisibility();
    this.renderArrows();
  }
  position(n, g) {
    Object.assign(n.style, { left: `${g.x * 100}%`, top: `${g.y * 100}%`, width: `${g.w * 100}%`, height: `${g.h * 100}%` });
  }
  renderArrows() {
    const w = this.stage.clientWidth || 1, h = this.stage.clientHeight || 1;
    this.arrows.setAttribute("viewBox", `0 0 ${w} ${h}`);
    this.arrows.innerHTML = this.state.boxes.filter((b) => b.action === "move" && b.src).map((b) => {
      const x = (b.src.x + b.src.w / 2) * w, y = (b.src.y + b.src.h / 2) * h, cx = (b.x + b.w / 2) * w, cy = (b.y + b.h / 2) * h, dx = cx - x, dy = cy - y;
      if (Math.hypot(dx, dy) < 2) return "";
      const edge = Math.min(b.w * w / 2 / Math.max(1e-9, Math.abs(dx)), b.h * h / 2 / Math.max(1e-9, Math.abs(dy)), 0.8), ex = cx - dx * edge, ey = cy - dy * edge, a = Math.atan2(ey - y, ex - x), color = COLORS[this.state.boxes.indexOf(b) % COLORS.length];
      return `<path d="M${x} ${y}L${ex} ${ey}M${ex - 8 * Math.cos(a - 0.5)} ${ey - 8 * Math.sin(a - 0.5)}L${ex} ${ey}L${ex - 8 * Math.cos(a + 0.5)} ${ey - 8 * Math.sin(a + 0.5)}" stroke="${color}" fill="none" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    }).join("");
  }
  renderInspector() {
    this.inspector.replaceChildren();
    const b = this.box(), target = b || this.defaults, head = el2("div", "inspector-head");
    this.inspector.append(head);
    if (b) head.append(el2("span", "selection", b.object_id + (this.selection.size > 1 ? ` \xB7 ${this.selection.size} selected` : "")));
    const action = el2("select");
    action.setAttribute("aria-label", "Row action");
    for (const value of ACTIONS) {
      const o = el2("option", null, value[0].toUpperCase() + value.slice(1));
      o.value = value;
      action.append(o);
    }
    action.value = target.action || "new";
    action.addEventListener("change", () => {
      if (b) {
        this.checkpoint();
        const selected = this.selectedBoxes();
        for (const box of selected) setAction(box, action.value);
        this.selectOwners(selected);
        this.changed();
        this.render();
      } else {
        setAction(this.defaults, action.value);
        this.render();
      }
    });
    head.append(action);
    if (!b) {
      head.append(el2("span", "setting-summary", `${target.mode}${target.align ? ` \xB7 ${target.align} align` : ""}`));
      this.inspector.append(el2("span", "hint", "Drag to draw \xB7 V to edit \xB7 Ctrl/Shift-click for multi-selection"));
      return;
    }
    if (b.action === "move") for (const part of ["source", "target"]) {
      const choose = el2("button", "icon pair-control" + (this.activePart === part ? " active" : ""));
      choose.type = "button";
      choose.title = `Select ${part} box`;
      choose.setAttribute("aria-label", choose.title);
      choose.innerHTML = svg(part);
      choose.addEventListener("click", () => {
        this.setTool("select");
        this.select(b.id, part);
      });
      head.append(choose);
      const draw = el2("button", "icon pair-control");
      draw.type = "button";
      draw.title = `Draw ${part} box`;
      draw.setAttribute("aria-label", draw.title);
      draw.innerHTML = svg("draw");
      draw.addEventListener("click", () => {
        this.setTool("draw");
        this.select(b.id, part);
        this.drawPart = { id: b.id, part };
        this.tool = "draw";
        this.render();
        this.notify(`Draw the ${part} box`);
      });
      head.append(draw);
    }
    const fields = el2("div", "fields");
    for (const [key, label] of this.fieldsFor(b)) {
      const wrapper = el2("label", "field");
      wrapper.title = label;
      const f = this.input(b, key, label);
      f.rows = 1;
      wrapper.append(f);
      fields.append(wrapper);
    }
    head.append(fields);
    const output = el2("output", "generated", boxInstruction(b));
    output.setAttribute("aria-label", "Generated instruction");
    output.title = output.textContent;
    this.inspector.append(output);
  }
  render() {
    this.pruneSelection();
    this.renderBoxes();
    this.renderInspector();
    this.refreshButtons();
    this.fit();
  }
  chooseMode(mode) {
    this.drawPart = null;
    if (this.box()) {
      this.checkpoint();
      const boxes = this.selectedBoxes();
      for (const b of boxes) setMode(b, mode);
      this.selectOwners(boxes);
      this.changed();
      this.render();
      this.focusText();
    } else {
      setMode(this.defaults, mode);
      this.render();
    }
  }
  chooseAlignment(align) {
    const target = this.box() || this.defaults;
    if (target.action !== "new" || !supportsAlignment(target.mode)) return;
    if (this.box()) {
      this.checkpoint();
      const boxes = this.selectedBoxes().filter((b) => b.action === "new" && supportsAlignment(b.mode)), clear = boxes.every((b) => b.align === align);
      for (const b of boxes) b.align = clear ? null : align;
      this.changed();
      this.render();
    } else {
      target.align = target.align === align ? null : align;
      this.render();
    }
  }
  focusText() {
    var _a;
    if (this.tool !== "select") return;
    const f = !this.labelsHidden && this.root.querySelector(".box.selected textarea,.box.selected input");
    if (f && f.getBoundingClientRect().height > 20) f.focus({ preventScroll: true });
    else (_a = this.inspector.querySelector("textarea")) == null ? void 0 : _a.focus({ preventScroll: true });
  }
  point(e, constrain = true) {
    const r = this.stage.getBoundingClientRect(), x = (e.clientX - r.left) / (r.width || 1), y = (e.clientY - r.top) / (r.height || 1);
    return { x: constrain ? clamp(x) : x, y: constrain ? clamp(y) : y };
  }
  localPoint(e) {
    const r = this.viewport.getBoundingClientRect();
    return { x: (e.clientX - r.left) * this.viewport.clientWidth / (r.width || 1), y: (e.clientY - r.top) * this.viewport.clientHeight / (r.height || 1) };
  }
  pointerDown(e) {
    var _a;
    if (this.taskbar.contains(e.target) || this.popupLayer.contains(e.target)) return;
    if (this.guides.pointerDown(e)) return;
    const raw = this.point(e, false), inImage = raw.x >= 0 && raw.x <= 1 && raw.y >= 0 && raw.y <= 1, inStage = this.stage.contains(e.target) || !!e.target.closest(".guide");
    if (e.button === 0 && e.altKey && inImage) {
      e.preventDefault();
      e.stopPropagation();
      const hits = regions(this.state.boxes).filter((r) => raw.x >= r.g.x && raw.x <= r.g.x + r.g.w && raw.y >= r.g.y && raw.y <= r.g.y + r.g.h).reverse();
      if (hits.length) {
        const i = hits.findIndex((r) => r.id === this.selected && r.part === this.activePart), next = hits[(i + 1) % hits.length];
        this.select(next.id, next.part);
      }
      return;
    }
    if (e.button === 1 || e.button === 0 && this.tool === "pan") {
      e.preventDefault();
      e.stopPropagation();
      this.closePopovers();
      this.drag = { kind: "pan", start: this.localPoint(e), before: { ...this.view }, pointerId: e.pointerId };
      this.viewport.setPointerCapture(e.pointerId);
      this.viewport.classList.add("panning");
      return;
    }
    if (e.button !== 0) return;
    this.closePopovers();
    this.toggleMenu(false);
    if (this.tool === "draw") {
      if (!inImage || !inStage) return;
      e.preventDefault();
      e.stopPropagation();
      this.checkpoint();
      const pair = this.drawPart ? { ...this.drawPart } : null;
      if (!pair) {
        this.selection.clear();
        this.selected = null;
      }
      this.drag = { kind: "draw", start: this.point(e), pair, pointerId: e.pointerId };
      this.render();
      this.draft = el2("div", "draft");
      this.stage.append(this.draft);
      this.position(this.draft, { ...this.drag.start, w: 0, h: 0 });
      this.viewport.setPointerCapture(e.pointerId);
      return;
    }
    const outer = e.target.closest(".box");
    if (!outer) {
      this.select(null);
      return;
    }
    const id = outer.dataset.id, part = outer.dataset.part || "target", key = regionKey(id, part), handle = (_a = e.target.closest(".handle")) == null ? void 0 : _a.dataset.h;
    if ((e.ctrlKey || e.metaKey || e.shiftKey) && !handle) {
      e.preventDefault();
      e.stopPropagation();
      this.select(id, part, { toggle: true });
      return;
    }
    if (e.target.closest("input,textarea") && this.selection.has(key)) return;
    const already = this.selection.has(key), moveHandle = handle || e.target.closest(".tag") || e.target === outer;
    e.preventDefault();
    this.select(id, part, { preserve: already });
    if (moveHandle) {
      this.checkpoint();
      const refs = this.selectedRegions().sort((a, b) => a.id === id && a.part === part ? -1 : b.id === id && b.part === part ? 1 : 0), before = refs.map((ref) => ({ ...geometry(this.geometryFor(ref)), ...ref }));
      this.drag = { kind: handle ? "resize" : "move", handle, start: this.point(e), refs, before, pointerId: e.pointerId };
      this.drag.targets = targetsFor(regions(this.state.boxes), new Set(refs.map((r) => regionKey(r.id, r.part))), this.state.guides, this.snapSettings);
      this.updateInteractionVisibility();
      this.viewport.setPointerCapture(e.pointerId);
    } else this.focusText();
  }
  pointerMove(e) {
    if (!this.drag) return;
    const d = this.drag;
    if (d.kind === "guide") {
      this.guides.move(e);
      return;
    }
    if (d.kind === "taskbar") {
      const p2 = this.localPoint(e);
      this.taskbarOffsets.set(d.id, { x: d.effective.x + p2.x - d.start.x, y: d.effective.y + p2.y - d.start.y });
      this.positionTaskbar();
      return;
    }
    if (d.kind === "pan") {
      const p2 = this.localPoint(e);
      this.view.panX = d.before.panX + p2.x - d.start.x;
      this.view.panY = d.before.panY + p2.y - d.start.y;
      this.applyView();
      return;
    }
    const p = this.point(e);
    if (d.kind === "draw") {
      d.box = { x: Math.min(p.x, d.start.x), y: Math.min(p.y, d.start.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
      this.position(this.draft, d.box);
      return;
    }
    const r = this.stage.getBoundingClientRect(), screen = { x: r.width, y: r.height }, dx = p.x - d.start.x, dy = p.y - d.start.y, targets = d.kind === "move" && e.shiftKey ? { x: [], y: [] } : d.targets;
    const result = d.kind === "move" ? moveGroup(d.before, dx, dy, targets, screen) : resizeGroup(d.before, d.handle, dx, dy, e.shiftKey, targets, screen, { w: 1 / this.width, h: 1 / this.height });
    for (let i = 0; i < d.refs.length; i++) {
      const g = this.geometryFor(d.refs[i]), next = result.geometries[i];
      if (g) Object.assign(g, { x: next.x, y: next.y, w: next.w, h: next.h });
    }
    this.snapIndicators = result.snaps;
    this.renderBoxes();
    this.guides.render();
  }
  pointerUp(e) {
    var _a;
    if (!this.drag) return;
    this.pointerMove(e);
    const d = this.drag;
    this.drag = null;
    if (this.viewport.hasPointerCapture(e.pointerId)) this.viewport.releasePointerCapture(e.pointerId);
    this.viewport.classList.remove("panning");
    this.taskbar.classList.remove("dragging");
    this.snapIndicators = [];
    (_a = this.draft) == null ? void 0 : _a.remove();
    this.draft = null;
    if (d.kind === "pan" || d.kind === "taskbar") {
      this.guides.render();
      return;
    }
    if (d.kind === "guide" && d.remove) this.state.guides = this.state.guides.filter((g) => g.id !== d.id);
    if (d.kind === "draw") {
      if (!d.box || d.box.w * this.stage.clientWidth < 4 || d.box.h * this.stage.clientHeight < 4) {
        this.past.pop();
        this.render();
        return;
      }
      if (d.pair) {
        const b = this.state.boxes.find((b2) => b2.id === d.pair.id);
        if (b) {
          if (d.pair.part === "source") b.src = { ...d.box };
          else Object.assign(b, d.box);
          this.selection.clear();
          this.selection.set(regionKey(b.id, d.pair.part), { id: b.id, part: d.pair.part });
          this.selected = b.id;
          this.activePart = d.pair.part;
        }
        this.drawPart = null;
        this.tool = "select";
      } else {
        const b = cleanBox({ ...d.box, ...this.defaults, id: uid(), object_id: allocateId(this.state), origin: "local" });
        this.state.boxes.push(b);
        this.selection.clear();
        this.selection.set(regionKey(b.id), { id: b.id, part: "target" });
        this.selected = b.id;
        this.activePart = "target";
      }
    }
    this.changed();
    this.render();
    if (d.kind === "draw") this.focusText();
  }
  cancelDrag() {
    var _a;
    if (!this.drag) return;
    const d = this.drag;
    if (d.kind === "pan") this.view = d.before;
    else if (d.kind === "taskbar") {
      if (d.before) this.taskbarOffsets.set(d.id, d.before);
      else this.taskbarOffsets.delete(d.id);
    } else {
      const before = this.past.pop();
      if (before) this.state = before;
    }
    this.drag = null;
    this.snapIndicators = [];
    if (d.pointerId != null && this.viewport.hasPointerCapture(d.pointerId)) this.viewport.releasePointerCapture(d.pointerId);
    (_a = this.draft) == null ? void 0 : _a.remove();
    this.draft = null;
    this.viewport.classList.remove("panning");
    this.taskbar.classList.remove("dragging");
    this.render();
  }
  deleteSelected() {
    if (this.drag) this.cancelDrag();
    if (!this.selection.size) return;
    this.checkpoint();
    const ids = new Set(this.selectedBoxes().map((b) => b.id));
    this.state.boxes = this.state.boxes.filter((b) => !ids.has(b.id));
    this.selection.clear();
    this.selected = null;
    this.drawPart = null;
    this.closePopovers();
    this.changed();
    this.render();
  }
  clearBoxes() {
    if (this.drag) this.cancelDrag();
    if (!this.state.boxes.length) return;
    this.checkpoint();
    this.state.boxes = [];
    this.selection.clear();
    this.selected = null;
    this.drawPart = null;
    this.closePopovers();
    this.changed();
    this.render();
  }
  cloneSelected() {
    if (this.drag) this.cancelDrag();
    const selected = this.selectedBoxes();
    if (!selected.length) return;
    this.checkpoint();
    const copies = selected.map((b) => ({ ...clone(b), id: uid(), origin: "local", object_id: null }));
    this.state.boxes.push(...copies);
    this.selectOwners(copies, copies.at(-1).id);
    this.tool = "select";
    this.drawPart = null;
    this.closePopovers();
    this.changed();
    this.render();
  }
  undo() {
    if (!this.past.length) return;
    const revision = this.state.revision;
    this.future.push(this.snapshot());
    this.state = this.past.pop();
    this.state.revision = revision;
    this.selection.clear();
    this.selected = null;
    this.drawPart = null;
    this.closePopovers();
    this.changed();
    this.render();
  }
  redo() {
    if (!this.future.length) return;
    const revision = this.state.revision;
    this.past.push(this.snapshot());
    this.state = this.future.pop();
    this.state.revision = revision;
    this.selection.clear();
    this.selected = null;
    this.drawPart = null;
    this.closePopovers();
    this.changed();
    this.render();
  }
  keyDown(e) {
    e.stopPropagation();
    if (e.key === "Escape") {
      if (this.drag) this.cancelDrag();
      else if (this.openPopover) this.closePopovers({ restoreFocus: true });
      else if (!this.menu.hidden) this.toggleMenu(false);
      else if (this.modal) this.expand();
      else this.select(null);
      e.preventDefault();
      return;
    }
    if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      e.shiftKey ? this.redo() : this.undo();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      this.deleteSelected();
    } else if (e.key.toLowerCase() === "v") this.setTool("select");
    else if (e.key.toLowerCase() === "n") this.setTool("draw");
    else if (e.key.toLowerCase() === "h") this.setTool("pan");
  }
  fit() {
    if (!this.hasBackground) {
      const [w, h] = this.dimensions();
      this.width = Math.max(1, Number(w) || 1024);
      this.height = Math.max(1, Number(h) || 1024);
    }
    const scale = Math.min(Math.max(1, this.viewport.clientWidth - 24) / this.width, Math.max(1, this.viewport.clientHeight - 24) / this.height);
    this.stage.style.width = `${this.width * scale}px`;
    this.stage.style.height = `${this.height * scale}px`;
    this.applyView();
  }
  applyView() {
    var _a;
    this.stage.style.transform = `translate(-50%, -50%) translate(${this.view.panX}px, ${this.view.panY}px) scale(${this.view.zoom})`;
    this.positionTaskbar();
    this.positionPopover();
    (_a = this.guides) == null ? void 0 : _a.render();
    this.renderArrows();
  }
  resetView() {
    this.view = { zoom: 1, panX: 0, panY: 0 };
    this.fit();
  }
  zoomAt(factor, event) {
    const p = event ? this.localPoint(event) : { x: this.viewport.clientWidth / 2, y: this.viewport.clientHeight / 2 }, old = this.view.zoom, next = clamp(old * factor, 0.25, 8), ratio = next / old;
    this.view.panX = p.x - this.viewport.clientWidth / 2 - (p.x - this.viewport.clientWidth / 2 - this.view.panX) * ratio;
    this.view.panY = p.y - this.viewport.clientHeight / 2 - (p.y - this.viewport.clientHeight / 2 - this.view.panY) * ratio;
    this.view.zoom = next;
    this.applyView();
  }
  selectionBounds() {
    const gs = this.selectedRegions().map((r) => this.geometryFor(r));
    if (!gs.length) return null;
    const x = Math.min(...gs.map((b) => b.x)), y = Math.min(...gs.map((b) => b.y));
    return { x, y, w: Math.max(...gs.map((b) => b.x + b.w)) - x, h: Math.max(...gs.map((b) => b.y + b.h)) - y };
  }
  positionTaskbar() {
    var _a;
    const b = this.selectionBounds();
    if (!b || ["move", "resize"].includes((_a = this.drag) == null ? void 0 : _a.kind)) {
      this.taskbar.hidden = true;
      return;
    }
    const v = this.viewport.getBoundingClientRect(), s = this.stage.getBoundingClientRect(), w = this.viewport.clientWidth, h = this.viewport.clientHeight;
    if (!v.width || !v.height) {
      this.taskbar.hidden = true;
      return;
    }
    const sx = w / v.width, sy = h / v.height, left = (s.left + b.x * s.width - v.left) * sx, top = (s.top + b.y * s.height - v.top) * sy, bounds = { left, top, right: left + b.w * s.width * sx, bottom: top + b.h * s.height * sy };
    this.taskbar.hidden = false;
    const r = this.taskbar.getBoundingClientRect(), position = placeTaskbar(bounds, w, h, r.width * sx || 300, r.height * sy || 38);
    this.taskbar.hidden = !position.visible;
    if (position.visible) {
      this.taskbarAnchor = position;
      const o = this.taskbarOffsets.get(this.selected) || { x: 0, y: 0 };
      this.taskbar.style.left = `${clamp(position.left + o.x, 8, Math.max(8, w - r.width * sx - 8))}px`;
      this.taskbar.style.top = `${clamp(position.top + o.y, 8, Math.max(8, h - r.height * sy - 8))}px`;
      this.taskbar.dataset.side = position.side;
      this.buttons.resetTaskbar.disabled = !this.taskbarOffsets.has(this.selected);
    }
  }
  startTaskbarDrag(e) {
    if (e.button !== 0 || !this.box()) return;
    e.preventDefault();
    e.stopPropagation();
    this.closePopovers();
    const a = this.taskbarAnchor || { left: 0, top: 0 };
    this.drag = { kind: "taskbar", id: this.selected, start: this.localPoint(e), before: this.taskbarOffsets.has(this.selected) ? { ...this.taskbarOffsets.get(this.selected) } : null, effective: { x: parseFloat(this.taskbar.style.left) - a.left, y: parseFloat(this.taskbar.style.top) - a.top }, pointerId: e.pointerId };
    this.viewport.setPointerCapture(e.pointerId);
    this.taskbar.classList.add("dragging");
  }
  resetTaskbar() {
    if (this.selected) this.taskbarOffsets.delete(this.selected);
    this.positionTaskbar();
    this.positionPopover();
  }
  notify(text, error = false) {
    clearTimeout(this.noticeTimer);
    this.message.textContent = text;
    this.message.classList.toggle("error", error);
    this.message.hidden = false;
    this.noticeTimer = setTimeout(() => {
      this.message.hidden = true;
    }, error ? 6e3 : 2400);
  }
  download(prompt = false) {
    const text = prompt ? completePrompt(this.state.boxes) : JSON.stringify(elements(this.state.boxes), null, 2), blob = new Blob([text], { type: prompt ? "text/plain" : "application/json" }), url = URL.createObjectURL(blob), a = el2("a");
    a.href = url;
    a.download = prompt ? "fontbox-prompt.txt" : "elements.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
  }
  importFile() {
    const f = el2("input");
    f.type = "file";
    f.accept = ".json,application/json";
    f.addEventListener("change", async () => {
      if (!f.files[0]) return;
      try {
        const boxes = importBoxes(await f.files[0].text(), this.width, this.height);
        this.checkpoint();
        this.state.boxes.push(...boxes);
        this.selectOwners(boxes);
        this.changed();
        this.render();
        this.notify(`Imported ${boxes.length} boxes`);
      } catch (error) {
        this.notify(error.message, true);
      }
    });
    f.click();
  }
  expand() {
    this.closePopovers();
    if (this.modal) {
      this.shadow.append(this.root);
      this.portal.remove();
      this.modal = null;
      this.portal = null;
    } else {
      this.portal = el2("div");
      document.body.append(this.portal);
      const shadow = this.portal.attachShadow({ mode: "open" }), style = el2("style");
      style.textContent = EDITOR_STYLES;
      this.modal = el2("div", "modal");
      this.modal.setAttribute("role", "dialog");
      this.modal.setAttribute("aria-label", "FontBox");
      shadow.append(style, this.modal);
      this.modal.append(this.root);
    }
    requestAnimationFrame(() => {
      if (!this.destroyed) this.fit();
    });
  }
  setBackground(url, { dimensions } = {}) {
    const generation = (this.imageGeneration || 0) + 1;
    this.imageGeneration = generation;
    if (!url) {
      this.hasBackground = false;
      this.background.hidden = true;
      this.background.removeAttribute("src");
      this.empty.hidden = this.state.boxes.length > 0;
      this.fit();
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const probe = new Image();
      probe.onload = () => {
        if (this.destroyed || this.imageGeneration !== generation) {
          resolve(false);
          return;
        }
        const w = probe.naturalWidth || (dimensions == null ? void 0 : dimensions[0]), h = probe.naturalHeight || (dimensions == null ? void 0 : dimensions[1]);
        if (!(w > 0 && h > 0)) {
          probe.onerror();
          return;
        }
        this.width = w;
        this.height = h;
        this.background.src = probe.src;
        this.background.hidden = false;
        this.hasBackground = true;
        this.empty.hidden = true;
        this.fit();
        resolve(true);
      };
      probe.onerror = () => {
        if (!this.destroyed && this.imageGeneration === generation) {
          this.hasBackground = false;
          this.background.hidden = true;
          this.background.removeAttribute("src");
          this.empty.hidden = this.state.boxes.length > 0;
          this.fit();
          this.notify("Background preview could not load.", true);
        }
        resolve(false);
      };
      probe.src = url;
    });
  }
  async sync(output, imageUrl, { skipBackground = false } = {}) {
    var _a, _b;
    const next = (_a = output.lora_bbox_state) == null ? void 0 : _a[0];
    if (next) {
      if (next.revision === this.state.revision) this.state = parseState(next);
      else if (next.incoming_signature !== this.state.incoming_signature) {
        this.state.boxes = this.state.boxes.filter((b) => b.origin !== "input").concat(next.boxes.filter((b) => b.origin === "input"));
        this.state.incoming_signature = next.incoming_signature;
      }
      assignIds(this.state);
      this.onChange(this.serialize());
      this.render();
    }
    if (skipBackground) return;
    const image = (_b = output.background_images) == null ? void 0 : _b[0];
    await this.setBackground(image ? imageUrl(image) : null, { dimensions: output.lora_bbox_dims });
  }
  destroy() {
    var _a;
    this.destroyed = true;
    this.imageGeneration = (this.imageGeneration || 0) + 1;
    clearTimeout(this.noticeTimer);
    document.removeEventListener("pointerdown", this.documentPointer, true);
    this.observer.disconnect();
    this.taskbarObserver.disconnect();
    (_a = this.portal) == null ? void 0 : _a.remove();
    this.host.remove();
  }
};

// ComfyUI-FontBox/frontend/background.js
function parseImageSelection(value, defaultType = "input") {
  if (value && typeof value === "object") {
    const filename = value.filename || value.name || value.asset_hash;
    return filename ? { filename: String(filename), subfolder: String(value.subfolder || ""), type: value.type || defaultType } : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  let path = value.trim(), type = defaultType;
  const annotation = path.match(/\s+\[(input|output|temp)\]$/);
  if (annotation) {
    type = annotation[1];
    path = path.slice(0, annotation.index);
  }
  const slash = path.lastIndexOf("/");
  return { filename: path.slice(slash + 1), subfolder: slash < 0 ? "" : path.slice(0, slash), type };
}
function stamp(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
function imageViewURL(api2, image, revision = "") {
  const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || "", type: image.type || "input" });
  if (revision) query.set("fontbox_preview", stamp(revision));
  return api2.apiURL(`/view?${query}`);
}
var getLink = (graph, id) => {
  var _a, _b, _c, _d;
  return (_d = (_b = (_a = graph == null ? void 0 : graph.links) == null ? void 0 : _a.get) == null ? void 0 : _b.call(_a, id)) != null ? _d : (_c = graph == null ? void 0 : graph.links) == null ? void 0 : _c[id];
};
var nodeClass = (node) => (node == null ? void 0 : node.comfyClass) || (node == null ? void 0 : node.type) || "";
function resolveBackground(node, app2, api2) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
  let graph = node.graph || app2.graph || app2.rootGraph;
  const input = (_a = node.inputs) == null ? void 0 : _a.find((input2) => input2.name === "background");
  if ((input == null ? void 0 : input.link) == null) return { key: "disconnected", connected: false, url: null };
  let link = getLink(graph, input.link), source, slot = 0;
  const seen = /* @__PURE__ */ new Set();
  for (let depth = 0; depth < 64 && link; depth++) {
    source = (_b = graph == null ? void 0 : graph.getNodeById) == null ? void 0 : _b.call(graph, link.origin_id);
    slot = Number(link.origin_slot || 0);
    if (!source || seen.has(source)) {
      source = null;
      break;
    }
    seen.add(source);
    if (nodeClass(source) !== "Reroute") break;
    graph = source.graph || graph;
    link = getLink(graph, (_d = (_c = source.inputs) == null ? void 0 : _c[0]) == null ? void 0 : _d.link);
    source = null;
  }
  if (!source) return { key: `pending-link:${input.link}`, connected: true, url: null };
  const sourceKey = `${source.id}:${slot}`;
  if (["LoadImage", "LoadImageOutput"].includes(nodeClass(source)) && slot === 0) {
    const widget = (_e = source.widgets) == null ? void 0 : _e.find((widget2) => widget2.name === "image");
    const imageInput = (_f = source.inputs) == null ? void 0 : _f.find((input2) => input2.name === "image");
    const descriptor = (imageInput == null ? void 0 : imageInput.link) == null ? parseImageSelection(widget == null ? void 0 : widget.value, nodeClass(source) === "LoadImageOutput" ? "output" : "input") : null;
    if (descriptor) {
      const preview = (_g = source.imgs) == null ? void 0 : _g[0];
      const revision = JSON.stringify(descriptor) + String(((_h = preview == null ? void 0 : preview.dataset) == null ? void 0 : _h.fileUrl) || (preview == null ? void 0 : preview.currentSrc) || (preview == null ? void 0 : preview.src) || "");
      const key = `file:${sourceKey}:${revision}`;
      return { key, connected: true, kind: "file", url: imageViewURL(api2, descriptor, revision) };
    }
    return { key: `pending-file:${sourceKey}`, connected: true, url: null };
  }
  if (slot === 0) {
    const output = (_i = app2.nodeOutputs) == null ? void 0 : _i[String(source.id)];
    const image = (_j = output == null ? void 0 : output.images) == null ? void 0 : _j[0];
    if (image == null ? void 0 : image.filename) {
      const descriptor = parseImageSelection(image, "output"), preview2 = (_k = source.imgs) == null ? void 0 : _k[0];
      const revision = JSON.stringify(descriptor) + String(((_l = preview2 == null ? void 0 : preview2.dataset) == null ? void 0 : _l.fileUrl) || (preview2 == null ? void 0 : preview2.currentSrc) || (preview2 == null ? void 0 : preview2.src) || "");
      return { key: `cached:${sourceKey}:${revision}`, connected: true, kind: "preview", url: imageViewURL(api2, descriptor, revision) };
    }
    const preview = (_m = source.imgs) == null ? void 0 : _m[0], url = ((_n = preview == null ? void 0 : preview.dataset) == null ? void 0 : _n.fileUrl) || (preview == null ? void 0 : preview.currentSrc) || (preview == null ? void 0 : preview.src);
    if (url) return { key: `preview:${sourceKey}:${url}`, connected: true, kind: "preview", url };
  }
  return { key: `pending:${sourceKey}`, connected: true, url: null };
}
var BackgroundWatcher = class {
  constructor(node, editor, app2, api2, { schedule = setInterval, cancel = clearInterval, report = (error) => console.warn("[FontBox] Background preview is not ready:", error) } = {}) {
    Object.assign(this, { node, editor, app: app2, api: api2, schedule, cancel, report });
    this.lastKey = null;
    this.disposed = false;
  }
  reportOnce(error) {
    const message = String((error == null ? void 0 : error.message) || error);
    if (message === this.lastError) return;
    this.lastError = message;
    try {
      this.report(error);
    } catch {
    }
  }
  refresh(force = false) {
    if (this.disposed) return this.current;
    let current;
    try {
      current = resolveBackground(this.node, this.app, this.api);
    } catch (error) {
      this.reportOnce(error);
      return this.current;
    }
    this.current = current;
    if (!force && current.key === this.lastKey) return current;
    this.lastKey = current.key;
    this.status = current.url ? "loading" : "empty";
    try {
      const loading = this.editor.setBackground(current.url);
      this.lastError = null;
      Promise.resolve(loading).then((loaded) => {
        if (!this.disposed && this.lastKey === current.key) this.status = current.url ? loaded ? "ready" : "error" : "empty";
      }).catch((error) => {
        if (!this.disposed && this.lastKey === current.key) {
          this.status = "error";
          this.reportOnce(error);
        }
      });
      if (current.connected && !current.url) this.editor.notify("Background connected. Its upstream image must be available before it can be displayed.");
    } catch (error) {
      this.status = "error";
      this.lastKey = null;
      this.reportOnce(error);
    }
    return current;
  }
  get ownsBackground() {
    var _a;
    return !!((_a = this.current) == null ? void 0 : _a.url) && this.status !== "error";
  }
  start() {
    if (this.disposed || this.timer !== void 0) return;
    try {
      this.timer = this.schedule(() => this.refresh(), 200);
      this.refresh();
    } catch (error) {
      this.reportOnce(error);
    }
  }
  stop() {
    this.disposed = true;
    if (this.timer !== void 0) this.cancel(this.timer);
  }
};

// ComfyUI-FontBox/frontend/comfy.js
var editors = /* @__PURE__ */ new WeakMap();
var backgrounds = /* @__PURE__ */ new WeakMap();
var activeBackgrounds = /* @__PURE__ */ new Set();
function ensureSockets(node) {
  var _a;
  if (node.comfyClass === "FontBoxFitBoxAspect" && typeof node.addInput === "function" && !((_a = node.inputs) == null ? void 0 : _a.some((i) => i.name === "instruction"))) node.addInput("instruction", "STRING");
  const specs = node.comfyClass === "LoRABoundingBoxEditor" ? [["elements", "ARRAY"], ["bbox", "BOUNDING_BOX"], ["mask", "MASK"], ["preview", "IMAGE"], ["prompt", "STRING"], ["instruction", "STRING"], ["elements_json", "STRING"]] : node.comfyClass === "FontBoxFitBoxAspect" ? [["elements", "ARRAY"], ["bbox", "BOUNDING_BOX"], ["mask", "MASK"], ["preview", "IMAGE"], ["elements_json", "STRING"], ["prompt", "STRING"]] : null;
  if (specs && typeof node.addOutput === "function") for (let i = (node.outputs || []).length; i < specs.length; i++) node.addOutput(...specs[i]);
}
app.registerExtension({
  name: "fontbox.editor",
  getCustomWidgets() {
    return { LORA_BBOX_EDITOR(node, inputName, inputData) {
      var _a;
      const host = document.createElement("div");
      const editor = new BBoxEditor(host, {
        dimensions: () => {
          var _a2, _b, _c, _d;
          return [
            ((_b = (_a2 = node.widgets) == null ? void 0 : _a2.find((w) => w.name === "width")) == null ? void 0 : _b.value) || 1024,
            ((_d = (_c = node.widgets) == null ? void 0 : _c.find((w) => w.name === "height")) == null ? void 0 : _d.value) || 1024
          ];
        },
        onChange: () => {
          var _a2;
          return (_a2 = node.graph) == null ? void 0 : _a2.setDirtyCanvas(true, true);
        }
      });
      let watcher;
      const widget = node.addDOMWidget(inputName, "LORA_BBOX_EDITOR", host, {
        getValue: () => editor.serialize(),
        setValue: (value) => editor.load(value),
        getMinHeight: () => 560,
        getMaxHeight: () => 560,
        getHeight: () => 560,
        hideOnZoom: false,
        // ComfyUI must not select/reframe the node when a nested text field gains focus.
        selectOn: [],
        afterResize: () => editor.fit(),
        onDraw: () => watcher == null ? void 0 : watcher.refresh()
      });
      widget.computeSize = (width) => [width, 560];
      widget.serializeValue = () => editor.serialize();
      const originalRemove = widget.onRemove;
      widget.onRemove = function(...args) {
        watcher == null ? void 0 : watcher.stop();
        activeBackgrounds.delete(watcher);
        editor.destroy();
        return originalRemove == null ? void 0 : originalRemove.apply(this, args);
      };
      editor.load((_a = inputData[1]) == null ? void 0 : _a.default);
      editors.set(node, editor);
      watcher = new BackgroundWatcher(node, editor, app, api);
      backgrounds.set(node, watcher);
      activeBackgrounds.add(watcher);
      queueMicrotask(() => watcher.start());
      return { widget };
    } };
  },
  nodeCreated(node) {
    var _a;
    ensureSockets(node);
    if (node.comfyClass !== "LoRABoundingBoxEditor") return;
    if (node.title === "LoRA Bounding Box Editor") node.title = "FontBox";
    node.setSize([Math.max(640, node.size[0]), Math.max(680, node.size[1])]);
    (_a = backgrounds.get(node)) == null ? void 0 : _a.start();
  },
  loadedGraphNode(node) {
    var _a, _b, _c;
    ensureSockets(node);
    if (node.comfyClass === "LoRABoundingBoxEditor" && node.title === "LoRA Bounding Box Editor") node.title = "FontBox";
    (_a = editors.get(node)) == null ? void 0 : _a.render();
    (_b = backgrounds.get(node)) == null ? void 0 : _b.start();
    (_c = backgrounds.get(node)) == null ? void 0 : _c.refresh();
  },
  setup() {
    api.addEventListener("executed", (event) => {
      var _a, _b, _c;
      for (const watcher of activeBackgrounds) watcher.refresh();
      const data = event.detail;
      const graph = app.rootGraph || app.graph;
      const node = (graph == null ? void 0 : graph.getNodeById(data.node)) || ((_a = app.graph) == null ? void 0 : _a.getNodeById(data.node));
      const editor = node && editors.get(node);
      if (!editor || !((_b = data.output) == null ? void 0 : _b.lora_bbox_state)) return;
      editor.sync(data.output, (image) => imageViewURL(api, image), { skipBackground: !!((_c = backgrounds.get(node)) == null ? void 0 : _c.ownsBackground) });
    });
  }
});
