import unittest

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
