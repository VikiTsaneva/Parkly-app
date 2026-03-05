const CACHE_NAME = 'parkly-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.6.1/firebase-database-compat.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js'
];

// Инсталиране на service worker
self.addEventListener('install', event => {
  console.log('Service Worker инсталиране...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Кеширане на файлове');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Активиране на service worker
self.addEventListener('activate', event => {
  console.log('Service Worker активиране...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Изтриване на стар кеш:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Стратегия за кеширане: Cache First, then Network
self.addEventListener('fetch', event => {
  // Пропускаме Firebase и EmailJS заявките (не ги кешираме)
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('emailjs') ||
      event.request.url.includes('googleapis')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Връщаме от кеш ако има
        if (response) {
          return response;
        }
        
        // Ако няма в кеш, правим мрежова заявка
        return fetch(event.request).then(
          response => {
            // Проверяваме дали отговорът е валиден
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Кешираме новия ресурс
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

// Синхронизация при възстановяване на връзката
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log('Синхронизиране на данни...');
    // Тук може да добавите логика за синхронизация
  }
});
