/* Account-based work ratings and chapter hearts for Galaxite. */
(() => {
  const $ = (selector) => document.querySelector(selector);
  let dbPromise = null;
  const ratingLoads = new Map();

  async function getDb() {
    if (window.GALAXITE_SUPABASE_CLIENT) return window.GALAXITE_SUPABASE_CLIENT;
    if (!dbPromise) {
      dbPromise = Promise.resolve(window.GALAXITE_GET_SUPABASE_CLIENT?.())
        .then((db) => {
          if (!db) throw new Error("قاعدة البيانات غير متاحة.");
          return db;
        })
        .catch((error) => {
          dbPromise = null;
          throw error;
        });
    }
    return dbPromise;
  }

  function rowOf(data) {
    if (Array.isArray(data)) return data[0] || null;
    return data && typeof data === "object" ? data : null;
  }

  function showLogin(message) {
    if (document.querySelector(".gx-login-overlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "gx-login-overlay";
    overlay.innerHTML = `
      <section class="gx-login-modal" role="dialog" aria-modal="true" aria-labelledby="gxLoginTitle">
        <button class="gx-login-close" type="button" aria-label="إغلاق">×</button>
        <div class="gx-login-symbol" aria-hidden="true">♥</div>
        <h3 id="gxLoginTitle">شاركنا تفاعلك على Galaxite</h3>
        <p class="gx-login-message"></p>
        <p class="gx-login-free">إنشاء حساب جديد مجاني تمامًا، ومش محتاج أي اشتراك.</p>
        <div class="gx-login-actions">
          <button class="gx-login-signup" type="button">إنشاء حساب مجاني</button>
          <button class="gx-login-signin" type="button">تسجيل الدخول</button>
        </div>
      </section>`;
    overlay.querySelector(".gx-login-message").textContent =
      message || "لازم تسجل دخولك الأول عشان تضيف قلب أو تقيّم العمل.";
    document.body.appendChild(overlay);

    const close = () => {
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.querySelector(".gx-login-close").onclick = close;
    overlay.querySelector(".gx-login-signin").onclick = () => {
      close();
      window.VX?.openAuth?.("in");
      if (location.hash !== "#/login") location.hash = "#/login";
    };
    overlay.querySelector(".gx-login-signup").onclick = () => {
      close();
      window.VX?.openAuth?.("up");
      if (location.hash !== "#/login") location.hash = "#/login";
    };
    document.addEventListener("keydown", onKeyDown);
    overlay.querySelector(".gx-login-close").focus();
  }

  async function currentUser(db) {
    const { data, error } = await db.auth.getUser();
    if (error) throw error;
    return data?.user || null;
  }

  function renderRatingStats(work, stats) {
    work.rating = Number(stats?.average_rating || 0);
    work.ratingCount = Number(stats?.rating_count || 0);
    work.myRating = stats?.my_rating == null ? null : Number(stats.my_rating);

    const box = $("#workRatingBox");
    if (!box || String(box.dataset.workId) !== String(work.id)) return;
    const avg = $("#workRatingAverage");
    const count = $("#workRatingCount");
    const slider = $("#myWorkRating");
    const output = $("#myWorkRatingValue");
    const note = $("#workRatingNote");
    if (avg) avg.textContent = work.ratingCount ? work.rating.toFixed(1) + " / 10" : "لا توجد تقييمات بعد";
    if (count) count.textContent = work.ratingCount.toLocaleString("ar-EG") + " تقييم";
    if (slider && work.myRating != null) slider.value = String(work.myRating);
    if (output) output.textContent = (slider?.value || "5") + " / 10";
    if (note) note.textContent = work.myRating != null
      ? "تقييمك الحالي محفوظ على حسابك، وتقدر تغيّره في أي وقت."
      : "شاركنا رأيك في العمل.";
  }

  async function loadWorkRating(work) {
    if (!work?.id) return null;
    const key = String(work.id);
    if (ratingLoads.has(key)) return ratingLoads.get(key);
    const promise = (async () => {
      const db = await getDb();
      const { data, error } = await db.rpc("get_work_rating_stats", { p_work_ids: [work.id] });
      if (error) throw error;
      const stats = rowOf(data);
      renderRatingStats(work, stats);
      return stats;
    })().finally(() => ratingLoads.delete(key));
    ratingLoads.set(key, promise);
    return promise;
  }

  async function hydrateWorkRatings(works) {
    const list = (Array.isArray(works) ? works : []).filter((work) => work?.id);
    if (!list.length) return;
    try {
      const db = await getDb();
      const { data, error } = await db.rpc("get_work_rating_stats", {
        p_work_ids: list.map((work) => work.id)
      });
      if (error) throw error;
      const byId = new Map((Array.isArray(data) ? data : []).map((row) => [String(row.work_id), row]));
      for (const work of list) {
        const stats = byId.get(String(work.id));
        work.rating = Number(stats?.average_rating || 0);
        work.ratingCount = Number(stats?.rating_count || 0);
        work.myRating = stats?.my_rating == null ? null : Number(stats.my_rating);
      }
      window.dispatchEvent(new Event("galaxite:ratings-updated"));
    } catch (error) {
      console.warn("Galaxite public ratings could not be loaded.", error);
    }
  }

  function bindWorkRating(work) {
    const box = $("#workRatingBox");
    if (!box || !work?.id) return;
    const slider = $("#myWorkRating");
    const output = $("#myWorkRatingValue");
    const save = $("#saveWorkRating");
    const note = $("#workRatingNote");
    if (slider && output) slider.oninput = () => { output.textContent = slider.value + " / 10"; };
    loadWorkRating(work).catch((error) => {
      console.warn("Work rating stats unavailable.", error);
      if (note) note.textContent = "تعذر تحميل التقييمات الآن. حاول تحديث الصفحة.";
    });
    if (!save) return;
    save.onclick = async () => {
      const rating = Number(slider?.value || 5);
      save.disabled = true;
      if (note) note.textContent = "بنحفظ تقييمك...";
      try {
        const db = await getDb();
        const user = await currentUser(db);
        if (!user) {
          showLogin("سجّل دخولك عشان تقدر تقيّم العمل.");
          return;
        }
        const { data, error } = await db.rpc("set_work_rating", {
          p_work_id: work.id,
          p_rating: rating
        });
        if (error) throw error;
        renderRatingStats(work, rowOf(data));
        if (note) note.textContent = "تم حفظ تقييمك على حسابك.";
        if (window.VX?.toast) window.VX.toast("تم حفظ تقييمك", "ok");
        window.dispatchEvent(new Event("galaxite:ratings-updated"));
      } catch (error) {
        console.error("Work rating save failed.", error);
        if (note) note.textContent = error?.message || "تعذر حفظ التقييم. حاول مرة أخرى.";
      } finally {
        save.disabled = false;
      }
    };
  }

  async function resolveChapterId(workId, chapterNumber, chapterId) {
    if (chapterId) return chapterId;
    const db = await getDb();
    const { data, error } = await db.from("site_chapters")
      .select("id")
      .eq("work_id", String(workId))
      .eq("chapter_number", Number(chapterNumber))
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw error;
    return data?.id || null;
  }

  function updateChapterListHeart(button, stats) {
    const liked = Boolean(stats?.is_liked);
    const icon = button.querySelector(".chapter-heart-icon");
    const count = button.querySelector(".chapter-heart-count");
    button.setAttribute("aria-pressed", liked ? "true" : "false");
    button.classList.toggle("liked", liked);
    if (icon) icon.textContent = liked ? "♥" : "♡";
    if (count) count.textContent = Number(stats?.hearts_count || 0).toLocaleString("ar-EG");
  }

  async function bindChapterListHearts(chapters) {
    const buttons = [...document.querySelectorAll(".chapter-heart[data-chapter-id]")];
    if (!buttons.length) return;
    const ids = [...new Set(buttons.map((button) => button.dataset.chapterId).filter(Boolean))];
    buttons.forEach((button) => { button.disabled = true; });
    if (!ids.length) return;

    buttons.forEach((button) => {
      button.onclick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled) return;
        button.disabled = true;
        try {
          const db = await getDb();
          const user = await currentUser(db);
          if (!user) {
            showLogin("سجّل دخولك الأول عشان تضيف قلب للفصل. إنشاء الحساب مجاني.");
            return;
          }
          const { data, error } = await db.rpc("toggle_chapter_heart", {
            p_chapter_id: button.dataset.chapterId
          });
          if (error) throw error;
          updateChapterListHeart(button, rowOf(data));
        } catch (error) {
          console.error("Chapter list heart update failed.", error);
          if (window.VX?.toast) window.VX.toast("تعذر تحديث القلب. حاول مرة أخرى.");
        } finally {
          button.disabled = false;
        }
      };
    });

    try {
      const db = await getDb();
      const { data, error } = await db.rpc("get_chapter_heart_stats_many", {
        p_chapter_ids: ids
      });
      if (error) throw error;
      const byId = new Map((Array.isArray(data) ? data : [])
        .map((row) => [String(row.chapter_id), row]));
      buttons.forEach((button) => {
        const stats = byId.get(String(button.dataset.chapterId));
        updateChapterListHeart(button, stats || { hearts_count: 0, is_liked: false });
        button.disabled = false;
      });
    } catch (error) {
      console.warn("Chapter list heart stats unavailable.", error);
      buttons.forEach((button) => {
        const count = button.querySelector(".chapter-heart-count");
        if (count) count.textContent = "—";
        button.disabled = false;
      });
    }
  }

  function updateHeartBox(stats) {
    const button = $("#chapterHeartButton");
    const count = $("#chapterHeartCount");
    const note = $("#chapterHeartNote");
    const liked = Boolean(stats?.is_liked);
    if (button) {
      button.setAttribute("aria-pressed", liked ? "true" : "false");
      button.classList.toggle("liked", liked);
      button.innerHTML = liked ? "♥ أعجبني" : "♡ أعجبني";
    }
    if (count) count.textContent = Number(stats?.hearts_count || 0).toLocaleString("ar-EG");
    if (note) note.textContent = "القلوب من حسابات Galaxite";
  }

  async function bindChapterHeart(workId, chapterNumber, chapterId) {
    const box = $("#chapterHeartBox");
    if (!box) return;
    const button = $("#chapterHeartButton");
    const note = $("#chapterHeartNote");
    let resolvedId = chapterId || null;

    try {
      const db = await getDb();
      resolvedId = await resolveChapterId(workId, chapterNumber, resolvedId);
      if (!resolvedId) throw new Error("الفصل غير متاح.");
      box.dataset.chapterId = resolvedId;
      const { data, error } = await db.rpc("get_chapter_heart_stats", { p_chapter_id: resolvedId });
      if (error) throw error;
      updateHeartBox(rowOf(data));
    } catch (error) {
      console.warn("Chapter heart count unavailable.", error);
      if (note) note.textContent = "عداد القلوب غير متاح حاليًا.";
      if (button) button.disabled = true;
      return;
    }

    if (!button) return;
    button.onclick = async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        const db = await getDb();
        const user = await currentUser(db);
        if (!user) {
          showLogin("سجّل دخولك عشان تضيف قلبك للفصل.");
          return;
        }
        const { data, error } = await db.rpc("toggle_chapter_heart", {
          p_chapter_id: resolvedId
        });
        if (error) throw error;
        updateHeartBox(rowOf(data));
      } catch (error) {
        console.error("Chapter heart update failed.", error);
        if (note) note.textContent = error?.message || "تعذر تحديث القلب. حاول مرة أخرى.";
      } finally {
        button.disabled = false;
      }
    };
  }

  window.GALAXITE_ENGAGEMENT = {
    hydrateWorkRatings,
    bindWorkRating,
    bindChapterHeart,
    bindChapterListHearts
  };
})();
