#!/usr/bin/env python3
"""Read-only probe of public Asura pages; never writes to Galaxite or downloads images."""
from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.parse import urlparse

from asura_adapter import parse_listing, parse_detail, parse_chapter


BROWSE_URL = "https://asurascans.com/browse/comics?page=1"
DETAIL_URL = "https://asurascans.com/comics/eleceed-7de80a82"


class ProbeParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.anchors = []
        self.images = []
        self.has_astro_island = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "astro-island":
            self.has_astro_island = True
        if tag == "a" and attrs.get("href"):
            self.anchors.append(attrs["href"])
        if tag == "img":
            self.images.extend(v for k, v in attrs.items() if k in {"src", "data-src"} and v)


def fetch_html(url: str, max_bytes: int = 8 * 1024 * 1024) -> tuple[str, dict]:
    request = Request(url, headers={
        "User-Agent": "GalaxitePublicMetadataProbe/1.0",
        "Accept": "text/html,application/xhtml+xml",
    })
    with urlopen(request, timeout=25) as response:
        raw = response.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise RuntimeError("response exceeded probe limit")
        metadata = {
            "final_url": response.geturl(),
            "mime": response.headers.get("Content-Type", ""),
            "bytes": len(raw),
        }
    return raw.decode("utf-8", "replace"), metadata


def inspect(url: str) -> tuple[str, ProbeParser, dict]:
    html, meta = fetch_html(url)
    parser = ProbeParser()
    parser.feed(html)
    title = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    meta["title"] = re.sub(r"<[^>]+>", "", title.group(1)).strip() if title else ""
    meta["astro_island"] = parser.has_astro_island
    meta["anchors"] = len(parser.anchors)
    meta["images"] = len(parser.images)
    print(f"URL={url}")
    for key, value in meta.items():
        print(f"{key.upper()}={value}")
    return html, parser, meta


if __name__ == "__main__":
    try:
        listing_html, listing_dom, listing_meta = inspect(BROWSE_URL)
        listings = parse_listing(listing_html, BROWSE_URL)
        print(f"PARSED_LISTINGS={len(listings)}")
        print(f"LISTING_SAMPLE={listings[:3]}")

        detail_html, detail_dom, detail_meta = inspect(DETAIL_URL)
        detail = parse_detail(detail_html, DETAIL_URL)
        print(f"PARSED_DETAIL_TITLE={detail['title']}")
        print(f"PARSED_DETAIL_DESCRIPTION_CHARS={len(detail['description'])}")
        print(f"PARSED_DETAIL_COVER={bool(detail['cover_url'])}")
        print(f"PARSED_DETAIL_CHAPTERS={len(detail['chapters'])}")
        print(f"PARSED_CHAPTER_SAMPLE={detail['chapters'][-2:]}")

        if detail["chapters"]:
            chapter = detail["chapters"][-1]
            chapter_html, chapter_dom, chapter_meta = inspect(chapter["url"])
            page_urls = parse_chapter(chapter_html, chapter["url"])
            print(f"PARSED_CHAPTER_IMAGES={len(page_urls)}")
            print(f"CHAPTER_IMAGE_SAMPLE={page_urls[:3]}")
        else:
            print("PARSED_CHAPTER_IMAGES=0 (no chapter links parsed)")
    except Exception as exc:
        print(f"PROBE_ERROR={type(exc).__name__}: {exc}")
        raise
