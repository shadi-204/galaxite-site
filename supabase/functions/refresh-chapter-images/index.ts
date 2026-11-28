import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag))) {
    out[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return out;
}

function extractImageUrls(html: string, pageUrl: string): string[] {
  const tags = html.match(/<(?:img|source)\b[^>]*>/gi) || [];
  const found = new Set<string>();
  for (const tag of tags) {
    const a = attrs(tag);
    const candidates = [
      a.src, a["data-src"], a["data-original"], a["data-lazy-src"],
      ...(a.srcset || a["data-srcset"] || "").split(",").map((part) => part.trim().split(/\s+/)[0]),
    ];
    for (const raw of candidates) {
      if (!raw) continue;
      try {
        const url = new URL(raw, pageUrl);
        if (
          url.protocol === "https:" &&
          url.hostname === "cdn.asurascans.com" &&
          url.pathname.includes("/asura-images/chapters/")
        ) found.add(url.href);
      } catch { /* Ignore malformed image attributes. */ }
    }
  }
  return [...found].slice(0, 200);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { chapterId } = await req.json();
    if (typeof chapterId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(chapterId)) {
      return json({ error: "Invalid chapter ID." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration is incomplete." }, 500);
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: chapter, error: chapterError } = await db
      .from("site_chapters")
      .select("id,work_id,source_url,is_published")
      .eq("id", chapterId)
      .maybeSingle();
    if (chapterError) throw chapterError;
    if (!chapter?.is_published || !chapter.source_url) {
      return json({ error: "Chapter is unavailable or has no public source URL." }, 404);
    }

    const { data: work, error: workError } = await db
      .from("site_works").select("is_published").eq("id", chapter.work_id).maybeSingle();
    if (workError) throw workError;
    if (!work?.is_published) return json({ error: "Work is not published." }, 404);

    const { data: existing, error: pagesError } = await db
      .from("site_chapter_pages")
      .select("page_number,image_url,storage_path")
      .eq("chapter_id", chapterId)
      .order("page_number", { ascending: true });
    if (pagesError) throw pagesError;

    if (existing?.length) {
      const urls: string[] = [];
      for (const page of existing) {
        if (page.image_url) urls.push(page.image_url);
        else if (page.storage_path) {
          const { data } = await db.storage.from("galaxite-chapters").createSignedUrl(page.storage_path, 3600);
          if (data?.signedUrl) urls.push(data.signedUrl);
        }
      }
      if (urls.length) return json({ urls, cached: true });
    }

    let source: URL;
    try { source = new URL(chapter.source_url); } catch { return json({ error: "Invalid chapter source URL." }, 400); }
    if (
      source.protocol !== "https:" ||
      source.hostname !== "asurascans.com" ||
      !/^\/comics\/[^/]+\/chapter\/\d+(?:\.\d+)?\/?$/i.test(source.pathname)
    ) return json({ error: "Chapter source is not an allowed public Asura page." }, 400);

    const { data: claimed, error: claimError } = await db.rpc("claim_site_chapter_refresh", { p_chapter_id: chapterId });
    if (claimError) throw claimError;
    if (!claimed) return json({ pending: true, message: "Chapter image refresh is already in progress." }, 202);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    let response: Response;
    try {
      response = await fetch(source.href, {
        headers: { "Accept": "text/html", "User-Agent": "GalaxitePublicReader/1.0" },
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok || response.status >= 300) {
      return json({ error: "The public source page could not be reached.", sourceStatus: response.status }, 502);
    }
    const html = await response.text();
    const urls = extractImageUrls(html, source.href);
    if (!urls.length) {
      return json({ error: "No public chapter image links were found on the source page." }, 422);
    }

    const rows = urls.map((image_url, index) => ({
      chapter_id: chapterId,
      page_number: index + 1,
      image_url,
    }));
    const { error: insertError } = await db.from("site_chapter_pages").insert(rows);
    if (insertError) throw insertError;

    return json({ urls, cached: false });
  } catch (error) {
    console.error("refresh-chapter-images failed:", error);
    return json({ error: "Could not refresh chapter image links." }, 500);
  }
});
