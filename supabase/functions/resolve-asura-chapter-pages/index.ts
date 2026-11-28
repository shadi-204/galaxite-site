import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_ORIGINS = new Set([
  "https://galaxite-preview.pages.dev",
  "https://galaxitescans.com",
  "https://www.galaxitescans.com",
  "https://shadi-204.github.io"
]);
const PAGE_IMAGE_PATH = "/asura-images/chapters/";
const rate = new Map<string, number[]>();

function headers(origin: string | null): Headers {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://galaxite-preview.pages.dev";
  return new Headers({
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
}

function reply(status: number, body: Record<string, unknown>, cors: Headers): Response {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

async function rest(path: string, init: RequestInit = {}): Promise<any> {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("server_configuration_missing");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`database_request_failed_${response.status}: ${raw.slice(0, 300)}`);
  return raw ? JSON.parse(raw) : null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x2f;/gi, "/")
    .replace(/\\\//g, "/")
    .trim();
}

function extractImageUrls(html: string, pageUrl: string): string[] {
  const found = new Set<string>();
  const tags = html.match(/<(?:img|source)\b[^>]*>/gi) || [];
  const allowedKeys = new Set(["src", "data-src", "data-original", "data-lazy-src", "srcset", "data-srcset"]);

  for (const tag of tags) {
    const attrs: Record<string, string> = {};
    const attrPattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let match: RegExpExecArray | null;
    while ((match = attrPattern.exec(tag)) !== null) {
      const key = match[1].toLowerCase();
      if (allowedKeys.has(key)) attrs[key] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? "");
    }

    const candidates: string[] = [];
    for (const key of ["src", "data-src", "data-original", "data-lazy-src"]) {
      if (attrs[key]) candidates.push(attrs[key]);
    }
    for (const key of ["srcset", "data-srcset"]) {
      if (!attrs[key]) continue;
      for (const item of attrs[key].split(",")) {
        const candidate = item.trim().split(/\s+/)[0];
        if (candidate) candidates.push(candidate);
      }
    }

    for (const candidate of candidates) {
      try {
        const url = new URL(candidate, pageUrl);
        if (url.protocol !== "https:" || url.hostname !== "cdn.asurascans.com") continue;
        if (!url.pathname.includes(PAGE_IMAGE_PATH)) continue;
        found.add(url.toString());
      } catch {
        // Ignore malformed image attributes.
      }
    }
  }
  return [...found].slice(0, 200);
}

function allowFetch(ip: string): boolean {
  const now = Date.now();
  const recent = (rate.get(ip) || []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 15) return false;
  recent.push(now);
  rate.set(ip, recent);
  return true;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const cors = headers(origin);

  if (request.method === "OPTIONS") return new Response("ok", { status: 204, headers: cors });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return reply(403, { error: "origin_not_allowed" }, cors);
  if (request.method !== "POST") return reply(405, { error: "method_not_allowed" }, cors);

  try {
    const body = await request.json().catch(() => ({}));
    const chapterId = String(body?.chapterId || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(chapterId)) {
      return reply(400, { error: "invalid_chapter_id" }, cors);
    }

    const chapterRows = await rest(
      `site_chapters?select=id,source_url,is_published&id=eq.${encodeURIComponent(chapterId)}&limit=1`
    );
    const chapter = chapterRows?.[0];
    if (!chapter || chapter.is_published !== true) {
      return reply(404, { error: "published_chapter_not_found" }, cors);
    }

    const existing = await rest(
      `site_chapter_pages?select=page_number,image_url,storage_path&chapter_id=eq.${encodeURIComponent(chapterId)}&order=page_number.asc`
    );
    if (Array.isArray(existing) && existing.length) {
      return reply(200, { pages: existing, cached: true }, cors);
    }

    const sourceRows = await rest(
      "site_content_sources?select=id,base_url,adapter_key,authorization_status,enabled&source_key=eq.asura_scans&limit=1"
    );
    const source = sourceRows?.[0];
    if (!source || source.enabled !== true || source.authorization_status !== "authorized" || source.adapter_key !== "asura_scans") {
      return reply(403, { error: "asura_source_not_authorized" }, cors);
    }

    const chapterUrl = new URL(String(chapter.source_url || ""));
    if (chapterUrl.protocol !== "https:" || chapterUrl.hostname !== "asurascans.com" || !chapterUrl.pathname.startsWith("/comics/") || !/\/chapter\//.test(chapterUrl.pathname)) {
      return reply(400, { error: "chapter_source_url_not_allowed" }, cors);
    }

    const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!allowFetch(clientIp)) return reply(429, { error: "too_many_chapter_refreshes" }, cors);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18_000);
    let html = "";
    try {
      const upstream = await fetch(chapterUrl.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "Mozilla/5.0 (compatible; GalaxiteReader/1.0)"
        }
      });
      if (!upstream.ok) return reply(502, { error: "chapter_source_unavailable", upstreamStatus: upstream.status }, cors);
      if (!upstream.url || new URL(upstream.url).hostname !== "asurascans.com") {
        return reply(502, { error: "chapter_source_redirected" }, cors);
      }
      html = await upstream.text();
      if (html.length > 8 * 1024 * 1024) return reply(413, { error: "chapter_source_too_large" }, cors);
    } finally {
      clearTimeout(timeout);
    }

    const imageUrls = extractImageUrls(html, chapterUrl.toString());
    if (!imageUrls.length) {
      return reply(422, { error: "no_public_image_links_found" }, cors);
    }

    const pageRows = imageUrls.map((imageUrl, index) => ({
      chapter_id: chapterId,
      page_number: index + 1,
      image_url: imageUrl
    }));
    const saved = await rest(
      "site_chapter_pages?on_conflict=chapter_id,page_number",
      {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(pageRows)
      }
    );

    // This chapter was just repaired on demand; prevent the hourly worker from
    // repeating the same scrape for an already queued job.
    await rest(
      `site_ingestion_jobs?external_chapter_id=eq.${encodeURIComponent(chapterId)}&job_type=eq.fetch_asura_chapter&status=eq.queued`,
      {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        body: JSON.stringify({
          status: "completed",
          completed_at: new Date().toISOString(),
          last_error: null,
          locked_at: null,
          locked_by: null
        })
      }
    ).catch(() => null);

    return reply(200, { pages: Array.isArray(saved) && saved.length ? saved : pageRows, cached: false }, cors);
  } catch (error) {
    console.error("resolve-asura-chapter-pages failed:", error);
    return reply(500, { error: "chapter_pages_unavailable" }, cors);
  }
});
