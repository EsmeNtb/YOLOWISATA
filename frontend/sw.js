// Service worker: keeps the website working with no internet after the first visit.
// Bump VERSION every time you deploy a change, so phones pick up the new files.
const VERSION="yolowisata-v16";
const SHELL=["/","/index.html","/app.css","/app.js","/config.js","/data/content.json","/icon.svg","/manifest.webmanifest"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  const url=new URL(r.url);
  if(url.pathname.startsWith("/api/"))return;               // backend calls always go to the network
  // Our own files (page, css, js, data): network first so a new deploy shows up straight away, saved copy when there is no signal.
  if(url.origin===location.origin){
    const key=r.mode==="navigate"?"/index.html":r;
    e.respondWith(fetch(r).then(res=>{if(res.ok){const c=res.clone();caches.open(VERSION).then(x=>x.put(key,c))}return res}).catch(()=>caches.match(key)));return}
  // Fonts and other outside files: saved copy first, then network, and keep what we fetch.
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok||res.type==="opaque"){const c=res.clone();caches.open(VERSION).then(x=>x.put(r,c))}return res})));
});