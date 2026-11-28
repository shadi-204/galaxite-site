/* v3: مجتمع، متصدرين، صفحة العمل بتبويبات، قارئ بأزرار عائمة، بطاقات الرئيسية */
const V3 = (() => {
const S = (k, d) => store.get(k, d), W = (k, v) => store.set(k, v);
const svg = (p, s = 20) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 14),
  unlock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7-2.6"/>', 14),
  heart: svg('<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 22l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>', 18),
  fire: svg('<path d="M12 2s5 4.5 5 9.5a5 5 0 0 1-10 0c0-1.7.8-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>', 14),
  msg: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>', 18),
  save: svg('<path d="M6 3h12v18l-6-4-6 4z"/>', 18),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4"/>', 18),
  full: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  up: svg('<path d="M6 15l6-6 6 6"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  play: svg('<path d="M7 4l13 8-13 8z"/>'),
  pause: svg('<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  star: svg('<path d="M12 2l3 6.9 7.4.7-5.6 5 1.7 7.3L12 17.8 5.5 21.9l1.7-7.3-5.6-5 7.4-.7z"/>', 16),
  trend: svg('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'),
  gift: svg('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-3-5 0 1 1 3 1 5 0zM12 8c2-4 6-3 5 0-1 1-3 1-5 0z"/>'),
  home: svg('<path d="M3 11l9-8 9 8v10H3z"/>'),
};
const me = () => window.VX.me();
const nm = (n) => n.toLocaleString("ar-EG");
const hsl = (t) => `linear-gradient(135deg,hsl(${hue(t)},62%,42%),hsl(${(hue(t) + 50) % 360},60%,30%))`;
const av = (name, cls = "") => `<i class="av2 ${cls}" style="background:${hsl(name)}">${esc([...String(name)][0] || "?")}</i>`;
const rel = (ts) => { const m = Math.max(1, Math.round((Date.now() - ts) / 60000)); return m < 60 ? `منذ ${nm(m)} د` : m < 1440 ? `منذ ${nm(Math.round(m / 60))} س` : `منذ ${nm(Math.round(m / 1440))} يوم`; };
const liked = () => new Set(S("vx-liked", [])), saved = () => new Set(S("vx-saved", []));
const toastM = (m, k) => window.VX.toast ? window.VX.toast(m, k) : 0;

/* ---------- المجتمع ---------- */
const CHANNELS = [["all", "كل المنشورات", "#fff"], ["announce", "إعلانات", "#ef4444"], ["general", "دردشة عامة", "#9ca3af"], ["series", "نقاش الأعمال", "#f59e0b"], ["theories", "نظريات", "#8b5cf6"], ["read", "إيه أقرأ؟", "#10b981"], ["requests", "طلبات أعمال", "#ec4899"], ["help", "أسئلة ومساعدة", "#3b82f6"], ["fan", "أعمال المعجبين", "#f472b6"]];
const chName = (id) => (CHANNELS.find((c) => c[0] === id) || CHANNELS[2])[1];
const SEED = [];
const posts = () => [...S("vx-posts", []), ...SEED].sort((a, b) => b.ts - a.ts);
const LB = [];
const board = () => { const u = me(); const l = LB.map(([n, x]) => ({ n, x, me: 0 })); if (u) l.push({ n: u.name, x: u.xp, me: 1 }); return l.sort((a, b) => b.x - a.x); };
let cv = "feed", cc = "all", ct = "foryou", cq = "";
function community() {
  const u = me(), L = liked(), Sv = saved();
  let list = posts();
  if (cc !== "all") list = list.filter((p) => p.ch === cc);
  if (cv === "trend") list = [...list].sort((a, b) => b.likes - a.likes);
  if (cv === "saved") list = list.filter((p) => Sv.has(p.id));
  if (cq) list = list.filter((p) => (p.txt + p.u).toLowerCase().includes(cq.toLowerCase()));
  if (ct === "chapter") list = list.filter((p) => p.series);
  const nav = [["feed", "الرئيسية", IC.home], ["trend", "الرائج", IC.trend], ["saved", "المحفوظ", IC.save], ["events", "الفعاليات", IC.gift]];
  const stories = WORKS.slice(0, 8).map((w) => `<a class="story" href="#/s/${slug(w)}"><i style="background:${grad(w.title)}"><b>${esc([...w.title][0])}</b></i><span dir="auto">${esc(w.title)}</span><small>ف ${nm(w.chapters)}</small></a>`).join("");
  const feed = list.map((p) => `<article class="post" data-id="${p.id}"><div class="ph">${av(p.u)}<div><b dir="auto">${esc(p.u)}</b> <small>${rel(p.ts)}</small><span class="chtag">${esc(chName(p.ch))}</span></div></div>
    <p dir="auto">${esc(p.txt)}</p><div class="pa"><button data-a="like" class="${L.has(p.id) ? "on" : ""}">${IC.heart}<span>${nm(p.likes + (L.has(p.id) ? 1 : 0))}</span></button><button data-a="cm">${IC.msg}<span>${nm(p.cm)}</span></button><button data-a="share">${IC.share}</button><button data-a="save" class="${Sv.has(p.id) ? "on" : ""}" aria-label="حفظ">${IC.save}</button></div></article>`).join("") || `<p class="empty">مفيش منشورات هنا لسه.</p>`;
  const evs = `<div class="evbox"><h3>${IC.gift} الفعاليات</h3><p>فعاليات المجتمع بتديك عملات وXP.</p>
    ${[["تحدي القراءة الأسبوعي", "اقرأ ٥ فصول واكسب ٢٥ عملة", 5], ["تحدي المراجع", "اكتب مراجعة لعمل واكسب ١٠٠ XP", 1]].map(([t, d, n], i) => { const r = u ? Math.min(n, i ? S("vx-revcount", 0) : u.read.length) : 0; return `<div class="ev"><b>${t}</b><small>${d}</small><div class="bar"><i style="width:${r / n * 100}%"></i></div><small>${nm(r)} من ${nm(n)}</small></div>`; }).join("")}</div>`;
  const tr = posts().sort((a, b) => b.likes - a.likes).slice(0, 3);
  $("#app").innerHTML = `<div class="comm"><aside class="cside"><nav>${nav.map(([k, t, i]) => `<button data-v="${k}" class="${cv === k ? "on" : ""}">${i}<span>${t}</span></button>`).join("")}</nav><h4>القنوات</h4>${CHANNELS.map(([k, t, c]) => `<button class="chn ${cc === k ? "on" : ""}" data-c="${k}"><u style="background:${c}"></u>${t}</button>`).join("")}</aside>
  <section class="cmain"><h2 class="ctitle">المجتمع</h2><div class="ctabs">${[["foryou", "لك"], ["follow", "المتابَعين"], ["chapter", "نقاش الفصول"]].map(([k, t]) => `<button data-t="${k}" class="${ct === k ? "on" : ""}">${t}</button>`).join("")}</div>
  <div class="stories">${stories}</div>
  ${cv === "events" ? evs : `${u ? `<form class="compose" id="cf">${av(u.name)}<div><textarea id="cx" rows="2" maxlength="280" placeholder="شارك رأيك أو نظريتك... (٢٨٠ حرف)"></textarea><div class="cr"><select id="cch" aria-label="القناة">${CHANNELS.slice(1).map(([k, t]) => `<option value="${k}"${k === (cc === "all" ? "general" : cc) ? " selected" : ""}>${t}</option>`).join("")}</select><button class="cta" type="submit">نشر</button></div></div></form>` : `<div class="join"><div><b>انضم للمجتمع</b><small>اعمل حساب مجاني واكتب وكسّب XP واطلع في المتصدرين.</small></div><a class="cta" href="#/login">إنشاء حساب</a><a class="cta alt" href="#/login">دخول</a></div>`}${feed}`}</section>
  <aside class="cright"><input id="cs" type="search" placeholder="ابحث في المنشورات..." value="${esc(cq)}" aria-label="بحث"><div class="box"><h4>الرائج الآن</h4>${tr.map((p) => `<p dir="auto"><b>${esc(p.txt.slice(0, 34))}${p.txt.length > 34 ? "..." : ""}</b><small>${nm(p.likes)} إعجاب</small></p>`).join("")}</div>
  <div class="box"><h4>أفضل الأعضاء <a href="#/top">الكل</a></h4>${board().slice(0, 5).map((r, i) => `<p class="mem">${nm(i + 1)} ${av(r.n, "s")}<b dir="auto">${esc(r.n)}</b><small>${nm(r.x)} XP</small></p>`).join("")}</div>
  <div class="box"><h4>قواعد المجتمع</h4><ul><li>كن لطيفا ومحترما مع القراء.</li><li>اكتب (حرق) قبل أي سبويلر.</li><li>خلّي المنشور في القناة المناسبة.</li></ul></div></aside></div>`;
  const A = $("#app");
  A.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => { cv = b.dataset.v; community(); }));
  A.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { cc = b.dataset.c; if (cv === "events") cv = "feed"; community(); }));
  A.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { ct = b.dataset.t; community(); }));
  $("#cs").oninput = (e) => { cq = e.target.value; const p = e.target.selectionStart; community(); const n = $("#cs"); n.focus(); n.setSelectionRange(p, p); };
  if ($("#cf")) $("#cf").onsubmit = (e) => { e.preventDefault(); const t = $("#cx").value.trim(); if (!t) return; const l = S("vx-posts", []); l.unshift({ id: "p" + Date.now(), u: u.name, ch: $("#cch").value, txt: t, likes: 0, cm: 0, ts: Date.now() }); W("vx-posts", l); toastM("تم النشر", "ok"); community(); };
  A.querySelectorAll(".post").forEach((el) => el.querySelectorAll("button").forEach((b) => (b.onclick = () => {
    const id = el.dataset.id, a = b.dataset.a;
    if (a === "like" || a === "save") { if (!me()) { location.hash = "#/login"; return; } const k = a === "like" ? "vx-liked" : "vx-saved", s = new Set(S(k, [])); s.has(id) ? s.delete(id) : s.add(id); W(k, [...s]); community(); }
    else if (a === "share") { try { navigator.clipboard.writeText(location.href); } catch {} toastM("تم نسخ الرابط"); }
    else toastM("التعليقات الكاملة تحتاج قاعدة بيانات. جاهزة لما تربط Firebase أو Supabase.");
  })));
}
function top() {
  const l = board(), p = [l[1], l[0], l[2]], me0 = me();
  $("#app").innerHTML = `<section class="lbhero"><h2>لوحة المتصدرين</h2><p>القراء الأعلى مستوى وXP. اقرأ وعلّق وكمّل سلسلتك اليومية لتصعد.</p></section>
  <div class="podium">${p.map((r, i) => { const rk = [2, 1, 3][i]; return `<div class="pod p${rk}"><span class="rk">${nm(rk)}</span>${av(r.n, "xl")}<b dir="auto">${esc(r.n)}</b><small>مستوى ${nm(Math.floor(r.x / 50) + 1)} · ${nm(r.x)} XP</small></div>`; }).join("")}</div>
  <ol class="lb">${l.slice(3).map((r, i) => `<li class="${r.me ? "me" : ""}"><b>${nm(i + 4)}</b>${av(r.n, "s")}<span dir="auto">${esc(r.n)}${r.me ? " (أنت)" : ""}</span><small>${nm(r.x)} XP</small></li>`).join("")}</ol>
  ${me0 ? "" : `<div class="join"><div><b>سجّل دخول عشان اسمك يظهر هنا</b><small>الأرقام هنا تجريبية لحد ما تربط قاعدة بيانات.</small></div><a class="cta" href="#/login">دخول</a></div>`}`;
}
const pages = { community, top };

