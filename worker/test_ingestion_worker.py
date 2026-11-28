import json
import unittest

from ingestion_worker import WorkerError, _validate_manifest, _https_url


class FeedValidationTests(unittest.TestCase):
    def test_accepts_minimal_feed(self):
        self.assertEqual(_validate_manifest({"schema": "galaxite-feed-v1", "works": []})["works"], [])

    def test_rejects_unknown_schema(self):
        with self.assertRaises(WorkerError):
            _validate_manifest({"schema": "other", "works": []})

    def test_rejects_missing_title(self):
        with self.assertRaises(WorkerError):
            _validate_manifest({"schema": "galaxite-feed-v1", "works": [{"chapters": []}]})

    def test_blocks_http(self):
        with self.assertRaises(WorkerError):
            _https_url("http://example.com/feed.json")


if __name__ == "__main__":
    unittest.main()
