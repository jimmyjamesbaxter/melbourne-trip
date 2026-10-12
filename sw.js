/* Melbourne planner service worker: app shell + photos offline; map tiles cached as you view them (not the whole map) */
const V="mel-shell-v7",IMG="mel-img-flat-v1",TILES="mel-tiles-v1",MAXT=1500;
const SHELL=["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","https://unpkg.com/leaflet@1.9.4/dist/leaflet.css","https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>c.add(new Request(u,{mode:u.startsWith("http")?"cors":"same-origin",cache:"reload"})).catch(()=>{})))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>![V,IMG,TILES].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const isTile=u=>/arcgisonline\.com|basemaps\.cartocdn\.com|tile\.openstreetmap\.org/.test(u.hostname);
async function trim(name,max){const c=await caches.open(name);const ks=await c.keys();for(let i=0;i<ks.length-max;i++)await c.delete(ks[i])}
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;const u=new URL(r.url);
  if(/jsonblob\.com$/.test(u.hostname))return; /* sync: always live */
  if(u.hostname==="router.project-osrm.org")return; /* app keeps its own OSRM cache */
  if(r.mode==="navigate"||(u.origin===location.origin&&/\/(index\.html)?$/.test(u.pathname))){
    e.respondWith(fetch(r).then(res=>{const cp=res.clone();caches.open(V).then(c=>c.put("./index.html",cp));return res}).catch(()=>caches.match("./index.html",{ignoreSearch:true}).then(x=>x||caches.match("./",{ignoreSearch:true}))));return}
  if(u.origin===location.origin&&/\/img__[^/]+$/.test(u.pathname)){
    e.respondWith(caches.open(IMG).then(c=>c.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok)c.put(r,res.clone());return res}))));return}
  if(isTile(u)){e.respondWith(caches.open(TILES).then(c=>c.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok||res.type==="opaque"){c.put(r,res.clone());trim(TILES,MAXT)}return res}))));return}
  e.respondWith(caches.match(r,{ignoreSearch:u.origin===location.origin}).then(hit=>hit||fetch(r).then(res=>{if(res.ok&&(u.origin===location.origin||u.hostname==="unpkg.com")){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}return res})))});
self.addEventListener("message",e=>{const m=e.data||{};if(m.type!=="cacheAll")return;const src=e.source;
  e.waitUntil((async()=>{const c=await caches.open(IMG);let done=0,fail=0;const urls=m.urls||[];const tot=urls.length;
    for(let i=0;i<urls.length;i+=6){await Promise.all(urls.slice(i,i+6).map(async p=>{const req=new Request(new URL(p,self.registration.scope).href);try{if(!(await c.match(req))){const res=await fetch(req);if(res.ok)await c.put(req,res);else fail++}}catch(_){fail++}done++}));
      if(src)src.postMessage({type:"progress",done,total:tot,fail})}})())});
