/* Fast Galaxite catalog: cached work cards first, chapter metadata on demand. */
(() => {
  const WORKS_CACHE_KEY = "galaxite:catalog:works:v3";
  const CHAPTER_CACHE_KEY = "galaxite:catalog:chapters:v5";
  const PAGE_URL_CACHE_KEY = "galaxite:reader:page-urls:v1";
  const PAGE_URL_CACHE_TTL = 45 * 60 * 1000;
  const WORKS_CACHE_TTL = 6 * 60 * 60 * 1000;
  const CHAPTER_CACHE_TTL = 15 * 60 * 1000;
  const MAX_CHAPTER_CACHE_WORKS = 18;

  let latestRows = [];
  let refreshPromise = null;
  const chapterCache = new Map();
  const chapterPromises = new Map();

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const writeJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  };
  const getClient = async () => {
    if (window.GALAXITE_SUPABASE_CLIENT) return window.GALAXITE_SUPABASE_CLIENT;
    if (typeof window.GALAXITE_GET_SUPABASE_CLIENT === "function") {
      return await window.GALAXITE_GET_SUPABASE_CLIENT();
    }
    return null;
  };
  const state = (status, message = "") => {
    window.GALAXITE_CATALOG_STATE = { status, message };
    window.dispatchEvent(new Event("galaxite:catalog-state"));
  };
  const catalogUpdated = () => window.dispatchEvent(new Event("galaxite:catalog-updated"));

  function normalizeWorks(rows) {
    return (Array.isArray(rows) ? rows : []).map((w) => ({
      id: w.id,
      title: w.title || "",
      type: w.type || "مانهوا",
      genres: Array.isArray(w.genres) ? w.genres : [],
      rating: Number(w.rating || 0),
      status: w.status || "مستمر",
      desc: w.description || w.desc || "",
      chapters: Number(w.chapter_count || w.chapters || 0),
      cover: w.cover_url || w.cover || "",
      sort_order: Number(w.sort_order || 0)
    }));
  }

  function publishWorks(rows, preserveLoadedChapters = true) {
    const oldById = new Map(latestRows.map((work) => [String(work.id), work]));
    const next = normalizeWorks(rows).map((work) => {
      const old = oldById.get(String(work.id));
      if (preserveLoadedChapters && Array.isArray(old?.publishedChapters)) {
        work.publishedChapters = old.publishedChapters;
      }
      return work;
    });
    latestRows = next;
    window.GALAXITE_SET_WORKS?.(next);
    window.GALAXITE_ENGAGEMENT?.hydrateWorkRatings?.(next);
    return next;
  }

  function seedCachedWorks() {
    const cached = readJson(WORKS_CACHE_KEY, null);
    if (!cached || !Array.isArray(cached.rows) || !cached.rows.length) return false;
    publishWorks(cached.rows, false);
    state("ready");
    return true;
  }

  function seedChapterCache() {
    const cached = readJson(CHAPTER_CACHE_KEY, []);
    if (!Array.isArray(cached)) return;
    for (const item of cached) {
      if (!item?.id || !Array.isArray(item.rows)) continue;
      chapterCache.set(String(item.id), {
        rows: item.rows,
        savedAt: Number(item.savedAt || 0)
      });
    }
  }

  function persistChapterCache() {
    const items = [...chapterCache.entries()]
      .sort((a, b) => b[1].savedAt - a[1].savedAt)
      .slice(0, MAX_CHAPTER_CACHE_WORKS)
      .map(([id, value]) => ({ id, rows: value.rows, savedAt: value.savedAt }));
    writeJson(CHAPTER_CACHE_KEY, items);
  }

  function attachChapters(workId, rows) {
    const work = latestRows.find((item) => String(item.id) === String(workId));
    if (work) work.publishedChapters = rows;
    return rows;
  }

  async function fetchWorkChapters(workId) {
    const db = await getClient();
    if (!db) throw new Error("Supabase client unavailable.");

    const pageSize = 1000;
    let offset = 0;
    const rows = [];
    while (true) {
      const result = await db.from("site_chapters")
        .select("id,work_id,chapter_number,title,display_title,source_published_at,is_premium,created_at")
        .eq("work_id", String(workId))
        .eq("is_published", true)
        .order("chapter_number", { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (result.error) throw result.error;
      const batch = Array.isArray(result.data) ? result.data : [];
      rows.push(...batch.map((chapter) => ({
        id: chapter.id,
        chapter_number: Number(chapter.chapter_number),
        title: chapter.title || "",
        display_title: chapter.display_title || null,
        source_published_at: chapter.source_published_at || null,
        is_premium: Boolean(chapter.is_premium),
        created_at: chapter.created_at || null
      })));
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    chapterCache.delete(String(workId));
    chapterCache.set(String(workId), { rows, savedAt: Date.now() });
    persistChapterCache();
    attachChapters(workId, rows);
    window.dispatchEvent(new CustomEvent("galaxite:work-chapters-updated", {
      detail: { workId: String(workId) }
    }));
    return rows;
  }

  function getCachedWorkChapters(workId) {
    const cached = chapterCache.get(String(workId));
    if (!cached) return null;
    chapterCache.delete(String(workId));
    chapterCache.set(String(workId), cached);
    attachChapters(workId, cached.rows);
    return cached.rows;
  }

  function getWorkChapters(workId) {
    const key = String(workId);
    const cached = chapterCache.get(key);
    if (cached) {
      attachChapters(key, cached.rows);
      // Serve cached chapters immediately. Refresh old entries without blocking
      // the page the visitor is currently reading.
      if (Date.now() - cached.savedAt > CHAPTER_CACHE_TTL) {
        refreshWorkChapters(key).catch((error) => console.warn("Chapter metadata refresh failed.", error));
      }
      return Promise.resolve(cached.rows);
    }
    if (chapterPromises.has(key)) return chapterPromises.get(key);
    const promise = fetchWorkChapters(key).finally(() => chapterPromises.delete(key));
    chapterPromises.set(key, promise);
    return promise;
  }

  function refreshWorkChapters(workId) {
    const key = String(workId);
    if (chapterPromises.has(key)) return chapterPromises.get(key);
    const promise = fetchWorkChapters(key).finally(() => chapterPromises.delete(key));
    chapterPromises.set(key, promise);
    return promise;
  }

  async function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const db = await getClient();
        if (!db) throw new Error("Supabase client unavailable.");
        const pageSize = 1000;
        let offset = 0;
        const workRows = [];
        while (true) {
          const result = await db.from("site_works")
            .select("id,title,type,genres,rating,status,description,chapter_count,cover_url,sort_order")
            .eq("is_published", true)
            .order("sort_order", { ascending: true })
            .range(offset, offset + pageSize - 1);
          if (result.error) throw result.error;
          const batch = Array.isArray(result.data) ? result.data : [];
          workRows.push(...batch);
          if (batch.length < pageSize) break;
          offset += pageSize;
        }

        const rows = publishWorks(workRows);
        writeJson(WORKS_CACHE_KEY, { rows, savedAt: Date.now() });
        state("ready");
        catalogUpdated();
        return rows;
      } catch (error) {
        console.error("Galaxite catalog refresh failed.", error);
        if (latestRows.length) {
          // A temporary outage must not blank a catalog already on screen.
          state("ready");
          return latestRows;
        }
        state("error", "تعذر الاتصال بقاعدة البيانات.");
        return [];
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  async function getLatestChapters(limit = 40) {
    try {
      const db = await getClient();
      if (!db) return [];
      const { data, error } = await db.from("site_chapters")
        .select("work_id,chapter_number,title,display_title,source_published_at,created_at")
        .eq("is_published", true)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn("Latest chapter metadata unavailable.", error);
      return [];
    }
  }

  function readPageUrlCache(key) {
    const all = readJson(PAGE_URL_CACHE_KEY, {});
    const entry = all && typeof all === "object" ? all[key] : null;
    if (!entry || !Array.isArray(entry.urls) || Date.now() - Number(entry.savedAt || 0) > PAGE_URL_CACHE_TTL) return null;
    return entry.urls;
  }

  function savePageUrlCache(key, urls) {
    const all = readJson(PAGE_URL_CACHE_KEY, {});
    const next = all && typeof all === "object" ? all : {};
    next[key] = { savedAt: Date.now(), urls };
    const keep = Object.entries(next)
      .sort((a, b) => Number(b[1]?.savedAt || 0) - Number(a[1]?.savedAt || 0))
      .slice(0, 12);
    writeJson(PAGE_URL_CACHE_KEY, Object.fromEntries(keep));
  }

  async function getChapterPages(workId, chapterNumber, chapterId = null, forceRefresh = false) {
    try {
      const cacheKey = String(chapterId || (String(workId) + ":" + String(chapterNumber)));
      if (!forceRefresh) {
        const cachedUrls = readPageUrlCache(cacheKey);
        if (cachedUrls?.length) return cachedUrls;
      }

      const db = await getClient();
      if (!db) return [];
      let resolvedChapterId = chapterId;
      if (!resolvedChapterId) {
        const { data: chapter, error } = await db.from("site_chapters")
          .select("id,is_published")
          .eq("work_id", String(workId))
          .eq("chapter_number", Number(chapterNumber))
          .maybeSingle();
        if (error || !chapter?.is_published) return [];
        resolvedChapterId = chapter.id;
      }

      let urls = [];
      if (db.functions?.invoke) {
        // This existing project endpoint checks publication/source permissions,
        // reuses saved links, locks concurrent refreshes, and scrapes missing links.
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const result = await db.functions.invoke("refresh-chapter-images", {
            body: { chapterId: resolvedChapterId }
          });
          if (!result.error && Array.isArray(result.data?.urls)) {
            urls = result.data.urls.filter((url) => typeof url === "string" && url.startsWith("https://"));
            break;
          }
          if (!result.error && result.data?.pending && attempt < 7) {
            await new Promise((resolve) => setTimeout(resolve, 900));
            continue;
          }
          if (result.error) console.warn("Asura chapter refresh unavailable; using saved page URLs.", result.error);
          break;
        }
      }

      if (!urls.length) {
        const { data, error } = await db.from("site_chapter_pages")
          .select("page_number,storage_path,image_url")
          .eq("chapter_id", String(resolvedChapterId))
          .order("page_number", { ascending: true });
        const pages = !error && Array.isArray(data) ? data : [];
        const resolved = await Promise.all(pages.map(async (page) => {
          if (page.image_url) return { page: page.page_number, url: page.image_url };
          if (!page.storage_path) return null;
          const { data: signed, error: signError } = await db.storage.from("galaxite-chapters")
            .createSignedUrl(page.storage_path, 3600);
          return signError ? null : { page: page.page_number, url: signed?.signedUrl || "" };
        }));
        urls = resolved.filter((item) => item?.url)
          .sort((a, b) => a.page - b.page)
          .map((item) => item.url);
      }
      if (urls.length) savePageUrlCache(cacheKey, urls);
      return urls;
    } catch (error) {
      console.warn("Chapter pages unavailable.", error);
      return [];
    }
  }

  window.GALAXITE_DB_CATALOG = {
    refresh, getLatestChapters, getChapterPages,
    getCachedWorkChapters, getWorkChapters, refreshWorkChapters
  };

  const hasCachedWorks = seedCachedWorks();
  seedChapterCache();
  if (!hasCachedWorks) state("loading");
  refresh();
})();
