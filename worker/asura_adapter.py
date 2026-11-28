"""Public-page parser for the Asura Scans adapter.

This adapter reads only the public HTML pages configured for this source.
It does not sign in, bypass gates, or fetch protected chapter content.
"""
from __future__ import annotations

from html.parser import HTMLParser
from urllib.parse import parse_qs, urljoin, urlparse
import re


COMIC_PATH = re.compile(r"^/comics/([a-z0-9-]+)$", re.I)
CHAPTER_PATH = re.compile(r"^/comics/([^/]+)/chapter/(\d+(?:\.\d+)?)$", re.I)
PAGE_IMAGE_PATH = "/asura-images/chapters/"


class _PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.metas = {}
        self.anchors = []
        self.images = []
        self.text = []
        self._anchor = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag.lower() == "meta":
            key = (attrs.get("property") or attrs.get("name") or "").lower()
            if key and attrs.get("content"):
                self.metas[key] = attrs["content"].strip()
        elif tag.lower() == "a":
            self._anchor = {"href": attrs.get("href", ""), "text": []}
        elif tag.lower() == "img":
            for key in ("src", "data-src", "data-original", "data-lazy-src"):
                if attrs.get(key):
                    self.images.append(attrs[key].strip())
            srcset = attrs.get("srcset") or attrs.get("data-srcset") or ""
            for candidate in srcset.split(","):
                candidate_url = candidate.strip().split(" ")[0]
                if candidate_url:
                    self.images.append(candidate_url)
        elif tag.lower() == "source":
            for key in ("src", "data-src"):
                if attrs.get(key):
                    self.images.append(attrs[key].strip())

    def handle_data(self, data):
        clean = data.strip()
        if clean:
            self.text.append(clean)
        if self._anchor is not None and clean:
            self._anchor["text"].append(clean)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._anchor is not None:
            self._anchor["text"] = " ".join(self._anchor["text"]).strip()
            self.anchors.append(self._anchor)
            self._anchor = None


def _parse(html: str) -> _PageParser:
    parser = _PageParser()
    parser.feed(html)
    return parser


def parse_listing(html: str, page_url: str) -> list[dict]:
    parser = _parse(html)
    found, seen = [], set()
    for anchor in parser.anchors:
        absolute = urljoin(page_url, anchor["href"])
        parsed = urlparse(absolute)
        match = COMIC_PATH.match(parsed.path)
        if parsed.hostname != "asurascans.com" or not match:
            continue
        if absolute in seen:
            continue
        seen.add(absolute)
        title = anchor["text"]
        found.append({"url": absolute, "slug": match.group(1), "title": title})
    return found


def parse_detail(html: str, page_url: str) -> dict:
    parser = _parse(html)
    title = parser.metas.get("og:title", "")
    title = re.sub(r"\s*[|–-]\s*Asura Scans.*$", "", title, flags=re.I).strip()
    if not title:
        title = page_url.rstrip("/").split("/")[-1].rsplit("-", 1)[0].replace("-", " ").title()
    # Asura's current comic pages expose the real cover on its image CDN.
    # The og:image URL (/og/comics/...) can be stale or fail as a hotlinked
    # asset, so prefer the first actual cover image found in the page markup.
    cover_candidates = []
    for raw in parser.images:
        absolute = urljoin(page_url, raw)
        parsed_image = urlparse(absolute)
        if (parsed_image.scheme == "https"
                and parsed_image.hostname == "cdn.asurascans.com"
                and "/asura-images/covers/" in parsed_image.path):
            if absolute not in cover_candidates:
                cover_candidates.append(absolute)
    cover = cover_candidates[0] if cover_candidates else (
        parser.metas.get("og:image") or parser.metas.get("twitter:image")
    )
    if cover:
        cover = urljoin(page_url, cover)
    chapters = {}
    genres = {}
    for anchor in parser.anchors:
        absolute = urljoin(page_url, anchor["href"])
        parsed = urlparse(absolute)
        if parsed.hostname != "asurascans.com":
            continue

        # Asura exposes genre chips as links such as /browse?genres=action.
        # Keep the visible label, using the query slug only as a fallback.
        query = parse_qs(parsed.query)
        if parsed.path.rstrip("/") in {"/browse", "/browse/comics"}:
            for key in ("genres", "genre"):
                for raw_genre in query.get(key, []):
                    value = raw_genre.strip().lower()
                    if not value:
                        continue
                    label = anchor["text"].strip() or value.replace("-", " ").title()
                    if len(label) <= 60:
                        genres[value] = label

        match = CHAPTER_PATH.match(parsed.path)
        if not match:
            continue
        number = float(match.group(2))
        chapters[number] = {
            "number": number,
            "title": anchor["text"] or f"Chapter {match.group(2)}",
            "url": absolute,
        }
    description = parser.metas.get("og:description") or parser.metas.get("description") or ""
    page_text = " ".join(parser.text)
    status_match = re.search(r"\bStatus\s+(ongoing|completed|hiatus|dropped)\b", page_text, re.I)
    status_map = {
        "ongoing": "مستمر",
        "completed": "مكتمل",
        "hiatus": "متوقف",
        "dropped": "دروب",
    }
    status = status_map.get(status_match.group(1).lower(), "مستمر") if status_match else "مستمر"
    type_match = re.search(r"\bType\s+(manhwa|manga|manhua)\b", page_text, re.I)
    type_map = {"manhwa": "مانهوا", "manga": "مانجا", "manhua": "مانهوا"}
    work_type = type_map.get(type_match.group(1).lower(), "مانهوا") if type_match else "مانهوا"
    return {
        "title": title[:300],
        "description": description[:5000],
        "cover_url": cover,
        "chapters": sorted(chapters.values(), key=lambda x: x["number"]),
        "type": work_type,
        "status": status,
        "genres": sorted(genres.values(), key=str.casefold),
    }


def parse_chapter(html: str, page_url: str) -> list[str]:
    parser = _parse(html)
    urls, seen = [], set()
    for raw in parser.images:
        absolute = urljoin(page_url, raw)
        parsed = urlparse(absolute)
        if parsed.scheme != "https" or parsed.hostname != "cdn.asurascans.com":
            continue
        if PAGE_IMAGE_PATH not in parsed.path or absolute in seen:
            continue
        seen.add(absolute)
        urls.append(absolute)
    return urls
