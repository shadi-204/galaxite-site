/* حسابات القراء + الملف الشخصي + العملات والمتجر. بدون مفاتيح يعمل كله تجريبيا في متصفحك فقط. */
(() => {
const CFG = window.AUTH_CONFIG || { provider: "demo" };
const PAY = window.PAY_CONFIG || { provider: "demo", packs: [] };
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ls = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const AVATARS = ["g0", "g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11"];
const GR = (i) => { const h = (+String(i).slice(1) || 0) * 30; return `linear-gradient(135deg,hsl(${h},75%,58%),hsl(${(h + 50) % 360},70%,38%))`; };
const avatar = (u, cls = "") => `<span class="avg ${cls}" style="background:${GR(u.avatar)}">${esc([...(u.name || "؟")][0])}</span>`;
const LOCK_LAST = 3, LOCK_COST = 15, VIP_DAYS = 30, DAILY = 10;
const icon = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  user: icon('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'),
  store: icon('<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>'),
  lock: icon('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>'),
  medal: icon('<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>'),
  gift: icon('<rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M5 12v9h14v-9"/><path d="M12 8c-3 0-4-4-1.5-4S12 8 12 8zM12 8c3 0 4-4 1.5-4S12 8 12 8z"/>')
};
const coin = `<span class="coin" aria-hidden="true">C</span>`;

/* ---------- كلمات المرور: تجزئة في المتصفح (للوضع التجريبي فقط) ---------- */
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function hash(pw, saltB64) {
  const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, key, 256);
  return { salt: b64(salt), hash: b64(bits) };
}

/* ---------- محولات المزوّد: demo / firebase / supabase ---------- */
const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load")); document.head.appendChild(s); });
const realProvider = () => (CFG.provider === "firebase" && CFG.firebase?.apiKey) ? "firebase" : (CFG.provider === "supabase" && CFG.supabase?.url && CFG.supabase?.anonKey) ? "supabase" : null;
let sdk = null;
async function getSdk() {
  if (sdk) return sdk;
  const p = realProvider();
  if (p === "firebase") {
    await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
    await loadScript("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js");
    firebase.initializeApp(CFG.firebase);
    const a = firebase.auth();
    sdk = {
      signUp: async (e, pw) => (await a.createUserWithEmailAndPassword(e, pw)).user.email,
      signIn: async (e, pw) => (await a.signInWithEmailAndPassword(e, pw)).user.email,
      google: async () => (await a.signInWithPopup(new firebase.auth.GoogleAuthProvider())).user.email,
      reset: (e) => a.sendPasswordResetEmail(e),
      signOut: () => a.signOut(),
      current: () => new Promise((r) => { const u = a.onAuthStateChanged((x) => { u(); r(x ? x.email : null); }); })
    };
  } else if (p === "supabase") {
    const c = await window.GALAXITE_GET_SUPABASE_CLIENT?.();
    if (!c) throw new Error("supabase_unavailable");
    const ok = ({ data, error }) => { if (error) throw error; return data; };
    // Supabase emits PASSWORD_RECOVERY after a valid recovery link is exchanged for a session.
    c.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        window.GALAXITE_PASSWORD_RECOVERY = true;
        setTimeout(() => window.GALAXITE_SHOW_PASSWORD_RECOVERY?.(), 0);
      }
    });
    sdk = {
      signUp: async (e, pw) => { const data = ok(await c.auth.signUp({ email: e, password: pw })); return { email: data.user?.email || e, needsConfirmation: !data.session }; },
      signIn: async (e, pw) => ok(await c.auth.signInWithPassword({ email: e, password: pw })).user.email,
      google: async () => {
        // GitHub Pages hosts this site under /galaxite-site/, not at the domain root.
        // Send Supabase back to the current deployed site path after Google OAuth.
        const redirectTo = new URL("./", window.location.href);
        redirectTo.search = "";
        redirectTo.hash = "";
        ok(await c.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: redirectTo.toString() }
        }));
        return null;
      },
      reset: async (e) => {
        const redirectTo = new URL("./", window.location.href);
        redirectTo.search = "";
        redirectTo.hash = "";
        return ok(await c.auth.resetPasswordForEmail(e, { redirectTo: redirectTo.toString() }));
      },
      updatePassword: async (password) => ok(await c.auth.updateUser({ password })),
      resend: async (e) => ok(await c.auth.resend({ type: "signup", email: e })),
      currentUser: async () => ok(await c.auth.getUser()).user,
      signOut: () => c.auth.signOut(),
      current: async () => (await c.auth.getSession()).data.session?.user?.email || null
    };
  }
  return sdk;
}

