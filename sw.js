// SpeakUp service worker — يخلي الموقع يشتغل كتطبيق ويفتح بسرعة
const CACHE = "speakup-v49";
const CORE = ["./", "./index.html", "./config.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (u.pathname.endsWith("admin.html")) return;
    // الشبكة أولاً عشان التحديثات توصل فوراً، والنسخة المحفوظة لما ما في إنترنت
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html"))));
    return;
  }
  if (u.hostname === "cdn.jsdelivr.net" || u.hostname === "api.dictionaryapi.dev" || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; })));
  }
});
