// App shell only. No Supabase responses, credentials or business data are cached.
const CACHE = "coliseo-pwa-shell-v1";
const SHELL = ["/", "/index.html", "/js/management.js", "/manifest.webmanifest", "/icons/icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  // Network-first avoids stale app logic when connected; cached shell is only a fallback.
  if (request.mode === "navigate" || SHELL.includes(new URL(request.url).pathname)) {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request).then(hit => hit || caches.match("/index.html"))));
  }
});
