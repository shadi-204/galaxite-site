"""One-time, bounded backfill of Asura genre tags for already imported works."""
from __future__ import annotations

import logging
import os
import re
import time
from urllib.parse import quote

from asura_adapter import parse_detail, parse_listing
from ingestion_worker import Supabase, _request

LOG = logging.getLogger("galaxite.genre_backfill")


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


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
            title = normalize(item.get("title") or "")
            row = by_title.get(title)
            if not detail_url or detail_url in seen_urls or not row:
                continue
            seen_urls.add(detail_url)
            matched += 1

            try:
                detail_raw, _ = _request(
                    detail_url,
                    {"Accept": "text/html"},
                    max_bytes=4 * 1024 * 1024,
                )
                detail = parse_detail(detail_raw.decode("utf-8", "replace"), detail_url)
                genres = detail.get("genres") or []
                if genres and genres != (row.get("genres") or []):
                    supabase.update(
                        "site_works",
                        "id=eq." + quote(str(row["id"]), safe=""),
                        {"genres": genres},
                    )
                    row["genres"] = genres
                    updated += 1
                    LOG.info("Updated genres for %s: %s", row["title"], ", ".join(genres))
                time.sleep(delay)
            except Exception as exc:
                failed += 1
                LOG.warning("Could not backfill genres for %s: %s", item.get("title"), exc)

    LOG.info(
        "Asura genre backfill finished: matched=%s updated=%s failed=%s published_works=%s",
        matched, updated, failed, len(by_title),
    )
    print(
        f"ASURA_GENRE_BACKFILL matched={matched} updated={updated} "
        f"failed={failed} published_works={len(by_title)}"
    )
    return 0 if matched and not failed else (1 if failed else 0)


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    raise SystemExit(main())
