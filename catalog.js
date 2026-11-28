/* Live Galaxite catalog and private chapter-page delivery. */
(() => {
  const getClient = async () => {
    if (window.GALAXITE_SUPABASE_CLIENT) return window.GALAXITE_SUPABASE_CLIENT;
    if (typeof window.GALAXITE_GET_SUPABASE_CLIENT === "function") return await window.GALAXITE_GET_SUPABASE_CLIENT();
    return null;
  };
  const state = (status, message = "") => {
    window.GALAXITE_CATALOG_STATE = { status, message };
    window.dispatchEvent(new Event("galaxite:catalog-state"));
  };
  async function refresh() {
    state("loading");
    try {
      const db = await getClient();
      if (!db) throw new Error("Supabase client unavailable.");
      const { data, error } = await db.from("site_works")
        .select("id,title,type,genres,rating,status,description,chapter_count,cover_url,sort_order")
        .eq("is_published", true).order("sort_order", { ascending: true });
      if (error) throw error;
      const workRows = data || [];
      let chapterRows = [];
      if (workRows.length) {
        const chapterResult = await db.from("site_chapters")
          .select("work_id,chapter_number,title,is_premium,created_at")
          .in("work_id", workRows.map((work) => work.id))
          .eq("is_published", true)
          .order("chapter_number", { ascending: false });
        if (chapterResult.error) {
          console.warn("Published chapter list unavailable.", chapterResult.error);
        } else {
          chapterRows = Array.isArray(chapterResult.data) ? chapterResult.data : [];
        }
      }
      const chaptersByWork = new Map();
      for (const chapter of chapterRows) {
        const key = String(chapter.work_id);
        if (!chaptersByWork.has(key)) chaptersByWork.set(key, []);
        chaptersByWork.get(key).push({
          chapter_number: Number(chapter.chapter_number),
          title: chapter.title || "",
          is_premium: Boolean(chapter.is_premium),
          created_at: chapter.created_at || null
        });
      }
      const rows = workRows.map((w) => {
        const publishedChapters = chaptersByWork.get(String(w.id)) || [];
        return {
          id: w.id, title: w.title, type: w.type,
          genres: Array.isArray(w.genres) ? w.genres : [],
          rating: Number(w.rating || 0), status: w.status || "مستمر",
          desc: w.description || "", chapters: Number(w.chapter_count || 0),
          publishedChapters, availableChaptersCount: publishedChapters.length,
          cover: w.cover_url || ""
        };
      });
      window.GALAXITE_SET_WORKS?.(rows);
      state("ready");
      window.dispatchEvent(new Event("galaxite:catalog-updated"));
      return rows;
    } catch (error) {
      console.error("Galaxite catalog load failed.", error);
      state("error", "تعذر تحميل مكتبة الأعمال من قاعدة البيانات.");
      window.dispatchEvent(new Event("galaxite:catalog-updated"));
      return [];
    }
  }
  async function getLatestChapters(limit = 40) {
    try {
      const db = await getClient();
      if (!db) return [];
      const { data, error } = await db.from("site_chapters")
        .select("work_id,chapter_number,title,created_at")
        .eq("is_published", true).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn("Latest chapter metadata unavailable.", error);
      return [];
    }
  }
  async function getChapterPages(workId, chapterNumber) {
    try {
      const db = await getClient();
      if (!db) return [];
      const { data: chapter, error: chapterError } = await db.from("site_chapters")
        .select("id,is_published").eq("work_id", String(workId))
        .eq("chapter_number", Number(chapterNumber)).maybeSingle();
      if (chapterError || !chapter?.is_published) return [];
      const { data: pages, error: pagesError } = await db.from("site_chapter_pages")
        .select("page_number,storage_path").eq("chapter_id", chapter.id)
        .order("page_number", { ascending: true });
      if (pagesError || !Array.isArray(pages) || !pages.length) return [];
      const signed = await Promise.all(pages.map(async (page) => {
        const { data, error } = await db.storage.from("galaxite-chapters").createSignedUrl(page.storage_path, 3600);
        return error ? null : { page: page.page_number, url: data?.signedUrl || "" };
      }));
      return signed.filter((item) => item?.url).sort((x, y) => x.page - y.page).map((item) => item.url);
    } catch (error) {
      console.warn("Chapter pages unavailable.", error);
      return [];
    }
  }
  window.GALAXITE_DB_CATALOG = { refresh, getLatestChapters, getChapterPages };
  refresh();
})();
