// ================== إعدادات موقعك — عدّل هذا الملف فقط ==================
window.APP_CONFIG = {
  APP_NAME: "دفتري الإنجليزي",

  // من Supabase ← Project Settings ← API
  SUPABASE_URL: "https://jqimkyqszlwnndddizkf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxaW1reXFzemx3bm5kZGRpemtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NDIyNTgsImV4cCI6MjEwNTQxODI1OH0.i6NypjJZt2qt8Dqgyd0ONrqFa5_gTF5e5BhvyWT9C54",

  CURRENCY: "₪",
  ACTIVATION_TIME: "خلال 24 ساعة",

  // رقم واتساب للتواصل بصيغة دولية بدون + (مثال: 970599000000)
  WHATSAPP: "970500000000",

  // طرق الدفع اللي بتظهر للمشترك — عدّلها ببياناتك الحقيقية
  PAYMENT_METHODS: [
    { id: "bank",   icon: "🏦", name: "تحويل بنكي",
      details: ["البنك: اسم البنك", "اسم صاحب الحساب: الاسم الكامل", "رقم الحساب: 0000000", "IBAN: PS00XXXX0000000000000000000"] },
    { id: "wallet", icon: "📱", name: "محفظة إلكترونية",
      details: ["المحفظة: اسم المحفظة", "رقم المحفظة: 0590000000", "الاسم: الاسم الكامل"] }
  ]
};