/* ---------- حالة المستخدم ---------- */
let session = ls.get("vx-session", null);       // البريد أو null
let authUserId = null;
const keyOf = (e) => "vx-u:" + String(e).toLowerCase();
const blank = (email, name) => ({ email, name: name || String(email).split("@")[0], bio: "", avatar: AVATARS[0], coins: 20, vipUntil: 0, unlocked: [], tx: [{ t: Date.now(), d: "هدية الترحيب", c: 20 }], xp: 0, read: [], daily: { last: "", streak: 0 }, joined: Date.now() });
const me = () => session ? { ...blank(session), ...ls.get(keyOf(session), {}) } : null;
const put = (u) => {
  ls.set(keyOf(u.email), u);
  refreshHead();
  if (authUserId && realProvider() === "supabase") {
    window.GALAXITE_GET_SUPABASE_CLIENT?.().then((db) => db?.from("profiles")
      .update({ display_name: u.name || String(u.email).split("@")[0], bio: u.bio || "" })
      .eq("id", authUserId))
      .then(({ error }) => { if (error) console.warn("Galaxite profile sync failed.", error); })
      .catch((error) => console.warn("Galaxite profile sync failed.", error));
  }
};
const isVip = (u) => u && u.vipUntil > Date.now();
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- الفصول المقفولة ---------- */
const premium = (w, ch) => {
  if (Array.isArray(w.publishedChapters)) {
    const row = w.publishedChapters.find((item) => Number(item.chapter_number ?? item.number) === Number(ch));
    return row ? Boolean(row.is_premium) : false;
  }
  return w.premiumFrom ? ch >= w.premiumFrom : (w.status === "مستمر" && w.chapters > 10 && ch > w.chapters - LOCK_LAST);
};
const lockKey = (w, ch) => w.title + "#" + ch;
const locked = (w, ch) => { if (!premium(w, ch)) return false; const u = me(); return !(u && (isVip(u) || u.unlocked.includes(lockKey(w, ch)))); };

/* ---------- واجهة صغيرة ---------- */
function toast(m, kind = "") { document.querySelector(".vtoast")?.remove(); document.body.insertAdjacentHTML("beforeend", `<div class="vtoast ${kind}" role="status">${esc(m)}</div>`); setTimeout(() => document.querySelector(".vtoast")?.remove(), 2600); }
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function confetti(n = 46) {
  if (reduce()) return;
  const box = document.createElement("div"); box.className = "confetti"; box.setAttribute("aria-hidden", "true");
  const cols = ["#7c5cff", "#ff5c9a", "#ffc857", "#3ddc84", "#4cc9f0"];
  for (let i = 0; i < n; i++) { const s = document.createElement("i"); s.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % 5]};--dx:${(Math.random() - .5) * 220}px;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * .25}s;animation-duration:${1.1 + Math.random() * .9}s`; box.appendChild(s); }
  document.body.appendChild(box); setTimeout(() => box.remove(), 2400);
}
function countUp(el) {
  const to = +el.dataset.to || 0; if (reduce() || to < 2) { el.textContent = to; return; }
  const t0 = performance.now(); const f = (t) => { const p = Math.min(1, (t - t0) / 800); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); }; requestAnimationFrame(f);
}
function reveal(root = document) {
  const els = [...root.querySelectorAll(".rv:not(.in)")];
  if (!("IntersectionObserver" in window) || reduce()) { els.forEach((e) => e.classList.add("in")); root.querySelectorAll("[data-to]").forEach(countUp); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); e.target.querySelectorAll?.("[data-to]").forEach(countUp); if (e.target.dataset.to) countUp(e.target); io.unobserve(e.target); } }), { threshold: .12 });
  els.forEach((e, i) => { e.style.setProperty("--d", (i % 8) * 55 + "ms"); io.observe(e); });
}
let sweepT;
addEventListener("scroll", () => { if (sweepT) return; sweepT = setTimeout(() => { sweepT = 0; document.querySelectorAll(".rv:not(.in)").forEach((e) => { if (e.getBoundingClientRect().top < innerHeight * 0.96) { e.classList.add("in"); e.querySelectorAll("[data-to]").forEach(countUp); if (e.dataset.to) countUp(e); } }); }, 80); }, { passive: true });
function tilt(root = document) {
  if (reduce() || !matchMedia("(hover:hover)").matches) return;
  root.querySelectorAll(".tilt").forEach((el) => {
    el.onpointermove = (e) => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; el.style.transform = `perspective(700px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-4px)`; };
    el.onpointerleave = () => { el.style.transform = ""; };
  });
}
document.addEventListener("pointerdown", (e) => {
  const b = e.target.closest(".cta,.btn"); if (!b || reduce()) return;
  const r = b.getBoundingClientRect(), s = document.createElement("span"); s.className = "ripple";
  s.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px`; b.appendChild(s); setTimeout(() => s.remove(), 600);
});

/* ---------- الهيدر: العملات والحساب ---------- */
function refreshHead() {
  const slot = $("#acct"); if (!slot) return;
  const u = me();
  slot.innerHTML = u
    ? `<a class="coinchip" href="#/store" aria-label="المتجر. رصيدك ${u.coins} عملة">${coin}<b>${u.coins}</b></a><a class="avchip" href="#/profile" aria-label="الملف الشخصي">${avatar(u)}</a>`
    : `<a class="btn ghost" href="#/store" aria-label="المتجر">${I.store}</a><a class="btn solid" href="#/login">دخول</a>`;
  document.querySelectorAll("#bnav a[data-r='profile'] span").forEach((s) => (s.textContent = u ? "حسابي" : "دخول"));
  document.querySelectorAll("#bnav a[data-r='profile']").forEach((a) => (a.href = u ? "#/profile" : "#/login"));
}

