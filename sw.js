// SpeakUp service worker — يخلي الموقع يشتغل كتطبيق، يفتح بسرعة، ويشتغل بدون نت
const CACHE = "speakup-v105";
const AUDIO = "speakup-audio-v1";   // الأصوات: بتضل محفوظة حتى مع التحديثات
const CDN = "speakup-cdn-v1";       // الأيقونات والخطوط
const CORE = ["./", "./index.html", "./config.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  const keep = [CACHE, AUDIO, CDN];
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// الآيفون بيطلب الصوت على أجزاء (Range)، فمنقصّله الجزء المطلوب من الملف المحفوظ
async function rangeFrom(resp, rangeHeader) {
  const buf = await resp.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(rangeHeader || "");
  if (!m) return new Response(buf, { status: 200, headers: { "Content-Type": "audio/mpeg", "Content-Length": String(size), "Accept-Ranges": "bytes" } });
  let start = m[1] === "" ? Math.max(0, size - Number(m[2])) : Number(m[1]);
  let end = m[1] !== "" && m[2] !== "" ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size) start = 0;
  const part = buf.slice(start, end + 1);
  return new Response(part, { status: 206, headers: { "Content-Type": "audio/mpeg", "Content-Length": String(part.byteLength), "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes" } });
}
async function audioFetch(req) {
  const url = req.url.split("#")[0], cache = await caches.open(AUDIO);
  let hit = await cache.match(url);
  if (!hit) {
    try { const r = await fetch(url, { cache: "no-store" }); if (r.ok) { await cache.put(url, r.clone()); hit = r; } else return r; }
    catch (e) { return new Response("", { status: 504 }); }
  }
  return rangeFrom(hit.clone(), req.headers.get("range"));
}
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === location.origin) {
    if (u.pathname.endsWith("admin.html")) return;
    if (u.pathname.includes("/a/") && u.pathname.endsWith(".mp3")) { e.respondWith(audioFetch(req)); return; }
    if (u.pathname.includes("/a/") && u.pathname.endsWith("m.json")) {
      e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(AUDIO).then((c) => c.put(req, cp)); return r; }).catch(() => caches.match(req, { cacheName: AUDIO }).then((r) => r || new Response("[]", { headers: { "Content-Type": "application/json" } }))));
      return;
    }
    // الشبكة أولاً عشان التحديثات توصل فوراً، والنسخة المحفوظة لما ما في إنترنت
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html"))));
    return;
  }
  if (u.hostname === "cdn.jsdelivr.net" || u.hostname === "api.dictionaryapi.dev" || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const cp = res.clone(); caches.open(CDN).then((c) => c.put(req, cp)); return res; })));
  }
});
// تنزيل كل أصوات لغة للاستخدام بدون نت
self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type !== "dl-audio" || !Array.isArray(d.urls)) return;
  const port = e.ports && e.ports[0];
  e.waitUntil((async () => {
    const cache = await caches.open(AUDIO); let done = 0, fail = 0;
    const urls = d.urls.slice(), N = urls.length;
    async function worker() { while (urls.length) { const url = urls.shift();
      try { if (!(await cache.match(url))) { const r = await fetch(url, { cache: "no-store" }); if (r.ok) await cache.put(url, r); else fail++; } } catch (x) { fail++; }
      done++; if (port && (done % 20 === 0 || done === N)) port.postMessage({ done, total: N, fail }); } }
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (port) port.postMessage({ done: N, total: N, fail, finished: true });
  })());
});
// 🔔 إشعارات التذكير
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "SpeakUp", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "SpeakUp", { body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", dir: "rtl", lang: "ar", tag: "speakup-reminder", renotify: true, data: { url: d.url || "./" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => { for (const c of cs) { if ("focus" in c) return c.focus(); } return self.clients.openWindow(url); }));
});
