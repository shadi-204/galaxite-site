/* Live Galaxite catalog and private chapter-page delivery. */
(() => {
  const cfg = window.AUTH_CONFIG || {};
  const getClient = async () => {
    if (window.GALAXITE_SUPABASE_CLIENT) return window.GALAXITE_SUPABASE_CLIENT;
    if (typeof window.GALAXITE_GET_SUPABASE_CLIENT === "function") return await window.GALAXITE_GET_SUPABASE_CLIENT();
    return null;
  };
  async function refresh() {
    try {
      const db = await getClient();
      if (!db) return;
      const { data, error } = await db.from("site_works")
        .select("id,title,type,genres,rating,status,description,chapter_count,cover_url,sort_order")
        .eq("is_published", true)
        .order("sort_order", { ascending: true });
      if (error || !Array.isArray(data) || !data.length) return;
      const rows = data.map((w) => ({
        id: w.id,
        title: w.title,
        type: w.type,
        genres: Array.isArray(w.genres) ? w.genres : [],
        rating: Number(w.rating || 0),
        status: w.status || "مستمر",
        desc: w.description || "",
        chapters: Number(w.chapter_count || 0),
        cover: w.cover_url || ""
      }));
      window.GALAXITE_SET_WORKS?.(rows);
      window.dispatchEvent(new Event("galaxite:catalog-updated"));
    } catch (error) {
      console.warn("Galaxite live catalog unavailable; using bundled catalog.", error);
    }
  }
  async function getChapterPages(workId, chapterNumber) {
    try {
      const db = await getClient();
      if (!db) return [];
      const { data: chapter, error: chapterError } = await db.from("site_chapters")
        .select("id,is_published")
        .eq("work_id", String(workId))
        .eq("chapter_number", Number(chapterNumber))
        .maybeSingle();
      if (chapterError || !chapter?.is_published) return [];
      const { data: pages, error: pagesError } = await db.from("site_chapter_pages")
        .select("page_number,storage_path")
        .eq("chapter_id", chapter.id)
        .order("page_number", { ascending: true });
      if (pagesError || !Array.isArray(pages) || !pages.length) return [];
      const signed = await Promise.all(pages.map(async (page) => {
        const { data, error } = await db.storage.from("galaxite-chapters").createSignedUrl(page.storage_path, 3600);
        return error ? null : { page: page.page_number, url: data?.signedUrl || "" };
      }));
      return signed.filter((item) => item?.url).sort((a,b) => a.page-b.page).map((item) => item.url);
    } catch (error) {
      console.warn("Chapter pages unavailable.", error);
      return [];
    }
  }
  window.GALAXITE_DB_CATALOG = { refresh, getChapterPages };
  refresh();
})();