/* ---------- صفحة العمل ---------- */
let st = "ch", sort = "new", sq = "", sMax = 40, sw = "";
function series(w) {
  if (sw !== w.title) { sw = w.title; st = "ch"; sq = ""; sMax = 40; sort = "new"; }
  const u = me(), V = window.VX;
  const chapterRows = chaptersFor(w);
  const base = chapterRows.map((chapter) => Number(chapter.number)).filter((number) => Number.isFinite(number) && number > 0);
  const firstP = base.find((c) => !V.premium(w, c));
  const oldest = base.length ? base[base.length - 1] : null;
  const latest = base.length ? base[0] : null;
  let chs = base.filter((c) => !sq || String(c).includes(sq.replace(/\D/g, "")) || ("الفصل " + c).includes(sq));
  if (sort === "old") chs = [...chs].reverse();
  const shown = chs.slice(0, sMax);
  const rev = S("vx-rev", {})[w.title] || [];
  const allR = [...rev], avg = allR.length ? (allR.reduce((a, r) => a + r.s, 0) / allR.length).toFixed(1) : "—";
  const reacts = S("vx-react", {})[w.title] || {};
  const RE = [["أعجبني", 0], ["رائع", 0], ["مضحك", 0], ["صادم", 0], ["حزين", 0], ["غاضب", 0]];
  const sim = WORKS.filter((x) => x !== w).map((x) => ({ x, n: x.genres.filter((g) => w.genres.includes(g)).length })).sort((a, b) => b.n - a.n || b.x.rating - a.x.rating).slice(0, 6).map((o) => o.x);
  const tabs = [["ch", `الفصول (${nm(base.length)})`], ["syn", "الملخص"], ["rev", `المراجعات (${nm(allR.length)})`], ["disc", "النقاشات"], ["media", "الميديا"]];
  let body = "";
  if (st === "ch") body = `<div class="ctl"><input id="sq" type="search" placeholder="ابحث برقم الفصل..." value="${esc(sq)}" aria-label="بحث في الفصول"><button id="so" class="btn">${sort === "new" ? "الأحدث" : "الأقدم"}</button><button id="ma" class="btn">تحديد الكل كمقروء</button></div>
    <div class="chl">${shown.map((c) => { const pr = V.premium(w, c), lk = V.locked(w, c), cur = (prog[w.title] || 0) === c; return `<a class="chr ${lk ? "lk" : ""} ${(prog[w.title] || 0) >= c ? "rd" : ""}" href="#/r/${slug(w)}/${c}"><span class="thm" style="background:${grad(w.title + c, c)}">${lk ? IC.lock : ""}</span><span class="cn"><b>${esc(chapterRows.find((row) => Number(row.number) === c)?.title || ("الفصل " + nm(c)))}</b><small>${c === base[0] ? '<em class="new">' + IC.fire + " جديد</em>" : ago[c % ago.length]}${c === firstP && w.status === "مستمر" && base.length > 10 ? ' <em class="free">' + IC.unlock + " مجاني الآن</em>" : ""}${cur ? " · وصلت هنا" : ""}</small></span>${lk ? `<span class="price">${V.coin}<b>${V.LOCK_COST}</b></span>` : pr ? '<span class="price ok">مفتوح</span>' : `<span class="price ok">متاح</span>`}</a>`; }).join("")}</div>${chs.length > sMax ? `<button class="cta alt" id="mo" style="margin-top:12px">عرض المزيد (${nm(chs.length - sMax)})</button>` : ""}`;
  if (st === "syn") body = `<div class="syn"><h4>الملخص</h4><p dir="auto">${esc(w.desc)}</p>
    <div class="share"><span>شارك العمل مع أصحابك</span><button class="cta" id="sh">${IC.share} مشاركة</button></div>
    <div class="reacts">${RE.map(([t, n]) => `<button data-r="${t}" class="${reacts[t] ? "on" : ""}"><b>${nm(n + (reacts[t] ? 1 : 0))}</b><span>${t}</span></button>`).join("")}</div></div>`;
  if (st === "rev") body = `<div class="rsum"><b>${avg}</b><span>${"★".repeat(Math.round(avg))}${"☆".repeat(5 - Math.round(avg))}</span><small>${nm(allR.length)} مراجعات</small></div>
    ${u ? `<form id="rf" class="rform"><div class="stars" id="rs">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-s="${n}" aria-label="${n} نجوم">★</button>`).join("")}</div><textarea id="rt" rows="2" maxlength="300" placeholder="اكتب رأيك في العمل..."></textarea><button class="cta" type="submit">نشر المراجعة</button></form>` : `<div class="join"><div><b>شارك رأيك</b><small>سجّل دخول عشان تكتب مراجعة.</small></div><a class="cta" href="#/login">دخول</a></div>`}
    ${allR.map((r) => `<div class="rv2">${av(r.u)}<div><b dir="auto">${esc(r.u)}</b> <small>${rel(r.ts)}</small><div class="ys">${"★".repeat(r.s)}${"☆".repeat(5 - r.s)}</div><p dir="auto">${esc(r.t)}</p></div></div>`).join("")}`;
  if (st === "disc") { const pl = posts().filter((p) => p.series === w.title); body = `<div class="syn"><h4>النقاشات</h4><p>ناقش ${esc(w.title)} مع باقي القراء في المجتمع.</p>${pl.map((p) => `<div class="rv2">${av(p.u)}<div><b>${esc(p.u)}</b> <small>${rel(p.ts)}</small><p dir="auto">${esc(p.txt)}</p></div></div>`).join("") || '<p class="empty">مفيش نقاشات لسه. كن أول واحد يبدأ.</p>'}<a class="cta" href="#/community">ابدأ نقاش في المجتمع</a></div>`; }
  if (st === "media") body = `<div class="syn"><p class="empty">لسه مفيش لقطات. زر الكاميرا في القارئ هيسمح للقراء يحفظوا مشاهد ويشاركوها هنا (يحتاج قاعدة بيانات).</p></div>`;
  $("#app").innerHTML = `<a class="back" href="#/">← رجوع</a>
  <div class="top">${cover(w, "big")}<div><h2 dir="auto">${esc(w.title)}</h2>
  <p><span class="badge">${kind(w)}</span> <span class="badge alt"><i class="dot ${w.status === 'مستمر' ? 'on' : ''}"></i>${esc(w.status)}</span> ⭐ ${w.ratingCount ? Number(w.rating).toFixed(1) : "—"}</p>
  <p>${(w.genres || []).map((g) => `<span class="tag">${esc(g)}</span>`).join("")}</p><p>${esc(w.desc || "")}</p>
  ${oldest !== null ? `<a class="cta" href="#/r/${slug(w)}/${oldest}">أقدم فصل متاح</a>` : ""}
  ${latest !== null && latest !== oldest ? `<a class="cta alt" href="#/r/${slug(w)}/${latest}">أحدث فصل متاح</a>` : latest !== null ? `<a class="cta alt" href="#/r/${slug(w)}/${latest}">ابدأ القراءة</a>` : ""}
  ${prog[w.title] ? `<a class="cta alt" href="#/r/${slug(w)}/${prog[w.title]}">أكمل من الفصل ${prog[w.title]}</a>` : ""}
  <button class="cta alt" id="mark">${marks.includes(w.title) ? "★ في المفضلة" : "☆ أضف للمفضلة"}</button><button class="cta alt" id="reportWork" type="button">الإبلاغ عن مشكلة في العمل</button></div></div>
  <section class="engagement-panel" id="workRatingBox" data-work-id="${esc(w.id)}">
    <div class="engagement-rating-head"><div><b>تقييم القرّاء</b><small id="workRatingCount">جارٍ تحميل التقييمات</small></div><strong id="workRatingAverage">— / 10</strong></div>
    <label for="myWorkRating">قيّم العمل من 1 إلى 10</label>
    <div class="rating-slider"><input id="myWorkRating" type="range" min="1" max="10" step="1" value="5"><output id="myWorkRatingValue">5 / 10</output></div>
    <button class="cta" id="saveWorkRating" type="button">حفظ تقييمي</button>
    <small id="workRatingNote">كل حساب يقدر يضيف تقييمًا واحدًا للعمل.</small>
  </section>
  <div class="stabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" data-k="${k}" class="${st === k ? "on" : ""}">${t}</button>`).join("")}</div>
  ${st === "ch" ? `<h3 class="h">الفصول المتاحة (${base.length})</h3>` : ""}
  ${body}`;
  window.GALAXITE_ENGAGEMENT?.bindWorkRating?.(w);
  const A = $("#app");
  A.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { st = b.dataset.k; series(w); VX.reveal($("#app")); }));
  if ($("#sq")) $("#sq").oninput = (e) => { sq = e.target.value; const p = e.target.selectionStart; series(w); const n = $("#sq"); n.focus(); n.setSelectionRange(p, p); };
  if ($("#so")) $("#so").onclick = () => { sort = sort === "new" ? "old" : "new"; series(w); };
  if ($("#ma")) $("#ma").onclick = () => { if (base.length) prog[w.title] = base[0]; store.set("prog", prog); toastM("تم تحديد الكل كمقروء", "ok"); series(w); };
  if ($("#mo")) $("#mo").onclick = () => { sMax += 60; series(w); };
  if ($("#mark")) $("#mark").onclick = () => { marks = marks.includes(w.title) ? marks.filter((t) => t !== w.title) : [...marks, w.title]; store.set("marks", marks); series(w); };
  if ($("#reportWork")) $("#reportWork").onclick = () => window.GalaxiteReports?.open({ targetType: "work", targetId: slug(w), targetTitle: w.title, targetPath: `#/s/${slug(w)}` });
  if ($("#sh")) $("#sh").onclick = () => { try { navigator.clipboard.writeText(location.href); } catch {} toastM("تم نسخ الرابط"); };
  A.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { const o = S("vx-react", {}); o[w.title] = o[w.title] || {}; o[w.title][b.dataset.r] = !o[w.title][b.dataset.r]; W("vx-react", o); series(w); }));
  if ($("#rf")) { let sc = 5; const paint = () => A.querySelectorAll("#rs button").forEach((b) => b.classList.toggle("on", +b.dataset.s <= sc)); paint(); A.querySelectorAll("#rs button").forEach((b) => (b.onclick = () => { sc = +b.dataset.s; paint(); }));
    $("#rf").onsubmit = (e) => { e.preventDefault(); const t = $("#rt").value.trim(); if (!t) return; const o = S("vx-rev", {}); o[w.title] = [{ u: u.name, s: sc, t, ts: Date.now() }, ...(o[w.title] || [])]; W("vx-rev", o); W("vx-revcount", S("vx-revcount", 0) + 1); toastM("تم نشر مراجعتك", "ok"); series(w); }; }
}

