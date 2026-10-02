/* Cache recorded card audio so letter and word cards still speak offline. */
const CACHE = 'abc-audio-v1';
const FILES = ["audio/letters/a.mp3", "audio/letters/b.mp3", "audio/letters/c.mp3", "audio/letters/d.mp3", "audio/letters/e.mp3", "audio/letters/f.mp3", "audio/letters/g.mp3", "audio/letters/h.mp3", "audio/letters/i.mp3", "audio/letters/j.mp3", "audio/letters/k.mp3", "audio/letters/l.mp3", "audio/letters/m.mp3", "audio/letters/n.mp3", "audio/letters/o.mp3", "audio/letters/p.mp3", "audio/letters/q.mp3", "audio/letters/r.mp3", "audio/letters/s.mp3", "audio/letters/t.mp3", "audio/letters/u.mp3", "audio/letters/v.mp3", "audio/letters/w.mp3", "audio/letters/x.mp3", "audio/letters/y.mp3", "audio/letters/z.mp3", "audio/words/apple.mp3", "audio/words/ant.mp3", "audio/words/airplane.mp3", "audio/words/ball.mp3", "audio/words/bear.mp3", "audio/words/banana.mp3", "audio/words/cat.mp3", "audio/words/car.mp3", "audio/words/cake.mp3", "audio/words/dog.mp3", "audio/words/duck.mp3", "audio/words/door.mp3", "audio/words/egg.mp3", "audio/words/elephant.mp3", "audio/words/eye.mp3", "audio/words/fish.mp3", "audio/words/frog.mp3", "audio/words/flower.mp3", "audio/words/grapes.mp3", "audio/words/giraffe.mp3", "audio/words/gift.mp3", "audio/words/hat.mp3", "audio/words/horse.mp3", "audio/words/house.mp3", "audio/words/ice-cream.mp3", "audio/words/igloo.mp3", "audio/words/juice.mp3", "audio/words/jellyfish.mp3", "audio/words/kite.mp3", "audio/words/key.mp3", "audio/words/koala.mp3", "audio/words/lion.mp3", "audio/words/lemon.mp3", "audio/words/leaf.mp3", "audio/words/moon.mp3", "audio/words/monkey.mp3", "audio/words/milk.mp3", "audio/words/nose.mp3", "audio/words/nest.mp3", "audio/words/orange.mp3", "audio/words/owl.mp3", "audio/words/octopus.mp3", "audio/words/pig.mp3", "audio/words/penguin.mp3", "audio/words/pizza.mp3", "audio/words/queen.mp3", "audio/words/quilt.mp3", "audio/words/rabbit.mp3", "audio/words/rainbow.mp3", "audio/words/rocket.mp3", "audio/words/sun.mp3", "audio/words/star.mp3", "audio/words/sock.mp3", "audio/words/tiger.mp3", "audio/words/tree.mp3", "audio/words/train.mp3", "audio/words/umbrella.mp3", "audio/words/unicorn.mp3", "audio/words/van.mp3", "audio/words/violin.mp3", "audio/words/whale.mp3", "audio/words/water.mp3", "audio/words/watch.mp3", "audio/words/xylophone.mp3", "audio/words/x-ray.mp3", "audio/words/yo-yo.mp3", "audio/words/yogurt.mp3", "audio/words/zebra.mp3", "audio/words/zoo.mp3"];
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
  if (url.origin !== self.location.origin || !url.pathname.endsWith('.mp3')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const res = await fetch(event.request);
    if (res && res.ok) cache.put(event.request, res.clone());
    return res;
  })());
});
