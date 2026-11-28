"""Public-page parser for the Asura Scans adapter.

This adapter reads only the public HTML pages configured for this source.
It does not sign in, bypass gates, or fetch protected chapter content.
"""
from __future__ import annotations

from html.parser import HTMLParser
from urllib.parse import parse_qs, urljoin, urlparse
from datetime import datetime, time, timedelta, timezone
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
            self._anchor = {"href": attrs.get("href", ""), "text": [], "datetime": None}
        elif tag.lower() == "time" and self._anchor is not None:
            self._anchor["datetime"] = attrs.get("datetime") or attrs.get("content")
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




_ASURA_DATE_SUFFIX = re.compile(
    r"(?P<date>[A-Za-z]{3,9}\\s+\\d{1,2},\\s+\\d{4})$",
    re.I,
)
_ASURA_RELATIVE_SUFFIX = re.compile(
    r"(?P<age>just now|yesterday|last week|last month|last year|"
    r"(?:\\d+|a|an|one)\\s+(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\\s+ago)$",
    re.I,
)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _chapter_display_metadata(
    raw_title: str,
    observed_at: datetime,
    explicit_datetime: str | None = None,
) -> tuple[str, str | None]:
    """Separate Asura's release-age/date suffix from the visible chapter title."""
    text = re.sub(r"\\s+", " ", (raw_title or "").strip())
    observed = _as_utc(observed_at)
    published_at = None
    suffix = None

    if explicit_datetime:
        raw_datetime = str(explicit_datetime).strip()
        try:
            parsed = datetime.fromisoformat(raw_datetime.replace("Z", "+00:00"))
            if len(raw_datetime) == 10:
                parsed = datetime.combine(parsed.date(), time(12, 0), tzinfo=timezone.utc)
            published_at = _as_utc(parsed)
        except ValueError:
            pass

    if published_at is None:
        date_match = _ASURA_DATE_SUFFIX.search(text)
        if date_match:
            suffix = date_match.group("date")
            date_text = suffix.strip()
            for date_format in ("%b %d, %Y", "%B %d, %Y"):
                try:
                    parsed_date = datetime.strptime(date_text, date_format).date()
                    published_at = datetime.combine(
                        parsed_date, time(12, 0), tzinfo=timezone.utc
                    )
                    break
                except ValueError:
                    continue

    if published_at is None:
        age_match = _ASURA_RELATIVE_SUFFIX.search(text)
        if age_match:
            suffix = age_match.group("age")
            age = suffix.lower()
            if age == "just now":
                delta = timedelta(0)
            elif age == "yesterday":
                delta = timedelta(days=1)
            elif age == "last week":
                delta = timedelta(days=7)
            elif age == "last month":
                delta = timedelta(days=30)
            elif age == "last year":
                delta = timedelta(days=365)
            else:
                relative = re.fullmatch(
                    r"(a|an|one|\\d+)\\s+(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\\s+ago",
                    age,
                    re.I,
                )
                if relative:
                    quantity = 1 if relative.group(1) in {"a", "an", "one"} else int(relative.group(1))
                    unit = relative.group(2).lower()
                    if unit.startswith(("second", "sec")):
                        delta = timedelta(seconds=quantity)
                    elif unit.startswith(("minute", "min")):
                        delta = timedelta(minutes=quantity)
                    elif unit.startswith(("hour", "hr")):
                        delta = timedelta(hours=quantity)
                    elif unit.startswith("day"):
                        delta = timedelta(days=quantity)
                    elif unit.startswith("week"):
                        delta = timedelta(weeks=quantity)
                    elif unit.startswith("month"):
                        delta = timedelta(days=30 * quantity)
                    else:
                        delta = timedelta(days=365 * quantity)
                else:
                    delta = None
            if delta is not None:
                published_at = observed - delta

    display_title = text
    if suffix:
        display_title = text[: -len(suffix)].rstrip(" -–—•|\\t")
    return display_title, published_at.isoformat() if published_at else None


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


def parse_detail(
    html: str,
    page_url: str,
    observed_at: datetime | None = None,
) -> dict:
    parser = _parse(html)
    observed_at = observed_at or datetime.now(timezone.utc)
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
        raw_chapter_title = anchor["text"] or f"Chapter {match.group(2)}"
        display_title, source_published_at = _chapter_display_metadata(
            raw_chapter_title,
            observed_at,
            anchor.get("datetime"),
        )
        chapters[number] = {
            "number": number,
            "title": raw_chapter_title,
            "display_title": display_title or raw_chapter_title,
            "source_published_at": source_published_at,
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
