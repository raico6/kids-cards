/* Cache recorded card audio so letter and word cards still speak offline.
   URLs include ?v=<file hash>. Matching keeps that query, so a new hash is a cache miss. */
importScripts('audio-ver.js');
const CACHE = 'abc-audio-v11';
function isCachedAudio(url) {
  return url.origin === self.location.origin && url.pathname.endsWith('.mp3');
}
const FILES = Object.keys(self.AUDIO_VER).sort().map(function (path) {
  return path + '?v=' + self.AUDIO_VER[path];
});
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!isCachedAudio(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request, { ignoreSearch: false });
    if (hit) return hit;
    const res = await fetch(event.request);
    if (res && res.ok) cache.put(event.request, res.clone());
    return res;
  })());
});
