const CACHE_NAME = 'mueve5-v1.8.4';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './game.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap',
  'https://cdn-icons-png.flaticon.com/512/5903/5903517.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
