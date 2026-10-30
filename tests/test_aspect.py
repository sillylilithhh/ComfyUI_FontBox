"""Companion node geometry, prompt preservation, and inpainting outputs."""
import copy
import json
import unittest

import torch

from test_backend import package
from lora_bbox_test_package.aspect import fit_box_aspect
from lora_bbox_test_package.nodes import FontBoxFitBoxAspect


class AspectTests(unittest.TestCase):
    def setUp(self):
        self.elements = [{"type": "obj", "bbox": [19, 136, 58, 874],
                          "desc": 'Change "A BEAUTIFUL ROSE HAS THORNS!" to "BEAUTY IS SUBJECTIVE!". Left align.'}]

    def test_wide_image_on_square_canvas(self):
        original = copy.deepcopy(self.elements)
        fitted, pixels = fit_box_aspect(self.elements, 1024, 128, 1024, 1024)
        self.assertEqual(fitted[0]["bbox"], [19, 136, 111, 874])
        self.assertEqual(fitted[0]["desc"], original[0]["desc"])
        self.assertEqual(self.elements, original)
        self.assertEqual(len(pixels[0]), 1)
        # 0..1000 output quantization allows at most half a normalized unit.
        self.assertLess(abs((111-19) - (874-136)/8), .5)

    def test_non_square_original_canvas(self):
        fitted, _ = fit_box_aspect(self.elements, 1024, 128, 2048, 1024)
        self.assertEqual(fitted[0]["bbox"], [19, 136, 204, 874])

    def test_batch_mask_union_and_canvas_override(self):
        elements = [{"type": "text", "bbox": [100, 100, 200, 600], "desc": "Do not rewrite me.",
                     "text": "Café 日本語", "custom": {"keep": [1, 2]}},
                    {"type": "obj", "bbox": [200, 350, 300, 850], "desc": "Overlap"}]
        original = copy.deepcopy(elements)
        image = torch.zeros((3, 10, 20, 3))  # aspect 2:1; pixels and batch are not used
        canvas = torch.zeros((2, 100, 200, 3))
        result = FontBoxFitBoxAspect().execute(elements, image, 10, 10, canvas)
        fitted, pixels, mask, preview, serialized = result[:5]
        self.assertEqual([e["bbox"] for e in fitted], [[100, 100, 600, 600], [200, 350, 700, 850]])
        self.assertEqual(mask.shape, (2, 100, 200))
        self.assertEqual(preview.shape, (2, 100, 200, 3))
        self.assertEqual(mask.sum().item(), (5000 + 5000 - 2000) * 2)
        self.assertTrue(torch.all(mask[:, :10, :] == 0))
        self.assertTrue(torch.any(preview[:, 10, 20, :] > 0))
        self.assertEqual(mask.dtype, torch.float32)
        self.assertEqual(preview.dtype, torch.float32)
        self.assertEqual(json.loads(serialized), fitted)
        self.assertEqual(elements, original)
        fitted[0]["custom"]["keep"].append(3)
        self.assertEqual(elements[0]["custom"]["keep"], [1, 2])
        self.assertEqual(pixels[0][0]["metadata"]["text"], "Café 日本語")

    def test_bottom_clipping_and_tiny_boxes(self):
        clipped, pixels = fit_box_aspect(self.elements, 1, 10, 100, 100)
        self.assertEqual(clipped[0]["bbox"], [19, 136, 1000, 874])
        self.assertLessEqual(pixels[0][0]["y"] + pixels[0][0]["height"], 100)
        tiny = [{"type": "obj", "bbox": [1, 1, 2, 2], "desc": "Thin"}]
        result = FontBoxFitBoxAspect().execute(tiny, torch.zeros((1, 1, 1000, 3)), 64, 64)
        self.assertEqual(result[0][0]["bbox"], [1, 1, 2, 2])
        self.assertGreater(result[2].sum().item(), 0)

    def test_json_empty_and_zero_area(self):
        image = torch.zeros((1, 16, 32, 3))
        result = FontBoxFitBoxAspect().execute(json.dumps(self.elements), image, 64, 64)
        self.assertEqual(result[0][0]["desc"], self.elements[0]["desc"])
        for data in ([], "[]", [{"bbox": [0, 0, 0, 10]}]):
            elements, boxes, mask, preview, serialized = FontBoxFitBoxAspect().execute(data, image, 64, 32)[:5]
            self.assertEqual(elements, [])
            self.assertEqual(boxes, [])
            self.assertEqual(mask.sum().item(), 0)
            self.assertEqual(preview.shape, (1, 32, 64, 3))
            self.assertEqual(serialized, "[]")

    def test_invalid_elements_and_images(self):
        for bad in (None, {}, "not json", [1], [{"bbox": [1, 2]}],
                    [{"bbox": [100, 0, 50, 100]}], [{"bbox": [0, 0, 1001, 100]}],
                    [{"bbox": [0, 0, float("nan"), 100]}]):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                fit_box_aspect(bad, 100, 100, 100, 100)
        for shape in ((1, 0, 32, 3), (0, 32, 32, 3), (1, 32, 32, 2), (32, 32, 3)):
            with self.subTest(shape=shape), self.assertRaises(ValueError):
                FontBoxFitBoxAspect().execute([], torch.zeros(shape), 64, 64)

    def test_registration_and_no_optional_preview_dependency(self):
        self.assertIs(package.NODE_CLASS_MAPPINGS["FontBoxFitBoxAspect"], FontBoxFitBoxAspect)
        self.assertEqual(package.NODE_DISPLAY_NAME_MAPPINGS["FontBoxFitBoxAspect"], "FontBox Fit Box Aspect")
        rgba = torch.zeros((1, 16, 32, 4))
        result = FontBoxFitBoxAspect().execute([], rgba, canvas=rgba)
        self.assertTrue(torch.all(result[3] == 1))  # transparent original composites to white


if __name__ == "__main__":
    unittest.main()
