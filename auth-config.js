// إعدادات تسجيل الدخول. بدون مفاتيح تعمل لوحة الإدارة ببوابة تجريبية.
// مفاتيح Firebase وSupabase (anon) مصممة لتكون علنية. الأمان الحقيقي يأتي من قواعد الأمان في مشروعك.
window.AUTH_CONFIG = {
  provider: "demo",              // "demo" أو "firebase" أو "supabase"
  ownerEmail: "ownermail@gmail.com",
  firebase: { apiKey: "", authDomain: "", projectId: "", appId: "" },
  supabase: { url: "", anonKey: "" }
};