/* ---------- صفحة الدخول والتسجيل ---------- */
let mode = "in";
function loginPage(next) {
  const real = realProvider();
  const m = mode;
  $("#app").innerHTML = `<div class="authwrap rv"><div class="authside"><h2>${m === "in" ? "أهلاً بعودتك" : "انضم لGalaxite"}</h2>
    <p>${m === "in" ? "سجّل دخولك لتحفظ تقدمك ومفضلتك وعملاتك." : "حساب مجاني: مفضلة، متابعة القراءة، عملات ترحيب 20، ومكافأة يومية."}</p>
    <ul class="perks"><li>مفضلة وتقدم القراءة على حسابك</li><li>مكافأة يومية وعملات لفتح الفصول المميزة</li><li>مستويات وشارات حسب قراءتك</li></ul>
    ${real ? "" : `<p class="note">وضع تجريبي: الحساب محفوظ في هذا المتصفح فقط. اربط Firebase أو Supabase في auth-config.js لحسابات حقيقية.</p>`}</div>
    <form class="authform" id="af" novalidate><div class="seg" role="tablist"><button type="button" role="tab" aria-selected="${m === "in"}" data-m="in" class="${m === "in" ? "on" : ""}">دخول</button><button type="button" role="tab" aria-selected="${m === "up"}" data-m="up" class="${m === "up" ? "on" : ""}">حساب جديد</button></div>
    ${m === "up" ? `<label>الاسم<input id="an" autocomplete="nickname" maxlength="24" placeholder="اسمك في الموقع"></label>` : ""}
    <label>البريد الإلكتروني<input id="ae" type="email" autocomplete="email" inputmode="email" dir="ltr" placeholder="you@example.com"></label>
    <label>كلمة المرور<span class="authpw"><input id="ap" type="password" autocomplete="${m === "in" ? "current-password" : "new-password"}" dir="ltr" placeholder="8 أحرف على الأقل"><button class="authpw-toggle" id="ap-toggle" type="button" aria-label="إظهار كلمة المرور" aria-pressed="false"><svg class="eye-open" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-closed" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A11 11 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.1 0 2.1-.2 3-.5"/></svg></button></span></label>
    <p class="err" id="ae-err" role="alert" hidden></p>
    <button class="cta" id="asub" type="button">${m === "in" ? "دخول" : "إنشاء الحساب"}</button>
    ${m === "in" ? `<button type="button" class="lnk" id="forgot">نسيت كلمة المرور؟</button>` : ""}
    <div class="or"><span>أو</span></div>
    <button type="button" class="btn ghost wide" id="gg" ${real ? "" : "disabled"}>متابعة بحساب Google ${real ? "" : "<small>(يتطلب Firebase أو Supabase)</small>"}</button></form></div>`;
  reveal();
  const pwInput = $("#ap"), pwToggle = $("#ap-toggle");
  if (pwInput && pwToggle) pwToggle.onclick = () => {
    const show = pwInput.type === "password";
    pwInput.type = show ? "text" : "password";
    pwToggle.setAttribute("aria-pressed", String(show));
    pwToggle.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
  };
  document.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => { mode = b.dataset.m; loginPage(next); }));
  const err = (t) => { document.getElementById("resend-confirmation")?.remove(); const e = $("#ae-err"); e.textContent = t; e.hidden = !t; };
  const submit = async () => {
    err("");
    const email = $("#ae").value.trim().toLowerCase(), pw = $("#ap").value, name = $("#an")?.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err("اكتب بريد إلكتروني صحيح.");
    if (pw.length < 8) return err("كلمة المرور لازم 8 أحرف على الأقل.");
    const btn = $("#asub"); btn.disabled = true; btn.textContent = "لحظة...";
    try {
      if (real) {
        const s = await getSdk();
        if (mode === "up") {
          const result = await s.signUp(email, pw);
          if (result && typeof result === "object" && result.needsConfirmation) {
            err("تم إنشاء الحساب. افتح رسالة التأكيد التي وصلتك على البريد، وبعد تأكيده ارجع وسجّل الدخول.");
            btn.disabled = false; btn.textContent = "إنشاء الحساب";
            return;
          }
          const signedEmail = typeof result === "string" ? result : (result?.email || email);
          await finish(signedEmail, name, next);
        } else {
          const signedEmail = await s.signIn(email, pw);
          await finish(signedEmail || email, name, next);
        }
      } else {
        const users = ls.get("vx-users", {});
        if (mode === "up") {
          if (users[email]) throw new Error("exists");
          users[email] = await hash(pw); ls.set("vx-users", users);
          await finish(email, name, next);
        } else {
          const rec = users[email]; if (!rec) throw new Error("nouser");
          if ((await hash(pw, rec.salt)).hash !== rec.hash) throw new Error("bad");
          await finish(email, name, next);
        }
      }
    } catch (x) {
      const raw = String(x?.message || "");
      const lower = raw.toLowerCase();
      const code = String(x?.code || x?.error_code || "").toLowerCase();
      console.warn("Galaxite account action failed:", code || "unknown", raw);
      let msg = {
        exists: "البريد ده مسجل قبل كده. جرّب تسجل دخول.",
        nouser: ((document.getElementById("ae")||{}).value||"").trim().toLowerCase() === String((window.AUTH_CONFIG||{}).ownerEmail||"").toLowerCase() ? "ده بريد لوحة الإدارة، مش حساب قارئ. افتح لوحة الإدارة بحساب Owner الحقيقي. وهنا استخدم حساب قارئ عادي." : "مفيش حساب بالبريد ده. اعمل حساب جديد.",
        bad: "كلمة المرور غير صحيحة. راجعها وحاول تاني."
      }[x.message];
      if (!msg && (code === "email_not_confirmed" || lower.includes("email not confirmed") || lower.includes("email_not_confirmed"))) {
        msg = "الحساب لسه محتاج تأكيد البريد. افتح رسالة التأكيد اللي وصلت على بريدك، واضغط رابط التأكيد، وبعدها ارجع سجّل دخول.";
      }
      if (!msg && (code === "invalid_credentials" || lower.includes("invalid login credentials"))) {
        msg = "البريد أو كلمة المرور غير صحيحة. تأكد من البيانات، أو استخدم «نسيت كلمة المرور؟».";
      }
      if (!msg && (lower.includes("user already registered") || lower.includes("already registered"))) {
        msg = "البريد مسجل بالفعل. ارجع لتبويب دخول بدل إنشاء حساب جديد.";
      }
      if (!msg && (lower.includes("password") && (lower.includes("at least") || lower.includes("characters") || lower.includes("weak")))) {
        msg = "كلمة المرور لا تحقق شروط الأمان المطلوبة. استخدم ٨ أحرف على الأقل.";
      }
      if (!msg && (x.message === "supabase_unavailable" || x.message === "load" || lower.includes("cdn") || lower.includes("network") || lower.includes("fetch") || lower.includes("timed out"))) {
        msg = "تعذر تحميل خدمة تسجيل الدخول أو الاتصال بها. جرّب تحديث الصفحة، وتأكد من اتصال الإنترنت، ثم أعد المحاولة.";
      }
      if (!msg) msg = "حصلت مشكلة أثناء تسجيل الدخول أو إنشاء الحساب. راجع البيانات وحاول مرة أخرى.";
      err(msg);
      if (code === "email_not_confirmed" || lower.includes("email not confirmed") || lower.includes("email_not_confirmed")) {
        const resend = document.createElement("button");
        resend.id = "resend-confirmation";
        resend.type = "button";
        resend.className = "lnk";
        resend.textContent = "إعادة إرسال رسالة التأكيد";
        resend.onclick = async () => {
          resend.disabled = true;
          resend.textContent = "جارٍ الإرسال...";
          try {
            await (await getSdk()).resend(email);
            err("طلبنا إرسال رسالة تأكيد جديدة. راجع صندوق الوارد والرسائل غير المرغوب فيها.");
          } catch (resendError) {
            console.warn("Galaxite confirmation resend failed:", resendError);
            err("تعذر إرسال رسالة التأكيد الآن. حاول لاحقًا أو راجع إعدادات البريد.");
            resend.disabled = false;
            resend.textContent = "إعادة إرسال رسالة التأكيد";
            $("#ae-err").insertAdjacentElement("afterend", resend);
          }
        };
        $("#ae-err").insertAdjacentElement("afterend", resend);
      }
      btn.disabled = false;
      btn.textContent = mode === "in" ? "دخول" : "إنشاء الحساب";
    }
  };
  $("#asub").onclick = submit;
  $("#af").onsubmit = (ev) => { ev.preventDefault(); submit(); };
  $("#af").onkeydown = (ev) => { if (ev.key === "Enter" && ev.target.tagName === "INPUT") { ev.preventDefault(); submit(); } };
  if ($("#forgot")) $("#forgot").onclick = async () => {
    const email = $("#ae").value.trim(); if (!email) return err("اكتب بريدك الأول.");
    if (!real) return err("استرجاع كلمة المرور يحتاج Firebase أو Supabase. في الوضع التجريبي امسح بيانات الموقع من المتصفح.");
    try { await (await getSdk()).reset(email); toast("بعتنا رابط الاسترجاع لبريدك"); } catch { err("تعذر إرسال الرابط."); }
  };
  $("#gg").onclick = async () => { if (!real) return; try { const e = await (await getSdk()).google(); if (e) await finish(e, "", next); } catch { err("تعذر الدخول بـ Google."); } };
}
function passwordRecoveryPage() {
  const real = realProvider();
  if (!real || real !== "supabase") return;
  $("#app").innerHTML = `<div class="authwrap rv"><div class="authside"><h2>تعيين كلمة مرور جديدة</h2><p>اكتب كلمة المرور الجديدة لحسابك، وبعد الحفظ تقدر تسجّل دخولك بيها.</p><ul class="perks"><li>استخدم ٨ أحرف على الأقل</li><li>اختار كلمة مرور قوية ومختلفة</li></ul></div>
    <form class="authform" id="recovery-form" novalidate>
      <label>كلمة المرور الجديدة<span class="authpw"><input id="new-password" type="password" autocomplete="new-password" dir="ltr" placeholder="٨ أحرف على الأقل"><button class="authpw-toggle" type="button" data-eye="new-password" aria-label="إظهار كلمة المرور" aria-pressed="false"><svg class="eye-open" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-closed" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A11 11 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.1 0 2.1-.2 3-.5"/></svg></button></span></label>
      <label>تأكيد كلمة المرور<input id="confirm-password" type="password" autocomplete="new-password" dir="ltr" placeholder="اكتبها مرة تانية"></label>
      <p class="err" id="recovery-error" role="alert" hidden></p>
      <button class="cta" id="save-password" type="submit">حفظ كلمة المرور الجديدة</button>
    </form></div>`;
  reveal();
  document.querySelectorAll("[data-eye]").forEach((toggle) => {
    toggle.onclick = () => {
      const input = document.getElementById(toggle.dataset.eye);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(show));
      toggle.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
    };
  });
  const form = $("#recovery-form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const password = $("#new-password").value;
    const confirm = $("#confirm-password").value;
    const error = $("#recovery-error");
    const button = $("#save-password");
    const showError = (message) => { error.textContent = message; error.hidden = !message; };
    if (password.length < 8) return showError("كلمة المرور لازم تكون ٨ أحرف على الأقل.");
    if (password !== confirm) return showError("كلمتا المرور مش متطابقتين.");
    button.disabled = true;
    button.textContent = "جارٍ الحفظ...";
    try {
      await (await getSdk()).updatePassword(password);
      showError("");
      toast("تم تغيير كلمة المرور بنجاح. سجّل دخولك بالكلمة الجديدة.", "ok");
      await (await getSdk()).signOut();
      session = null;
      authUserId = null;
      ls.set("vx-session", null);
      mode = "in";
      location.hash = "#/login";
      setTimeout(() => loginPage("#/profile"), 0);
    } catch (failure) {
      console.warn("Galaxite password recovery failed:", failure);
      const message = String(failure?.message || "").toLowerCase();
      showError(message.includes("password") ? "كلمة المرور لا تحقق شروط الأمان المطلوبة. جرّب كلمة أقوى." : "رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من صفحة الدخول.");
      button.disabled = false;
      button.textContent = "حفظ كلمة المرور الجديدة";
    }
  };
}
window.GALAXITE_SHOW_PASSWORD_RECOVERY = passwordRecoveryPage;
async function finish(email, name, next) {
  mode = "in";
  if (realProvider() === "supabase") {
    try {
      const db = await window.GALAXITE_GET_SUPABASE_CLIENT?.();
      const { data: { user }, error } = await db.auth.getUser();
      if (error) throw error;
      authUserId = user?.id || null;
    } catch (error) {
      console.warn("Galaxite could not read the authenticated user profile.", error);
    }
  }
  session = email;
  ls.set("vx-session", email);
  const k = keyOf(email);
  const ex = ls.get(k, null);
  const profile = ex ? { ...blank(email), ...ex } : blank(email, name);
  put(profile);
  if (authUserId && realProvider() === "supabase") {
    try {
      const db = await window.GALAXITE_GET_SUPABASE_CLIENT?.();
      const { error } = await db.from("profiles").upsert({
        id: authUserId,
        display_name: profile.name || String(email).split("@")[0],
        bio: profile.bio || ""
      }, { onConflict: "id" });
      if (error) console.warn("Galaxite profile create/update failed.", error);
    } catch (error) {
      console.warn("Galaxite profile create/update failed.", error);
    }
  }
  toast("أهلاً " + (me().name), "ok");
  confetti(30);
  location.hash = next || "#/profile";
}
async function logout() {
  try { if (realProvider()) await (await getSdk()).signOut(); } catch {}
  session = null; authUserId = null; ls.set("vx-session", null); refreshHead(); toast("تم تسجيل الخروج"); location.hash = "#/";
}
async function restore() {
  if (!realProvider()) return;
  try {
    const s = await getSdk();
    const email = await s.current();
    if (!email) {
      authUserId = null;
      if (session) { session = null; ls.set("vx-session", null); }
      refreshHead();
      return;
    }
    session = email;
    ls.set("vx-session", email);
    let profile = { ...blank(email), ...(ls.get(keyOf(email), {}) || {}) };
    if (realProvider() === "supabase") {
      const db = await window.GALAXITE_GET_SUPABASE_CLIENT?.();
      const user = await s.currentUser?.();
      authUserId = user?.id || null;
      if (authUserId) {
        const { data, error } = await db.from("profiles")
          .select("display_name,bio").eq("id", authUserId).maybeSingle();
        if (error) console.warn("Galaxite profile load failed.", error);
        if (data) profile = { ...profile, name: data.display_name || profile.name, bio: data.bio || "" };
        else {
          const { error: insertError } = await db.from("profiles").upsert({
            id: authUserId, display_name: profile.name, bio: profile.bio || ""
          }, { onConflict: "id" });
          if (insertError) console.warn("Galaxite profile bootstrap failed.", insertError);
        }
      }
    }
    put(profile);
    refreshHead();
  } catch (error) {
    console.warn("Galaxite session restore failed.", error);
  }
}

