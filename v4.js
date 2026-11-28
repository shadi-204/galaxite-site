/* v4: تصفح بفلتر جانبي وتصنيفات. لا توجد إحصاءات مشاهدات فعلية حتى الآن. */
(() => {
const nm = (n) => Number(n).toLocaleString("ar-EG");
const seed = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const hue = (t) => seed(t) % 360;
const grad = (t) => `linear-gradient(135deg,hsl(${hue(t)},60%,40%),hsl(${(hue(t) + 60) % 360},55%,22%))`;
const GEN = [...new Set(WORKS.flatMap((w) => w.genres || []))];
const pop = (w) => Number(w.rating || 0);
const latestList = () => WORKS.map((w) => ({ w, ch: w.chapters, ago: null })).sort((a, b) => b.ch - a.ch);
const agoTxt = (m) => (m < 60 ? `منذ ${nm(m)} د` : m < 1440 ? `منذ ${nm(Math.round(m / 60))} س` : `منذ ${nm(Math.round(m / 1440))} يوم`);
const LS = { g: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, s: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
const ic = (p) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

/* ---- تصفح ---- */
let bf = { q: "", st: "", ty: "", sort: "rating", g: [] };
function browse() {
  const list = WORKS.filter((w) => hit(w, bf.q) && (!bf.st || w.status === bf.st) && (!bf.ty || w.type === bf.ty) && bf.g.every((g) => (w.genres || []).includes(g)))
    .sort((a, b) => bf.sort === "rating" ? b.rating - a.rating : bf.sort === "pop" ? pop(b) - pop(a) : bf.sort === "ch" ? b.chapters - a.chapters : a.title.localeCompare(b.title));
  const chip = (k, v, l) => `<button class="v4chip ${bf[k] === v ? "on" : ""}" data-k="${k}" data-v="${v}">${l}</button>`;
  $("#app").innerHTML = `<h2 class="v4h"><span></span>تصفح الأعمال</h2><p class="v4sub">ابحث وفلتر حسب الحالة والنوع والتصنيف.</p>
  <div class="v4bw"><aside class="v4side"><h3>تصفية النتائج</h3>
   <b>الحالة</b><div>${chip("st", "", "الكل")}${chip("st", "مستمر", "مستمر")}${chip("st", "مكتمل", "مكتمل")}</div>
   <b>النوع</b><div>${chip("ty", "", "الكل")}${chip("ty", "manga", "مانجا")}${chip("ty", "manhwa", "مانهوا")}</div>
   <b>الترتيب</b><div>${chip("sort", "rating", "الأعلى تقييما")}${chip("sort", "pop", "الأكثر شعبية")}${chip("sort", "ch", "الأكثر فصولا")}${chip("sort", "az", "أ-ي")}</div>
   <b>التصنيفات</b><div>${GEN.map((g) => `<button class="v4chip ${bf.g.includes(g) ? "on" : ""}" data-g="${g}">${g}</button>`).join("")}</div>
   <button class="v4chip" id="v4rs">مسح الكل</button></aside>
  <section><input id="v4q" class="v4q" type="search" placeholder="ابحث عن عمل..." value="${esc(bf.q)}"><p class="v4cnt">عدد النتائج: <b>${nm(list.length)}</b></p>
  <div class="v4grid">${list.map((w) => card(w, `<b class="rate">★ ${w.rating}</b>`)).join("") || `<p class="empty">لا نتائج</p>`}</div></section></div>`;
  document.querySelectorAll(".v4chip[data-k]").forEach((b) => (b.onclick = () => { bf[b.dataset.k] = b.dataset.v; browse(); }));
  document.querySelectorAll(".v4chip[data-g]").forEach((b) => (b.onclick = () => { const g = b.dataset.g; bf.g = bf.g.includes(g) ? bf.g.filter((x) => x !== g) : [...bf.g, g]; browse(); }));
  $("#v4rs").onclick = () => { bf = { q: "", st: "", ty: "", sort: "rating", g: [] }; browse(); };
  $("#v4q").oninput = (e) => { bf.q = e.target.value; const p = e.target.selectionStart; browse(); const n = $("#v4q"); n.focus(); n.setSelectionRange(p, p); };
}
/* ---- التصنيفات ---- */
function cats() {
  $("#app").innerHTML = `<h2 class="v4h"><span></span>التصنيفات</h2><p class="v4sub">تصفح الأعمال حسب التصنيف.</p><div class="v4cats">${GEN.map((g) => { const n = WORKS.filter((w) => (w.genres || []).includes(g)); return `<a class="v4cat" href="#/browse" data-g="${g}" style="background:${grad(g)}"><b>${g}</b><small>${nm(n.length)} عمل</small><em>تصفح ‹</em></a>`; }).join("")}</div>`;
  document.querySelectorAll(".v4cat").forEach((a) => (a.onclick = () => { bf = { q: "", st: "", ty: "", sort: "rating", g: [a.dataset.g] }; }));
}
/* ---- أحدث الفصول ---- */
let lt = "all";
async function latest() {
  $("#app").innerHTML = `<h2 class="v4h"><span></span>أحدث الفصول</h2><div class="v4tabs">${[["all", "الكل"], ["manga", "مانجا"], ["manhwa", "مانهوا"]].map(([k, v]) => `<button class="${lt === k ? "on" : ""}" data-t="${k}">${v}</button>`).join("")}</div><p class="v4sub">جارٍ تحميل أحدث الفصول المنشورة...</p><div class="v4lat" id="v4-latest-list"></div>`;
  document.querySelectorAll(".v4tabs button").forEach((b) => (b.onclick = () => { lt = b.dataset.t; latest(); }));
  const list = $("#v4-latest-list");
  if (!list) return;
  const rows = await window.GALAXITE_DB_CATALOG?.getLatestChapters(60) || [];
  if (!list.isConnected) return;
  const entries = rows.map((row) => ({ row, w: WORKS.find((work) => String(work.id) === String(row.work_id)) })).filter((x) => x.w && (lt === "all" || x.w.type === lt));
  list.innerHTML = entries.length ? entries.map(({row,w}) => {
    const stamp = row.created_at ? new Date(row.created_at).toLocaleDateString("ar-EG") : "تاريخ غير متاح";
    const chapterTitle = row.title || ("الفصل " + nm(row.chapter_number));
    return `<a class="v4lc" href="#/r/${slug(w)}/${Number(row.chapter_number)}"><div class="v4th">${cover(w)}</div><div><b dir="auto">${esc(w.title)}</b><small>${esc(chapterTitle)}</small><small>${stamp}</small></div></a>`;
  }).join("") : '<p class="empty">لا توجد فصول منشورة متاحة في قاعدة البيانات.</p>';
}
/* ---- الأعلى تقييمًا ---- */
function rankBlock(el) {
  let per = "d";
  const draw = () => {
    const K = { d: ["الأعلى تقييمًا"] };
    const l = [...WORKS].sort((a, b) => pop(b) - pop(a)).slice(0, 8);
    el.innerHTML = `<h3 class="h">الأعلى تقييمًا</h3><div class="v4tabs">${Object.entries(K).map(([k, v]) => `<button class="${per === k ? "on" : ""}" data-p="${k}">${v[0]}</button>`).join("")}</div>
    <ol class="v4rank">${l.map((w, i) => `<li class="${i ? "" : "first"}"><a href="#/s/${slug(w)}"><b>${nm(i + 1)}</b><div class="v4th s">${cover(w)}</div><span dir="auto">${esc(w.title)}<small>الفصل ${nm(w.chapters)} · تقييم ${Number(w.rating || 0).toFixed(1)}</small></span></a></li>`).join("")}</ol>`;
    el.querySelectorAll("button").forEach((b) => (b.onclick = () => { per = b.dataset.p; draw(); }));
  };
  draw();
}
function rank() { $("#app").innerHTML = `<h2 class="v4h"><span></span>الأعلى تقييمًا</h2><div id="rk"></div>`; rankBlock($("#rk")); }
/* ---- المهام والمستويات ---- */
const MIS = [["دخول اليوم", 1, 5], ["اقرأ 3 فصول", 3, 15], ["أضف عملا للمفضلة", 1, 10], ["اكتب تعليقا", 1, 10], ["شارك عملا", 1, 5]];
function missions() {
  const day = new Date().toDateString(); let m = LS.g("v4m", {}); if (m.day !== day) m = { day, p: {}, xp: m.xp || 0 };
  const lvl = Math.floor(m.xp / 50) + 1, u = VX.me();
  $("#app").innerHTML = `<h2 class="v4h"><span></span>المهام والمستويات</h2><p class="v4sub">المستوى يرتفع بإكمال المهام فقط. المستوى يفتح إطارات وبانرات الملف الشخصي. (تجريبي، محفوظ على جهازك)</p>
  <div class="v4lv"><b>مستوى ${nm(lvl)}</b><div class="v4bar"><i style="width:${m.xp % 50 * 2}%"></i></div><small>${nm(m.xp)} نقطة خبرة</small></div>
  <div class="v4ms">${MIS.map(([t, n, x], i) => { const p = m.p[i] || 0, done = p >= n; return `<div class="v4m"><div><b>${t}</b><small>${nm(Math.min(p, n))} / ${nm(n)} · +${nm(x)} XP</small></div><button class="cta ${done ? "alt" : ""}" data-i="${i}" ${done ? "disabled" : ""}>${done ? "تمت" : "تقدّم +1"}</button></div>`; }).join("")}</div>
  <h3 class="h">إطارات وبانرات الملف</h3><div class="v4fr">${["Galaxy", "Aurora", "Ember", "Frost", "Sakura", "Neon"].map((n, i) => `<div class="v4f ${lvl >= i * 2 + 1 ? "" : "lk"}" style="background:${grad(n)}"><b>${n}</b><small>${lvl >= i * 2 + 1 ? "مفتوح" : `يفتح عند مستوى ${nm(i * 2 + 1)}`}</small></div>`).join("")}</div>${u ? "" : `<p class="v4sub">سجّل دخول لحفظ تقدمك على حسابك. <a href="#/login">دخول</a></p>`}`;
  document.querySelectorAll(".v4m button").forEach((b) => (b.onclick = () => { const i = +b.dataset.i; m.p[i] = (m.p[i] || 0) + 1; if (m.p[i] >= MIS[i][1]) { m.xp += MIS[i][2]; VX.toast(`+${MIS[i][2]} XP`, "ok"); } LS.s("v4m", m); missions(); }));
}
/* ---- الدعم ---- */
function support() {
  $("#app").innerHTML = `<h2 class="v4h"><span></span>ادعمنا</h2><p class="v4sub">الموقع مجاني. دعمك يغطي السيرفرات ويمول المزايا الجديدة.</p>
  <div class="v4why">${[["تكاليف السيرفرات", "سيرفرات سريعة ومتاحة دائما."], ["تجربة بلا إعلانات", "نحافظ على الموقع نظيفا."], ["تطوير مستمر", "مزايا جديدة وإصلاح المشاكل."]].map(([a, b]) => `<div><b>${a}</b><small>${b}</small></div>`).join("")}</div>
  <div class="v4calc"><h3>حاسبة النقاط</h3><div class="v4tabs">${[2, 5, 10, 20].map((n) => `<button data-a="${n}">+${n}$</button>`).join("")}</div><input id="v4a" type="number" min="0" value="5" dir="ltr"><p>المعدل: 1$ = 1000 نقطة. ستحصل على <b id="v4p">5000</b> نقطة</p><button class="cta" id="v4d">ادعم (تجريبي)</button><p class="note">لا يتم أي دفع حقيقي حاليا. الدفع يتفعل بعد ربط بوابة دفع من سيرفرك.</p></div>`;
  const up = () => ($("#v4p").textContent = nm((+$("#v4a").value || 0) * 1000));
  $("#v4a").oninput = up; up();
  document.querySelectorAll(".v4tabs button").forEach((b) => (b.onclick = () => { $("#v4a").value = b.dataset.a; up(); }));
  $("#v4d").onclick = () => VX.toast("وضع تجريبي: لا دفع حقيقي", "ok");
}
V3.pages.browse = browse; V3.pages.cats = cats; V3.pages.latest = latest; V3.pages.rank = rank; V3.pages.missions = missions; V3.pages.support = support;
const T = { browse: "تصفح", cats: "التصنيفات", latest: "أحدث الفصول", rank: "الأعلى تقييمًا", missions: "المهام", support: "ادعمنا" };
addEventListener("hashchange", () => setTimeout(() => { const p = location.hash.slice(2).split("/")[0]; if (T[p]) document.title = T[p] + " | Galaxite"; }, 0));

/* ---- الرئيسية: الأعلى تقييمًا + تصنيفات ---- */
function enrich() {
  if (location.hash && location.hash !== "#/" && location.hash !== "#") return;
  const a = $("#app"); if (!a.querySelector(".gstrip, .row, .hero") || a.querySelector("#v4home")) return;
  const d = document.createElement("div"); d.id = "v4home";
  d.innerHTML = `<section id="rk4"></section><div class="rh"><h3 class="h">التصنيفات</h3><a href="#/cats" class="v4more">عرض الكل</a></div><div class="v4cats sm">${GEN.slice(0, 6).map((g) => `<a class="v4cat" href="#/cats" style="background:${grad(g)}"><b>${g}</b></a>`).join("")}</div><div class="v4cta"><b>ادعم الموقع واجمع النقاط</b><span><a class="cta" href="#/missions">المهام</a> <a class="cta alt" href="#/support">ادعمنا</a></span></div>`;
  a.appendChild(d); rankBlock(d.querySelector("#rk4"));
}
new MutationObserver(() => { if (!$("#v4home")) enrich(); }).observe($("#app"), { childList: true });

/* ---- قائمة التنقل ---- */
const nav = $("#mnav"); if (nav) nav.innerHTML = `<a href="#/" data-r="home">الرئيسية</a><a href="#/browse">تصفح</a><a href="#/latest">أحدث الفصول</a><a href="#/cats">التصنيفات</a><a href="#/rank">الأعلى تقييمًا</a><a href="#/store" data-r="store">المتجر</a><a href="#/community">المجتمع</a><a href="#/top">المتصدرين</a><a href="#/missions">المهام</a><a href="#/support">ادعمنا</a>`;
const ft = document.querySelector(".foot nav"); if (ft) ft.insertAdjacentHTML("beforeend", `<a href="#/support">ادعمنا</a>`);

/* ---- كوكيز ونافذة الجديد ---- */
if (!LS.g("v4ck", 0)) { const c = document.createElement("div"); c.className = "v4ck"; c.innerHTML = `<div><b>تجربة قراءة أفضل</b><small>نحفظ تقدمك وإعداداتك على جهازك فقط.</small></div><span><button class="cta" id="ck1">موافق</button><button class="cta alt" id="ck2">رفض</button></span>`; document.body.appendChild(c); c.querySelectorAll("button").forEach((b) => (b.onclick = () => { LS.s("v4ck", 1); c.remove(); })); }
const NEW = [["تصفح بفلتر جانبي", "فلتر بالحالة والنوع والتصنيف."], ["الأعلى تقييمًا", "اليوم والأسبوع والشهر."], ["المهام والمستويات", "اجمع XP وافتح إطارات الملف."], ["لوحات للفرق", "لوحة فريق ولوحة مدير الموقع."]];
if (!LS.g("v4new", 0)) setTimeout(() => {
  let i = 0; const o = document.createElement("div"); o.className = "v4ov";
  const d = () => { o.innerHTML = `<div class="v4md"><small>الجديد في الموقع · ${nm(i + 1)} من ${nm(NEW.length)}</small><h3>${NEW[i][0]}</h3><p>${NEW[i][1]}</p><div><button class="cta alt" id="nx0">تخطي</button><button class="cta" id="nx1">${i == NEW.length - 1 ? "ابدأ" : "التالي"}</button></div></div>`; o.querySelector("#nx0").onclick = end; o.querySelector("#nx1").onclick = () => (++i >= NEW.length ? end() : d()); };
  const end = () => { LS.s("v4new", 1); o.remove(); };
  d(); document.body.appendChild(o);
}, 1500);
})();
