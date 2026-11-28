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


def _discover(supabase: Supabase, source: dict[str, Any], job: dict[str, Any]) -> None:
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
                payload = {"page_urls": chapter["pages"], "source_host": urlparse(source["base_url"]).hostname}
                supabase.insert("site_ingestion_jobs", {
                    "source_id": source["id"], "job_type": "fetch_chapter",
                    "external_work_id": str(work_id), "external_chapter_id": str(chapter_id),
                    "payload": payload,
                })
    supabase.update("site_ingestion_jobs", "id=eq." + job["id"], {"status": "completed", "completed_at": "now()", "last_error": None, "locked_at": None, "locked_by": None})


def _fetch_chapter(supabase: Supabase, source: dict[str, Any], job: dict[str, Any]) -> None:
    if source.get("authorization_status") != "authorized" or not source.get("enabled"):
        raise WorkerError("Source is no longer enabled and authorized.")
    payload = job.get("payload") or {}
    urls = payload.get("page_urls")
    host = urlparse(str(source.get("base_url") or "")).hostname
    if not isinstance(urls, list) or not urls or len(urls) > 200:
        raise WorkerError("Chapter job has no valid page_urls list.")
    if payload.get("source_host") != host:
        raise WorkerError("Chapter URLs do not match the authorized source host.")
    chapter_id = job.get("external_chapter_id")
    if not chapter_id:
        raise WorkerError("Chapter job is missing its chapter ID.")
    bucket = os.getenv("SUPABASE_CHAPTERS_BUCKET", "galaxite-chapters")
    page_rows = []
    for index, page_url in enumerate(urls, 1):
        if urlparse(_https_url(str(page_url))).hostname != host:
            raise WorkerError("Page URL host does not match the authorized feed host.")
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
    supabase.update("site_ingestion_jobs", "id=eq." + job["id"], {"status": "completed", "completed_at": "now()", "last_error": None, "locked_at": None, "locked_by": None})


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
        else:
            raise WorkerError(f"Job type {job['job_type']} is not implemented by this worker.")
    except Exception as exc:
        attempts = int(job.get("attempts") or 1)
        status = "needs_attention" if attempts >= 3 else "failed"
        supabase.update("site_ingestion_jobs", "id=eq." + job["id"], {
            "status": status, "last_error": str(exc)[:2000], "locked_at": None, "locked_by": None,
        })
        LOG.exception("Job %s failed", job.get("id"))
    return True


def main() -> None:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    if not url.startswith("https://"):
        raise SystemExit("SUPABASE_URL must use HTTPS.")
    worker_id = os.getenv("WORKER_ID", f"galaxite-{uuid.uuid4().hex[:10]}")
    idle = max(2, int(os.getenv("POLL_SECONDS", "15")))
    supabase = Supabase(url, key)
    LOG.info("Galaxite ingestion worker started: %s", worker_id)
    while True:
        try:
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
