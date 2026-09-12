/* RPG-OS — Service Worker
 * Offline-safe: cached apenas estáticos/service shell. NUNCA cacheia
 * pedidos de dados/API (auth, staffList, orçamentos...) nem URLs que
 * tenham origem fora do app. Network-first em navegações para garantir
 * conteúdo fresco nas dashboard.
 */
const CACHE = "rpg-os-v1";
const CORE = ["/manifest.json", "/icon-192.png", "/icon-512.png", "/icon-128.png", "/apple-touch-icon.png", "/badge-72.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.endsWith(".png") ||
  url.pathname.endsWith(".svg") ||
  url.pathname.endsWith(".ico") ||
  url.pathname.startsWith("/manifest.json");

const isDataOrAuth = (url) =>
  url.pathname.startsWith("/api/") ||
  url.pathname.startsWith("/auth/") ||
  url.pathname.startsWith("/login") ||
  url.pathname.startsWith("/recuperar-senha");

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (isDataOrAuth(url)) return;

  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const c = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, c));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/dashboard")))
    );
    return;
  }

  if (isStatic(url)) {
    e.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const c = res.clone();
              caches.open(CACHE).then((cache) => cache.put(request, c));
            }
            return res;
          })
      )
    );
  }
});
