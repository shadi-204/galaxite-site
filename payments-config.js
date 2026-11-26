// إعدادات المتجر والدفع. بدون تغيير يعمل المتجر تجريبيا (بدون أي دفع حقيقي).
// مهم: لا تضع هنا أي مفتاح سري (secret key). الدفع الحقيقي يتم من سيرفرك:
//  1) provider: "stripe" أو "paymob"
//  2) اعمل على سيرفرك مسار POST يعمل جلسة دفع ويرجع { url } لصفحة الدفع
//  3) ضع رابط المسار في checkoutEndpoint
//  4) السيرفر نفسه يضيف العملات للمستخدم بعد وصول تأكيد الدفع (webhook). المتصفح لا يضيف رصيد حقيقي أبدا.
window.PAY_CONFIG = {
  provider: "demo",             // "demo" أو "stripe" أو "paymob"
  stripe: { checkoutEndpoint: "" },
  paymob: { checkoutEndpoint: "" },
  packs: [
    { id: "c100",  name: "باقة صغيرة",  coins: 100,  price: "49 ج.م" },
    { id: "c300",  name: "باقة متوسطة", coins: 330,  price: "129 ج.م", best: true },
    { id: "c700",  name: "باقة كبيرة",  coins: 800,  price: "269 ج.م" },
    { id: "vip30", name: "اشتراك VIP شهري", coins: 0, price: "149 ج.م / شهر" }
  ]
};
