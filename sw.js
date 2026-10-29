/* Melbourne planner service worker: app shell + photos offline; map tiles cached as you view them (not the whole map) */
const V="mel-shell-flat-v70",IMG="mel-img-flat-v1",TILES="mel-tiles-v2",MAXT=1500;
/* r11: an install must get index.html, or it doesn't install and the old worker keeps its offline copy. The rest is best effort. ("./" was the same page, downloaded twice.) */
const PAGE="./index.html",SHELL=["./manifest.webmanifest","./icon-192.png","./icon-512.png","https://unpkg.com/leaflet@1.9.4/dist/leaflet.css","https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"];
/* r11: which of the two pages a same-origin path is, or null. "index"/"family" cover hosts that drop the .html */
const ROOT=new URL("./",location).pathname;
const pageOf=p=>p===ROOT||p===ROOT+"index.html"||p===ROOT+"index"?"./index.html":p===ROOT+"family.html"||p===ROOT+"family"?"./family.html":null;
/* r11: store only a real copy of the page: never an error, a gate or login page, a redirect elsewhere, or another file opened as a page */
const pageCopy=(res,pg)=>res&&res.ok&&res.type==="basic"&&pageOf(new URL(res.url).pathname)===pg?(res.redirected?new Response(res.body,{status:res.status,statusText:res.statusText,headers:res.headers}):res):null;
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>fetch(new Request(PAGE,{cache:"reload"})).then(res=>{const cp=pageCopy(res,PAGE);if(!cp)throw new Error("index.html not cached ("+res.status+")");return c.put(PAGE,cp)})
  .then(()=>Promise.all(SHELL.map(u=>c.add(new Request(u,{mode:u.startsWith("http")?"cors":"same-origin",cache:"reload"})).catch(()=>{}))))).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>/^mel-/.test(k)&&![V,IMG,TILES].includes(k))/* r14: only this app's old caches; other apps on the github.io origin keep theirs */.map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const isTile=u=>/arcgisonline\.com|basemaps\.cartocdn\.com|tile\.openstreetmap\.org/.test(u.hostname);
let tileW=0;
async function trim(name,max){const c=await caches.open(name);const ks=await c.keys();for(let i=0;i<ks.length-max;i++)await c.delete(ks[i])}
/* r11: tiles are fetched with CORS so each is stored at its real size (an opaque copy counts about 7 MB toward Chrome's storage quota).
   If a tile server refuses CORS, the tile still shows but isn't stored. */
let tileCors=true,tileOffT=0;
function tile(r,c){if(!tileCors&&Date.now()-tileOffT<300000)return fetch(r);tileCors=true;/* r14: a failed CORS fetch (often just a dropped connection) pauses tile caching for 5 min, not until restart */
  return fetch(r.url,{mode:"cors",credentials:"omit"}).then(res=>{if(res.ok)c.put(r,res.clone()).then(()=>{if(++tileW%25===1)return trim(TILES,MAXT)}).catch(()=>{})/* r13: trim every 25 tile writes, not every one */;return res},()=>fetch(r).then(res=>{tileCors=false;tileOffT=Date.now();return res}))}
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;const u=new URL(r.url),same=u.origin===location.origin;
  if(/jsonblob\.com$/.test(u.hostname))return; /* sync: always live */
  if(u.hostname==="router.project-osrm.org")return; /* app keeps its own OSRM cache */
  const pg=same&&pageOf(u.pathname);
  if(pg){e.respondWith(fetch(r).then(res=>{const cp=pageCopy(res.clone(),pg);if(cp)caches.open(V).then(c=>c.put(pg,cp)).catch(()=>{});return res})
    .catch(()=>caches.match(pg,{ignoreSearch:true}).then(x=>x||Response.error())));return}
  if(same&&/\/img(\/|__)/.test(u.pathname)){ /* r11: the app's photos are under img/ (img/v2/…, img/v3/…) */
    e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>hit||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(IMG).then(c=>c.put(r,cp)).catch(()=>{})}return res})));return}
  if(isTile(u)){e.respondWith(caches.open(TILES).then(c=>c.match(r).then(hit=>hit||tile(r,c))));return}
  e.respondWith(caches.match(r,{ignoreSearch:same}).then(hit=>hit||fetch(r).then(res=>{if(res.ok&&(same||u.hostname==="unpkg.com")){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp)).catch(()=>{})}return res})))});
self.addEventListener("message",e=>{const m=e.data||{};if(m.type!=="cacheAll")return;const src=e.source;
  e.waitUntil((async()=>{const c=await caches.open(IMG);let done=0,fail=0;const urls=m.urls||[];const tot=urls.length;
    for(let i=0;i<urls.length;i+=6){await Promise.all(urls.slice(i,i+6).map(async p=>{const req=new Request(new URL(p,self.registration.scope).href);try{if(!(await c.match(req))){const res=await fetch(req);if(res.ok)await c.put(req,res);else fail++}}catch(_){fail++}done++}));
      if(src)src.postMessage({type:"progress",done,total:tot,fail})}})())});
