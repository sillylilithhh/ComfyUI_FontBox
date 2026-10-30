# ComfyUI_FontBox
A ComfyUI bbox editor geared towards text manipulation for FLUX.3 Image Klein.

<p align="center">
<img src="https://github.com/user-attachments/assets/926b111b-5458-4343-ae67-5d11afb0bfd7" width="600">
</p>

# Installation

```
cd custom_nodes/
git clone https://github.com/sillylilithhh/ComfyUI_FontBox
```

# Documentation

## Basic tools
### Selection/move bboxes tool
Allows you to select a bbox(s) and allow you to adjust the boundaries of them by using the resize handles. When resizing, hold `Shift` to constrain the resizing to the current bbox aspect ratio.

### Draw a box tool
Allows you to draw bboxes onto the canvas. Left mouse drag to create bboxes.

### Pan Canvas (hand) tool
Allows you to pan the canvas. Left mouse drag to pan the canvas.

### Fit Canvas
Fits the view to the canvas.

### Expand editor
Expands the editor into a large modal dialog, acting as a 'fullscreen' of the editor.

### Hide box labels and text
Toggle to hide all bbox labels and text inside, only leaving the bbox boundaries. Useful if the motifs and text get in the way.

### Snapping (magnet) options
Toggle options on to change snapping behavior of bboxes. Snap to guides, or snap to bboxes.

### Guides
Drag from the horizontal or vertical rulers to create a guide. If snapping is turned on, bboxes will snap to the edge of the guide when it is in close proximity.

## Bbox Selection options

When a bbox is selected, there are various options that appear in a floating taskbar above the text. These are the following:

### Change Text mode
Using the bbox boundaries, change the text that resides in them. You must type in the text you want to change verbatim in the "original text" field. In "replacement text" field, you can write what text should be there. Only write the text you want verbatim; do not type any instructions here, just plain text without quotes. Boilerplate prompts will auto quote this text, so only type plain text. Left, right, and center align options are compatible in this mode. This change text mode is the default mode when creating new bboxes.

### Free prompt mode
Inside the same group as Change Text mode, Free prompt allows you to freely type a prompt. You can type in new text, or type in a new instruction. A new instruction will always override the new text. Left, right, and center align are compatible in this mode.

### Bold and Italicize mode
Bold or italicize text. When selected, type in the text you want to bold or italicize verbatim.

### Move Text mode
Move text to a different position. When selected, a new target bbox is generated above the first one; make sure to move the newly generated target bbox to a new area. An arrow will point from the source to the new target area, showing the transformation. Type in the text you want to move verbatim.

### Adjust size of text mode
Adjust the size of text. Create a bbox that encompasses the size of the text you want it to be. Type in the text you want to adjust the size of in verbatim. When adjusting the size of text, ensure that the aspect ratio of the newly sized text is similar or identical to the original aspect ratio for the best effect.

### Adjust vertical scale mode
Adjust the vertical scale of text. Create a bbox that extends above the text or letters you want to change the vertical scale of. Ensure that the text is encompassed on 3 sides except the top one, as it is sensitive to small gaps. Try to create an accurate marquee of the text. Type in the text you want to adjust the vertical scale in verbatim.

### Adjust tracking mode
This is an experimental mode, and it doesn't really work much. Extend the area from the sides of the text to adjust the tracking of the text. However, don't use it in its current state, as on-going development of this LoRA will improve tracking manipulation of text. Type in the text you want to adjust the tracking of in verbatim.

### Add prompt
Type in an additional instruction to the end of the generated instructions. This is useful if you want to tell the AI model to place text behind subjects.

### Clone selected bounding boxes
Clones the selected bboxes. Works with multi-selection.

## Mode shift combobox in toolbar

The mode shift allows you to toggle between modes for FLUX.3 Image Klein; you can change between "New", "Keep", "Move", "Remove". All of these are native FLUX.3 native commands. For some modes such as Move Text mode, it will automatically toggle on Move mode shift in the toggle box.

### "New" mode
The default mode. It's the mode where most of the LoRA's functions take place.

### "Keep" mode
Native FLUX.3 Image command to keep items you want the image model to not touch. Changing a bbox's mode shift to "keep" will grey out all other modes, as this is a unique mode. Type in the text you want to "keep" in verbatim. Useful for keeping important text in non-cooperative generations.

### "Move" mode
Mandatory for the "Move Mode" tool, and will force that tool. Allows you to move text.

### "Remove" mode
Attempts to remove text present in the bbox. Type in the text you want to remove in verbatim. Additionally, you can remove text by typing in a space or empty character in "New" mode in change text mode.










