// أعمال مضافة من لوحة الإدارة (على نفس المتصفح فقط)
try { const o = JSON.parse(localStorage.getItem("vx-works")); if (Array.isArray(o) && o.length) WORKS.splice(0, WORKS.length, ...o); } catch {}
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
function cover(w, cls = "") {
  return w.cover ? `<img class="cover ${cls}" src="${esc(w.cover)}" alt="" loading="lazy">`
    : `<div class="cover art ${cls}" style="background:${grad(w.title)};--h:${hue(w.title)}"><b class="ini">${esc([...w.title][0].toUpperCase())}</b><span>${esc(w.title)}</span></div>`;
}
function cardM(w) {
  return card(w, `<b class="rate">⭐ ${w.rating}</b>`).replace(/<\/a>$/, `<span class="meta"><i>${w.chapters} فصل</i><i class="${w.status === "مستمر" ? "on" : ""}"><u></u>${esc(w.status)}</i></span></a>`);
}
function rowOf(title, list) {
  return `<div class="rh"><h3 class="h">${title}</h3><span class="arr"><button data-d="1" aria-label="السابق">›</button><button data-d="-1" aria-label="التالي">‹</button></span></div><div class="row">${list.map(cardM).join("")}</div>`;
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
  if (!q) h += `<div class="stat3"><div><b data-to="${WORKS.length}">0</b><span>عمل</span></div><div><b data-to="${WORKS.reduce((a, w) => a + w.chapters, 0)}">0</b><span>فصل</span></div><div><b data-to="${new Set(WORKS.flatMap((w) => w.genres)).size}">0</b><span>تصنيف</span></div></div><h3 class="h">تصفح بالنوع</h3><div class="gstrip">${[...new Set(WORKS.flatMap((w) => w.genres))].map((g) => `<button class="gchip" data-gg="${esc(g)}">${esc(g)}</button>`).join("")}</div>`;
  h += rowOf("الأكثر شعبية", [...list].sort((a, b) => b.rating - a.rating));
  if (!q) h += rowOf("اختيارات المحرر", [...list].filter((w) => w.rating >= 8.5).sort((a, b) => a.title.localeCompare(b.title)));
  if (!q) h += `<h3 class="h">أفضل 10</h3><ol class="top10">${[...WORKS].sort((a, b) => b.rating - a.rating).slice(0, 10).map((w, i) => `<li><a href="#/s/${slug(w)}"><b class="num">${i + 1}</b>${cover(w, "sm")}<span><i dir="auto">${esc(w.title)}</i><small>${kind(w)} · ⭐ ${w.rating}</small></span></a></li>`).join("")}</ol>`;
  h += `<h3 class="h">آخر التحديثات</h3><div class="latest">${list.map((w, i) => `<div class="item"><a href="#/s/${slug(w)}">${cover(w, "sm")}</a><div><a class="t" dir="auto" href="#/s/${slug(w)}">${esc(w.title)}</a>${[0, 1, 2].map((k) => `<a class="ch" href="#/r/${slug(w)}/${w.chapters - k}"><span>الفصل ${w.chapters - k}</span><small>${k === 0 && i % 2 === 0 ? '<em class="new">● جديد</em>' : ago[(i + k) % ago.length]}</small></a>`).join("")}</div></div>`).join("")}</div>`;
  if (!list.length) h += "<p>مفيش نتائج</p>";
  $("#app").innerHTML = h;
  document.querySelectorAll(".gchip").forEach((b) => (b.onclick = () => { flt = { g: [b.dataset.gg], st: "", sort: "rating", min: 0, hideB: false, page: 1 }; location.hash = "#/lib"; }));
  document.querySelectorAll(".rh").forEach((r) => r.querySelectorAll("button").forEach((b) => (b.onclick = () => { const row = r.nextElementSibling; row.scrollBy({ left: -b.dataset.d * row.clientWidth * 0.8, behavior: "smooth" }); })));
  if (!q) {
    const draw = () => {
      const w = hero[slide];
      $("#hero").style.background = grad(w.title, 20);
      $("#hero").innerHTML = `<div class="hero-art tilt" aria-hidden="true">${cover(w)}</div><div class="hero-in"><span class="badge">${kind(w)}</span><span class="badge alt">⭐ ${w.rating}</span><h2 dir="auto">${esc(w.title)}</h2><p>${esc(w.desc)}</p><a class="cta" href="#/s/${slug(w)}">ابدأ القراءة</a></div><div class="dots">${hero.map((_, i) => `<button data-i="${i}" aria-label="slide ${i + 1}" class="${i === slide ? "on" : ""}"></button>`).join("")}</div>`;
      document.querySelectorAll(".dots button").forEach((b) => (b.onclick = () => { slide = +b.dataset.i; draw(); }));
    };
    draw();
    clearInterval(timer);
    timer = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : setInterval(() => { if ($("#hero")) { slide = (slide + 1) % hero.length; draw(); } }, 5000);
  }
}
let showAll = false;
function series(w) {
  const n = showAll ? w.chapters : Math.min(w.chapters, 50);
  $("#app").innerHTML = `<a class="back" href="#/">← رجوع</a>
  <div class="top">${cover(w, "big")}<div><h2 dir="auto">${esc(w.title)}</h2>
  <p><span class="badge">${kind(w)}</span> <span class="badge alt"><i class="dot ${w.status === 'مستمر' ? 'on' : ''}"></i>${esc(w.status)}</span> ⭐ ${w.rating}</p>
  <p>${w.genres.map((g) => `<span class="tag">${esc(g)}</span>`).join("")}</p><p>${esc(w.desc)}</p>
  <a class="cta" href="#/r/${slug(w)}/1">الفصل الأول</a><a class="cta alt" href="#/r/${slug(w)}/${w.chapters}">آخر فصل</a>
  ${prog[w.title] ? `<a class="cta alt" href="#/r/${slug(w)}/${prog[w.title]}">أكمل من الفصل ${prog[w.title]}</a>` : ""}
  <button class="cta alt" id="mark">${marks.includes(w.title) ? "★ في المفضلة" : "☆ أضف للمفضلة"}</button><button class="cta alt" id="reportWork" type="button">الإبلاغ عن مشكلة في العمل</button></div></div>
  <h3 class="h">الفصول (${w.chapters})</h3>
  <div class="chs">${Array.from({ length: n }, (_, i) => w.chapters - i).map((c) => `<a class="ch" href="#/r/${slug(w)}/${c}"><span>الفصل ${c}</span><small>${VX.premium(w, c) ? (VX.locked(w, c) ? "● مميز" : "○ مفتوح") : ago[c % ago.length]}${(prog[w.title] || 0) === c ? " · وصلت هنا" : ""}</small></a>`).join("")}</div>${w.chapters > 50 ? `<button class="cta alt" id="more" style="margin-top:12px">${showAll ? "عرض أقل" : "عرض كل الفصول (" + w.chapters + ")"}</button>` : ""}`;
  if ($("#more")) $("#more").onclick = () => { showAll = !showAll; series(w); };
  $("#mark").onclick = () => { marks = marks.includes(w.title) ? marks.filter((t) => t !== w.title) : [...marks, w.title]; store.set("marks", marks); series(w); };
  if ($("#reportWork")) $("#reportWork").onclick = () => window.GalaxiteReports?.open({ targetType: "work", targetId: slug(w), targetTitle: w.title, targetPath: `#/s/${slug(w)}` });
}
function reader(w, ch) {
  ch = Math.max(1, Math.min(w.chapters, ch));
  if (VX.locked(w, ch)) return VX.lockedScreen(w, ch, slug(w));
  VX.track(w, ch);
  prog[w.title] = ch; store.set("prog", prog);
  const pages = (w.pages && w.pages[ch]) || [1, 2, 3, 4].map((p) => null);
  $("#app").innerHTML = `<div class="rbar"><a class="back" href="#/s/${slug(w)}">← ${esc(w.title)}</a><select id="cj" aria-label="انتقل لفصل">${Array.from({ length: w.chapters }, (_, i) => w.chapters - i).map((c) => `<option value="${c}"${c === ch ? " selected" : ""}>الفصل ${c}</option>`).join("")}</select>
  <span><button id="zo" aria-label="تصغير">−</button><button id="zi" aria-label="تكبير">+</button></span>
  <span>${ch > 1 ? `<a href="#/r/${slug(w)}/${ch - 1}">السابق</a>` : ""}${ch < w.chapters ? `<a href="#/r/${slug(w)}/${ch + 1}">التالي</a>` : ""}</span></div>
  <div class="prg"><i id="pg"></i></div><div class="pages" style="max-width:${store.get("zoom", 760)}px">${pages.map((p, i) => p ? `<img src="${esc(p)}" alt="" loading="lazy">` : `<div class="page" style="background:${grad(w.title + ch, (i + 1) * 40)}">صفحة ${i + 1}<small>ضع صور الفصل في data.js</small></div>`).join("")}</div>
  <div class="rend"><p>نهاية الفصل ${ch}</p>${ch < w.chapters ? `<a class="cta" href="#/r/${slug(w)}/${ch + 1}">الفصل التالي ←</a>` : `<p>وصلت لآخر فصل متاح 🎉</p>`}<button class="cta alt" id="reportChapter" type="button">الإبلاغ عن مشكلة في الفصل</button><a class="cta alt" href="#/s/${slug(w)}">كل الفصول</a></div>
  <div class="rbar"><span>${ch > 1 ? `<a href="#/r/${slug(w)}/${ch - 1}">السابق</a>` : ""}${ch < w.chapters ? `<a href="#/r/${slug(w)}/${ch + 1}">التالي</a>` : ""}</span></div>`;
}
function readerInit(w, ch) {
  if (!$("#cj")) return;
  if ($("#reportChapter")) $("#reportChapter").onclick = () => window.GalaxiteReports?.open({ targetType: "chapter", targetId: `${slug(w)}#${ch}`, targetTitle: `${w.title} - الفصل ${ch}`, targetPath: `#/r/${slug(w)}/${ch}` });
  $("#cj").onchange = (e) => (location.hash = `#/r/${slug(w)}/${e.target.value}`);
  const z = (d) => { const v = Math.max(360, Math.min(1200, store.get("zoom", 760) + d)); store.set("zoom", v); document.querySelector(".pages").style.maxWidth = v + "px"; };
  $("#zi").onclick = () => z(100); $("#zo").onclick = () => z(-100);
  window.onscroll = () => { const m = document.documentElement.scrollHeight - innerHeight; const b = $("#pg"); if (b) b.style.width = (m > 0 ? Math.min(100, scrollY / m * 100) : 0) + "%"; else window.onscroll = null; };
}
function listPage(title, items, empty, chips) {
  $("#app").innerHTML = `<h3 class="h">${title}</h3>` + (items.length ? `<div class="grid">${items.map((w) => cardM(w)).join("")}</div>` : `<p class="empty">${empty}</p>`);
}
let flt = { g: [], st: "", sort: "rating", min: 0, hideB: false, page: 1 }, PER = 12;
function library() {
  const q = $("#q").value.trim();
  const genres = [...new Set(WORKS.flatMap((w) => w.genres || []))];
  const sorts = { rating: (a, b) => b.rating - a.rating, title: (a, b) => a.title.localeCompare(b.title), chapters: (a, b) => b.chapters - a.chapters };
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
function route() {
  const p = location.hash.slice(2).split("/");
  window.scrollTo(0, 0);
  document.title = "Galaxite | مانجا ومانهوا";
  const w = p[1] && byTitle(decodeURIComponent(p[1]));
  if ((p[0] === "s" || p[0] === "r") && !w) return notFound();
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
  const cur = { lib: "lib", b: "b", store: "store", profile: "profile", login: "profile", community: "community", top: "community", "": "home" }[p[0]];
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
applyTheme();
$("#app").innerHTML = `<div class="skel hero"></div><div class="row">${"<div class='card'><div class='cover skel'></div></div>".repeat(8)}</div>`;
setTimeout(route, 350);

document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); $("#q").focus(); } });

(() => { const b = document.createElement("button"); b.id = "top"; b.setAttribute("aria-label", "للأعلى"); b.textContent = "↑"; b.hidden = true; b.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" }); document.body.appendChild(b); addEventListener("scroll", () => { b.hidden = scrollY < 600; }, { passive: true }); })();