/* ---------- القارئ: أزرار جانبية قابلة للإظهار والإخفاء ---------- */
const _ri = readerInit;
readerInit = function (w, ch) {
  window.GALAXITE_READER_UI_CLEANUP?.();
  _ri(w, ch);
  const pages = document.querySelector(".pages");
  if (!$("#cj") || !pages) return;

  const AUTO_SPEED_KEY = "galaxite:reader:auto-scroll-speed";
  const readAutoSpeed = () => {
    try {
      const saved = Number(localStorage.getItem(AUTO_SPEED_KEY));
      return Number.isFinite(saved) && saved >= 0.5 && saved <= 12 ? saved : 2;
    } catch {
      return 2;
    }
  };
  let autoScrollSpeed = readAutoSpeed();
  const updateSpeedLabels = () => {
    const shown = nm(Number(autoScrollSpeed.toFixed(1)));
    const speedHint = "السرعة الحالية: " + shown;
    [$("#zi"), $("#f-zi")].filter(Boolean).forEach((button) => {
      button.title = "تسريع التمرير التلقائي · " + speedHint;
      button.setAttribute("aria-label", "تسريع التمرير التلقائي · " + speedHint);
    });
    [$("#zo"), $("#f-zo")].filter(Boolean).forEach((button) => {
      button.title = "إبطاء التمرير التلقائي · " + speedHint;
      button.setAttribute("aria-label", "إبطاء التمرير التلقائي · " + speedHint);
    });
  };
  const changeAutoSpeed = (amount) => {
    autoScrollSpeed = Math.max(0.5, Math.min(12, Math.round((autoScrollSpeed + amount) * 10) / 10));
    window.GALAXITE_AUTO_SCROLL_SPEED = autoScrollSpeed;
    try { localStorage.setItem(AUTO_SPEED_KEY, String(autoScrollSpeed)); } catch {}
    updateSpeedLabels();
  };
  window.GALAXITE_AUTO_SCROLL_SPEED = autoScrollSpeed;
  $("#zi").onclick = () => changeAutoSpeed(0.5);
  $("#zo").onclick = () => changeAutoSpeed(-0.5);
  updateSpeedLabels();

  document.querySelector(".fab")?.remove();
  if (window.__auto) { clearInterval(window.__auto); window.__auto = 0; }

  const f = document.createElement("div");
  f.className = "fab";
  f.setAttribute("aria-label", "أدوات القراءة");
  f.innerHTML = `<span class="pc" id="pc">1/1</span>
    <button id="f-dn" aria-label="نزول">${IC.down}</button>
    <button id="f-ls" aria-label="الفصول">${IC.list}</button>
    <button id="f-zi" aria-label="تسريع التمرير التلقائي">${IC.plus}</button>
    <button id="f-zo" aria-label="إبطاء التمرير التلقائي">${IC.minus}</button>
    <button id="f-fs" aria-label="ملء الشاشة">${IC.full}</button>
    <button id="f-pl" aria-label="تمرير تلقائي">${IC.play}</button>
    <button id="f-up" aria-label="للأعلى">${IC.up}</button>`;
  document.body.appendChild(f);

  const pg = () => [...document.querySelectorAll(".pages > *")];
  const upd = () => {
    const items = pg();
    if (!items.length || !$("#pc")) return;
    let i = 0;
    items.forEach((element, index) => {
      if (element.getBoundingClientRect().top < innerHeight * 0.4) i = index;
    });
    $("#pc").textContent = `${nm(i + 1)}/${nm(items.length)}`;
  };

  const toggleControls = () => {
    const hidden = f.classList.toggle("gx-controls-hidden");
    f.setAttribute("aria-hidden", String(hidden));
  };
  const onPageTap = (event) => {
    if (event.target.closest("a,button,select,input,textarea")) return;
    const inCenterX = event.clientX >= innerWidth * 0.34 && event.clientX <= innerWidth * 0.66;
    const inCenterY = event.clientY >= innerHeight * 0.28 && event.clientY <= innerHeight * 0.72;
    if (inCenterX && inCenterY) toggleControls();
  };
  pages.addEventListener("click", onPageTap);

  const prevScroll = window.onscroll;
  window.onscroll = () => {
    if (prevScroll) prevScroll();
    upd();
    if (!$("#pc")) window.onscroll = null;
  };
  upd();

  $("#f-dn").onclick = () => scrollBy({ top: innerHeight * 0.9, behavior: "smooth" });
  $("#f-up").onclick = () => scrollTo({ top: 0, behavior: "smooth" });
  $("#f-ls").onclick = () => {
    $("#cj").focus();
    document.querySelector(".reader-topbar")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  $("#f-zi").onclick = () => $("#zi")?.click();
  $("#f-zo").onclick = () => $("#zo")?.click();
  $("#f-fs").onclick = () => {
    try {
      document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
    } catch {}
  };
  $("#f-pl").onclick = () => {
    if (window.__auto) {
      clearInterval(window.__auto);
      window.__auto = 0;
      $("#f-pl").innerHTML = IC.play;
    } else {
      window.__auto = setInterval(() => scrollBy(0, autoScrollSpeed), 16);
      $("#f-pl").innerHTML = IC.pause;
    }
  };

  const cleanup = () => {
    pages.removeEventListener("click", onPageTap);
    window.removeEventListener("hashchange", cleanup);
    if (f.isConnected) f.remove();
    if (window.__auto) { clearInterval(window.__auto); window.__auto = 0; }
    if (window.GALAXITE_READER_UI_CLEANUP === cleanup) window.GALAXITE_READER_UI_CLEANUP = null;
  };
  window.GALAXITE_READER_UI_CLEANUP = cleanup;
  window.addEventListener("hashchange", cleanup, { once: true });
};

/* ---------- الرئيسية: الأعمال المثبتة وآخر تحديثات Asura ---------- */
let lt = "latest";
const formatAsuraDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Cairo"
  }).format(date);
};
const pinnedChapterLoads = new Set();

