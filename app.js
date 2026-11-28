const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
let tab = "all", marks = store.get("marks", []), prog = store.get("prog", {}), light = store.get("light", false);
const ago = ["منذ ساعة", "منذ 3 ساعات", "منذ 5 ساعات", "أمس", "منذ يومين"];
const kind = (w) => (w.type === "manga" ? "مانجا" : "مانهوا");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hue = (t) => { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const grad = (t, a = 0) => `linear-gradient(135deg,hsl(${(hue(t) + a) % 360},60%,38%),hsl(${(hue(t) + a + 60) % 360},60%,20%))`;
const norm = (s) => String(s).toLowerCase().replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
const hit = (w, q) => !q || (!norm(q) ? [w.title, w.desc || ""].some((f) => String(f).toLowerCase().includes(q.toLowerCase())) : [w.title, ...(w.genres || []), w.desc || ""].some((f) => norm(f).includes(norm(q))));
const byTitle = (t) => WORKS.find((w) => w.title === t);
const slug = (w) => encodeURIComponent(w.title);
const chapterDisplayTitle = (chapter, number) => {
  const raw = String(chapter.display_title || chapter.title || ("الفصل " + number));
  const clean = raw.replace(/\s+(?:just now|yesterday|last week|last month|last year|(?:\d+|a|an|one)\s+(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)\s+ago|[A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})$/i, "").trim();
  return clean || ("الفصل " + number);
};
const chaptersFor = (w) => {
  if (Array.isArray(w.publishedChapters)) {
    return w.publishedChapters
      .map((chapter) => ({ ...chapter, number: Number(chapter.chapter_number ?? chapter.number) }))
      .filter((chapter) => Number.isFinite(chapter.number) && chapter.number > 0)
      .sort((x, y) => y.number - x.number);
  }
  return Array.from({ length: Math.max(0, Number(w.chapters) || 0) }, (_, i) => ({
    number: Number(w.chapters) - i,
    is_premium: null
  }));
};
function cover(w, cls = "") {
  return w.cover ? `<img class="cover ${cls}" src="${esc(w.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="cover art ${cls}" style="background:${grad(w.title)};--h:${hue(w.title)}"><b class="ini">${esc([...w.title][0].toUpperCase())}</b><span>${esc(w.title)}</span></div>`;
}
function cardM(w) {
  return card(w, `<b class="rate">⭐ ${w.ratingCount ? Number(w.rating).toFixed(1) : "—"}</b>`).replace(/<\/a>$/, `<span class="meta"><i>${Array.isArray(w.publishedChapters) ? w.publishedChapters.length : w.chapters} فصل</i><i class="${w.status === "مستمر" ? "on" : ""}"><u></u>${esc(w.status)}</i></span></a>`);
}
function rowOf(title, list) {
  return `<div class="rh"><h3 class="h">${title}</h3><span class="arr"><button data-d="1" aria-label="السابق">›</button><button data-d="-1" aria-label="التالي">‹</button></span></div><div class="row">${list.map(cardM).join("")}</div>`;
}

let genreTickerFrame = 0, genreTickerController = null;
function initGenreTicker(root = document) {
  const viewport = root.querySelector(".gstrip");
  const track = viewport?.querySelector(".gstrip-track");
  const firstSet = track?.querySelector(".gstrip-set:not([aria-hidden='true'])");
  if (!viewport || !track || !firstSet) return;

  genreTickerController?.abort();
  if (genreTickerFrame) cancelAnimationFrame(genreTickerFrame);
  genreTickerController = new AbortController();
  const { signal } = genreTickerController;
  let loopWidth = 0, offset = 0, lastFrame = 0;
  let pointer = null, dragging = false, hovered = false, focused = false;
  let suppressClick = false;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const normalize = (value) => loopWidth > 0 ? ((value % loopWidth) + loopWidth) % loopWidth : 0;
  const paint = () => { track.style.transform = `translate3d(${-offset}px,0,0)`; };
  const measure = () => {
    const styles = getComputedStyle(track);
    const gap = parseFloat(styles.columnGap || styles.gap || "0") || 0;
    loopWidth = firstSet.getBoundingClientRect().width + gap;
    offset = normalize(offset);
    paint();
  };
  measure();

  const onDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, totalX: 0, totalY: 0 };
    dragging = false;
  };
  const onMove = (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.lastX;
    pointer.totalX += dx;
    pointer.totalY += event.clientY - (pointer.lastY ?? pointer.startY);
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    if (!dragging && Math.abs(pointer.totalX) > 6 && Math.abs(pointer.totalX) > Math.abs(pointer.totalY)) {
      dragging = true;
      viewport.classList.add("is-dragging");
    }
    if (dragging) {
      offset = normalize(offset - dx);
      paint();
    }
  };
  const onUp = (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (dragging) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 300);
    }
    pointer = null;
    dragging = false;
    viewport.classList.remove("is-dragging");
  };

  viewport.addEventListener("pointerdown", onDown, { signal });
  window.addEventListener("pointermove", onMove, { passive: true, signal });
  window.addEventListener("pointerup", onUp, { signal });
  window.addEventListener("pointercancel", onUp, { signal });
  viewport.addEventListener("pointerenter", () => { hovered = true; }, { signal });
  viewport.addEventListener("pointerleave", () => { hovered = false; }, { signal });
  viewport.addEventListener("focusin", () => { focused = true; }, { signal });
  viewport.addEventListener("focusout", (event) => { focused = viewport.contains(event.relatedTarget); }, { signal });
  viewport.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressClick = false;
  }, { capture: true, signal });
  viewport.addEventListener("keydown", (event) => {
    if (event.target !== viewport) return;
    if (event.key === "ArrowLeft") { offset = normalize(offset + 100); paint(); }
    if (event.key === "ArrowRight") { offset = normalize(offset - 100); paint(); }
  }, { signal });
  window.addEventListener("resize", measure, { passive: true, signal });

  const animate = (now) => {
    if (!viewport.isConnected) {
      cancelAnimationFrame(genreTickerFrame);
      genreTickerFrame = 0;
      return;
    }
    if (!lastFrame) lastFrame = now;
    const elapsed = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (!reducedMotion && !dragging && !hovered && !focused && document.visibilityState === "visible") {
      offset = normalize(offset + 25 * elapsed);
      paint();
    }
    genreTickerFrame = requestAnimationFrame(animate);
  };
  if (!reducedMotion) genreTickerFrame = requestAnimationFrame(animate);
}

