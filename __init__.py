from .nodes import FontBox, FontBoxFitBoxAspect

# Keep the stable internal ID so existing workflows open with the updated node.
NODE_CLASS_MAPPINGS = {"LoRABoundingBoxEditor": FontBox, "FontBoxFitBoxAspect": FontBoxFitBoxAspect}
NODE_DISPLAY_NAME_MAPPINGS = {"LoRABoundingBoxEditor": "FontBox", "FontBoxFitBoxAspect": "FontBox Fit Box Aspect"}
VERSION = "2.1.0"
WEB_DIRECTORY = f"./web/fontbox-{VERSION}"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