/* ---------- المكافآت والتتبع ---------- */
function claimDaily() {
  const u = me(); if (!u) return;
  if (u.daily.last === today()) return toast("خدت مكافأة النهاردة. تعالى بكرة");
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const streak = u.daily.last === y ? u.daily.streak + 1 : 1;
  const bonus = DAILY + Math.min(streak - 1, 6) * 2;
  u.coins += bonus; u.daily = { last: today(), streak }; u.tx.unshift({ t: Date.now(), d: `مكافأة يومية (يوم ${streak})`, c: bonus });
  put(u); confetti(); toast(`+${bonus} عملة`, "ok"); return true;
}
function track(w, ch) {
  const u = me(); if (!u) return;
  const k = lockKey(w, ch); if (u.read.includes(k)) return;
  u.read.push(k); u.xp += 5; if (u.read.length > 3000) u.read.shift(); put(u);
}
const level = (xp) => ({ lv: Math.floor(xp / 50) + 1, cur: xp % 50, need: 50 });
const BADGES = [
  { id: "r1", t: "القارئ الجديد", d: "اقرأ أول فصل", ok: (u) => u.read.length >= 1 },
  { id: "r25", t: "مدمن فصول", d: "اقرأ 25 فصل", ok: (u) => u.read.length >= 25 },
  { id: "r100", t: "أسطورة القراءة", d: "اقرأ 100 فصل", ok: (u) => u.read.length >= 100 },
  { id: "vip", t: "عضو VIP", d: "فعّل الاشتراك", ok: (u) => u.vipUntil > 0 },
  { id: "str", t: "على النار", d: "مكافأة يومية 3 أيام ورا بعض", ok: (u) => u.daily.streak >= 3 },
  { id: "unl", t: "فاتح الأقفال", d: "افتح 3 فصول مميزة", ok: (u) => u.unlocked.length >= 3 }
];

