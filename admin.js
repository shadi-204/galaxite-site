/* لوحة إدارة تجريبية. مهم: لا يوجد أمان حقيقي في موقع ثابت. */
const CFG = window.AUTH_CONFIG || { provider: "demo", ownerEmail: "ownermail@gmail.com" };
const OWNER_EMAIL = CFG.ownerEmail; // في الوضع التجريبي للعرض فقط. مع Firebase/Supabase يُفرض فعلا
const KEY_WORKS = "vx-works", KEY_AUTH = "vx-admin-auth", KEY_SESSION = "vx-admin-session";
const $ = (s) => document.querySelector(s);
const root = $("#root");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
let works = load(KEY_WORKS, null) || JSON.parse(JSON.stringify(WORKS));
let view = "dash", toastT;
const persist = () => save(KEY_WORKS, works);

/* ---- تجزئة كلمة المرور في المتصفح فقط (PBKDF2). لا تُخزن كلمة المرور نفسها ---- */
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function hash(pw, saltB64) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, key, 256);
  return { salt: b64(salt), hash: b64(bits) };
}
const toast = (m) => { clearTimeout(toastT); document.querySelector(".toast")?.remove(); document.body.insertAdjacentHTML("beforeend", `<div class="toast" role="status">${esc(m)}</div>`); toastT = setTimeout(() => document.querySelector(".toast")?.remove(), 2200); };


/* ---- محول تسجيل الدخول الحقيقي (اختياري) ---- */
const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load")); document.head.appendChild(s); });
const realProvider = () => (CFG.provider === "firebase" && CFG.firebase?.apiKey) ? "firebase" : (CFG.provider === "supabase" && CFG.supabase?.url && CFG.supabase?.anonKey) ? "supabase" : null;
let sdk = null;
async function initSdk(p) {
  if (sdk) return sdk;
  if (p === "firebase") {
    await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
    await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js");
    firebase.initializeApp(CFG.firebase);
    sdk = { signIn: async (e, pw) => { const c = await firebase.auth().signInWithEmailAndPassword(e, pw); return c.user.email; }, signOut: () => firebase.auth().signOut(),
      current: () => new Promise((r) => { const u = firebase.auth().onAuthStateChanged((x) => { u(); r(x ? x.email : null); }); }) };
  } else {
    await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
    const c = supabase.createClient(CFG.supabase.url, CFG.supabase.anonKey);
    sdk = { signIn: async (e, pw) => { const { data, error } = await c.auth.signInWithPassword({ email: e, password: pw }); if (error) throw error; return data.user.email; }, signOut: () => c.auth.signOut(),
      current: async () => { const { data } = await c.auth.getSession(); return data.session ? data.session.user.email : null; } };
  }
  return sdk;
}
const isOwner = (e) => (e || "").toLowerCase() === OWNER_EMAIL.toLowerCase();
function realGate(p, msg) {
  root.innerHTML = `<div class="gate"><form class="box" id="gf">
    <div class="logo">◢ لوحة الإدارة</div><p style="color:var(--mut);margin:6px 0 0">تسجيل الدخول عبر ${p === "firebase" ? "Firebase" : "Supabase"}</p>
    <label for="em">البريد</label><input id="em" type="email" required value="${esc(OWNER_EMAIL)}" autocomplete="username">
    <label for="pw">كلمة المرور</label><span class="admin-pw"><input id="pw" type="password" required autocomplete="current-password"><button class="admin-pw-toggle" id="pw-toggle" type="button" aria-label="إظهار كلمة المرور" aria-pressed="false"><svg class="eye-open" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-closed" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A11 11 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.1 0 2.1-.2 3-.5"/></svg></button></span>
    <div class="err" id="ge" role="alert">${esc(msg || "")}</div>
    <button class="btn pri" style="width:100%;justify-content:center;margin-top:8px">دخول</button>
    <p style="text-align:center;margin:14px 0 0"><a href="index.html" style="color:var(--mut);font-size:13px">← العودة للموقع</a></p></form></div>`;
  const adminPw = $("#pw"), adminToggle = $("#pw-toggle");
  if (adminPw && adminToggle) adminToggle.onclick = () => { const show = adminPw.type === "password"; adminPw.type = show ? "text" : "password"; adminToggle.setAttribute("aria-pressed", String(show)); adminToggle.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"); };
  $("#gf").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const s = await initSdk(p); const mail = await s.signIn($("#em").value.trim(), $("#pw").value);
      if (!isOwner(mail)) { await s.signOut(); $("#ge").textContent = "هذا الحساب غير مسموح له بالدخول."; return; }
      sessionStorage.setItem(KEY_SESSION, "1"); render();
    } catch { $("#ge").textContent = "تعذر تسجيل الدخول. تأكد من البيانات والإعدادات."; }
  };
}

