#!/usr/bin/env python3
"""Galaxite ingestion worker for explicitly authorized JSON feeds.

The worker never scrapes arbitrary comic websites. A source must expose a
Galaxite JSON manifest and be explicitly marked authorized in Supabase.
All discovered works/chapters remain unpublished for owner review.
"""
from __future__ import annotations

import json
import logging
import os
import socket
import time
import uuid
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode

from asura_adapter import parse_listing, parse_detail, parse_chapter
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

LOG = logging.getLogger("galaxite.worker")
API_TIMEOUT = int(os.getenv("HTTP_TIMEOUT_SECONDS", "25"))
MAX_MANIFEST_BYTES = 2 * 1024 * 1024
MAX_PAGE_BYTES = 18 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/avif"}


class WorkerError(RuntimeError):
    pass


def _https_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise WorkerError("Only public HTTPS URLs are allowed.")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise WorkerError("Could not resolve source host.") from exc
    for item in addresses:
        ip = item[4][0]
        # Reject private, loopback, link-local, multicast and reserved destinations.
        import ipaddress
        addr = ipaddress.ip_address(ip)
        if not addr.is_global:
            raise WorkerError("Source resolves to a non-public network address.")
    return url


def _request(url: str, headers: dict[str, str] | None = None, max_bytes: int = MAX_MANIFEST_BYTES) -> tuple[bytes, str]:
    url = _https_url(url)
    req = Request(url, headers={"User-Agent": "GalaxiteIngestionWorker/1.0", **(headers or {})})
    try:
        with urlopen(req, timeout=API_TIMEOUT) as response:
            final_url = response.geturl()
            if urlparse(final_url).hostname != urlparse(url).hostname or urlparse(final_url).scheme != "https":
                raise WorkerError("Cross-host or insecure redirects are blocked.")
            data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise WorkerError("Remote file exceeds the configured size limit.")
            return data, response.headers.get("Content-Type", "").split(";")[0].lower()
    except (HTTPError, URLError, TimeoutError) as exc:
        raise WorkerError(f"Remote request failed: {exc}") from exc


class Supabase:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key

    def request(self, method: str, path: str, body: Any = None, prefer: str | None = None,
                content_type: str = "application/json", raw: bytes | None = None) -> Any:
        headers = {"apikey": self.key, "Authorization": f"Bearer {self.key}"}
        if content_type:
            headers["Content-Type"] = content_type
        if prefer:
            headers["Prefer"] = prefer
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = Request(f"{self.url}{path}", data=data, headers=headers, method=method)
        try:
            with urlopen(req, timeout=API_TIMEOUT) as response:
                payload = response.read()
                return json.loads(payload) if payload else None
        except HTTPError as exc:
            detail = exc.read(2000).decode("utf-8", "replace")
            raise WorkerError(f"Supabase {method} {path} failed ({exc.code}): {detail}") from exc
        except (URLError, TimeoutError) as exc:
            raise WorkerError(f"Supabase request failed: {exc}") from exc

    def rpc(self, name: str, args: dict[str, Any]) -> Any:
        return self.request("POST", f"/rest/v1/rpc/{name}", args)

    def rows(self, table: str, query: str) -> list[dict[str, Any]]:
        return self.request("GET", f"/rest/v1/{table}?{query}") or []

    def insert(self, table: str, row: dict[str, Any]) -> dict[str, Any]:
        result = self.request("POST", f"/rest/v1/{table}", row, "return=representation")
        return (result or [{}])[0]

    def update(self, table: str, query: str, row: dict[str, Any]) -> None:
        self.request("PATCH", f"/rest/v1/{table}?{query}", row, "return=minimal")

    def upload(self, bucket: str, path: str, content: bytes, mime: str) -> None:
        safe_path = "/".join(__import__("urllib.parse", fromlist=["quote"]).quote(p, safe="") for p in path.split("/"))
        self.request("POST", f"/storage/v1/object/{bucket}/{safe_path}",
                     prefer="return=minimal", content_type=mime, raw=content)


