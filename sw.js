// v2: always retrieve live cashier screens; never serve a stale checkout from cache.
const CACHE="coliseo-pwa-shell-v2";
const SHELL=["/manifest.webmanifest","/icons/icon.svg"];
self.addEventListener("install",event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET"||new URL(request.url).origin!==self.location.origin)return;
 if(request.mode==="navigate"||new URL(request.url).pathname==="/index.html"||new URL(request.url).pathname==="/") {
  event.respondWith(fetch(request,{cache:"no-store"}));
 }
});