/* ---- شاشة الدخول ---- */
function gate() {
  const rp = realProvider();
  if (rp) return realGate(rp);
  const auth = load(KEY_AUTH, null);
  root.innerHTML = `<div class="gate"><form class="box" id="gf" autocomplete="off">
    <div class="logo">◢ لوحة الإدارة</div>
    <p style="color:var(--mut);margin:6px 0 0">${auth ? "سجّل الدخول للمتابعة" : "أول استخدام: اختر كلمة مرور لهذا المتصفح"}</p>
    <div class="warn"><b>بوابة تجريبية فقط.</b> الموقع ثابت على GitHub Pages، فمفيش تحقق حقيقي من الهوية. أي حد يفتح الموقع من متصفح تاني يقدر ينشئ كلمة مرور خاصة بيه، والبيانات بتتحفظ في متصفحك بس. للحماية الحقيقية اربط Firebase Auth أو Supabase (الخطوات في README).</div>
    <label for="em">البريد</label><input id="em" type="email" value="${esc(OWNER_EMAIL)}" readonly>
    <label for="pw">كلمة المرور</label><input id="pw" type="password" required minlength="8" autocomplete="${auth ? "current-password" : "new-password"}">
    ${auth ? "" : `<label for="pw2">تأكيد كلمة المرور</label><input id="pw2" type="password" required minlength="8" autocomplete="new-password">`}
    <div class="err" id="ge" role="alert"></div>
    <button class="btn pri" style="width:100%;justify-content:center;margin-top:8px">${auth ? "دخول" : "إنشاء كلمة المرور والدخول"}</button>
    <p style="text-align:center;margin:14px 0 0"><a href="index.html" style="color:var(--mut);font-size:13px">← العودة للموقع</a></p>
  </form></div>`;
  $("#gf").onsubmit = async (e) => {
    e.preventDefault();
    const pw = $("#pw").value;
    if (!window.crypto?.subtle) { $("#ge").textContent = "المتصفح لا يدعم التشفير هنا. افتح الموقع عبر https."; return; }
    if (auth) {
      const h = await hash(pw, auth.salt);
      if (h.hash !== auth.hash) { $("#ge").textContent = "كلمة المرور غير صحيحة."; return; }
    } else {
      if (pw.length < 8) { $("#ge").textContent = "٨ أحرف على الأقل."; return; }
      if (pw !== $("#pw2").value) { $("#ge").textContent = "كلمتا المرور غير متطابقتين."; return; }
      save(KEY_AUTH, await hash(pw));
    }
    sessionStorage.setItem(KEY_SESSION, "1");
    render();
  };
}

/* ---- الهيكل ---- */
const ICON = {
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-6"/>',
  sales: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  community: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  promo: '<path d="M12 2l3 6.9 7.4.7-5.6 5 1.7 7.3L12 17.8 5.5 21.9l1.7-7.3-5.6-5 7.4-.7z"/>',
  dash: '<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z"/>',
  works: '<path d="M4 4h4v16H4zM10 4h4v16h-4zM16 5l4 1-3 14-4-1z"/>',
  chapters: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'
};
const ic = (n) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const NAV = [["dash", "الرئيسية"], ["works", "الأعمال"], ["chapters", "الفصول"], ["users", "المستخدمين"], ["sales", "المبيعات والعملات"], ["community", "المجتمع والإشراف"], ["promo", "الواجهة والمثبت"], ["settings", "الإعدادات"]];
function render() {
  if (!sessionStorage.getItem(KEY_SESSION)) return gate();
  const titles = { dash: "نظرة عامة", works: "إدارة الأعمال", chapters: "إدارة الفصول", users: "المستخدمين", sales: "المبيعات والعملات", community: "المجتمع والإشراف", promo: "الواجهة والمثبت", settings: "الإعدادات" };
  root.innerHTML = `<div class="app"><nav class="side" aria-label="القائمة">
    <div class="logo brand" style="padding:6px 14px 16px">◢ Galaxite</div>
    ${NAV.map(([k, l]) => `<a href="#${k}" class="${view === k ? "on" : ""}">${ic(k)}<span>${l}</span></a>`).join("")}
    <div class="sp"></div>
    <a href="index.html" class="nav">${ic("works")}<span>الموقع</span></a>
    <button class="nav" id="out">${ic("settings")}<span>خروج</span></button>
  </nav><main class="main"><div class="top"><h1>${titles[view]}</h1><span class="pill" dir="ltr">${esc(OWNER_EMAIL)}</span></div><div id="v"></div></main></div>`;
  $("#out").onclick = async () => { sessionStorage.removeItem(KEY_SESSION); try { if (sdk) await sdk.signOut(); } catch {} gate(); };
  ({ dash, works: worksView, chapters: chaptersView, users: usersView, sales: salesView, community: communityView, promo: promoView, settings })[view]();
}
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (["dash", "works", "chapters", "users", "sales", "community", "promo", "settings"].includes(h)) { view = h; render(); } });