def _validate_manifest(data: Any) -> dict[str, Any]:
    if not isinstance(data, dict) or data.get("schema") != "galaxite-feed-v1":
        raise WorkerError("Feed must declare schema=galaxite-feed-v1.")
    works = data.get("works")
    if not isinstance(works, list) or len(works) > 100:
        raise WorkerError("Feed works must be a list with at most 100 entries.")
    for work in works:
        if not isinstance(work, dict) or not str(work.get("title", "")).strip():
            raise WorkerError("Every work requires a title.")
        chapters = work.get("chapters", [])
        if not isinstance(chapters, list) or len(chapters) > 500:
            raise WorkerError("Each work may contain at most 500 chapters.")
        for chapter in chapters:
            if not isinstance(chapter, dict) or chapter.get("number") is None:
                raise WorkerError("Every chapter requires a number.")
            pages = chapter.get("pages", [])
            if not isinstance(pages, list) or len(pages) > 200:
                raise WorkerError("Each chapter may contain at most 200 page URLs.")
    return data


def _source_manifest(source: dict[str, Any]) -> tuple[dict[str, Any], str]:
    if source.get("authorization_status") != "authorized" or not source.get("enabled"):
        raise WorkerError("Source is not enabled and authorized.")
    base = _https_url(str(source.get("base_url") or ""))
    adapter = source.get("adapter_key")
    if adapter != "galaxite_json_feed":
        raise WorkerError("Unsupported adapter. Use galaxite_json_feed for an authorized feed.")
    manifest_url = base.rstrip("/") + "/galaxite-feed.json"
    raw, mime = _request(manifest_url, {"Accept": "application/json"})
    if mime not in {"application/json", "text/json", ""}:
        raise WorkerError("Feed endpoint did not return JSON.")
    try:
        manifest = _validate_manifest(json.loads(raw.decode("utf-8")))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise WorkerError("Feed is not valid UTF-8 JSON.") from exc
    return manifest, urlparse(base).hostname or ""


