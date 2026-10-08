// =============================================================================
// sw.js — Service worker: permite abrir la app sin internet.
//
// Estrategia:
//   • Código (HTML, JS, CSS): primero internet, y si no hay, la copia guardada.
//     Así cada vez que publicas cambios, la gente los ve de inmediato.
//   • Imágenes, íconos y fuentes: primero la copia guardada (cargan rápido).
//
// Si agregas archivos nuevos que deban funcionar sin internet, súmalos a
// ARCHIVOS y cambia VERSION.
// =============================================================================

const VERSION = 'v4';
const CACHE = `mis-clientes-${VERSION}`;

const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/main.js',
  './js/config.js',
  './js/util.js',
  './js/store.js',
  './js/engine.js',
  './js/whatsapp.js',
  './js/ui.js',
  './js/enviar.js',
  './js/cliente-form.js',
  './js/importar.js',
  './js/documentos.js',
  './js/recordatorios.js',
  './js/views/hoy.js',
  './js/views/clientes.js',
  './js/views/ficha.js',
  './js/views/mensajes.js',
  './js/views/ajustes.js',
  './js/views/bienvenida.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png',
  './img/qashqai-atardecer.jpg',
  './img/gtr-naranja.jpg',
  './img/gtr-negro.jpg',
  './img/frontier-negra.jpg',
  './img/navara-nieve.jpg',
  './img/xterra-montana.jpg',
  './img/volante.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mis-clientes-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const esEstatico = (url) =>
  /\.(png|jpe?g|webp|svg|woff2?)$/i.test(url.pathname) || url.hostname.includes('fonts.g') || url.hostname === 'cdnjs.cloudflare.com';

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  if (esEstatico(url)) {
    // Primero la copia guardada
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })),
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Primero internet
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html'))),
  );
});
