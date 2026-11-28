"""One-time, bounded backfill of Asura genre tags for already imported works."""
from __future__ import annotations

import logging
import os
import re
import time
from urllib.parse import urlparse

from asura_adapter import parse_detail, parse_listing
from ingestion_worker import Supabase, _request

LOG = logging.getLogger("galaxite.genre_backfill")


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def comic_slug(url: str) -> str:
    parts = [part for part in urlparse(str(url or "")).path.split("/") if part]
    return parts[1] if len(parts) >= 3 and parts[0] == "comics" else ""


def main() -> int:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url.startswith("https://") or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")

    max_pages = max(1, min(30, int(os.getenv("ASURA_BROWSE_PAGES", "22"))))
    delay = max(0.05, min(2.0, float(os.getenv("ASURA_REQUEST_DELAY_SECONDS", "0.15"))))
    supabase = Supabase(url, key)
    rows = supabase.rows(
        "site_works",
        "select=id,title,genres&is_published=eq.true&limit=1000",
    )
    by_title = {normalize(row.get("title")): row for row in rows if row.get("title")}
    if not by_title:
        LOG.info("No published works found; nothing to backfill.")
        return 0

    # Match by the exact source slug stored in chapter source URLs. Asura's
    # visible browse-card label is not guaranteed to equal our canonical title.
    slug_to_work: dict[str, dict] = {}
    offset = 0
    source_rows_seen = 0
    while True:
        batch = supabase.rows(
            "site_chapters",
            "select=work_id,source_url&is_published=eq.true&source_url=not.is.null"
            "&order=work_id.asc,chapter_number.asc&limit=1000&offset=" + str(offset),
        )
        source_rows_seen += len(batch)
        for chapter in batch:
            slug = comic_slug(chapter.get("source_url", ""))
            work = next((row for row in rows if str(row["id"]) == str(chapter.get("work_id"))), None)
            if slug and work:
                slug_to_work.setdefault(slug, work)
        if len(batch) < 1000:
            break
        offset += 1000

    LOG.info(
        "Loaded %s published works and %s chapter source rows; mapped %s Asura slugs.",
        len(rows), source_rows_seen, len(slug_to_work),
    )

    seen_urls: set[str] = set()
    updated = 0
    matched = 0
    failed = 0

    for page in range(1, max_pages + 1):
        browse_url = f"https://asurascans.com/browse/comics?page={page}"
        try:
            raw, _ = _request(browse_url, {"Accept": "text/html"}, max_bytes=4 * 1024 * 1024)
            listings = parse_listing(raw.decode("utf-8", "replace"), browse_url)
        except Exception as exc:
            failed += 1
            LOG.warning("Could not read Asura browse page %s: %s", page, exc)
            continue

        LOG.info("Genre backfill page %s/%s: %s listings", page, max_pages, len(listings))
        for item in listings:
            detail_url = str(item.get("url") or "")
            if not detail_url or detail_url in seen_urls:
                continue
            seen_urls.add(detail_url)
            row = slug_to_work.get(comic_slug(detail_url))

            try:
                detail_raw, _ = _request(
                    detail_url,
                    {"Accept": "text/html"},
                    max_bytes=4 * 1024 * 1024,
                )
                detail = parse_detail(detail_raw.decode("utf-8", "replace"), detail_url)
                if row is None:
                    row = by_title.get(normalize(detail.get("title")))
                if row is None:
                    LOG.debug("No imported work matched Asura slug %s / title %s", comic_slug(detail_url), detail.get("title"))
                    continue
                matched += 1

                genres = detail.get("genres") or []
                if genres and genres != (row.get("genres") or []):
                    supabase.update(
                        "site_works",
                        "id=eq." + str(row["id"]),
                        {"genres": genres},
                    )
                    row["genres"] = genres
                    updated += 1
                    LOG.info("Updated genres for %s: %s", row["title"], ", ".join(genres))
                time.sleep(delay)
            except Exception as exc:
                failed += 1
                LOG.warning("Could not backfill genres for %s: %s", detail_url, exc)

    LOG.info(
        "Asura genre backfill finished: matched=%s updated=%s failed=%s published_works=%s",
        matched, updated, failed, len(by_title),
    )
    print(
        f"ASURA_GENRE_BACKFILL matched={matched} updated={updated} "
        f"failed={failed} published_works={len(by_title)}"
    )
    return 0 if matched and not failed else (1 if failed or not matched else 0)


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    raise SystemExit(main())
