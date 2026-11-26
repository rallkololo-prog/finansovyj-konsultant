/* Service worker: приложение работает офлайн.
   Стратегия простая — «сначала кэш, в фоне обновляем».
   При изменении приложения поднимайте VERSION, иначе телефон останется на старой версии. */
const VERSION = "fin-2026-11-26-2";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  // Не активируемся сами: сначала человек увидит плашку «вышла новая версия»,
  // чтобы его не выбросило из расчётов посреди работы.
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).catch(() => { }));
});

self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // чужие домены не трогаем

  // переходы по страницам: сначала сеть, при обрыве — сохранённая оболочка
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put("./index.html", copy));
        return res;
      }).catch(() => caches.match("./index.html").then(r => r || caches.match("./")))
    );
    return;
  }

  // остальное: из кэша, иначе из сети (и в кэш)
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200 && res.type === "basic") {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
