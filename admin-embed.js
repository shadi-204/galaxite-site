/* Owner-only dashboard entry and same-page embedding for Galaxite. */
(() => {
  "use strict";
  const app = () => document.querySelector("#app");
  let checkId = 0;
  let clientPromise = null;

  async function client() {
    if (!clientPromise) {
      clientPromise = Promise.resolve(window.GALAXITE_GET_SUPABASE_CLIENT?.())
        .then((value) => value || null)
        .catch(() => null);
    }
    return clientPromise;
  }

  function setOwnerLinks(visible) {
    ["#mnav", "#bnav"].forEach((selector) => {
      const nav = document.querySelector(selector);
      if (!nav) return;
      let link = nav.querySelector('a[data-r="admin"]');
      if (visible && !link) {
        link = document.createElement("a");
        link.href = "#/admin";
        link.dataset.r = "admin";
        link.innerHTML = selector === "#bnav"
          ? '<span aria-hidden="true">⌘</span><span>الإدارة</span>'
          : "لوحة الإدارة";
        nav.appendChild(link);
      } else if (!visible && link) {
        link.remove();
      }
    });
  }

  async function ownerStatus(db) {
    const { data: sessionData, error: sessionError } = await db.auth.getSession();
    if (sessionError || !sessionData?.session) return false;
    const { data, error } = await db.rpc("is_owner");
    return !error && data === true;
  }

  function state(title, message, action) {
    const host = app();
    if (!host) return;
    host.innerHTML = `<section class="gx-admin-state">
      <h2>${title}</h2><p>${message}</p>
      ${action || ""}
    </section>`;
  }

  window.GALAXITE_RENDER_ADMIN = async () => {
    const myCheck = ++checkId;
    const host = app();
    if (!host) return;
    host.innerHTML = '<section class="gx-admin-state"><h2>جارٍ التحقق من صلاحية الدخول</h2><p>نتأكد من حسابك قبل فتح لوحة الإدارة.</p></section>';

    const db = await client();
    if (myCheck !== checkId) return;
    if (!db) {
      state("تعذر الاتصال", "خدمة تسجيل الدخول غير متاحة حاليًا. حدّث الصفحة وحاول مرة أخرى.");
      return;
    }
    try {
      const { data: sessionData, error: sessionError } = await db.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData?.session) {
        sessionStorage.removeItem("vx-admin-session");
        state("سجّل دخولك أولًا", "لوحة الإدارة متاحة لحساب Owner فقط. سجّل الدخول بحساب Galaxite ثم افتحها من جديد.",
          '<a class="cta" href="#/login">تسجيل الدخول</a>');
        return;
      }
      const { data: allowed, error: roleError } = await db.rpc("is_owner");
      if (roleError || allowed !== true) {
        sessionStorage.removeItem("vx-admin-session");
        state("غير مصرح بالدخول", "الحساب الحالي لا يحمل صلاحية Owner في قاعدة بيانات Galaxite.");
        return;
      }
      if (myCheck !== checkId) return;

      // admin.html independently checks the current Supabase session and is_owner().
      // This session marker only skips its duplicate login form; it is not an authorization check.
      sessionStorage.setItem("vx-admin-session", "1");
      host.innerHTML = '<div class="gx-admin-shell"><iframe class="gx-admin-frame" title="لوحة إدارة Galaxite" src="admin.html?embedded=1" loading="eager" referrerpolicy="same-origin"></iframe></div>';
    } catch (error) {
      if (myCheck !== checkId) return;
      console.warn("Galaxite dashboard access check failed:", error?.message || error);
      state("تعذر التحقق من الصلاحيات", "حصلت مشكلة أثناء التأكد من صلاحية Owner. حدّث الصفحة وحاول مرة أخرى.");
    }
  };

  async function refreshOwnerMenu() {
    const db = await client();
    if (!db) { setOwnerLinks(false); return; }
    try { setOwnerLinks(await ownerStatus(db)); }
    catch { setOwnerLinks(false); }
  }

  refreshOwnerMenu();
  client().then((db) => {
    if (!db) return;
    db.auth.onAuthStateChange((event) => {
      // Avoid doing Supabase work inside its auth callback.
      setTimeout(() => {
        refreshOwnerMenu();
        if (["SIGNED_IN", "SIGNED_OUT", "TOKEN_REFRESHED", "USER_UPDATED"].includes(event)
            && location.hash.startsWith("#/admin")) {
          window.GALAXITE_RENDER_ADMIN?.();
        }
      }, 0);
    });
  });
})();
