// Service worker: guarda la app para que abra y funcione sin conexión.
// Al publicar cambios, subir VERSION para que los usuarios reciban la nueva versión.
const VERSION = 'pympocket-v2.3.0';

const APP_SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js',
  'js/auth.js',
  'js/charts.js',
  'js/config.js',
  'js/csv.js',
  'js/demo.js',
  'js/db.js',
  'js/defaults.js',
  'js/format.js',
  'js/habits.js',
  'js/i18n.js',
  'js/i18n/en.js',
  'js/i18n/es.js',
  'js/i18n/pt.js',
  'js/lock.js',
  'js/model.js',
  'js/plan.js',
  'js/rates.js',
  'js/recurring.js',
  'js/store.js',
  'js/sync.js',
  'js/theme.js',
  'js/ui.js',
  'js/util.js',
  'js/views/analysis.js',
  'js/views/auth.js',
  'js/views/budgets.js',
  'js/views/categories.js',
  'js/views/common.js',
  'js/views/goals.js',
  'js/views/home.js',
  'js/views/more.js',
  'js/views/movementForm.js',
  'js/views/movements.js',
  'js/views/recurring.js',
  'js/views/trash.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const LOCAL_DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // La cotización del BCRA y otros orígenes van siempre a la red.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // En la computadora de desarrollo se pide siempre la versión nueva (y la
  // caché solo se usa sin conexión), así los cambios se ven al recargar.
  if (LOCAL_DEV) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true })),
    );
    return;
  }
  // Publicada: responde al instante desde la caché y la actualiza en segundo plano.
  event.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(event.request, { ignoreSearch: true }).then((cached) => {
        const network = fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          })
          .catch(() => cached);
        if (cached) event.waitUntil(network);
        return cached || network;
      }),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((wins) => (wins[0] ? wins[0].focus() : self.clients.openWindow('./#/inicio?nuevo=1'))),
  );
});