def _discover_asura(supabase: Supabase, source: dict[str, Any], job: dict[str, Any]) -> None:
    """Discover one Asura browse page per job to keep each run bounded."""
    if source.get("authorization_status") != "authorized" or not source.get("enabled"):
        raise WorkerError("Asura source is not enabled and authorized.")
    page = max(1, int((job.get("payload") or {}).get("page") or 1))
    max_pages = max(1, min(30, int(os.getenv("ASURA_BROWSE_PAGES", "22"))))
    browse_url = f"https://asurascans.com/browse/comics?page={page}"
    raw, _ = _request(browse_url, {"Accept": "text/html"}, max_bytes=4 * 1024 * 1024)
    listings = parse_listing(raw.decode("utf-8", "replace"), browse_url)
    initial_chapters = max(0, min(10, int(os.getenv("ASURA_INITIAL_CHAPTERS", "1"))))
    download_works = max(0, min(20, int(os.getenv("ASURA_INITIAL_WORKS_WITH_CHAPTERS", "1"))))
    LOG.info("Asura page %s: parsed %s works; chapter downloads enabled for first %s works.", page, len(listings), download_works)
    for work_index, entry in enumerate(listings):
        detail_raw, _ = _request(entry["url"], {"Accept": "text/html"}, max_bytes=4 * 1024 * 1024)
        detail = parse_detail(detail_raw.decode("utf-8", "replace"), entry["url"])
        title = (detail.get("title") or "").strip()
        if not title:
            # Listing-card anchors can contain the rating instead of the title;
            # only use a clean slug fallback if detail metadata is missing.
            title = re.sub(r"-7de80a82$", "", entry["slug"], flags=re.I).replace("-", " ").title()
        if not title or re.fullmatch(r"\\d+(?:\\.\\d+)?", title):
            continue
        existing = supabase.rows("site_works", "select=id&title=eq." + __import__("urllib.parse", fromlist=["quote"]).quote(title, safe="") + "&limit=1")
        fields = {
            "title": title[:300], "type": "manhwa", "genres": detail["genres"],
            "description": detail["description"], "cover_url": detail["cover_url"],
            "chapter_count": len(detail["chapters"]), "rating": 0,
            "status": "مستمر", "sort_order": 0, "is_published": False,
        }
        if existing:
            work_id = existing[0]["id"]
            supabase.update("site_works", "id=eq." + work_id, fields)
        else:
            work_id = supabase.insert("site_works", fields)["id"]
        chapters = detail["chapters"]
        selected_for_download = (set(x["number"] for x in chapters[-initial_chapters:])
                                 if initial_chapters and work_index < download_works else set())
        for chapter in chapters:
            number = chapter["number"]
            query = f"select=id&work_id=eq.{work_id}&chapter_number=eq.{number}&limit=1"
            found = supabase.rows("site_chapters", query)
            chapter_fields = {"work_id": work_id, "chapter_number": number,
                              "title": chapter["title"][:300] or None, "is_published": False}
            if found:
                chapter_id = found[0]["id"]
            else:
                chapter_id = supabase.insert("site_chapters", chapter_fields)["id"]
            if number in selected_for_download:
                prior = supabase.rows(
                    "site_ingestion_jobs",
                    f"select=id&external_chapter_id=eq.{chapter_id}&job_type=eq.fetch_asura_chapter&status=in.(queued,running,completed)&limit=1",
                )
                if not prior:
                    supabase.insert("site_ingestion_jobs", {
                        "source_id": source["id"], "job_type": "fetch_asura_chapter",
                        "external_work_id": str(work_id), "external_chapter_id": str(chapter_id),
                        "payload": {"chapter_url": chapter["url"], "source_host": "asurascans.com",
                                    "allowed_image_hosts": ["cdn.asurascans.com"]},
                    })
    # Queue the next browse page separately; this avoids one very long job.
    if listings and page < max_pages:
        pending = supabase.rows(
            "site_ingestion_jobs",
            f"select=id&source_id=eq.{source['id']}&job_type=eq.discover_works&status=in.(queued,running)&limit=2",
        )
        if len(pending) <= 1:
            supabase.insert("site_ingestion_jobs", {
                "source_id": source["id"], "job_type": "discover_works",
                "payload": {"page": page + 1, "trigger": "asura_pagination"},
            })
    supabase.update("site_ingestion_jobs", "id=eq." + job["id"], {
        "status": "completed", "completed_at": datetime.now(timezone.utc).isoformat(),
        "last_error": None, "locked_at": None, "locked_by": None,
    })


def _fetch_asura_chapter(supabase: Supabase, source: dict[str, Any], job: dict[str, Any]) -> None:
    payload = job.get("payload") or {}
    chapter_url = str(payload.get("chapter_url") or "")
    if urlparse(_https_url(chapter_url)).hostname != "asurascans.com":
        raise WorkerError("Chapter page must be on the configured Asura host.")
    raw, _ = _request(chapter_url, {"Accept": "text/html"}, max_bytes=8 * 1024 * 1024)
    page_urls = parse_chapter(raw.decode("utf-8", "replace"), chapter_url)
    if not page_urls:
        raise WorkerError("No public chapter page images were found; chapter may require access or page markup may have changed.")
    payload["page_urls"] = page_urls
    _fetch_chapter(supabase, source, {**job, "payload": payload})


