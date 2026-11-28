import unittest
from pathlib import Path

from paddle_ocr_batch import normalize_prediction, sort_page_paths


class FakePrediction:
    def __init__(self, payload):
        self.json = payload


class PaddleOCRBatchTests(unittest.TestCase):
    def test_page_files_are_sorted_numerically(self):
        paths = [
            Path("page10.webp"),
            Path("page2.webp"),
            Path("page001.webp"),
            Path("cover.webp"),
        ]
        self.assertEqual(
            [path.name for path in sort_page_paths(paths)],
            ["page001.webp", "page2.webp", "page10.webp", "cover.webp"],
        )

    def test_prediction_keeps_text_confidence_and_polygon(self):
        prediction = FakePrediction({
            "res": {
                "rec_texts": ["DAMN!!"],
                "rec_scores": [0.93],
                "rec_polys": [[[10, 20], [90, 20], [90, 50], [10, 50]]],
            }
        })
        result = normalize_prediction(
            Path("040.webp"), prediction, 800, 2630, min_confidence=0.75
        )
        self.assertEqual(result["page_number"], 40)
        self.assertEqual(result["regions"][0]["text"], "DAMN!!")
        self.assertEqual(result["regions"][0]["confidence"], 0.93)
        self.assertEqual(result["regions"][0]["bbox"], {
            "x": 10.0, "y": 20.0, "width": 80.0, "height": 30.0
        })
        self.assertTrue(result["review_required"])

    def test_low_confidence_is_flagged_and_never_auto_approved(self):
        prediction = FakePrediction({
            "res": {
                "rec_texts": ["INGRID"],
                "rec_scores": [0.41],
                "rec_polys": [[[1, 2], [8, 2], [8, 9], [1, 9]]],
            }
        })
        result = normalize_prediction(
            Path("040.webp"), prediction, 800, 2630, min_confidence=0.75
        )
        self.assertTrue(result["regions"][0]["low_confidence"])
        self.assertTrue(result["regions"][0]["review_required"])
        self.assertTrue(result["review_required"])


if __name__ == "__main__":
    unittest.main()