/* ---------- فتح فصل ---------- */
function unlock(title, ch) {
  const u = me(); if (!u) return (location.hash = "#/login");
  if (u.coins < LOCK_COST) { toast("رصيدك مش كفاية. اشحن عملات", "err"); return (location.hash = "#/store"); }
  u.coins -= LOCK_COST; u.unlocked.push(title + "#" + ch); u.tx.unshift({ t: Date.now(), d: `فتح ${title} فصل ${ch}`, c: -LOCK_COST });
  put(u); confetti(34); toast("تم فتح الفصل", "ok");
}
function lockedScreen(w, ch, slug) {
  const u = me();
  $("#app").innerHTML = `<div class="rbar"><a class="back" href="#/s/${slug}">← ${esc(w.title)}</a></div>
  <div class="lockbox rv"><div class="lockico">${I.lock}</div><h2>الفصل ${ch} مميز</h2><p>آخر ${LOCK_LAST} فصول من الأعمال المستمرة بتتفتح بعملات أو باشتراك VIP. باقي الفصول مجانية.</p>
  ${u ? `<p class="bal">رصيدك: ${coin} <b>${u.coins}</b></p><button class="cta" id="ul">افتح الفصل بـ ${LOCK_COST} عملة</button>` : `<a class="cta" href="#/login">سجّل دخولك لفتح الفصل</a>`}
  <a class="cta alt" href="#/store">المتجر والاشتراك</a><a class="lnk" href="#/r/${slug}/${Math.max(1, w.chapters - LOCK_LAST)}">اقرأ آخر فصل مجاني</a></div>`;
  reveal();
  if ($("#ul")) $("#ul").onclick = () => { unlock(w.title, ch); if (!locked(w, ch)) window.dispatchEvent(new Event("hashchange")); };
}