/* ---- أقسام الإدارة الموسعة (v3): الأرقام التجريبية موضحة، والبيانات الحقيقية تحتاج قاعدة بيانات ---- */
const realUsers = () => Object.keys(load("vx-users", {})).map((e) => { const p = load("vx-u:" + e.toLowerCase(), null) || {}; return { email: e, name: p.name || e.split("@")[0], xp: p.xp || 0, coins: p.coins ?? 20, vip: p.vipUntil > Date.now() }; });
const DEMO_USERS = [["نجم الشتاء", "najm@example.com", 990, 140, 1], ["ظل الليل", "zill@example.com", 1105, 20, 0], ["قمر الصحراء", "qamar@example.com", 1240, 560, 1], ["صقر الشرق", "saqr@example.com", 760, 0, 0], ["ريم القارئة", "reem@example.com", 515, 75, 0]];
const kpi = (b, s, d) => `<div class="stat"><b>${b}</b><span>${s}</span>${d ? `<small class="up">${d}</small>` : ""}</div>`;
function demoNote() { return `<div class="warn"><b>أرقام تجريبية.</b> اللوحة ثابتة على GitHub Pages، فالأرقام دي أمثلة للشكل المقترح. بعد ربط Supabase أو Firebase وبوابة دفع (Paymob أو Stripe) هتتغذى ببياناتك الحقيقية.</div>`; }
function usersView() {
  const r = realUsers(), rows = [...r.map((u) => [u.name, u.email, u.xp, u.coins, u.vip ? 1 : 0, "حقيقي (هذا المتصفح)"]), ...DEMO_USERS.map((u) => [...u, "مثال"])];
  $("#v").innerHTML = demoNote() + `<div class="stats">${kpi(rows.length.toLocaleString("ar-EG"), "إجمالي المستخدمين", "+٣ هذا الأسبوع")}${kpi(rows.filter((x) => x[4]).length.toLocaleString("ar-EG"), "مشتركو VIP")}${kpi("٤٢٪", "نسبة النشطين أسبوعيا")}${kpi("٣", "حسابات محظورة")}</div>
  <div class="panel"><h2>قائمة المستخدمين</h2><div class="acts" style="margin:0 0 10px"><input id="us" type="search" placeholder="ابحث بالاسم أو البريد..." style="flex:1;min-width:200px"><select id="uf"><option value="">الكل</option><option value="1">VIP فقط</option></select></div>
  <div class="tw"><table><thead><tr><th>الاسم</th><th>البريد</th><th>XP</th><th>العملات</th><th>الخطة</th><th>المصدر</th><th>إجراءات</th></tr></thead><tbody id="ub"></tbody></table></div></div>
  <div class="panel"><h2>إجراءات مقترحة</h2><p style="color:var(--mut);margin:0;line-height:1.9">إضافة أو خصم عملات يدويا · منح VIP · حظر أو فك حظر · تغيير الدور (قارئ، مشرف، مترجم) · إعادة تعيين كلمة المرور · سجل نشاط كل مستخدم.</p></div>`;
  const draw = () => { const q = $("#us").value.toLowerCase(), f = $("#uf").value; $("#ub").innerHTML = rows.filter((x) => (!q || (x[0] + x[1]).toLowerCase().includes(q)) && (!f || x[4])).map((x) => `<tr><td dir="auto">${esc(x[0])}</td><td dir="ltr">${esc(x[1])}</td><td>${(+x[2]).toLocaleString("ar-EG")}</td><td>${(+x[3]).toLocaleString("ar-EG")}</td><td>${x[4] ? '<span class="pill">VIP</span>' : "مجاني"}</td><td><small>${x[5]}</small></td><td><button class="btn" data-n="1">+ عملات</button> <button class="btn" data-n="2">حظر</button></td></tr>`).join(""); document.querySelectorAll("#ub button").forEach((b) => (b.onclick = () => toast("هذا الإجراء يحتاج قاعدة بيانات حقيقية"))); };
  $("#us").oninput = draw; $("#uf").onchange = draw; draw();
}
function salesView() {
  const days = ["س", "ح", "ن", "ث", "ر", "خ", "ج"], v = [120, 180, 90, 240, 310, 280, 420], mx = Math.max(...v);
  $("#v").innerHTML = demoNote() + `<div class="stats">${kpi("٤٬٢٨٠ ج.م", "إيراد هذا الشهر", "+١٨٪")}${kpi("٣٦٤", "عمليات شراء")}${kpi("٨٧", "مشتركو VIP نشطين")}${kpi("١٢٬٥٠٠", "عملات مباعة")}${kpi("٣٣٠٠٠", "عملات مستهلكة")}${kpi("٢", "مدفوعات معلقة")}</div>
  <div class="panel"><h2>الإيراد آخر ٧ أيام (جنيه)</h2><svg viewBox="0 0 350 130" style="width:100%;max-width:560px" role="img" aria-label="رسم بياني للإيراد">${v.map((x, i) => `<rect x="${i * 50 + 8}" y="${110 - x / mx * 95}" width="34" height="${x / mx * 95}" rx="6" fill="#ef4444" opacity="${0.45 + x / mx * 0.55}"/><text x="${i * 50 + 25}" y="125" text-anchor="middle" font-size="11" fill="#9ba0b8">${days[i]}</text><text x="${i * 50 + 25}" y="${106 - x / mx * 95}" text-anchor="middle" font-size="10" fill="#ecedf5">${x}</text>`).join("")}</svg></div>
  <div class="panel"><h2>آخر العمليات</h2><div class="tw"><table><thead><tr><th>العملية</th><th>المستخدم</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${[["باقة ١٠٠٠ عملة", "najm@example.com", "٢٠٠ ج", "مكتملة"], ["اشتراك VIP", "qamar@example.com", "١٥٠ ج", "مكتملة"], ["باقة ٣٠٠ عملة", "reem@example.com", "٧٥ ج", "معلقة"], ["باقة ٥٠٠ عملة", "saqr@example.com", "١١٠ ج", "مرفوضة"]].map((r) => `<tr><td>${r[0]}</td><td dir="ltr">${r[1]}</td><td>${r[2]}</td><td><span class="pill">${r[3]}</span></td></tr>`).join("")}</tbody></table></div></div>
  <div class="panel"><h2>إعدادات الأسعار</h2><p style="color:var(--mut);margin:0;line-height:1.9">سعر فتح الفصل بالعملات · عدد الفصول المقفولة لكل عمل · باقات العملات وأسعارها · كوبونات وخصومات · استرداد المدفوعات (يتم من بوابة الدفع).</p></div>`;
}
function communityView() {
  const posts = load("vx-posts", []);
  const rep = [["منشور فيه سبويلر بدون تحذير", "ظل الليل", "معلّق"], ["رسالة إعلانية", "مستخدم_٤٤", "معلّق"]];
  $("#v").innerHTML = (posts.length ? "" : demoNote()) + `<div class="stats">${kpi((posts.length + 5).toLocaleString("ar-EG"), "إجمالي المنشورات")}${kpi(rep.length.toLocaleString("ar-EG"), "بلاغات معلقة")}${kpi("٩", "مراجعات جديدة")}${kpi("٠", "مستخدمون موقوفون")}</div>
  <div class="panel"><h2>البلاغات</h2><div class="tw"><table><tbody>${rep.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td><span class="pill">${r[2]}</span></td><td><button class="btn" data-n="1">إخفاء</button> <button class="btn" data-n="2">تجاهل</button></td></tr>`).join("")}</tbody></table></div></div>
  <div class="panel"><h2>منشورات من هذا المتصفح</h2>${posts.length ? `<div class="tw"><table><tbody>${posts.map((p, i) => `<tr><td dir="auto">${esc(p.txt)}</td><td>${esc(p.u)}</td><td><button class="btn" data-del="${i}">حذف</button></td></tr>`).join("")}</tbody></table></div>` : `<p style="color:var(--mut);margin:0">لا توجد منشورات كتبها قراء في هذا المتصفح بعد.</p>`}</div>
  <div class="panel"><h2>القنوات والقواعد</h2><p style="color:var(--mut);margin:0;line-height:1.9">إنشاء وترتيب القنوات · كلمات محظورة · تثبيت منشور · فعاليات ومسابقات بمكافآت XP وعملات · أدوار المشرفين.</p></div>`;
  document.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { posts.splice(+b.dataset.del, 1); save("vx-posts", posts); toast("تم الحذف"); communityView(); }));
  document.querySelectorAll("#v [data-n]").forEach((b) => (b.onclick = () => toast("يحتاج قاعدة بيانات حقيقية")));
}
function promoView() {
  const pins = load("vx-pins", null) || [...works].sort((a, b) => b.rating - a.rating).slice(0, 3).map((w) => w.title);
  const an = load("vx-announce", "");
  $("#v").innerHTML = `<div class="panel"><h2>الأعمال المثبتة في الرئيسية (حتى ٣)</h2><div class="tw"><table><tbody>${works.map((w, i) => `<tr><td><input type="checkbox" data-p="${i}" ${pins.includes(w.title) ? "checked" : ""} aria-label="تثبيت ${esc(w.title)}"></td><td dir="auto">${esc(w.title)}</td><td>⭐ ${esc(w.rating)}</td></tr>`).join("")}</tbody></table></div><div class="acts" style="margin-top:10px"><button class="btn pri" id="sp">حفظ التثبيت</button></div></div>
  <div class="panel"><h2>رسالة إعلان أعلى الموقع</h2><input id="an" value="${esc(an)}" placeholder="مثال: خصم ٢٠٪ على باقات العملات هذا الأسبوع" style="width:100%"><div class="acts" style="margin-top:10px"><button class="btn pri" id="sa">حفظ</button></div></div>
  <div class="panel"><h2>البانر المتحرك والأقسام</h2><p style="color:var(--mut);margin:0;line-height:1.9">اختيار أعمال البانر · ترتيب أقسام الرئيسية (الأشهر اليوم، المثبتة، آخر الإصدارات) · أعمال المستخدمين المميزة · ألوان الهوية.</p></div>`;
  $("#sp").onclick = () => { const sel = [...document.querySelectorAll("[data-p]:checked")].map((c) => works[+c.dataset.p].title).slice(0, 3); save("vx-pins", sel); toast("تم حفظ المثبت (يظهر في الرئيسية)"); };
  $("#sa").onclick = () => { save("vx-announce", $("#an").value.trim()); toast("تم حفظ الإعلان"); };
}

/* ---- نظرة عامة ---- */
function dash() {
  const marks = load("marks", []).length;
  const chs = works.reduce((a, w) => a + (+w.chapters || 0), 0);
  const avg = works.length ? (works.reduce((a, w) => a + (+w.rating || 0), 0) / works.length).toFixed(1) : "0";
  const withPages = works.reduce((a, w) => a + Object.keys(w.pages || {}).length, 0);
  $("#v").innerHTML = `<div class="stats">
    <div class="stat"><b>${works.length}</b><span>إجمالي الأعمال</span></div>
    <div class="stat"><b>${works.filter((w) => w.type === "manga").length}</b><span>مانجا</span></div>
    <div class="stat"><b>${works.filter((w) => w.type === "manhwa").length}</b><span>مانهوا</span></div>
    <div class="stat"><b>${chs.toLocaleString("ar-EG")}</b><span>إجمالي الفصول</span></div>
    <div class="stat"><b>${avg}</b><span>متوسط التقييم</span></div>
    <div class="stat"><b>${withPages}</b><span>فصول لها صور</span></div></div>
    <div class="panel"><h2>أعلى الأعمال تقييما</h2><div class="tw"><table><tbody>${[...works].sort((a, b) => b.rating - a.rating).slice(0, 5).map((w) => `<tr><td dir="auto">${esc(w.title)}</td><td><span class="pill">${w.type === "manga" ? "مانجا" : "مانهوا"}</span></td><td>⭐ ${esc(w.rating)}</td></tr>`).join("") || `<tr><td class="empty">لا توجد أعمال</td></tr>`}</tbody></table></div></div>
    <div class="panel"><h2>إجراءات سريعة</h2><div class="acts" style="margin:0"><button class="btn pri" id="qa">+ إضافة عمل</button><button class="btn" id="qe">تصدير data.js</button></div>
    <p style="color:var(--mut);font-size:13px;margin:12px 0 0">البيانات مخزنة في هذا المتصفح فقط (${marks} عمل في مفضلة الموقع هنا). لنشرها للجميع صدّر data.js وارفعه على GitHub.</p></div>`;
  $("#qa").onclick = () => workForm(); $("#qe").onclick = exportData;
}

/* ---- الأعمال ---- */
function worksView() {
  $("#v").innerHTML = `<div class="top" style="margin-top:-6px"><input id="sq" placeholder="ابحث..." style="max-width:260px"><button class="btn pri" id="add">+ إضافة عمل</button></div>
  <div class="panel"><div class="tw"><table><thead><tr><th></th><th>العنوان</th><th>النوع</th><th>الحالة</th><th>الفصول</th><th>التقييم</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
  const draw = () => {
    const q = $("#sq").value.trim().toLowerCase();
    const list = works.map((w, i) => ({ w, i })).filter(({ w }) => w.title.toLowerCase().includes(q));
    $("#tb").innerHTML = list.map(({ w, i }) => `<tr><td>${w.cover ? `<img class="thumb" src="${esc(w.cover)}" alt="" loading="lazy">` : `<div class="thumb" style="background:linear-gradient(135deg,#7c5cff,#ff5c9a)"></div>`}</td>
      <td dir="auto"><b>${esc(w.title)}</b></td><td><span class="pill">${w.type === "manga" ? "مانجا" : "مانهوا"}</span></td><td>${esc(w.status)}</td><td>${esc(w.chapters)}</td><td>${esc(w.rating)}</td>
      <td style="white-space:nowrap"><button class="btn sm" data-e="${i}">تعديل</button> <button class="btn sm dan" data-d="${i}">حذف</button></td></tr>`).join("") || `<tr><td colspan="7" class="empty">لا توجد نتائج</td></tr>`;
    document.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => workForm(+b.dataset.e)));
    document.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => confirmDel(+b.dataset.d)));
  };
  $("#sq").oninput = draw; $("#add").onclick = () => workForm(); draw();
}
function modal(html) { document.body.insertAdjacentHTML("beforeend", `<div class="modal" id="md" role="dialog" aria-modal="true"><div class="box">${html}</div></div>`); $("#md").onclick = (e) => { if (e.target.id === "md") closeModal(); }; }
const closeModal = () => $("#md")?.remove();
function confirmDel(i) {
  modal(`<h2>حذف العمل؟</h2><p style="color:var(--mut)">سيتم حذف «${esc(works[i].title)}» من هذا المتصفح. لا يمكن التراجع.</p><div class="acts"><button class="btn dan" id="yes">حذف</button><button class="btn" id="no">إلغاء</button></div>`);
  $("#no").onclick = closeModal; $("#yes").onclick = () => { works.splice(i, 1); persist(); closeModal(); toast("تم الحذف"); render(); };
}
function workForm(i) {
  const w = i === undefined ? { title: "", type: "manga", genres: [], rating: 8, status: "مستمر", desc: "", cover: "", chapters: 1 } : works[i];
  modal(`<h2>${i === undefined ? "إضافة عمل" : "تعديل العمل"}</h2><form id="wf">
    <label for="t">العنوان</label><input id="t" required value="${esc(w.title)}">
    <div class="row2"><div><label for="ty">النوع</label><select id="ty"><option value="manga" ${w.type === "manga" ? "selected" : ""}>مانجا</option><option value="manhwa" ${w.type === "manhwa" ? "selected" : ""}>مانهوا</option></select></div>
    <div><label for="st">الحالة</label><select id="st">${["مستمر", "مكتمل", "متوقف"].map((s) => `<option ${w.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div></div>
    <div class="row2"><div><label for="ra">التقييم (0-10)</label><input id="ra" type="number" min="0" max="10" step="0.1" value="${esc(w.rating)}"></div>
    <div><label for="ch">عدد الفصول</label><input id="ch" type="number" min="1" value="${esc(w.chapters)}"></div></div>
    <label for="g">التصنيفات (مفصولة بفاصلة)</label><input id="g" list="gl" value="${esc((w.genres || []).join("، "))}"><datalist id="gl">${[...new Set(works.flatMap((x) => x.genres || []))].map((g) => `<option value="${esc(g)}"></option>`).join("")}</datalist><div class="gchips" id="gch">${[...new Set(works.flatMap((x) => x.genres || []))].map((g) => `<button type="button" class="btn sm" data-gc="${esc(g)}">+ ${esc(g)}</button>`).join(" ")}</div>
    <label for="d">الوصف</label><textarea id="d" rows="3">${esc(w.desc)}</textarea>
    <label for="c">رابط صورة الغلاف (https)</label><input id="c" type="url" placeholder="https://..." value="${esc(w.cover)}">
    <div id="cp" style="margin-top:8px"></div>
    <div class="err" id="fe" role="alert"></div>
    <div class="acts"><button class="btn pri">حفظ</button><button type="button" class="btn" id="cx">إلغاء</button></div></form>`);
  const prev = () => { const v = $("#c").value.trim(); $("#cp").innerHTML = /^https?:\/\//i.test(v) ? `<img class="thumb" style="width:70px;height:100px" src="${esc(v)}" alt="معاينة الغلاف" onerror="this.replaceWith(Object.assign(document.createElement('small'),{textContent:'تعذر تحميل الصورة'}))">` : ""; };
  document.querySelectorAll("[data-gc]").forEach((b) => (b.onclick = () => { const cur = $("#g").value.split(/[،,]/).map((s) => s.trim()).filter(Boolean); if (!cur.includes(b.dataset.gc)) cur.push(b.dataset.gc); $("#g").value = cur.join("، "); }));
  $("#c").oninput = prev; prev(); $("#cx").onclick = closeModal;
  $("#wf").onsubmit = (e) => {
    e.preventDefault();
    const title = $("#t").value.trim(), cover = $("#c").value.trim();
    if (!title) return;
    if (cover && !/^https?:\/\//i.test(cover)) { $("#fe").textContent = "رابط الغلاف لازم يبدأ بـ https://"; return; }
    if (works.some((x, k) => k !== i && x.title.toLowerCase() === title.toLowerCase())) { $("#fe").textContent = "فيه عمل بنفس العنوان."; return; }
    const n = { ...w, title, type: $("#ty").value, status: $("#st").value, rating: +$("#ra").value || 0, chapters: Math.max(1, +$("#ch").value || 1), genres: $("#g").value.split(/[،,]/).map((s) => s.trim()).filter(Boolean), desc: $("#d").value.trim(), cover };
    if (!n.cover) delete n.cover;
    if (i === undefined) works.unshift(n); else works[i] = n;
    persist(); closeModal(); toast("تم الحفظ"); render();
  };
}

/* ---- الفصول ---- */
let selWork = 0;
function chaptersView() {
  if (!works.length) { $("#v").innerHTML = `<div class="panel empty">أضف عملا أولا.</div>`; return; }
  selWork = Math.min(selWork, works.length - 1);
  const w = works[selWork];
  $("#v").innerHTML = `<div class="panel"><label for="sw" style="margin-top:0">اختر العمل</label><select id="sw">${works.map((x, i) => `<option value="${i}" ${i === selWork ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select>
    <div class="row2"><div><label for="cn">رقم الفصل</label><input id="cn" type="number" min="1" max="${w.chapters}" value="${w.chapters}"></div>
    <div><label>&nbsp;</label><button class="btn" id="ac" style="width:100%;justify-content:center">+ إضافة فصل جديد (${+w.chapters + 1})</button></div></div>
    <label for="pg">روابط صور الفصل (رابط في كل سطر)</label><textarea id="pg" rows="6" dir="ltr" placeholder="https://..."></textarea>
    <div class="err" id="ce" role="alert"></div>
    <div class="acts"><button class="btn pri" id="sp">حفظ صور الفصل</button><button class="btn dan" id="cp2">مسح صور الفصل</button></div>
    <p style="color:var(--mut);font-size:13px">استخدم صور عندك حق نشرها فقط. بدون صور يعرض الموقع صفحات بديلة.</p></div>
    <div class="panel"><h2>فصول لها صور (${Object.keys(w.pages || {}).length})</h2><div class="tw"><table><tbody>${Object.entries(w.pages || {}).sort((a, b) => b[0] - a[0]).map(([n, p]) => `<tr><td>الفصل ${esc(n)}</td><td>${p.length} صورة</td><td><button class="btn sm" data-l="${esc(n)}">تحميل للتعديل</button></td></tr>`).join("") || `<tr><td class="empty">لا توجد</td></tr>`}</tbody></table></div></div>`;
  const loadCh = () => { const n = $("#cn").value; $("#pg").value = ((w.pages || {})[n] || []).join("\n"); };
  $("#sw").onchange = () => { selWork = +$("#sw").value; chaptersView(); };
  $("#cn").oninput = loadCh; loadCh();
  $("#ac").onclick = () => { w.chapters = +w.chapters + 1; persist(); toast("تمت إضافة فصل"); chaptersView(); };
  $("#sp").onclick = () => {
    const n = +$("#cn").value, lines = $("#pg").value.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!(n >= 1 && n <= w.chapters)) { $("#ce").textContent = "رقم الفصل خارج النطاق."; return; }
    if (lines.some((u) => !/^https?:\/\//i.test(u))) { $("#ce").textContent = "كل رابط لازم يبدأ بـ https://"; return; }
    w.pages = w.pages || {}; if (lines.length) w.pages[n] = lines; else delete w.pages[n];
    persist(); toast("تم الحفظ"); chaptersView();
  };
  $("#cp2").onclick = () => { delete (w.pages || {})[+$("#cn").value]; persist(); toast("تم المسح"); chaptersView(); };
  document.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => { $("#cn").value = b.dataset.l; loadCh(); }));
}

/* ---- الإعدادات ---- */
function exportText() {
  return "// تم التصدير من لوحة الإدارة\nconst WORKS = " + JSON.stringify(works, null, 1) + ";\n";
}
function exportData() {
  const url = URL.createObjectURL(new Blob([exportText()], { type: "text/javascript" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "data.js" }); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("تم تنزيل data.js");
}
function settings() {
  $("#v").innerHTML = `<div class="panel"><h2>البيانات</h2><div class="acts" style="margin-top:0"><button class="btn pri" id="ex">تصدير data.js</button><label class="btn" style="margin:0;cursor:pointer">استيراد data.js<input id="im" type="file" accept=".js,.json" hidden></label><button class="btn dan" id="rs">إعادة ضبط للبيانات الأصلية</button></div>
    <p style="color:var(--mut);font-size:13px">بعد التصدير ارفع data.js مكان القديم على GitHub ليظهر التحديث للجميع. التعديلات هنا تظهر على هذا المتصفح فقط.</p><pre class="code" id="pv"></pre></div>
    <div class="panel"><h2>الحساب</h2><p style="margin:0 0 8px">البريد: <b dir="ltr">${esc(OWNER_EMAIL)}</b></p>
    <div class="row2"><div><label for="np">كلمة مرور جديدة (٨ أحرف+)</label><input id="np" type="password" minlength="8" autocomplete="new-password"></div><div><label>&nbsp;</label><button class="btn" id="cpw" style="width:100%;justify-content:center">تغيير كلمة المرور</button></div></div>
    <div class="err" id="se" role="alert"></div>
    ${realProvider() ? "" : `<div class="warn">كلمة المرور محفوظة كتجزئة مشفرة (PBKDF2) في متصفحك فقط، وليست في الكود ولا على GitHub. لو نسيتها: امسح بيانات الموقع من المتصفح (وستفقد التعديلات غير المصدّرة).</div>`}</div>
    <div class="panel"><h2>ربط تسجيل دخول حقيقي لاحقا</h2><p style="color:var(--mut);margin:0">هذه اللوحة بوابة تجريبية. للحماية الحقيقية اربط Firebase Authentication أو Supabase Auth واسمح بالدخول لبريد المالك فقط، وخزّن الأعمال في قاعدة بيانات بقواعد أمان. الخطوات التفصيلية في README.</p></div>`;
  $("#pv").textContent = exportText().slice(0, 700) + (exportText().length > 700 ? "\n..." : "");
  $("#ex").onclick = exportData;
  $("#im").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const t = await f.text(); const m = t.match(/\[[\s\S]*\]/); const arr = JSON.parse(m[0]);
      if (!Array.isArray(arr) || arr.some((x) => !x.title || !x.type)) throw 0;
      works = arr; persist(); toast("تم الاستيراد"); settings();
    } catch { $("#se").textContent = "ملف غير صالح. لازم يكون data.js بصيغة JSON صحيحة."; }
  };
  $("#rs").onclick = () => { modal(`<h2>إعادة الضبط؟</h2><p style="color:var(--mut)">سيتم حذف تعديلاتك المحلية والرجوع لبيانات data.js الأصلية.</p><div class="acts"><button class="btn dan" id="y2">إعادة ضبط</button><button class="btn" id="n2">إلغاء</button></div>`); $("#n2").onclick = closeModal; $("#y2").onclick = () => { localStorage.removeItem(KEY_WORKS); works = JSON.parse(JSON.stringify(WORKS)); closeModal(); toast("تمت إعادة الضبط"); render(); }; };
  $("#cpw").onclick = async () => { const p = $("#np").value; if (p.length < 8) { $("#se").textContent = "٨ أحرف على الأقل."; return; } save(KEY_AUTH, await hash(p)); $("#np").value = ""; $("#se").textContent = ""; toast("تم تغيير كلمة المرور"); };
}
const h0 = location.hash.slice(1); if (["dash", "works", "chapters", "users", "sales", "community", "promo", "settings"].includes(h0)) view = h0;
(async () => {
  const rp = realProvider();
  if (rp && sessionStorage.getItem(KEY_SESSION)) {
    try { const s = await initSdk(rp); const m = await s.current(); if (!isOwner(m)) sessionStorage.removeItem(KEY_SESSION); } catch { sessionStorage.removeItem(KEY_SESSION); }
  }
  render();
})();
