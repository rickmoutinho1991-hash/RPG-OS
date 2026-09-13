/* RPG-OS — Service Worker
 * Offline-safe: cached apenas estáticos/service shell. NUNCA cacheia
 * pedidos de dados/API (auth, staffList, orçamentos...) nem URLs que
 * tenham origem fora do app. Network-first em navegações para garantir
 * conteúdo fresco nas dashboard.
 * VERSÃO AUTOMÁTICA: no install, lê /sw-version.json (gerado pelo build,
 * ver scripts/stamp-sw-version.mjs) e usa "rpg-os-<v>" como nome de cache.
 * Sem bump manual: cada deploy troca o cache automaticamente. O ficheiro de
 * versão NUNCA é cacheado. Só cai no fallback constante se o fetch falhar.
 */
const FALLBACK_CACHE_VERSION = "v2";
let ACTIVE_CACHE = `rpg-os-${FALLBACK_CACHE_VERSION}`;
const CORE = ["/manifest.json", "/icon-192.png", "/icon-512.png", "/icon-128.png", "/apple-touch-icon.png", "/badge-72.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    fetch("/sw-version.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data && typeof data.v === "string" ? data.v : FALLBACK_CACHE_VERSION))
      .catch(() => FALLBACK_CACHE_VERSION)
      .then((version) => {
        ACTIVE_CACHE = `rpg-os-${version}`;
        return caches.open(ACTIVE_CACHE);
      })
      .then((cache) => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== ACTIVE_CACHE).map((k) => caches.delete(k))))
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

const isVersionFile = (url) => url.pathname.endsWith("/sw-version.json");

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (isDataOrAuth(url)) return;
  if (isVersionFile(url)) return;

  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const c = res.clone();
          caches.open(ACTIVE_CACHE).then((cache) => cache.put(request, c));
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
              caches.open(ACTIVE_CACHE).then((cache) => cache.put(request, c));
            }
            return res;
          })
      )
    );
  }
});