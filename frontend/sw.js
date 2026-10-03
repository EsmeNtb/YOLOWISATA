// Service worker: keeps the website working with no internet after the first visit.
// Bump VERSION every time you deploy a change, so phones pick up the new files.
const VERSION="yolowisata-v3";
const SHELL=["/","/index.html","/app.css","/app.js","/config.js","/data/content.json","/icon.svg","/manifest.webmanifest"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const url=new URL(r.url);
  if(url.pathname.startsWith("/api/"))return;               // backend calls always go to the network
  // Pages and content: network first so updates arrive, saved copy when there is no signal.
  if(r.mode==="navigate"||url.pathname==="/data/content.json"){
    const key=r.mode==="navigate"?"/index.html":r;
    e.respondWith(fetch(r).then(res=>{const c=res.clone();caches.open(VERSION).then(x=>x.put(key,c));return res}).catch(()=>caches.match(key)));return}
  // Everything else (css, js, fonts): saved copy first, then network, and keep what we fetch.
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok||res.type==="opaque"){const c=res.clone();caches.open(VERSION).then(x=>x.put(r,c))}return res})));
});
