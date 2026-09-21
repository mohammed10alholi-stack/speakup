// ================== إعدادات موقعك ==================
window.APP_CONFIG = {
  APP_NAME: "SpeakUp",

  SUPABASE_URL: "https://jqimkyqszlwnndddizkf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxaW1reXFzemx3bm5kZGRpemtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NDIyNTgsImV4cCI6MjEwNTQxODI1OH0.i6NypjJZt2qt8Dqgyd0ONrqFa5_gTF5e5BhvyWT9C54",

  CURRENCY: "₪",
  ACTIVATION_TIME: "خلال دقائق",

  // رقم واتساب بصيغة دولية بدون +
  WHATSAPP: "972567385853",

  PAYMENT_METHODS: [
    { id: "bop",    icon: "🏦", name: "بنك فلسطين",
      details: ["التحويل على رقم الجوال: 0567385853"] },
    { id: "palpay", icon: "📱", name: "محفظة PalPay",
      details: ["رقم المحفظة: 0567385853"] },
    { id: "jawwalpay", icon: "💳", name: "محفظة Jawwal Pay",
      details: ["رقم المحفظة: 0597210118"] }
  ]
};
