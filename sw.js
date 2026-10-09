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

const VERSION = 'v16';
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
  './js/citas.js',
  './js/sesion.js',
  './js/nube.js',
  './js/sincro.js',
  './js/views/acceso.js',
  './js/cuaderno.js',
  './js/formato.js',
  './js/formato-editor.js',
  './js/vendor/supabase.js',
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
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mis-clientes-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// --- Notificaciones push ---------------------------------------------------------
// El servidor manda un aviso vacío a la hora indicada; aquí se arma el texto con
// el resumen que la app dejó guardado (nube.js → escribirResumen).
const CACHE_DATOS = 'datos-mis-clientes';

async function leerJSON(ruta) {
  try {
    const r = await (await caches.open(CACHE_DATOS)).match(ruta);
    return r ? await r.json() : null;
  } catch { return null; }
}
async function guardarJSON(ruta, valor) {
  const c = await caches.open(CACHE_DATOS);
  await c.put(ruta, new Response(JSON.stringify(valor), { headers: { 'Content-Type': 'application/json' } }));
}
const fechaLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function armarAviso() {
  const ahora = Date.now();
  const icono = { icon: './icons/icon-192.png', badge: './icons/icon-192.png' };

  // Notificación de prueba (pedida desde Ajustes)
  const prueba = await leerJSON('./__prueba');
  if (prueba && ahora - prueba.t < 5 * 60000) {
    await guardarJSON('./__prueba', { t: 0 });
    return { titulo: '¡Las notificaciones funcionan! ✅', cuerpo: 'Así te avisaremos de tus clientes y citas.', tag: `prueba-${ahora}`, url: './#/ajustes', ...icono };
  }

  const resumen = (await leerJSON('./__resumen')) || {};
  const avisadas = (await leerJSON('./__avisadas')) || [];

  // ¿Viene una cita en la próxima hora y media?
  const cita = (resumen.citas || []).find((c) => {
    const falta = Date.parse(c.inicio) - ahora;
    return falta <= 100 * 60000 && falta > -15 * 60000 && !avisadas.includes(c.id);
  });
  if (cita) {
    await guardarJSON('./__avisadas', [...avisadas.slice(-50), cita.id]);
    const min = Math.max(0, Math.round((Date.parse(cita.inicio) - ahora) / 60000));
    const cuando = min >= 50 ? 'en 1 hora' : min > 1 ? `en ${min} minutos` : 'ahora';
    return { titulo: `${cita.tipo} ${cuando}`, cuerpo: cita.texto, tag: `cita-${cita.id}`, url: './#/hoy', ...icono };
  }

  // Resumen del día
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const dia = resumen.dias?.[fechaLocal()];
  return {
    titulo: `${saludo}${resumen.nombre ? `, ${resumen.nombre}` : ''} 🌞`,
    cuerpo: dia?.texto ? `Hoy: ${dia.texto}` : 'Revisa tus clientes de hoy en Mis Clientes.',
    tag: 'resumen-dia', url: './#/hoy', ...icono,
  };
}

self.addEventListener('push', (e) => {
  e.waitUntil(armarAviso().then((a) =>
    // renotify: aunque haya una notificación anterior con la misma etiqueta sin leer,
    // la nueva suena y se muestra (si no, la reemplaza en silencio)
    self.registration.showNotification(a.titulo, { body: a.cuerpo, icon: a.icon, badge: a.badge, tag: a.tag, renotify: true, data: { url: a.url } })));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './#/hoy', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const c of lista) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
        c.navigate?.(url).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
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

  // Primero internet. "no-cache" obliga a preguntarle al servidor si hay versión
  // nueva (GitHub Pages deja guardar 10 minutos y se mezclarían versiones).
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
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
