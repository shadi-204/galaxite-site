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
let worksLoadedFromDb = false, worksLoadError = "";
let view = "dash", toastT;
const persist = () => save(KEY_WORKS, works);
const workIdFromTitle = (title) => String(title || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
async function loadWorksFromDatabase() {
  if (realProvider() !== "supabase") return false;
  const db = window.GALAXITE_SUPABASE_CLIENT;
  if (!db) throw new Error("اتصال قاعدة البيانات غير جاهز.");
  const { data, error } = await db.from("site_works")
    .select("id,title,type,genres,rating,status,description,chapter_count,cover_url,is_published,sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  works = (data || []).map((w) => ({
    id: w.id, title: w.title, type: w.type, genres: w.genres || [],
    rating: Number(w.rating || 0), status: w.status || "مستمر",
    desc: w.description || "", chapters: Number(w.chapter_count || 0),
    cover: w.cover_url || "", is_published: w.is_published, sort_order: w.sort_order
  }));
  worksLoadedFromDb = true; worksLoadError = "";
  return true;
}

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
    window.GALAXITE_SUPABASE_CLIENT = c;
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
      if (p === "supabase") {
        const { data: allowed, error: roleError } = await window.GALAXITE_SUPABASE_CLIENT.rpc("is_admin");
        if (roleError || allowed !== true) { await s.signOut(); $("#ge").textContent = "الحساب مسجل، لكن صلاحية المالك لم تُفعّل له في قاعدة البيانات بعد. تأكد من البريد أولًا."; return; }
      }
      if (p === "supabase") await loadWorksFromDatabase();
      sessionStorage.setItem(KEY_SESSION, "1"); render();
    } catch (error) { $("#ge").textContent = error?.message || "تعذر تسجيل الدخول. تأكد من البيانات والإعدادات."; }
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
    <label for="pw">كلمة المرور</label><span class="admin-pw"><input id="pw" type="password" required minlength="8" autocomplete="${auth ? "current-password" : "new-password"}"><button class="admin-pw-toggle" id="pw-toggle" type="button" aria-label="إظهار كلمة المرور" aria-pressed="false"><svg class="eye-open" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-closed" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A11 11 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.1 0 2.1-.2 3-.5"/></svg></button></span>
    ${auth ? "" : `<label for="pw2">تأكيد كلمة المرور</label><input id="pw2" type="password" required minlength="8" autocomplete="new-password">`}
    <div class="err" id="ge" role="alert"></div>
    <button class="btn pri" style="width:100%;justify-content:center;margin-top:8px">${auth ? "دخول" : "إنشاء كلمة المرور والدخول"}</button>
    <p style="text-align:center;margin:14px 0 0"><a href="index.html" style="color:var(--mut);font-size:13px">← العودة للموقع</a></p>
  </form></div>`;
  const adminPw = $("#pw"), adminToggle = $("#pw-toggle");
  if (adminPw && adminToggle) adminToggle.onclick = () => { const show = adminPw.type === "password"; adminPw.type = show ? "text" : "password"; adminToggle.setAttribute("aria-pressed", String(show)); adminToggle.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"); };
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
async function communityView() {
  const host = $("#v");
  host.innerHTML = '<div class="panel"><h2>بلاغات الأعمال والفصول</h2><p style="color:var(--mut)">جارٍ تحميل البلاغات...</p></div>';
  try {
    if (!window.GalaxiteReports) throw new Error("وحدة البلاغات غير محمّلة. حدّث الصفحة.");
    const reports = await window.GalaxiteReports.list();
    const open = reports.filter((r) => r.status === "open").length;
    const reviewing = reports.filter((r) => r.status === "reviewing").length;
    const resolved = reports.filter((r) => r.status === "resolved").length;
    const statusLabel = { open: "جديد", reviewing: "قيد المراجعة", resolved: "تم الإصلاح", dismissed: "تم التجاهل" };
    const typeLabel = { work: "عمل", chapter: "فصل", profile: "حساب", review: "مراجعة", comment: "تعليق" };
    const rows = reports.map((r) => {
      const safePath = typeof r.target_path === "string" && /^#\/[a-zA-Z0-9_./-]+$/.test(r.target_path) ? r.target_path : "";
      const target = esc(r.target_title || (typeLabel[r.target_type] || "محتوى") + " · " + r.target_id);
      const date = r.created_at ? new Date(r.created_at).toLocaleString("ar-EG") : "—";
      const actions = ["resolved", "dismissed"].includes(r.status)
        ? `<button class="btn sm" data-report-id="${esc(r.id)}" data-report-status="open">إعادة فتح</button>`
        : `<button class="btn sm pri" data-report-id="${esc(r.id)}" data-report-status="resolved">تم الإصلاح</button> <button class="btn sm dan" data-report-id="${esc(r.id)}" data-report-status="dismissed">تجاهل</button> <button class="btn sm" data-report-id="${esc(r.id)}" data-report-status="reviewing">قيد المراجعة</button>`;
      return `<tr>
        <td><b>${esc(typeLabel[r.target_type] || r.target_type)}</b><br><small style="color:var(--mut)">${esc(date)}</small></td>
        <td><b>${target}</b><br><small>${esc(r.reason)}</small>${r.details ? `<p style="margin:6px 0 0;color:var(--mut);white-space:pre-wrap">${esc(r.details)}</p>` : ""}</td>
        <td><span class="pill">${esc(statusLabel[r.status] || r.status)}</span></td>
        <td>${safePath ? `<a class="btn sm" href="index.html${esc(safePath)}" target="_blank" rel="noopener">فتح المحتوى</a>` : "—"}</td>
        <td>${actions}</td>
      </tr>`;
    }).join("");
    host.innerHTML = `
      <div class="stats">
        <div class="stat"><b>${reports.length}</b><span>كل البلاغات</span></div>
        <div class="stat"><b>${open}</b><span>بلاغات جديدة</span></div>
        <div class="stat"><b>${reviewing}</b><span>قيد المراجعة</span></div>
        <div class="stat"><b>${resolved}</b><span>تم إصلاحها</span></div>
      </div>
      <div class="panel"><h2>بلاغات المستخدمين</h2>
        <p style="color:var(--mut);margin:0 0 12px">البلاغات تظهر هنا بعد إرسالها من صفحة العمل أو الفصل. افتح المحتوى، أصلح المشكلة، ثم أغلق البلاغ.</p>
        <div class="tw"><table><thead><tr><th>النوع والتاريخ</th><th>المحتوى والسبب</th><th>الحالة</th><th>الرابط</th><th>الإجراء</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="empty">لا توجد بلاغات حتى الآن.</td></tr>'}</tbody></table></div>
      </div>`;
    host.onclick = async (event) => {
      const button = event.target.closest("[data-report-id]");
      if (!button) return;
      button.disabled = true;
      try {
        await window.GalaxiteReports.update(button.dataset.reportId, button.dataset.reportStatus);
        toast("تم تحديث حالة البلاغ");
        communityView();
      } catch (error) {
        button.disabled = false;
        toast(error?.message || "تعذر تحديث البلاغ");
      }
    };
  } catch (error) {
    host.innerHTML = `<div class="panel"><h2>تعذر تحميل البلاغات</h2><p style="color:var(--mut)">${esc(error?.message || "تحقق من اتصال قاعدة البيانات وصلاحيات حساب الإدارة.")}</p><button class="btn" id="retryReports">إعادة المحاولة</button></div>`;
    $("#retryReports").onclick = communityView;
  }
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
  if (realProvider() === "supabase" && !worksLoadedFromDb) {
    $("#v").innerHTML = `<div class="panel"><h2>إدارة الأعمال</h2><p class="empty">${esc(worksLoadError || "جارٍ تحميل الأعمال من قاعدة البيانات...")}</p><button class="btn" id="reloadWorks">إعادة المحاولة</button></div>`;
    $("#reloadWorks").onclick = async () => { try { await loadWorksFromDatabase(); worksView(); } catch (error) { worksLoadError = error.message; worksView(); } };
    return;
  }
  $("#v").innerHTML = `<div class="top" style="margin-top:-6px"><input id="sq" placeholder="ابحث..." style="max-width:260px"><button class="btn pri" id="add">+ إضافة عمل</button></div>
  <div class="panel"><div class="tw"><table><thead><tr><th></th><th>العنوان</th><th>النوع</th><th>الحالة</th><th>الفصول</th><th>التقييم</th><th>النشر</th><th></th></tr></thead><tbody id="tb"></tbody></table></div></div>`;
  const draw = () => {
    const q = $("#sq").value.trim().toLowerCase();
    const list = works.map((w, i) => ({ w, i })).filter(({ w }) => w.title.toLowerCase().includes(q));
    $("#tb").innerHTML = list.map(({ w, i }) => `<tr><td>${w.cover ? `<img class="thumb" src="${esc(w.cover)}" alt="" loading="lazy">` : `<div class="thumb" style="background:linear-gradient(135deg,#7c5cff,#ff5c9a)"></div>`}</td>
      <td dir="auto"><b>${esc(w.title)}</b></td><td><span class="pill">${w.type === "manga" ? "مانجا" : "مانهوا"}</span></td><td>${esc(w.status)}</td><td>${esc(w.chapters)}</td><td>${esc(w.rating)}</td>
      <td><span class="pill">${w.is_published === false ? "مخفي" : "منشور"}</span></td>
      <td style="white-space:nowrap"><button class="btn sm" data-e="${i}">تعديل</button> <button class="btn sm ${w.is_published === false ? "pri" : "dan"}" data-d="${i}">${w.is_published === false ? "نشر" : "إخفاء"}</button></td></tr>`).join("") || `<tr><td colspan="8" class="empty">لا توجد نتائج</td></tr>`;
    document.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => workForm(+b.dataset.e)));
    document.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => confirmDel(+b.dataset.d)));
  };
  $("#sq").oninput = draw; $("#add").onclick = () => workForm(); draw();
}
function modal(html) { document.body.insertAdjacentHTML("beforeend", `<div class="modal" id="md" role="dialog" aria-modal="true"><div class="box">${html}</div></div>`); $("#md").onclick = (e) => { if (e.target.id === "md") closeModal(); }; }
const closeModal = () => $("#md")?.remove();
function confirmDel(i) {
  const item = works[i];
  const publish = item.is_published === false;
  const action = publish ? "إعادة نشر" : "إخفاء";
  modal(`<h2>${action} العمل؟</h2><p style="color:var(--mut)">${publish ? "سيعود العمل للظهور للقراء." : "سيختفي العمل من الموقع مع الاحتفاظ بالفصول والبيانات."}</p><div class="acts"><button class="btn ${publish ? "pri" : "dan"}" id="yes">${action}</button><button class="btn" id="no">إلغاء</button></div>`);
  $("#no").onclick = closeModal;
  $("#yes").onclick = async () => {
    try {
      if (realProvider() === "supabase") {
        const db = window.GALAXITE_SUPABASE_CLIENT;
        const { error } = await db.from("site_works").update({ is_published: publish }).eq("id", item.id);
        if (error) throw error;
        await loadWorksFromDatabase();
      } else {
        item.is_published = publish; persist();
      }
      closeModal(); toast(publish ? "تم نشر العمل" : "تم إخفاء العمل"); render();
    } catch (error) { toast(error?.message || "تعذر تحديث العمل"); }
  };
}
function workForm(i) {
  if (realProvider() === "supabase" && !worksLoadedFromDb) { toast("بيانات الأعمال غير جاهزة"); return; }
  const w = i === undefined ? { id: null, title: "", type: "manga", genres: [], rating: 8, status: "مستمر", desc: "", cover: "", chapters: 0, is_published: true, sort_order: 0 } : works[i];
  modal(`<h2>${i === undefined ? "إضافة عمل" : "تعديل العمل"}</h2><form id="wf">
    <label for="t">العنوان</label><input id="t" required value="${esc(w.title)}">
    <div class="row2"><div><label for="ty">النوع</label><select id="ty"><option value="manga" ${w.type === "manga" ? "selected" : ""}>مانجا</option><option value="manhwa" ${w.type === "manhwa" ? "selected" : ""}>مانهوا</option></select></div>
    <div><label for="st">الحالة</label><select id="st">${["مستمر", "مكتمل", "متوقف"].map((s) => `<option ${w.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div></div>
    <div class="row2"><div><label for="ra">التقييم (0-10)</label><input id="ra" type="number" min="0" max="10" step="0.1" value="${esc(w.rating)}"></div>
    <div><label for="ch">عدد الفصول</label><input id="ch" type="number" min="0" value="${esc(w.chapters)}"></div></div>
    <label for="g">التصنيفات (مفصولة بفاصلة)</label><input id="g" list="gl" value="${esc((w.genres || []).join("، "))}"><datalist id="gl">${[...new Set(works.flatMap((x) => x.genres || []))].map((g) => `<option value="${esc(g)}"></option>`).join("")}</datalist><div class="gchips" id="gch">${[...new Set(works.flatMap((x) => x.genres || []))].map((g) => `<button type="button" class="btn sm" data-gc="${esc(g)}">+ ${esc(g)}</button>`).join(" ")}</div>
    <label for="d">الوصف</label><textarea id="d" rows="3">${esc(w.desc)}</textarea>
    <label for="c">رابط صورة الغلاف (https)</label><input id="c" type="url" placeholder="https://..." value="${esc(w.cover)}">
    <div id="cp" style="margin-top:8px"></div>
    <div class="err" id="fe" role="alert"></div>
    <div class="acts"><button class="btn pri">حفظ</button><button type="button" class="btn" id="cx">إلغاء</button></div></form>`);
  const prev = () => { const v = $("#c").value.trim(); $("#cp").innerHTML = /^https?:\/\//i.test(v) ? `<img class="thumb" style="width:70px;height:100px" src="${esc(v)}" alt="معاينة الغلاف" onerror="this.replaceWith(Object.assign(document.createElement('small'),{textContent:'تعذر تحميل الصورة'}))">` : ""; };
  document.querySelectorAll("[data-gc]").forEach((b) => (b.onclick = () => { const cur = $("#g").value.split(/[،,]/).map((s) => s.trim()).filter(Boolean); if (!cur.includes(b.dataset.gc)) cur.push(b.dataset.gc); $("#g").value = cur.join("، "); }));
  $("#c").oninput = prev; prev(); $("#cx").onclick = closeModal;
  $("#wf").onsubmit = async (e) => {
    e.preventDefault();
    const title = $("#t").value.trim(), cover = $("#c").value.trim();
    if (!title) return;
    if (cover && !/^https?:\/\//i.test(cover)) { $("#fe").textContent = "رابط الغلاف لازم يبدأ بـ https://"; return; }
    if (works.some((x, k) => k !== i && x.title.toLowerCase() === title.toLowerCase())) { $("#fe").textContent = "فيه عمل بنفس العنوان."; return; }
    if (i === undefined && works.some((x) => x.id === workIdFromTitle(title))) { $("#fe").textContent = "معرّف العمل موجود بالفعل. اختار عنوانًا مختلفًا أو عدّل العمل الموجود."; return; }
    const n = { ...w, title, type: $("#ty").value, status: $("#st").value, rating: +$("#ra").value || 0, chapters: Math.max(0, +$("#ch").value || 0), genres: $("#g").value.split(/[،,]/).map((s) => s.trim()).filter(Boolean), desc: $("#d").value.trim(), cover };
    try {
      if (realProvider() === "supabase") {
        const db = window.GALAXITE_SUPABASE_CLIENT;
        const payload = {
          id: n.id || workIdFromTitle(title), title: n.title, type: n.type, genres: n.genres,
          rating: n.rating, status: n.status, description: n.desc, chapter_count: n.chapters,
          cover_url: n.cover || null, is_published: n.is_published !== false,
          sort_order: Number.isInteger(n.sort_order) ? n.sort_order : (i === undefined ? Math.max(0, ...works.map((x) => Number(x.sort_order) || 0)) + 1 : i)
        };
        const { error } = await db.from("site_works").upsert(payload, { onConflict: "id" });
        if (error) throw error;
        await loadWorksFromDatabase();
      } else {
        if (!n.cover) delete n.cover;
        if (i === undefined) works.unshift(n); else works[i] = n;
        persist();
      }
      closeModal(); toast("تم حفظ العمل في قاعدة البيانات"); render();
    } catch (error) { $("#fe").textContent = error?.message || "تعذر حفظ العمل."; }
  };
}

/* ---- الفصول ---- */
let selWork = 0;
async function chaptersView() {
  if (realProvider() === "supabase" && !worksLoadedFromDb) {
    $("#v").innerHTML = '<div class="panel"><h2>إدارة الفصول</h2><p class="empty">بيانات الأعمال غير جاهزة.</p></div>';
    return;
  }
  if (!works.length) { $("#v").innerHTML = `<div class="panel empty">أضف عملا أولا.</div>`; return; }
  selWork = Math.min(selWork, works.length - 1);
  const w = works[selWork], db = window.GALAXITE_SUPABASE_CLIENT;
  if (!db) { $("#v").innerHTML = '<div class="panel empty">إدارة الفصول تحتاج اتصال Supabase.</div>'; return; }
  $("#v").innerHTML = '<div class="panel"><p class="empty">جارٍ تحميل الفصول...</p></div>';
  try {
    const { data: chapters, error } = await db.from("site_chapters")
      .select("id,chapter_number,title,is_published,is_premium,created_at")
      .eq("work_id", w.id).order("chapter_number", { ascending: false }).limit(500);
    if (error) throw error;
    const ids = (chapters || []).map((x) => x.id);
    let pageCounts = {};
    if (ids.length) {
      const { data: pages, error: pageError } = await db.from("site_chapter_pages")
        .select("chapter_id,page_number").in("chapter_id", ids);
      if (pageError) throw pageError;
      for (const page of pages || []) pageCounts[page.chapter_id] = (pageCounts[page.chapter_id] || 0) + 1;
    }
    $("#v").innerHTML = `
      <div class="panel">
        <label for="sw" style="margin-top:0">اختر العمل</label>
        <select id="sw">${works.map((x, i) => `<option value="${i}" ${i === selWork ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select>
        <h3 style="margin:18px 0 8px">إضافة / تعديل فصل</h3>
        <input id="chapter-id" type="hidden">
        <div class="row2"><div><label for="cn">رقم الفصل</label><input id="cn" type="number" min="1" step="1" value="${Math.max(1, w.chapters + 1)}"></div>
        <div><label for="ct">عنوان الفصل (اختياري)</label><input id="ct" placeholder="الفصل 201"></div></div>
        <div class="row2">
          <label class="sw"><input id="pub" type="checkbox"> نشر الفصل</label>
          <label class="sw"><input id="prem" type="checkbox"> فصل مدفوع</label>
        </div>
        <label for="chapter-files">صور الفصل بالترتيب (يمكن اختيار أكثر من صورة)</label>
        <input id="chapter-files" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif">
        <label class="sw" style="margin-top:10px"><input id="replace-pages" type="checkbox"> استبدال الصور القديمة بدل إضافة صور جديدة</label>
        <p style="color:var(--mut);font-size:12px;margin:8px 0">الصور تُرفع إلى التخزين الخاص في Galaxite. الحد الأقصى للصورة الواحدة 15MB. لا ترفع إلا صفحات تملك حق استخدامها.</p>
        <div class="err" id="ce" role="alert"></div>
        <div class="acts"><button class="btn pri" id="saveChapter">حفظ الفصل والصور</button><button class="btn" id="clearChapter">تفريغ النموذج</button></div>
      </div>
      <div class="panel"><h3>فصول ${esc(w.title)} <small style="color:var(--mut)">آخر 500 فصل</small></h3>
        <div class="tw"><table><thead><tr><th>الفصل</th><th>الحالة</th><th>الصفحات</th><th>النوع</th><th></th></tr></thead><tbody>
        ${(chapters || []).map((x) => `<tr><td>${esc(x.chapter_number)} · ${esc(x.title || "")}</td><td><span class="pill">${x.is_published ? "منشور" : "مسودة"}</span></td><td>${pageCounts[x.id] || 0}</td><td>${x.is_premium ? "مدفوع" : "مجاني"}</td><td><button class="btn sm" data-edit-chapter="${esc(x.id)}">تعديل</button></td></tr>`).join("") || '<tr><td colspan="5" class="empty">لا توجد فصول مسجلة.</td></tr>'}
        </tbody></table></div>
      </div>`;
    $("#sw").onchange = () => { selWork = +$("#sw").value; chaptersView(); };
    const clearForm = () => { $("#chapter-id").value = ""; $("#cn").value = Math.max(1, w.chapters + 1); $("#ct").value = ""; $("#pub").checked = false; $("#prem").checked = false; $("#chapter-files").value = ""; $("#replace-pages").checked = false; $("#ce").textContent = ""; };
    $("#clearChapter").onclick = clearForm;
    document.querySelectorAll("[data-edit-chapter]").forEach((button) => {
      button.onclick = () => {
        const chapter = chapters.find((x) => x.id === button.dataset.editChapter);
        if (!chapter) return;
        $("#chapter-id").value = chapter.id;
        $("#cn").value = chapter.chapter_number;
        $("#ct").value = chapter.title || "";
        $("#pub").checked = !!chapter.is_published;
        $("#prem").checked = !!chapter.is_premium;
        $("#chapter-files").value = "";
        $("#replace-pages").checked = false;
        $("#ce").textContent = "";
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
    });
    $("#saveChapter").onclick = async () => {
      const number = Number($("#cn").value);
      const title = $("#ct").value.trim();
      const files = Array.from($("#chapter-files").files || []);
      const replacePages = $("#replace-pages").checked;
      const err = $("#ce"), save = $("#saveChapter");
      err.textContent = "";
      if (!Number.isInteger(number) || number < 1) { err.textContent = "رقم الفصل لازم يكون رقمًا صحيحًا أكبر من صفر."; return; }
      if (files.some((file) => !["image/jpeg","image/png","image/webp","image/avif"].includes(file.type) || file.size > 15 * 1024 * 1024)) {
        err.textContent = "استخدم صور JPG أو PNG أو WEBP أو AVIF، وبحد أقصى 15MB للصورة."; return;
      }
      save.disabled = true; save.textContent = "جارٍ الحفظ...";
      let uploaded = [], oldPages = [], chapterId = "", pagesCommitted = false;
      try {
        const { data: savedChapter, error: chapterError } = await db.from("site_chapters").upsert({
          work_id: w.id, chapter_number: number, title: title || null,
          is_published: $("#pub").checked, is_premium: $("#prem").checked
        }, { onConflict: "work_id,chapter_number" }).select("id").single();
        if (chapterError) throw chapterError;
        chapterId = savedChapter.id;
        if (replacePages && !files.length) throw new Error("اختار الصور الجديدة قبل استبدال الصور القديمة.");
        if (files.length) {
          const { data: old, error: oldError } = await db.from("site_chapter_pages")
            .select("id,page_number,storage_path").eq("chapter_id", chapterId).order("page_number");
          if (oldError) throw oldError;
          oldPages = old || [];
          const startAt = replacePages ? 0 : oldPages.length;
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "page";
            const storagePath = `${w.id}/${number}/${Date.now()}-${i}-${safeName}`;
            const { error: uploadError } = await db.storage.from("galaxite-chapters")
              .upload(storagePath, file, { contentType: file.type, upsert: false });
            if (uploadError) throw uploadError;
            uploaded.push({ page_number: startAt + i + 1, storage_path: storagePath });
          }
          if (replacePages && oldPages.length) {
            const { error: deleteError } = await db.from("site_chapter_pages").delete().eq("chapter_id", chapterId);
            if (deleteError) throw deleteError;
          }
          const { error: insertError } = await db.from("site_chapter_pages").insert(
            uploaded.map((page) => ({ chapter_id: chapterId, page_number: page.page_number, storage_path: page.storage_path }))
          );
          if (insertError) {
            if (replacePages && oldPages.length) await db.from("site_chapter_pages").insert(oldPages);
            throw insertError;
          }
          pagesCommitted = true;
          if (replacePages && oldPages.length) {
            await db.storage.from("galaxite-chapters").remove(oldPages.map((page) => page.storage_path));
          }
        }
        if (number > w.chapters) {
          const { error: countError } = await db.from("site_works").update({ chapter_count: number }).eq("id", w.id);
          if (countError) throw countError;
        }
        await loadWorksFromDatabase();
        toast(files.length ? "تم حفظ الفصل ورفع الصور" : "تم حفظ بيانات الفصل");
        chaptersView();
      } catch (error) {
        if (uploaded.length && !pagesCommitted) await db.storage.from("galaxite-chapters").remove(uploaded.map((page) => page.storage_path));
        err.textContent = error?.message || "تعذر حفظ الفصل. لم يتم اعتماد العملية.";
      } finally {
        save.disabled = false; save.textContent = "حفظ الفصل والصور";
      }
    };
  } catch (error) {
    $("#v").innerHTML = `<div class="panel"><h2>تعذر تحميل الفصول</h2><p class="empty">${esc(error?.message || "تحقق من صلاحيات الحساب.")}</p><button class="btn" id="retryChapters">إعادة المحاولة</button></div>`;
    $("#retryChapters").onclick = chaptersView;
  }
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
  $("#v").innerHTML = `
    <div class="panel"><h2>حالة النظام</h2>
      <div class="stats">
        <div class="stat"><b>${works.length}</b><span>عمل في قاعدة البيانات</span></div>
        <div class="stat"><b>${works.filter((w) => w.is_published !== false).length}</b><span>عمل منشور</span></div>
        <div class="stat"><b>Supabase</b><span>قاعدة البيانات</span></div>
      </div>
      <p style="color:var(--mut);line-height:1.9;margin:0">الأعمال والفصول وبلاغات المحتوى تُحفظ مركزيًا في قاعدة البيانات والتخزين، وأي تعديل ناجح يظهر للمستخدمين بعد تحديث الموقع. لا تعتمد هذه اللوحة على تصدير data.js لحفظ التعديلات.</p>
    </div>
    <div class="panel"><h2>الحساب والأمان</h2>
      <p style="margin:0 0 12px">حساب المالك: <b dir="ltr">${esc(OWNER_EMAIL)}</b></p>
      <label for="np">كلمة مرور جديدة (٨ أحرف على الأقل)</label>
      <div class="acts"><input id="np" type="password" minlength="8" autocomplete="new-password" style="flex:1;min-width:200px"><button class="btn pri" id="cpw">تغيير كلمة المرور</button></div>
      <div class="err" id="se" role="alert"></div>
      <p style="color:var(--mut);font-size:12px;margin:10px 0 0">تغيير كلمة المرور يتم مباشرة عبر Supabase Auth. لا تشارك كلمة المرور أو مفاتيح الإدارة في المحادثات.</p>
    </div>
    <div class="panel"><h2>حالة النسخة</h2>
      <p style="color:var(--mut);line-height:1.9;margin:0">الموقع المنشور لا يتأثر بتعديلات فرع التطوير إلا بعد اعتمادها ونشرها. يتم اختبار ملفات JavaScript تلقائيًا قبل دمج التغييرات.</p>
    </div>`;
  $("#cpw").onclick = async () => {
    const password = $("#np").value;
    const errorBox = $("#se");
    if (password.length < 8) { errorBox.textContent = "كلمة المرور لازم تكون ٨ أحرف على الأقل."; return; }
    const db = window.GALAXITE_SUPABASE_CLIENT;
    if (!db) { errorBox.textContent = "اتصال Supabase غير متاح."; return; }
    $("#cpw").disabled = true; errorBox.textContent = "جارٍ تحديث كلمة المرور...";
    try {
      const { error } = await db.auth.updateUser({ password });
      if (error) throw error;
      $("#np").value = ""; errorBox.textContent = "تم تحديث كلمة المرور بنجاح.";
    } catch (error) {
      errorBox.textContent = error?.message || "تعذر تغيير كلمة المرور.";
    } finally { $("#cpw").disabled = false; }
  };
}
const h0 = location.hash.slice(1); if (["dash", "works", "chapters", "users", "sales", "community", "promo", "settings"].includes(h0)) view = h0;
(async () => {
  const rp = realProvider();
  if (rp && sessionStorage.getItem(KEY_SESSION)) {
    try {
      const s = await initSdk(rp); const m = await s.current();
      let allowed = true;
      if (rp === "supabase" && m) { const result = await window.GALAXITE_SUPABASE_CLIENT.rpc("is_admin"); allowed = !result.error && result.data === true; }
      if (!isOwner(m) || !allowed) sessionStorage.removeItem(KEY_SESSION);
      else if (rp === "supabase") await loadWorksFromDatabase();
    } catch { sessionStorage.removeItem(KEY_SESSION); }
  }
  render();
})();
