/* Galaxite content reports: real Supabase-backed reports for works and chapters. */
(() => {
  const CFG = window.AUTH_CONFIG || {};
  let modal = null;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  async function client() {
    if (window.GALAXITE_SUPABASE_CLIENT) return window.GALAXITE_SUPABASE_CLIENT;
    if (typeof window.GALAXITE_GET_SUPABASE_CLIENT === "function") {
      const value = await window.GALAXITE_GET_SUPABASE_CLIENT();
      if (value) return value;
    }
    throw new Error("تعذر الاتصال بخدمة الحسابات. حدّث الصفحة وحاول مرة أخرى.");
  }
  function close() { modal?.remove(); modal = null; }
  function open(target) {
    if (!target || !["work", "chapter"].includes(target.targetType) || !target.targetId) return;
    close();
    const title = target.targetType === "chapter" ? "الإبلاغ عن مشكلة في الفصل" : "الإبلاغ عن مشكلة في العمل";
    document.body.insertAdjacentHTML("beforeend", `
      <div class="gx-report-overlay" id="gx-report-overlay" role="presentation">
        <form class="gx-report-modal" id="gx-report-form" role="dialog" aria-modal="true" aria-labelledby="gx-report-title">
          <button class="gx-report-close" type="button" id="gx-report-close" aria-label="إغلاق">×</button>
          <h3 id="gx-report-title">${title}</h3>
          <p class="gx-report-target">${esc(target.targetTitle || "محتوى Galaxite")}</p>
          <label for="gx-report-reason">سبب البلاغ</label>
          <select id="gx-report-reason" required>
            <option value="">اختر السبب</option>
            <option>صور ناقصة أو لا تعمل</option>
            <option>الفصل أو العمل غير صحيح</option>
            <option>ترجمة بها خطأ</option>
            <option>تكرار في الصفحات أو الفصول</option>
            <option>مشكلة أخرى</option>
          </select>
          <label for="gx-report-details">تفاصيل إضافية (اختياري)</label>
          <textarea id="gx-report-details" rows="4" maxlength="1000" placeholder="اشرح المشكلة باختصار..."></textarea>
          <p class="gx-report-message" id="gx-report-message" role="status"></p>
          <div class="gx-report-actions">
            <button type="button" class="cta alt" id="gx-report-cancel">إلغاء</button>
            <button type="submit" class="cta" id="gx-report-submit">إرسال البلاغ</button>
          </div>
        </form>
      </div>`);
    modal = document.getElementById("gx-report-overlay");
    const form = document.getElementById("gx-report-form");
    const message = document.getElementById("gx-report-message");
    const submit = document.getElementById("gx-report-submit");
    document.getElementById("gx-report-close").onclick = close;
    document.getElementById("gx-report-cancel").onclick = close;
    modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const reason = document.getElementById("gx-report-reason").value;
      const details = document.getElementById("gx-report-details").value.trim();
      if (!reason) { message.textContent = "اختار سبب البلاغ الأول."; return; }
      submit.disabled = true; message.textContent = "جارٍ إرسال البلاغ...";
      try {
        const db = await client();
        const { data: auth, error: authError } = await db.auth.getUser();
        if (authError || !auth?.user) {
          message.innerHTML = 'لازم تسجل دخولك الأول. <a href="#/login">تسجيل الدخول</a>';
          submit.disabled = false; return;
        }
        const { error } = await db.from("content_reports").insert({
          reporter_id: auth.user.id,
          target_type: target.targetType,
          target_id: String(target.targetId),
          target_title: String(target.targetTitle || "").slice(0, 180),
          target_path: String(target.targetPath || "").startsWith("#/") ? target.targetPath : "",
          reason,
          details
        });
        if (error) throw error;
        message.textContent = "وصل البلاغ بنجاح. شكرًا لمساعدتنا في تحسين الموقع.";
        submit.textContent = "تم الإرسال";
        setTimeout(close, 1200);
      } catch (error) {
        message.textContent = error?.message || "تعذر إرسال البلاغ. حاول مرة أخرى.";
        submit.disabled = false;
      }
    });
  }
  async function list() {
    const db = await client();
    const { data, error } = await db.from("content_reports")
      .select("id,reporter_id,target_type,target_id,target_title,target_path,reason,details,status,created_at,resolved_at")
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return data || [];
  }
  async function update(id, status) {
    if (!["open", "reviewing", "resolved", "dismissed"].includes(status)) throw new Error("حالة البلاغ غير صالحة.");
    const db = await client();
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth?.user) throw new Error("انتهت جلسة الدخول. سجّل الدخول مرة أخرى.");
    const payload = { status, moderator_id: auth.user.id, resolved_at: ["resolved", "dismissed"].includes(status) ? new Date().toISOString() : null };
    const { error } = await db.from("content_reports").update(payload).eq("id", id);
    if (error) throw error;
  }
  window.GalaxiteReports = { open, list, update };
})();