import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../app/dist/", import.meta.url);
async function files(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) =>
      e.isDirectory()
        ? files(new URL(`${e.name}/`, directory), `${prefix}${e.name}/`)
        : [`${prefix}${e.name}`],
    ),
  );
  return nested.flat();
}
const assets = (await files(root)).filter((f) => f !== "sw.js").sort();
const hash = createHash("sha256");
for (const file of assets) hash.update(await readFile(new URL(file, root)));
const version = `mutiny-${hash.digest("hex").slice(0, 16)}`;
await writeFile(
  new URL("sw.js", root),
  `const CACHE=${JSON.stringify(version)};
const ASSETS=${JSON.stringify(assets)};
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("mutiny-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=="GET"||url.origin!==self.location.origin)return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  const cached=await cache.match(event.request,{ignoreSearch:true,ignoreVary:true});
  if(cached)return cached;
  try{return await fetch(event.request);}catch(error){
   if(event.request.mode==="navigate")return cache.match("index.html");
   throw error;
  }
 }));
});
`,
);
console.log(`Offline Free Play: ${assets.length} bundled assets.`);
