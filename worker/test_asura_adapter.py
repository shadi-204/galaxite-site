import unittest
from datetime import datetime, timezone

from asura_adapter import parse_listing, parse_detail, parse_chapter


class AsuraAdapterTests(unittest.TestCase):
    def test_listing_extracts_comic_urls_and_ignores_chapter_urls(self):
        html = """
        <a href="/comics/eleceed-7de80a82"><img src="/cover.webp">Eleceed</a>
        <a href="/comics/eleceed-7de80a82/chapter/1">Chapter 1</a>
        """
        rows = parse_listing(html, "https://asurascans.com/browse")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "Eleceed")
        self.assertTrue(rows[0]["url"].endswith("/comics/eleceed-7de80a82"))

    def test_detail_extracts_metadata_and_chapter_links(self):
        html = """
        <meta property="og:title" content="Eleceed | Asura Scans">
        <meta property="og:description" content="A story description">
        <meta property="og:image" content="https://cdn.asurascans.com/cover.webp">
        <a href="/comics/eleceed-7de80a82/chapter/1">Chapter 1</a>
        <a href="/comics/eleceed-7de80a82/chapter/2">Chapter 2</a>
        """
        result = parse_detail(html, "https://asurascans.com/comics/eleceed-7de80a82")
        self.assertEqual(result["title"], "Eleceed")
        self.assertEqual(result["description"], "A story description")
        self.assertEqual([x["number"] for x in result["chapters"]], [1.0, 2.0])


    def test_detail_separates_asura_absolute_release_date_from_title(self):
        html = """
        <a href="/comics/example-7de80a82/chapter/24">Chapter 24 Oct 10, 2026</a>
        """
        observed = datetime(2026, 11, 28, 18, 0, tzinfo=timezone.utc)
        result = parse_detail(
            html,
            "https://asurascans.com/comics/example-7de80a82",
            observed_at=observed,
        )
        chapter = result["chapters"][0]
        self.assertEqual(chapter["title"], "Chapter 24 Oct 10, 2026")
        self.assertEqual(chapter["display_title"], "Chapter 24")
        self.assertTrue(chapter["source_published_at"].startswith("2026-10-10T12:00:00"))

    def test_detail_converts_relative_asura_age_using_observation_time(self):
        html = """
        <a href="/comics/example-7de80a82/chapter/118">Chapter 118 6 days ago</a>
        """
        observed = datetime(2026, 11, 28, 18, 0, tzinfo=timezone.utc)
        result = parse_detail(
            html,
            "https://asurascans.com/comics/example-7de80a82",
            observed_at=observed,
        )
        chapter = result["chapters"][0]
        self.assertEqual(chapter["display_title"], "Chapter 118")
        self.assertEqual(chapter["source_published_at"], "2026-11-22T18:00:00+00:00")

    def test_detail_handles_last_week_as_asura_release_age(self):
        html = """
        <a href="/comics/example-7de80a82/chapter/29">Chapter 29 last week</a>
        """
        observed = datetime(2026, 11, 28, 18, 0, tzinfo=timezone.utc)
        result = parse_detail(
            html,
            "https://asurascans.com/comics/example-7de80a82",
            observed_at=observed,
        )
        chapter = result["chapters"][0]
        self.assertEqual(chapter["display_title"], "Chapter 29")
        self.assertEqual(chapter["source_published_at"], "2026-11-21T18:00:00+00:00")

    def test_chapter_only_accepts_asura_cdn_images(self):
        html = """
        <img src="https://cdn.asurascans.com/asura-images/chapters/eleceed/1/a.webp?v=1">
        <img src="https://example.com/asura-images/chapters/eleceed/1/b.webp">
        <img src="https://cdn.asurascans.com/other/image.webp">
        """
        result = parse_chapter(html, "https://asurascans.com/comics/eleceed-7de80a82/chapter/1")
        self.assertEqual(len(result), 1)
        self.assertIn("/a.webp", result[0])


if __name__ == "__main__":
    unittest.main()
