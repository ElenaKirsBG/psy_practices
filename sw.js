/* Service worker: сохраняет всё приложение и библиотеку для работы без интернета */
const CACHE = 'psykab-v4';
const CORE = [
  './', 'index.html', 'styles.css', 'export.js', 'app.js', 'manifest.webmanifest',
  'fonts/Lora-Variable.ttf', 'fonts/DejaVuSans.ttf', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'data/meta.json', 'data/algorithms.json', 'data/items-0.json', 'data/items-1.json', 'data/items-2.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll()).then(cl => cl.forEach(c => c.postMessage('cached')))
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match('index.html')))
  );
});