def _discover(supabase: Supabase, source: dict[str, Any], job: dict[str, Any]) -> None:
    if source.get("adapter_key") == "asura_scans":
        return _discover_asura(supabase, source, job)
    manifest, _ = _source_manifest(source)
    for item in manifest["works"]:
        title = str(item["title"]).strip()[:300]
        existing = supabase.rows("site_works", "select=id&title=eq." + __import__("urllib.parse", fromlist=["quote"]).quote(title, safe="") + "&limit=1")
        fields = {
            "title": title,
            "type": item.get("type", "مانهوا"),
            "genres": item.get("genres", []) if isinstance(item.get("genres", []), list) else [],
            "description": str(item.get("description", ""))[:5000],
            "cover_url": item.get("cover_url"),
            "is_published": False,
        }
        if existing:
            work_id = existing[0]["id"]
            supabase.update("site_works", "id=eq." + work_id, fields)
        else:
            work_id = supabase.insert("site_works", fields)["id"]
        for chapter in item.get("chapters", []):
            number = chapter["number"]
            query = f"select=id&work_id=eq.{work_id}&chapter_number=eq.{number}&limit=1"
            found = supabase.rows("site_chapters", query)
            chapter_fields = {"work_id": work_id, "chapter_number": number, "title": str(chapter.get("title", ""))[:300] or None, "is_published": False}
            if found:
                chapter_id = found[0]["id"]
            else:
                chapter_id = supabase.insert("site_chapters", chapter_fields)["id"]
            if chapter.get("pages"):
                prior = supabase.rows(
                    "site_ingestion_jobs",
                    f"select=id&external_chapter_id=eq.{chapter_id}&job_type=eq.fetch_chapter&status=in.(queued,running,completed)&limit=1",
                )
                if not prior:
                    payload = {"page_urls": chapter["pages"], "source_host": urlparse(source["base_url"]).hostname}
                    supabase.insert("site_ingestion_jobs", {
                        "source_id": source["id"], "job_type": "fetch_chapter",
                        "external_work_id": str(work_id), "external_chapter_id": str(chapter_id),
                        "payload": payload,
                    })
    supabase.update("site_ingestion_jobs", "id=eq." + job["id"], {"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat(), "last_error": None, "locked_at": None, "locked_by": None})


def _fetch_chapter(supabase: Supabase, source: dict[str, Any], job: dict[str, Any]) -> None:
    if source.get("authorization_status") != "authorized" or not source.get("enabled"):
        raise WorkerError("Source is no longer enabled and authorized.")
    payload = job.get("payload") or {}
    urls = payload.get("page_urls")
    host = urlparse(str(source.get("base_url") or "")).hostname
    if not isinstance(urls, list) or not urls or len(urls) > 200:
        raise WorkerError("Chapter job has no valid page_urls list.")
    allowed_hosts = set(payload.get("allowed_image_hosts") or [host])
    if payload.get("source_host") != host:
        raise WorkerError("Chapter URLs do not match the configured source host.")
    chapter_id = job.get("external_chapter_id")
    if not chapter_id:
        raise WorkerError("Chapter job is missing its chapter ID.")
    bucket = os.getenv("SUPABASE_CHAPTERS_BUCKET", "galaxite-chapters")
    page_rows = []
    for index, page_url in enumerate(urls, 1):
        if urlparse(_https_url(str(page_url))).hostname not in allowed_hosts:
            raise WorkerError("Page URL host is not in the source adapter allowlist.")
        content, mime = _request(str(page_url), max_bytes=MAX_PAGE_BYTES)
        if mime not in ALLOWED_IMAGE_TYPES:
            raise WorkerError(f"Page {index} is not a supported image.")
        suffix = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif"}[mime]
        path = f"{chapter_id}/{index:03d}.{suffix}"
        supabase.upload(bucket, path, content, mime)
        page_rows.append({"chapter_id": chapter_id, "page_number": index, "storage_path": path})
    for row in page_rows:
        exists = supabase.rows("site_chapter_pages", f"select=id&storage_path=eq.{row['storage_path']}&limit=1")
        if not exists:
            supabase.insert("site_chapter_pages", row)
    processing = supabase.rows("site_chapter_processing_jobs", f"select=id&chapter_id=eq.{chapter_id}&limit=1")
    fields = {"source_id": source["id"], "status": "ready", "total_pages": len(page_rows),
              "completed_pages": len(page_rows), "settings": {"human_review_required": True, "auto_publish": False}}
    if processing:
        supabase.update("site_chapter_processing_jobs", "id=eq." + processing[0]["id"], fields)
    else:
        supabase.insert("site_chapter_processing_jobs", {"chapter_id": chapter_id, **fields})
    supabase.update("site_ingestion_jobs", "id=eq." + job["id"], {"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat(), "last_error": None, "locked_at": None, "locked_by": None})


def schedule_discovery(supabase: Supabase) -> None:
    """Queue periodic discovery for each enabled, authorized JSON feed."""
    sources = supabase.rows(
        "site_content_sources",
        "select=id,adapter_key,enabled,authorization_status,poll_interval_minutes&enabled=eq.true&authorization_status=eq.authorized&adapter_key=in.(galaxite_json_feed,asura_scans)",
    )
    now = datetime.now(timezone.utc)
    for source in sources:
        interval = max(5, min(1440, int(source.get("poll_interval_minutes") or 60)))
        cutoff = (now - timedelta(minutes=interval)).isoformat()
        query = urlencode({
            "select": "id",
            "source_id": f"eq.{source['id']}",
            "job_type": "eq.discover_works",
            "created_at": f"gte.{cutoff}",
            "limit": "1",
        })
        recent = supabase.rows("site_ingestion_jobs", query)
        if not recent:
            supabase.insert("site_ingestion_jobs", {
                "source_id": source["id"],
                "job_type": "discover_works",
                "payload": {"trigger": "scheduled_poll"},
            })


def process_one(supabase: Supabase, worker_id: str) -> bool:
    claimed = supabase.rpc("claim_site_ingestion_job", {"p_worker_id": worker_id})
    if not claimed:
        return False
    job = claimed[0]
    try:
        sources = supabase.rows("site_content_sources", f"select=*&id=eq.{job['source_id']}&limit=1")
        if not sources:
            raise WorkerError("Source record no longer exists.")
        source = sources[0]
        if job["job_type"] == "discover_works":
            _discover(supabase, source, job)
        elif job["job_type"] == "fetch_chapter":
            _fetch_chapter(supabase, source, job)
        elif job["job_type"] == "fetch_asura_chapter" and source.get("adapter_key") == "asura_scans":
            _fetch_asura_chapter(supabase, source, job)
        else:
            raise WorkerError(f"Job type {job['job_type']} is not implemented by this worker.")
    except Exception as exc:
        attempts = int(job.get("attempts") or 1)
        status = "needs_attention" if attempts >= 3 else "queued"
        retry_at = datetime.now(timezone.utc) + timedelta(minutes=min(60, 2 ** attempts))
        supabase.update("site_ingestion_jobs", "id=eq." + job["id"], {
            "status": status, "last_error": str(exc)[:2000], "locked_at": None, "locked_by": None,
            "run_after": retry_at.isoformat(),
        })
        LOG.exception("Job %s failed", job.get("id"))
    return True


def run_once() -> int:
    """Run a bounded batch for scheduled CI runners; never idle or loop forever."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    if not url.startswith("https://"):
        raise SystemExit("SUPABASE_URL must use HTTPS.")
    worker_id = os.getenv("WORKER_ID", f"galaxite-gha-{uuid.uuid4().hex[:10]}")
    max_jobs = max(1, min(5, int(os.getenv("MAX_JOBS_PER_RUN", "1"))))
    supabase = Supabase(url, key)
    LOG.info("Galaxite scheduled worker starting: %s (max_jobs=%s)", worker_id, max_jobs)
    schedule_discovery(supabase)
    processed = 0
    for _ in range(max_jobs):
        if not process_one(supabase, worker_id):
            break
        processed += 1
    LOG.info("Galaxite scheduled worker finished; claimed_jobs=%s", processed)
    return processed


def main() -> None:
    if os.getenv("RUN_ONCE", "false").lower() in {"1", "true", "yes"}:
        run_once()
        return

    # Local/manual continuous mode remains available for development only.
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    if not url.startswith("https://"):
        raise SystemExit("SUPABASE_URL must use HTTPS.")
    worker_id = os.getenv("WORKER_ID", f"galaxite-{uuid.uuid4().hex[:10]}")
    idle = max(2, int(os.getenv("POLL_SECONDS", "15")))
    supabase = Supabase(url, key)
    LOG.info("Galaxite ingestion worker started: %s", worker_id)
    last_schedule = 0.0
    while True:
        try:
            if time.monotonic() - last_schedule >= 30:
                schedule_discovery(supabase)
                last_schedule = time.monotonic()
            if not process_one(supabase, worker_id):
                time.sleep(idle)
        except KeyboardInterrupt:
            LOG.info("Worker stopping.")
            break
        except Exception:
            LOG.exception("Worker loop error")
            time.sleep(idle)


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    main()
