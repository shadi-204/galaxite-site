#!/usr/bin/env python3
"""Read-only probe of public Asura pages; never writes to Galaxite or downloads images."""
from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.parse import urlparse


URLS = [
    "https://asurascans.com/browse/comics?page=1",
    "https://asurascans.com/comics/eleceed-7de80a82",
]


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


def inspect(url: str) -> None:
    request = Request(url, headers={
        "User-Agent": "GalaxitePublicMetadataProbe/1.0",
        "Accept": "text/html,application/xhtml+xml",
    })
    with urlopen(request, timeout=25) as response:
        raw = response.read(4 * 1024 * 1024)
        final_url = response.geturl()
        mime = response.headers.get("Content-Type", "")
        html = raw.decode("utf-8", "replace")

    parser = ProbeParser()
    parser.feed(html)
    title = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    comic_links = [
        href for href in parser.anchors
        if re.search(r"^/comics/[a-z0-9-]+(?:-7de80a82)?$", href, re.I)
    ]
    contains_known_title = "Eleceed" in html or "Damn Reincarnation" in html
    print(f"URL={url}")
    print(f"FINAL_URL={final_url}")
    print(f"HOST={urlparse(final_url).hostname}")
    print(f"MIME={mime}")
    print(f"BYTES={len(raw)}")
    print(f"TITLE={(re.sub(r'<[^>]+>', '', title.group(1)).strip() if title else '')}")
    print(f"ASTRO_ISLAND={parser.has_astro_island}")
    print(f"ANCHORS={len(parser.anchors)}")
    print(f"COMIC_LINKS={len(comic_links)}")
    print(f"IMAGES={len(parser.images)}")
    print(f"KNOWN_TITLE_IN_RAW_HTML={contains_known_title}")
    print(f"COMIC_LINK_SAMPLE={comic_links[:3]}")
    print("---")


if __name__ == "__main__":
    for target in URLS:
        try:
            inspect(target)
        except Exception as exc:
            print(f"URL={target}")
            print(f"ERROR={type(exc).__name__}: {exc}")
            print("---")