function wcard(w, i, pin) {
  const V = window.VX;
  const hasChapterMetadata = Array.isArray(w.publishedChapters);
  const chapterRows = (
    hasChapterMetadata
      ? [...w.publishedChapters]
      : Array.from({ length: Math.min(3, Math.max(0, Number(w.chapters) || 0)) }, (_, k) => ({
          chapter_number: Number(w.chapters) - k,
          title: ""
        }))
  )
    .map((chapter) => ({
      ...chapter,
      number: Number(chapter.chapter_number ?? chapter.number)
    }))
    .filter((chapter) => Number.isFinite(chapter.number) && chapter.number > 0)
    .sort((a, b) => b.number - a.number)
    .slice(0, 3);

  const rows = chapterRows.map((chapter) => {
    const number = chapter.number;
    const premium = hasChapterMetadata && V.premium(w, number);
    const locked = premium && V.locked(w, number);
    const date = hasChapterMetadata ? formatAsuraDate(chapter.source_published_at) : "";
    const chapterTitle = chapter.display_title || chapter.title || ("الفصل " + nm(number));
    const status = !hasChapterMetadata
      ? ""
      : locked
        ? `<em class="new">${IC.lock} مقفول</em>`
        : premium
          ? '<em class="free">مفتوح</em>'
          : date ? `<small>${esc(date)}</small>` : "";
    return `<a class="wr ${locked ? "lk" : ""}" href="#/r/${slug(w)}/${number}">
      <span>${locked ? IC.lock : ""}${esc(chapterTitle)}</span>
      ${status}
    </a>`;
  }).join("");

  return `<div class="wc" data-work-id="${esc(w.id || "")}">
    <a href="#/s/${slug(w)}" class="wcv">${cover(w, "sm")}${pin ? '<b class="pin">مثبت</b>' : ""}</a>
    <div class="wci">
      <a class="wt" dir="auto" href="#/s/${slug(w)}">${esc(w.title)}</a>
      <div class="wm"><span>${IC.star} <span class="work-rating">${Number(w.rating || 0).toFixed(1)}</span></span><span class="st ${w.status === "مستمر" ? "on" : ""}"><u></u>${esc(w.status)}</span></div>
      ${rows || (hasChapterMetadata ? '<small class="work-source-date">لا توجد فصول منشورة مسجلة</small>' : "")}
    </div>
  </div>`;
}
const _home = home;
home = function () {
  _home();
  const q = $("#q").value.trim();
  const old = document.querySelector(".latest");
  if (!old) return;

  const list = WORKS.filter((w) => (tab === "all" || w.type === tab) && hit(w, q.toLowerCase()));
  const ord = lt === "new"
    ? [...list].sort((a, b) => {
        const ad = Date.parse(a.source_updated_at || "") || 0;
        const bd = Date.parse(b.source_updated_at || "") || 0;
        return bd - ad || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
      })
    : list;

  const sp = S("vx-pins", null);
  const pins = !q ? (sp ? sp.map(byTitle).filter(Boolean) : [...list].sort((a, b) => b.rating - a.rating).slice(0, 3)) : [];
  const an = S("vx-announce", "");
  const hd = old.previousElementSibling;
  const showWorkCards = Boolean(q) || lt === "new";
  const sectionTitle = showWorkCards ? "الأعمال الأجدد" : "أحدث الفصول";
  const mainGrid = showWorkCards
    ? `<div class="wgrid">${ord.map((w, i) => wcard(w, i, 0)).join("") || '<p class="empty">لا توجد أعمال مطابقة.</p>'}</div>`
    : '<div class="wgrid latest-chapters"><p class="empty">جارٍ تحميل أحدث الفصول...</p></div>';

  const html = (an && !q ? `<div class="annc">${esc(an)}</div>` : "")
    + (pins.length ? `<h3 class="h">مثبتة</h3><div class="wgrid pins">${pins.map((w, i) => wcard(w, i, 1)).join("")}</div>` : "")
    + `<div class="lh"><h3 class="h">${sectionTitle}</h3><div class="ltabs">
        <button data-l="latest" class="${lt === "latest" ? "on" : ""}">الأحدث</button>
        <button data-l="new" class="${lt === "new" ? "on" : ""}">الأجدد</button>
      </div></div>`
    + mainGrid;

  if (hd && hd.classList.contains("h")) hd.remove();
  old.outerHTML = html;

  // Fetch the real per-chapter premium flags for pinned works before showing lock icons.
  const missingPinned = pins.filter((w) =>
    w.id && !Array.isArray(w.publishedChapters) && !w._chapterLoadFailed && !pinnedChapterLoads.has(String(w.id))
  );
  if (missingPinned.length) {
    const pending = missingPinned.map((w) => {
      const id = String(w.id);
      pinnedChapterLoads.add(id);
      return (window.GALAXITE_DB_CATALOG?.getWorkChapters?.(w.id) || Promise.reject(new Error("Chapter API unavailable")))
        .then((rows) => { w.publishedChapters = Array.isArray(rows) ? rows : []; })
        .catch((error) => {
          w._chapterLoadFailed = true;
          console.warn("Pinned chapter metadata unavailable.", error);
        })
        .finally(() => pinnedChapterLoads.delete(id));
    });
    Promise.all(pending).then(() => {
      if (!location.hash || location.hash === "#" || location.hash === "#/") home();
    });
  }

  const recentGrid = document.querySelector("#app .latest-chapters");
  if (recentGrid && !q && lt === "latest") {
    window.GALAXITE_DB_CATALOG?.getLatestChapters(60).then(async (rows) => {
      if (!recentGrid.isConnected) return;

      const grouped = new Map();
      (rows || []).forEach((row) => {
        const w = WORKS.find((item) => String(item.id) === String(row.work_id));
        if (!w || (tab !== "all" && w.type !== tab)) return;
        const key = String(w.id);
        if (!grouped.has(key)) grouped.set(key, { w, rows: [] });
        grouped.get(key).rows.push(row);
      });

      const groups = [...grouped.values()]
        .map((group) => ({
          ...group,
          rows: [...group.rows].sort((a, b) =>
            (Date.parse(b.source_published_at || "") || 0) - (Date.parse(a.source_published_at || "") || 0)
            || Number(b.chapter_number) - Number(a.chapter_number)
          )
        }))
        .sort((a, b) =>
          (Date.parse(b.rows[0]?.source_published_at || "") || 0) - (Date.parse(a.rows[0]?.source_published_at || "") || 0)
        )
        .slice(0, 18);

      const cards = await Promise.all(groups.map(async ({ w, rows: recentRows }) => {
        let chapters = [...recentRows];
        if (chapters.length < 2 && w.id) {
          try {
            const more = await window.GALAXITE_DB_CATALOG?.getWorkLatestChapters?.(w.id, 2) || [];
            const seen = new Set(chapters.map((row) => String(row.chapter_number)));
            chapters.push(...more.filter((row) => !seen.has(String(row.chapter_number))));
          } catch (error) {
            console.warn("Second latest chapter unavailable for home card.", error);
          }
        }

        chapters.sort((a, b) =>
          (Date.parse(b.source_published_at || "") || 0) - (Date.parse(a.source_published_at || "") || 0)
          || Number(b.chapter_number) - Number(a.chapter_number)
        );
        chapters = chapters.slice(0, 3);

        const chapterRows = chapters.map((row) => {
          const number = Number(row.chapter_number);
          const date = formatAsuraDate(row.source_published_at);
          const title = row.display_title || row.title || ("الفصل " + nm(number));
          return `<a class="wr" href="#/r/${slug(w)}/${number}">
            <span>${esc(title)}</span><small>${esc(date)}</small>
          </a>`;
        }).join("");

        return `<div class="wc">
          <a href="#/s/${slug(w)}" class="wcv">${cover(w, "sm")}</a>
          <div class="wci">
            <a class="wt" dir="auto" href="#/s/${slug(w)}">${esc(w.title)}</a>
            <div class="wm"><span>${IC.star} ${w.rating}</span><span class="st ${w.status === "مستمر" ? "on" : ""}"><u></u>${esc(w.status)}</span></div>
            ${chapterRows}
          </div>
        </div>`;
      }));

      if (!recentGrid.isConnected) return;
      recentGrid.innerHTML = cards.length
        ? cards.join("")
        : '<p class="empty">لا توجد فصول منشورة حاليًا.</p>';
      recentGrid.querySelectorAll(".wc").forEach((element) => element.classList.add("rv"));
      VX.reveal(recentGrid);
    });
  }

  document.querySelectorAll(".ltabs button").forEach((b) => (b.onclick = () => {
    lt = b.dataset.l;
    home();
  }));
  document.querySelectorAll("#app .wc, #app .lh").forEach((e) => e.classList.add("rv"));
  VX.reveal($("#app"));
};

return { pages, community, top, series };
})();
/* app.js owns the canonical work page; do not replace it after the first render. */