/* ---------- المتجر والدفع ---------- */
async function checkout(pack) {
  const u = me(); if (!u) { toast("سجّل دخولك الأول"); return (location.hash = "#/login"); }
  const prov = PAY.provider;
  if (prov === "stripe" || prov === "paymob") {
    /* الدفع الحقيقي: السيرفر بتاعك بيعمل جلسة الدفع ويضيف العملات بعد تأكيد الـ webhook. لا مفاتيح سرية هنا أبدا. */
    const ep = PAY[prov]?.checkoutEndpoint;
    if (!ep) return toast("أضف checkoutEndpoint في payments-config.js", "err");
    try {
      const r = await fetch(ep, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pack: pack.id, email: u.email }) });
      const j = await r.json(); if (!j.url) throw new Error("no url"); location.href = j.url;
    } catch { toast("تعذر بدء الدفع. راجع السيرفر والإعدادات", "err"); }
    return;
  }
  return demoPay(pack, u);
}
function demoPay(pack, u) {
  const d = document.createElement("div"); d.className = "modal"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "تأكيد الشراء");
  d.innerHTML = `<div class="mbox"><h3>تأكيد الشراء (تجريبي)</h3><p><b>${esc(pack.name)}</b><br>${pack.coins ? `${pack.coins} عملة` : `VIP لمدة ${VIP_DAYS} يوم`} · ${esc(pack.price)}</p><p class="note">ده وضع تجريبي: مفيش دفع حقيقي ولا بيتسحب أي مبلغ. الدفع الحقيقي يتفعل بعد ربط Paymob أو Stripe من سيرفرك.</p><div class="mrow"><button class="cta" id="mok">تأكيد</button><button class="cta alt" id="mno">إلغاء</button></div></div>`;
  document.body.appendChild(d); $("#mok", d).focus();
  const close = () => d.remove();
  $("#mno", d).onclick = close; d.onclick = (e) => { if (e.target === d) close(); };
  d.onkeydown = (e) => { if (e.key === "Escape") close(); };
  $("#mok", d).onclick = () => {
    const x = me();
    if (pack.coins) { x.coins += pack.coins; x.tx.unshift({ t: Date.now(), d: "شحن: " + pack.name + " (تجريبي)", c: pack.coins }); }
    else { x.vipUntil = Math.max(Date.now(), x.vipUntil) + VIP_DAYS * 864e5; x.tx.unshift({ t: Date.now(), d: "اشتراك VIP (تجريبي)", c: 0 }); }
    put(x); close(); confetti(60); toast("تمت العملية (تجريبي)", "ok"); storePage();
  };
}
function storePage() {
  const u = me();
  const packs = PAY.packs || [];
  const coinPacks = packs.filter((p) => p.coins), vip = packs.find((p) => !p.coins);
  const canDaily = u && u.daily.last !== today();
  $("#app").innerHTML = `<section class="storehero rv"><div><span class="badge">المتجر</span><h2>عملات واشتراك VIP</h2><p>افتح الفصول المميزة أو اشترك وافتح كل حاجة.</p></div>
    <div class="wallet">${u ? `<small>رصيدك</small><div class="bigcoin">${coin}<b data-to="${u.coins}">${u.coins}</b></div>${isVip(u) ? `<span class="vip">VIP حتى ${new Date(u.vipUntil).toLocaleDateString("ar-EG")}</span>` : ""}` : `<a class="cta" href="#/login">سجّل دخولك</a>`}</div></section>
    ${u ? `<div class="daily rv"><div>${I.gift}<span><b>المكافأة اليومية</b><small>سلسلة الأيام: ${u.daily.streak} · كل يوم زيادة</small></span></div><button class="cta" id="dl" ${canDaily ? "" : "disabled"}>${canDaily ? "استلم الآن" : "تعالى بكرة"}</button></div>` : ""}
    <h3 class="h">باقات العملات</h3><div class="packs">${coinPacks.map((p) => `<div class="pack rv tilt${p.best ? " best" : ""}">${p.best ? '<em class="ribbon">الأفضل قيمة</em>' : ""}<div class="pcoin">${coin}</div><b class="pn">${p.coins}</b><span class="pl">${esc(p.name)}</span><span class="pp">${esc(p.price)}</span><button class="cta" data-pack="${esc(p.id)}">شراء</button></div>`).join("")}</div>
    ${vip ? `<h3 class="h">الاشتراك</h3><div class="vipcard rv"><div><span class="badge">VIP</span><h3>${esc(vip.name)}</h3><ul class="perks"><li>كل الفصول المميزة مفتوحة</li><li>مكافأة يومية مضاعفة قريبا</li><li>شارة VIP على ملفك</li></ul></div><div class="vp"><b>${esc(vip.price)}</b><button class="cta" data-pack="${esc(vip.id)}">اشترك</button></div></div>` : ""}
    <h3 class="h">طرق الدفع</h3><p class="note">${PAY.provider === "demo" ? "الوضع الحالي تجريبي بدون أي مبلغ حقيقي. بعد ربط Paymob (بطاقات ومحافظ وفوري) أو Stripe من سيرفرك، تتفعل نفس الأزرار دي بدفع حقيقي." : "الدفع عن طريق " + esc(PAY.provider)}</p>
    ${u ? `<h3 class="h">سجل العمليات</h3><ul class="tx">${u.tx.slice(0, 12).map((t) => `<li><span>${esc(t.d)}<small>${new Date(t.t).toLocaleDateString("ar-EG")}</small></span><b class="${t.c < 0 ? "neg" : "pos"}">${t.c > 0 ? "+" : ""}${t.c || "—"}</b></li>`).join("") || "<li>لا عمليات بعد</li>"}</ul>` : ""}`;
  reveal(); tilt();
  document.querySelectorAll("[data-pack]").forEach((b) => (b.onclick = () => checkout(packs.find((p) => p.id === b.dataset.pack))));
  if ($("#dl")) $("#dl").onclick = () => { if (claimDaily()) storePage(); };
}