function card(w, extra = "") {
  return `<a class="card" href="#/s/${slug(w)}">${cover(w)}<b class="flag">${kind(w)}</b>${extra}<span class="name" dir="auto">${esc(w.title)}</span></a>`;
}
let slide = 0, timer;
function home() {
  const q = $("#q").value.trim().toLowerCase();
  const list = WORKS.filter((w) => (tab === "all" || w.type === tab) && hit(w, q));
  const hero = WORKS.slice(0, 3);
  const cont = Object.keys(prog).filter(byTitle);
  const favs = marks.filter(byTitle);
  let h = "";
  if (!q) h += `<section class="hero" id="hero"></section>`;
  if (!q && cont.length) h += `<h3 class="h">أكمل القراءة</h3><div class="row">${cont.map((t) => { const w = byTitle(t); return `<a class="card" href="#/r/${slug(w)}/${prog[t]}">${cover(w)}<b class="rate">ف ${prog[t]}</b><span class="name" dir="auto">${esc(t)}</span></a>`; }).join("")}</div>`;
  if (!q && favs.length) h += `<h3 class="h">المفضلة</h3><div class="row">${favs.map((t) => card(byTitle(t))).join("")}</div>`;
  const genreList = [...new Set(WORKS.flatMap((w) => w.genres || []))].sort((a, b) => a.localeCompare(b));
  const genreChips = genreList.map((g) => `<button class="gchip" data-gg="${esc(g)}">${esc(g)}</button>`).join("");
  const duplicateGenreChips = genreList.map((g) => `<button class="gchip" data-gg="${esc(g)}" tabindex="-1">${esc(g)}</button>`).join("");
  if (!q) h += `<div class="stat3"><div><b data-to="${WORKS.length}" data-suffix="+">0</b><span>عمل</span></div><div><b data-to="${WORKS.reduce((a, w) => a + (Array.isArray(w.publishedChapters) ? w.publishedChapters.length : w.chapters), 0)}" data-suffix="+">0</b><span>فصل</span></div><div><b data-to="${genreList.length}" data-suffix="+">0</b><span>تصنيف</span></div></div><h3 class="h">تصفح بالنوع</h3><div class="gstrip" role="region" aria-label="تصفح التصنيفات" tabindex="0"><div class="gstrip-track"><div class="gstrip-set">${genreChips}</div><div class="gstrip-set" aria-hidden="true">${duplicateGenreChips}</div></div></div>`;
  h += rowOf("الأعلى تقييمًا من القراء", [...list].sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount));
  if (!q) h += rowOf("اختيارات المحرر", [...list].filter((w) => w.ratingCount > 0 && w.rating >= 8.5).sort((a, b) => b.rating - a.rating));
  if (!q) h += `<h3 class="h">أفضل 10</h3><ol class="top10">${[...WORKS].filter((w) => w.ratingCount > 0).sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount).slice(0, 10).map((w, i) => `<li><a href="#/s/${slug(w)}"><b class="num">${i + 1}</b>${cover(w, "sm")}<span><i dir="auto">${esc(w.title)}</i><small>${kind(w)} · ⭐ ${Number(w.rating).toFixed(1)} (${w.ratingCount})</small></span></a></li>`).join("") || `<li class="empty">لسه مفيش تقييمات من القراء.</li>`}</ol>`;
  h += `<h3 class="h">آخر التحديثات</h3><div class="latest">${list.map((w, i) => { const chapters = chaptersFor(w).slice(0, 3); return `<div class="item"><a href="#/s/${slug(w)}">${cover(w, "sm")}</a><div><a class="t" dir="auto" href="#/s/${slug(w)}">${esc(w.title)}</a>${chapters.map((chapter) => `<a class="ch" href="#/r/${slug(w)}/${chapter.number}"><span>${esc(chapterDisplayTitle(chapter, chapter.number))}</span><small>${chapter.source_published_at ? new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Cairo" }).format(new Date(chapter.source_published_at)) : "تاريخ Asura غير متاح"}</small></a>`).join("")}</div></div>`; }).join("")}</div>`;
  if (!list.length) h += "<p>مفيش نتائج</p>";
  $("#app").innerHTML = h;
  initGenreTicker($("#app"));
  document.querySelectorAll(".gchip").forEach((b) => (b.onclick = () => { flt = { g: [b.dataset.gg], st: "", sort: "rating", min: 0, hideB: false, page: 1 }; location.hash = "#/lib"; }));
  document.querySelectorAll(".rh").forEach((r) => r.querySelectorAll("button").forEach((b) => (b.onclick = () => { const row = r.nextElementSibling; row.scrollBy({ left: -b.dataset.d * row.clientWidth * 0.8, behavior: "smooth" }); })));
  if (!q && hero.length) {
    slide %= hero.length;
    const heroElement = $("#hero");
    let swipeStart = null;
    const draw = () => {
      const w = hero[slide];
      if (!heroElement) return;
      heroElement.style.background = grad(w.title, 20);
      heroElement.innerHTML = `<div class="hero-art tilt" aria-hidden="true"><div class="gx-slide-art">${cover(w)}</div></div><div class="hero-in gx-slide-copy"><span class="badge">${kind(w)}</span><span class="badge alt">⭐ ${w.ratingCount ? Number(w.rating).toFixed(1) : "—"}</span><h2 dir="auto">${esc(w.title)}</h2><p>${esc(w.desc)}</p><a class="cta" href="#/s/${slug(w)}">ابدأ القراءة</a></div><div class="dots">${hero.map((_, i) => `<button data-i="${i}" aria-label="الشريحة ${i + 1}" class="${i === slide ? "on" : ""}"></button>`).join("")}</div>`;
      heroElement.querySelectorAll(".dots button").forEach((b) => (b.onclick = () => {
        const next = Number(b.dataset.i);
        if (next === slide) return;
        slide = next;
        draw();
      }));
    };
    const moveSlide = (direction) => {
      slide = (slide + direction + hero.length) % hero.length;
      draw();
    };
    heroElement?.addEventListener("pointerdown", (event) => {
      if (event.target.closest("a, button")) return;
      swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    });
    heroElement?.addEventListener("pointerup", (event) => {
      if (!swipeStart || swipeStart.id !== event.pointerId) return;
      const dx = event.clientX - swipeStart.x;
      const dy = event.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) moveSlide(dx < 0 ? 1 : -1);
    });
    heroElement?.addEventListener("pointercancel", () => { swipeStart = null; });
    heroElement?.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") clearInterval(timer);
    });
    heroElement?.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        clearInterval(timer);
        timer = setInterval(() => moveSlide(1), 5000);
      }
    });
    draw();
    clearInterval(timer);
    timer = matchMedia("(prefers-reduced-motion: reduce)").matches || hero.length < 2
      ? 0
      : setInterval(() => { if (heroElement?.isConnected) moveSlide(1); }, 5000);
  }
}
let showAll = false, seriesQuery = "", seriesSort = "new", seriesWorkTitle = "";
function series(w) {
  if (seriesWorkTitle !== w.title) { seriesWorkTitle = w.title; seriesQuery = ""; seriesSort = "new"; showAll = false; }
  const chapters = chaptersFor(w);
  let chapterList = chapters.filter((chapter) => {
    if (!seriesQuery) return true;
    const query = seriesQuery.trim().toLowerCase();
    return String(chapter.number).includes(query.replace(/[^0-9]/g, "")) || String(chapter.title || ("الفصل " + chapter.number)).toLowerCase().includes(query);
  });
  if (seriesSort === "old") chapterList = [...chapterList].reverse();
  const visible = showAll ? chapterList : chapterList.slice(0, 40);
  const oldest = chapters.length ? chapters[chapters.length - 1].number : null;
  const latest = chapters.length ? chapters[0].number : null;
  $("#app").innerHTML = `<a class="back" href="#/">← رجوع</a>
  <div class="top">${cover(w, "big")}<div><h2 dir="auto">${esc(w.title)}</h2>
  <p><span class="badge">${kind(w)}</span> <span class="badge alt"><i class="dot ${w.status === 'مستمر' ? 'on' : ''}"></i>${esc(w.status)}</span> ⭐ ${w.ratingCount ? Number(w.rating).toFixed(1) : "—"}</p>
  <p>${w.genres.map((g) => `<span class="tag">${esc(g)}</span>`).join("")}</p><p>${esc(w.desc)}</p>
  ${oldest !== null ? `<a class="cta" href="#/r/${slug(w)}/${oldest}">أقدم فصل متاح</a>` : ""}
  ${latest !== null && latest !== oldest ? `<a class="cta alt" href="#/r/${slug(w)}/${latest}">أحدث فصل متاح</a>` : latest !== null ? `<a class="cta alt" href="#/r/${slug(w)}/${latest}">ابدأ القراءة</a>` : ""}
  ${prog[w.title] ? `<a class="cta alt" href="#/r/${slug(w)}/${prog[w.title]}">أكمل من الفصل ${prog[w.title]}</a>` : ""}
  <button class="cta alt" id="mark">${marks.includes(w.title) ? "★ في المفضلة" : "☆ أضف للمفضلة"}</button><button class="cta alt" id="reportWork" type="button">الإبلاغ عن مشكلة في العمل</button></div></div>
  <section class="engagement-panel" id="workRatingBox" data-work-id="${esc(w.id)}">
    <div class="engagement-rating-head"><div><b>تقييم القرّاء</b><small id="workRatingCount">جارٍ تحميل التقييمات</small></div><strong id="workRatingAverage">— / 10</strong></div>
    <label for="myWorkRating">قيّم العمل من 1 إلى 10</label>
    <div class="rating-slider"><input id="myWorkRating" type="range" min="1" max="10" step="1" value="5"><output id="myWorkRatingValue">5 / 10</output></div>
    <button class="cta" id="saveWorkRating" type="button">حفظ تقييمي</button>
    <small id="workRatingNote">رأيك يهمّ القرّاء.</small>
  </section>
  <h3 class="h">الفصول المتاحة (${chapters.length})</h3>
  <div class="ctl"><input id="sq" type="search" placeholder="ابحث برقم أو اسم الفصل..." value="${esc(seriesQuery)}" aria-label="بحث في الفصول"><button id="so" class="btn">${seriesSort === "new" ? "الأحدث" : "الأقدم"}</button><button id="ma" class="btn">تحديد الكل كمقروء</button></div>
  <div class="chl">${visible.map((chapter) => {
    const number = chapter.number;
    const premium = VX.premium(w, number), locked = premium && VX.locked(w, number);
    const latest = chapters[0]?.number;
    const isRead = (prog[w.title] || 0) >= number;
    const publishedDate = chapter.source_published_at && !Number.isNaN(Date.parse(chapter.source_published_at))
      ? new Intl.DateTimeFormat("ar-EG", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Africa/Cairo"
        }).format(new Date(chapter.source_published_at))
      : "";
    const chapterMeta = [
      number === latest ? '<em class="new">● جديد</em>' : "",
      publishedDate ? `<time class="chapter-date" datetime="${esc(chapter.source_published_at)}">${esc(publishedDate)}</time>` : "",
      premium ? (locked ? "مميز" : "مفتوح") : "",
      (prog[w.title] || 0) === number ? "وصلت هنا" : ""
    ].filter(Boolean).join(" · ");
    return `<div class="chr ${locked ? "lk" : ""} ${isRead ? "rd" : ""}">
      <a class="chapter-main" href="#/r/${slug(w)}/${number}">
        <span class="thm" style="background:${grad(w.title + number, number)}">${w.cover ? `<img class="chapter-thumb" src="${esc(w.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : locked ? "🔒" : "›"}</span>
        <span class="cn"><b>${esc(chapterDisplayTitle(chapter, number))}</b><small class="chapter-meta">${chapterMeta}</small></span>
      </a>
      ${locked ? `<span class="price">${VX.coin}<b>${VX.LOCK_COST}</b></span>` : `<span class="chapter-end">${premium ? `<span class="price ok">مفتوح</span>` : ""}<button class="chapter-heart" type="button" data-chapter-id="${esc(chapter.id || "")}" aria-label="أعجبني الفصل ${number}" aria-pressed="false"><span class="chapter-heart-icon" aria-hidden="true">♡</span><b class="chapter-heart-count">…</b></button></span>`}
    </div>`;
  }).join("")}</div>${chapterList.length > visible.length ? `<button class="cta alt" id="more" style="margin-top:12px">عرض المزيد (${chapterList.length - visible.length})</button>` : showAll && chapterList.length > 40 ? `<button class="cta alt" id="more" style="margin-top:12px">عرض أقل</button>` : chapters.length ? "" : '<p class="empty">لسه مفيش فصول منشورة للعمل ده.</p>'}`;
  window.GALAXITE_ENGAGEMENT?.bindWorkRating?.(w);
  window.GALAXITE_ENGAGEMENT?.bindChapterListHearts?.(visible);
  if ($("#sq")) $("#sq").oninput = (e) => { seriesQuery = e.target.value; const p = e.target.selectionStart; series(w); const n = $("#sq"); n.focus(); n.setSelectionRange(p, p); };
  if ($("#so")) $("#so").onclick = () => { seriesSort = seriesSort === "new" ? "old" : "new"; series(w); };
  if ($("#ma")) $("#ma").onclick = () => { if (chapters.length) prog[w.title] = chapters[0].number; store.set("prog", prog); series(w); };
  if ($("#more")) $("#more").onclick = () => { showAll = !showAll; series(w); };
  $("#mark").onclick = () => { marks = marks.includes(w.title) ? marks.filter((t) => t !== w.title) : [...marks, w.title]; store.set("marks", marks); series(w); };
  if ($("#reportWork")) $("#reportWork").onclick = () => window.GalaxiteReports?.open({ targetType: "work", targetId: slug(w), targetTitle: w.title, targetPath: `#/s/${slug(w)}` });
}
function reader(w, ch) {
  let chapters = chaptersFor(w);
  // Direct reader links can render before the complete chapter list arrives.
  if (!chapters.length) chapters = [{ number: Number(ch), title: `الفصل ${Number(ch)}` }];
  const numbers = chapters.map((chapter) => chapter.number);
  if (numbers.length && !numbers.includes(Number(ch))) ch = numbers[0];
  ch = Number(ch);
  if (VX.locked(w, ch)) return VX.lockedScreen(w, ch, slug(w));
  VX.track(w, ch);
  prog[w.title] = ch; store.set("prog", prog);
  const currentIndex = numbers.indexOf(ch);
  const previous = numbers[currentIndex + 1] ?? null;
  const next = numbers[currentIndex - 1] ?? null;
  const pages = (w.pages && w.pages[ch]) || [];
  const chapterTitle = chapters.find((chapter) => chapter.number === ch)?.title || `الفصل ${ch}`;
  const options = chapters.map((numberRow) => `<option value="${numberRow.number}"${numberRow.number === ch ? " selected" : ""}>${esc(numberRow.title || ("الفصل " + numberRow.number))}</option>`).join("");
  $("#app").innerHTML = `<div class="reader-topbar"><a class="back" href="#/s/${slug(w)}">← ${esc(w.title)}</a><select id="cj" aria-label="انتقل لفصل">${options}</select>
  <span><button id="zo" type="button" aria-label="إبطاء التمرير التلقائي" title="إبطاء التمرير التلقائي">−</button><button id="zi" type="button" aria-label="تسريع التمرير التلقائي" title="تسريع التمرير التلقائي">+</button></span>
  <span>${previous !== null ? `<a href="#/r/${slug(w)}/${previous}">الفصل السابق</a>` : ""}${next !== null ? `<a href="#/r/${slug(w)}/${next}">الفصل التالي</a>` : ""}</span></div>
  <div class="prg"><i id="pg"></i></div><div class="pages" style="max-width:${store.get("zoom", 760)}px">${pages.length ? pages.map((p) => `<img src="${esc(p)}" alt="" loading="lazy">`).join("") : `<div class="page-loading skel" aria-hidden="true"></div>`}</div>
  <div class="rend"><p>نهاية ${esc(chapterTitle)}</p>${next !== null ? `<a class="cta" href="#/r/${slug(w)}/${next}">الفصل التالي ←</a>` : `<p>وصلت لأحدث فصل متاح 🎉</p>`}<button class="cta alt" id="reportChapter" type="button">الإبلاغ عن مشكلة في الفصل</button><a class="cta alt" href="#/s/${slug(w)}">كل الفصول</a></div>`;
}
function readerInit(w, ch) {
  const previousCleanup = window.GALAXITE_READER_CLEANUP;
  if (typeof previousCleanup === "function") previousCleanup();
  window.GALAXITE_READER_CLEANUP = null;
  if (!$("#cj")) return;
  if ($("#reportChapter")) $("#reportChapter").onclick = () => window.GalaxiteReports?.open({ targetType: "chapter", targetId: `${slug(w)}#${ch}`, targetTitle: `${w.title} - الفصل ${ch}`, targetPath: `#/r/${slug(w)}/${ch}` });
  $("#cj").onchange = (e) => (location.hash = `#/r/${slug(w)}/${e.target.value}`);
  // The + and − controls adjust automatic reader-scroll speed in v3.js.

  const readerTopbar = document.querySelector(".reader-topbar");
  let readerBarLastY = window.scrollY || 0;
  let readerBarTicking = false;
  const updateReaderTopbar = () => {
    const y = window.scrollY || 0;
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    if (!readerTopbar?.isConnected) {
      readerBarTicking = false;
      return;
    }
    if (!mobile || y <= 32 || y < readerBarLastY - 4) {
      readerTopbar.classList.remove("gx-reader-nav-hidden");
    } else if (y > readerBarLastY + 4) {
      readerTopbar.classList.add("gx-reader-nav-hidden");
    }
    readerBarLastY = y;
    readerBarTicking = false;
  };
  const onReaderBarScroll = () => {
    if (readerBarTicking) return;
    readerBarTicking = true;
    window.requestAnimationFrame(updateReaderTopbar);
  };
  const onReaderBarResize = () => {
    if (!readerTopbar?.isConnected) return;
    if (window.innerWidth > 640) {
      readerTopbar.classList.remove("gx-reader-nav-hidden");
    }
  };
  if (readerTopbar) {
    window.addEventListener("scroll", onReaderBarScroll, { passive: true });
    window.addEventListener("resize", onReaderBarResize, { passive: true });
    readerTopbar.classList.remove("gx-reader-nav-hidden");
  }
  const removeReaderTopbarScroll = () => {
    window.removeEventListener("scroll", onReaderBarScroll);
    window.removeEventListener("resize", onReaderBarResize);
    readerTopbar?.classList.remove("gx-reader-nav-hidden");
  };
  window.GALAXITE_READER_CLEANUP = removeReaderTopbarScroll;

  const pageBox = document.querySelector(".pages");
  if (pageBox && window.GALAXITE_DB_CATALOG) {
    const chapterMeta = chaptersFor(w).find((item) => item.number === Number(ch));
    const chapterId = chapterMeta?.id || null;
    const loadingMarkup = '<div class="page-loading skel" aria-hidden="true"></div><div class="page-loading skel" aria-hidden="true"></div>';
    let latestPageUrls = [];
    let retryingImages = false;
    let retriedImagesOnce = false;

    const renderPages = (urls) => {
      if (!pageBox.isConnected) return;
      latestPageUrls = Array.isArray(urls)
        ? urls.filter((url) => typeof url === "string" && url.startsWith("https://"))
        : [];
      pageBox.innerHTML = latestPageUrls.length
        ? latestPageUrls.map((url, i) => `<img src="${esc(url)}" alt="صفحة ${i + 1}" loading="${i < 2 ? "eager" : "lazy"}" fetchpriority="${i === 0 ? "high" : "auto"}" decoding="async" referrerpolicy="no-referrer">`).join("")
        : '<div class="reader-empty"><b>صور الفصل غير متاحة حاليًا.</b><p>المصدر لم يرجّع صورًا عامة لهذا الفصل.</p><button class="cta alt" id="retryChapterPages" type="button">حاول مرة أخرى</button></div>';
      pageBox.querySelectorAll("img").forEach((img) => {
        img.addEventListener("error", () => {
          if (retriedImagesOnce || retryingImages || !pageBox.isConnected) return;
          retriedImagesOnce = true;
          loadPages(true);
        }, { once: true });
      });
      const retry = $("#retryChapterPages");
      if (retry) retry.onclick = () => {
        retriedImagesOnce = false;
        loadPages(true);
      };
    };
    const loadPages = (forceRefresh = false) => {
      if (!pageBox.isConnected) return Promise.resolve([]);
      retryingImages = forceRefresh;
      pageBox.innerHTML = loadingMarkup;
      return window.GALAXITE_DB_CATALOG.getChapterPages(w.id || slug(w), ch, chapterId, forceRefresh)
        .then((urls) => {
          renderPages(urls);
          return urls;
        })
        .catch((error) => {
          console.warn("Reader image request failed.", error);
          renderPages([]);
          return [];
        })
        .finally(() => { retryingImages = false; });
    };

    // Rebuild the image elements after switching Desktop/mobile viewport modes.
    const restoreReaderImages = () => {
      if (!pageBox.isConnected) return;
      window.requestAnimationFrame(() => {
        if (!pageBox.isConnected) return;
        if (latestPageUrls.length) renderPages(latestPageUrls);
        else if (!pageBox.querySelector(".reader-empty")) loadPages(true);
      });
    };
    const readerBreakpoint = window.matchMedia("(max-width: 640px)");
    const onVisibilityChange = () => { if (!document.hidden) restoreReaderImages(); };
    const onPageShow = (event) => { if (event.persisted) restoreReaderImages(); };
    if (readerBreakpoint.addEventListener) readerBreakpoint.addEventListener("change", restoreReaderImages);
    else if (readerBreakpoint.addListener) readerBreakpoint.addListener(restoreReaderImages);
    window.addEventListener("orientationchange", restoreReaderImages);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.GALAXITE_READER_CLEANUP = () => {
      removeReaderTopbarScroll();
      if (readerBreakpoint.removeEventListener) readerBreakpoint.removeEventListener("change", restoreReaderImages);
      else if (readerBreakpoint.removeListener) readerBreakpoint.removeListener(restoreReaderImages);
      window.removeEventListener("orientationchange", restoreReaderImages);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    loadPages();
  }
  window.onscroll = () => { const m = document.documentElement.scrollHeight - innerHeight; const b = $("#pg"); if (b) b.style.width = (m > 0 ? Math.min(100, scrollY / m * 100) : 0) + "%"; else window.onscroll = null; };
}
function listPage(title, items, empty, chips) {
  $("#app").innerHTML = `<h3 class="h">${title}</h3>` + (items.length ? `<div class="grid">${items.map((w) => cardM(w)).join("")}</div>` : `<p class="empty">${empty}</p>`);
}
let flt = { g: [], st: "", sort: "rating", min: 0, hideB: false, page: 1 }, PER = 12;
function library() {
  const q = $("#q").value.trim();
  const genres = [...new Set(WORKS.flatMap((w) => w.genres || []))];
  const sorts = { rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount, title: (a, b) => a.title.localeCompare(b.title), chapters: (a, b) => b.chapters - a.chapters };
  const all = WORKS.filter((w) => (tab === "all" || w.type === tab) && hit(w, q) && flt.g.every((g) => (w.genres || []).includes(g)) && (!flt.st || w.status === flt.st) && w.chapters >= flt.min && !(flt.hideB && marks.includes(w.title))).sort(sorts[flt.sort]);
  const pages = Math.max(1, Math.ceil(all.length / PER)); flt.page = Math.min(flt.page, pages);
  const items = all.slice((flt.page - 1) * PER, flt.page * PER);
  const opt = (v, t, cur) => `<option value="${esc(v)}"${cur === v ? " selected" : ""}>${esc(t)}</option>`;
  const n = flt.g.length + (flt.st ? 1 : 0) + (flt.min ? 1 : 0) + (flt.hideB ? 1 : 0);
  const chips = flt.g.map((g) => `<button class="chip" data-g="${esc(g)}">${esc(g)} ✕</button>`).join("");
  listPage(`المكتبة <span class="cnt">${all.length}</span>`, items.map((w) => w), "مفيش نتائج. جرّب تغيّر البحث أو الفلاتر.", true);
  const pager = pages > 1 ? `<nav class="pager" aria-label="الصفحات">${Array.from({ length: pages }, (_, i) => `<button data-p="${i + 1}"${i + 1 === flt.page ? ' class="on" aria-current="page"' : ""}>${i + 1}</button>`).join("")}</nav>` : "";
  $("#app").insertAdjacentHTML("beforeend", pager);
  $("#app").insertAdjacentHTML("afterbegin", `<details class="fbox"${n ? " open" : ""}><summary>فلاتر${n ? ` (${n})` : ""}</summary><div class="flt"><select id="fs" aria-label="الحالة">${opt("", "كل الحالات", flt.st)}${opt("مستمر", "مستمر", flt.st)}${opt("مكتمل", "مكتمل", flt.st)}</select><select id="fo" aria-label="الترتيب">${opt("rating", "الأعلى تقييمًا", flt.sort)}${opt("title", "الاسم", flt.sort)}${opt("chapters", "عدد الفصول", flt.sort)}</select><select id="fm" aria-label="أقل عدد فصول">${[0, 50, 100, 200, 500].map((v) => opt(String(v), v ? "من " + v + " فصل" : "أي عدد فصول", String(flt.min))).join("")}</select><label class="tg"><input type="checkbox" id="fb"${flt.hideB ? " checked" : ""}> إخفاء المفضلة</label></div><div class="gen">${genres.map((g) => `<label class="gl"><input type="checkbox" value="${esc(g)}"${flt.g.includes(g) ? " checked" : ""}> ${esc(g)}</label>`).join("")}</div>${n ? '<button class="rst" id="fr">مسح الفلاتر</button>' : ""}</details>`);
  const re = () => { flt.page = 1; library(); };
  $("#fs").onchange = (e) => { flt.st = e.target.value; re(); };
  $("#fo").onchange = (e) => { flt.sort = e.target.value; re(); };
  $("#fm").onchange = (e) => { flt.min = +e.target.value; re(); };
  $("#fb").onchange = (e) => { flt.hideB = e.target.checked; re(); };
  document.querySelectorAll(".gl input").forEach((c) => (c.onchange = () => { flt.g = [...document.querySelectorAll(".gl input:checked")].map((x) => x.value); re(); }));
  if ($("#fr")) $("#fr").onclick = () => { flt = { g: [], st: "", sort: "rating", min: 0, hideB: false, page: 1 }; library(); };
  document.querySelectorAll(".pager button").forEach((b) => (b.onclick = () => { flt.page = +b.dataset.p; library(); window.scrollTo(0, 0); }));
}
function notFound() {
  $("#app").innerHTML = `<p class="empty">الصفحة أو العمل ده مش موجود. <a class="cta" href="#/">الرئيسية</a></p>`;
}
document.addEventListener("error", (e) => {
  const t = e.target;
  if (t.tagName === "IMG" && !t.dataset.f) { t.dataset.f = 1; const d = document.createElement("div"); d.className = t.className + " page"; d.style.background = "#272a36"; d.textContent = "تعذر تحميل الصورة"; t.replaceWith(d); }
}, true);
function catalogUnavailable() {
  const state = window.GALAXITE_CATALOG_STATE || { status: "loading" };
  if (state.status === "loading") {
    $("#app").innerHTML = `<div class="catalog-skeleton"><div class="skel hero"></div><div class="catalog-skeleton-row">${"<div class='cover skel'></div>".repeat(8)}</div></div>`;
  } else if (state.status === "error") {
    $("#app").innerHTML = '<div class="empty"><h2>مكتبة الأعمال غير متاحة حاليًا</h2><p>تعذر الاتصال بقاعدة البيانات. جرّب إعادة التحميل.</p><button class="cta" id="retryCatalog">إعادة المحاولة</button></div>';
    $("#retryCatalog").onclick = () => window.GALAXITE_DB_CATALOG?.refresh();
  } else {
    $("#app").innerHTML = '<div class="empty"><h2>لسه مفيش أعمال منشورة</h2><p>الأعمال هتظهر هنا بعد نشرها من لوحة الإدارة.</p></div>';
  }
}
const pendingWorkLoads = new Set();
function workRouteSkeleton(w, mode) {
  if (mode === "s") {
    $("#app").innerHTML = `<a class="back" href="#/">← رجوع</a><div class="top work-skeleton"><div class="cover big skel"></div><div><div class="skel skeleton-line"></div><div class="skel skeleton-line short"></div><div class="skel skeleton-line"></div><div class="skel skeleton-line"></div></div></div><h3 class="h">الفصول</h3><div class="chapter-skeleton">${"<div class='skel'></div>".repeat(12)}</div>`;
  } else {
    $("#app").innerHTML = `<div class="rbar"><a class="back" href="#/s/${slug(w)}">← ${esc(w.title)}</a></div><div class="prg"><i></i></div><div class="pages"><div class="page-loading skel"></div><div class="page-loading skel"></div></div>`;
  }
}
function ensureWorkChapters(w, mode, routeHash) {
  const api = window.GALAXITE_DB_CATALOG;
  const cached = api?.getCachedWorkChapters?.(w.id);
  if (Array.isArray(cached)) {
    w.publishedChapters = cached;
    api.getWorkChapters?.(w.id).catch((error) => console.warn("Chapter refresh skipped.", error));
    return true;
  }
  if (Array.isArray(w.publishedChapters) || w._chapterLoadFailed) return true;
  const key = String(w.id || w.title) + ":" + routeHash;
  // A reader should not wait for the entire work's chapter catalogue.
  // Render the requested chapter immediately while its navigation list loads.
  if (mode === "r") {
    if (!pendingWorkLoads.has(key)) {
      pendingWorkLoads.add(key);
      api?.getWorkChapters?.(w.id).then((rows) => {
        w.publishedChapters = Array.isArray(rows) ? rows : [];
        if (location.hash === routeHash) route();
      }).catch((error) => {
        console.warn("Work chapter list unavailable.", error);
        w._chapterLoadFailed = true;
      }).finally(() => pendingWorkLoads.delete(key));
    }
    return true;
  }
  workRouteSkeleton(w, mode);
  if (!pendingWorkLoads.has(key)) {
    pendingWorkLoads.add(key);
    api?.getWorkChapters?.(w.id).then((rows) => {
      w.publishedChapters = Array.isArray(rows) ? rows : [];
      if (location.hash === routeHash) route();
    }).catch((error) => {
      console.warn("Work chapter list unavailable.", error);
      w._chapterLoadFailed = true;
      if (location.hash === routeHash) route();
    }).finally(() => pendingWorkLoads.delete(key));
  }
  return false;
}
function route() {
  if (window.GALAXITE_PASSWORD_RECOVERY) {
    window.GALAXITE_SHOW_PASSWORD_RECOVERY?.();
    return;
  }
  const p = location.hash.slice(2).split("/");
  const readerMode = p[0] === "r";
  document.body.classList.toggle("gx-home-page", p[0] === "");
  document.body.classList.toggle("gx-reader-mode", readerMode);
  if (!readerMode) {
    window.GALAXITE_READER_UI_CLEANUP?.();
    window.GALAXITE_READER_CLEANUP?.();
    document.querySelector(".fab")?.remove();
    if (window.__auto) { clearInterval(window.__auto); window.__auto = 0; }
  }
  window.scrollTo(0, 0);
  document.title = "Galaxite | مانجا ومانهوا";
  if (p[0] === "admin") { document.title = "لوحة الإدارة | Galaxite"; window.GALAXITE_RENDER_ADMIN?.(); post(p); return; }
  if (!WORKS.length && !["login", "profile", "store"].includes(p[0])) return catalogUnavailable();
  const w = p[1] && byTitle(decodeURIComponent(p[1]));
  if ((p[0] === "s" || p[0] === "r") && !w) return notFound();
  if ((p[0] === "s" || p[0] === "r") && w && !ensureWorkChapters(w, p[0], location.hash)) return;
  if (p[0] === "s" && w) { document.title = w.title + " | Galaxite"; return series(w); }
  if (p[0] === "r" && w) { document.title = `${w.title} - الفصل ${+p[2] || 1}`; reader(w, +p[2] || 1); return readerInit(w, Math.max(1, Math.min(w.chapters, +p[2] || 1))); }
  if (p[0] === "login") { document.title = "دخول | Galaxite"; VX.loginPage(); return post(p); }
  if (p[0] === "profile") { document.title = "حسابي | Galaxite"; VX.profilePage(WORKS, slug); return post(p); }
  if (p[0] === "store") { document.title = "المتجر | Galaxite"; VX.storePage(); return post(p); }
  if (typeof V3 !== "undefined" && V3.pages[p[0]]) { document.title = (p[0] === "top" ? "المتصدرين" : "المجتمع") + " | Galaxite"; V3.pages[p[0]](p); return post(p); }
  if (!["", "lib", "b"].includes(p[0])) return notFound();
  if (p[0] === "lib") library(); else if (p[0] === "b") listPage("المفضلة", marks.map(byTitle).filter(Boolean), "لسه ما أضفتش حاجة. افتح أي عمل واضغط ☆ أضف للمفضلة."); else home();
  post(p);
}
function post(p) {
  const cur = { lib: "lib", b: "b", store: "store", profile: "profile", login: "profile", community: "community", top: "community", admin: "admin", "": "home" }[p[0]];
  document.querySelectorAll("#bnav a, #mnav a").forEach((x) => x.classList.toggle("on", x.dataset.r === cur));
  document.querySelectorAll("#app .h, #app .item, #app .card, #app .top, #app .stat3, #app .top10 li, #app .gstrip").forEach((e) => e.classList.add("rv"));
  VX.reveal($("#app")); VX.tilt($("#app"));
}
document.addEventListener("keydown", (e) => {
  const m = location.hash.match(/^#\/r\/(.+)\/(\d+)$/);
  if (!m || e.target.tagName === "INPUT") return;
  const w = byTitle(decodeURIComponent(m[1])), c = +m[2];
  if (e.key === "ArrowLeft" && c < w.chapters) location.hash = `#/r/${m[1]}/${c + 1}`;
  if (e.key === "ArrowRight" && c > 1) location.hash = `#/r/${m[1]}/${c - 1}`;
});
$("#q").oninput = () => { if (location.hash === "#/lib") library(); else if (location.hash && location.hash !== "#/") location.hash = "#/lib"; else home(); };
document.querySelectorAll("#tabs button").forEach((b) => (b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.remove("on"));
  b.classList.add("on"); tab = b.dataset.t; route();
}));
function applyTheme() { document.body.classList.toggle("light", light); $("#theme").innerHTML = light ? `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/></svg>` : `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`; }
$("#theme").onclick = () => { light = !light; store.set("light", light); applyTheme(); };
window.addEventListener("hashchange", route);
window.addEventListener("galaxite:catalog-updated", route);
window.addEventListener("galaxite:catalog-state", () => { if (!WORKS.length) catalogUnavailable(); });
window.addEventListener("galaxite:ratings-updated", () => {
  const page = location.hash.slice(2).split("/")[0];
  if (["", "lib", "browse", "cats"].includes(page)) route();
});
window.addEventListener("galaxite:work-chapters-updated", (event) => {
  const parts = location.hash.slice(2).split("/");
  if (!["s", "r"].includes(parts[0])) return;
  const work = parts[1] && byTitle(decodeURIComponent(parts[1]));
  if (work && String(work.id) === String(event.detail?.workId) && !pendingWorkLoads.size) route();
});
applyTheme();
if (!WORKS.length) catalogUnavailable();
else route();

document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#q").focus(); } });

(() => {
  const header = document.querySelector(".head");
  if (!header) return;
  let lastY = window.scrollY || 0;
  let ticking = false;
  const update = () => {
    const mobile = window.matchMedia("(max-width: 1100px)").matches;
    const y = window.scrollY || 0;
    if (!mobile || y < 48 || y < lastY - 6) {
      header.classList.remove("gx-head-hidden");
    } else if (y > lastY + 5) {
      header.classList.add("gx-head-hidden");
    }
    lastY = y;
    ticking = false;
  };
  window.addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(update);
    }
  }, { passive: true });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100) header.classList.remove("gx-head-hidden");
  }, { passive: true });
})();
(() => { const b = document.createElement("button"); b.id = "top"; b.setAttribute("aria-label", "للأعلى"); b.textContent = "↑"; b.hidden = true; b.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" }); document.body.appendChild(b); addEventListener("scroll", () => { b.hidden = scrollY < 600; }, { passive: true }); })();