/* ---------- الملف الشخصي ---------- */
function profilePage(WORKS, slugf) {
  const u = me(); if (!u) return loginPage("#/profile");
  const L = level(u.xp), pct = Math.round(L.cur / L.need * 100);
  const hist = Object.entries(JSON.parse(localStorage.getItem("prog") || "{}")).filter(([t]) => WORKS.some((w) => w.title === t)).slice(-6).reverse();
  const favs = (JSON.parse(localStorage.getItem("marks") || "[]")).filter((t) => WORKS.some((w) => w.title === t));
  const R = 46, C = 2 * Math.PI * R;
  $("#app").innerHTML = `<section class="prof rv"><div class="ring"><svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="${R}" class="rg0"/><circle cx="55" cy="55" r="${R}" class="rg1" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - pct / 100)}"/></svg><span class="av">${avatar(u, "lg")}</span><em>${L.lv}</em></div>
    <div class="pinfo"><h2 dir="auto">${esc(u.name)}${isVip(u) ? ' <span class="vip">VIP</span>' : ""}</h2><small dir="ltr">${esc(u.email)}</small><p dir="auto">${esc(u.bio) || "<i>أضف نبذة عنك</i>"}</p><div class="xpbar" title="${L.cur}/${L.need}"><i style="width:${pct}%"></i></div><small>المستوى ${L.lv} · ${L.need - L.cur} نقطة للمستوى التالي</small></div></section>
    <div class="stats rv"><div><b data-to="${u.read.length}">0</b><span>فصول مقروءة</span></div><div><b data-to="${favs.length}">0</b><span>في المفضلة</span></div><div><b data-to="${u.coins}">0</b><span>عملات</span></div><div><b data-to="${u.unlocked.length}">0</b><span>فصول مفتوحة</span></div></div>
    <div class="btnrow"><a class="cta" href="#/store">${I.store}&nbsp;المتجر</a><button class="cta alt" id="pe">تعديل الملف</button><button class="cta alt" id="lo">خروج</button></div>
    <h3 class="h">الشارات</h3><div class="badges">${BADGES.map((b) => `<div class="bdg rv ${b.ok(u) ? "got" : ""}"><span>${b.ok(u) ? I.medal : I.lock}</span><b>${b.t}</b><small>${b.d}</small></div>`).join("")}</div>
    <h3 class="h">آخر قراءاتك</h3>${hist.length ? `<div class="chs">${hist.map(([t, c]) => `<a class="ch" href="#/r/${encodeURIComponent(t)}/${c}"><span dir="auto">${esc(t)}</span><small>فصل ${c}</small></a>`).join("")}</div>` : `<p class="empty">لسه ما قرأتش حاجة.</p>`}
    <h3 class="h">إعدادات</h3><div class="setrow"><button class="cta alt" id="th">تبديل الوضع الفاتح/الداكن</button><button class="cta alt" id="dd">مسح بيانات حسابي من المتصفح</button></div>
    ${realProvider() ? "" : `<p class="note">وضع تجريبي: كل بياناتك (العملات والفصول المفتوحة) محفوظة في متصفحك وممكن تتعدل. الأرصدة الحقيقية لازم تتخزن على سيرفر.</p>`}`;
  reveal(); tilt();
  $("#lo").onclick = logout;
  $("#th").onclick = () => $("#theme").click();
  $("#dd").onclick = () => { if (!$("#dd").dataset.s) { $("#dd").dataset.s = 1; $("#dd").textContent = "اضغط تاني للتأكيد"; return; } localStorage.removeItem(keyOf(u.email)); logout(); };
  $("#pe").onclick = () => {
    const d = document.createElement("div"); d.className = "modal"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", "تعديل الملف");
    d.innerHTML = `<form class="mbox" id="pf"><h3>تعديل الملف</h3><label>الاسم<input id="pn" maxlength="24" value="${esc(u.name)}"></label><label>نبذة<textarea id="pb" maxlength="120" rows="2">${esc(u.bio)}</textarea></label><div class="avs" role="radiogroup" aria-label="الصورة">${AVATARS.map((a) => `<button type="button" role="radio" aria-label="صورة ${a.slice(1) * 1 + 1}" aria-checked="${a === u.avatar}" class="${a === u.avatar ? "on" : ""}" data-a="${a}"><i style="background:${GR(a)}"></i></button>`).join("")}</div><div class="mrow"><button class="cta" type="button" id="psv">حفظ</button><button class="cta alt" type="button" id="pc">إلغاء</button></div></form>`;
    document.body.appendChild(d); let av = u.avatar; $("#pn", d).focus();
    d.querySelectorAll(".avs button").forEach((b) => (b.onclick = () => { av = b.dataset.a; d.querySelectorAll(".avs button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); }); }));
    $("#pc", d).onclick = () => d.remove(); d.onclick = (e) => { if (e.target === d) d.remove(); }; d.onkeydown = (e) => { if (e.key === "Escape") d.remove(); };
    const save = () => { const x = me(); x.name = $("#pn", d).value.trim() || x.name; x.bio = $("#pb", d).value.trim(); x.avatar = av; put(x); d.remove(); toast("تم الحفظ", "ok"); profilePage(WORKS, slugf); };
    $("#psv", d).onclick = save; $("#pf", d).onsubmit = (e) => { e.preventDefault(); save(); }; $("#pf", d).onkeydown = (e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); save(); } };
  };
}

window.VX = {
  toast, level, me, locked, premium, lockedScreen, loginPage,
  openAuth: (nextMode) => { mode = nextMode === "up" ? "up" : "in"; loginPage(); },
  passwordRecoveryPage, profilePage, storePage, track, refreshHead,
  reveal, tilt, confetti, claimDaily, logout, restore, I, coin, LOCK_COST
};
document.addEventListener("DOMContentLoaded", () => { refreshHead(); restore(); });
})();
