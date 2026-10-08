// =============================================================================
// main.js — Arranque de la app y navegación entre pantallas.
//
// Las rutas usan el "#" de la URL:
//   #/hoy  #/clientes[/<etapa>]  #/cliente/<id>  #/mensajes[/<pestaña>]  #/ajustes
// Para agregar una pantalla nueva: crea js/views/<nombre>.js con una función
// `render(root, ctx)` y regístrala en RUTAS.
// =============================================================================

import * as store from './store.js';
import * as hoy from './views/hoy.js';
import * as clientes from './views/clientes.js';
import * as ficha from './views/ficha.js';
import * as mensajes from './views/mensajes.js';
import * as ajustes from './views/ajustes.js';
import { mostrarBienvenida } from './views/bienvenida.js';
import { abrirFormularioCliente } from './cliente-form.js';
import { pendientesHoy } from './engine.js';
import { modoSerie } from './enviar.js';
import { menuImportar } from './documentos.js';
import { sesionCerrada, cerrarSesion, mostrarEntrada } from './sesion.js';
import { actualizarInsignia } from './recordatorios.js';
import { hojaAbierta, cerrarHoja, aviso, icon, temaOscuro } from './ui.js';
import { hoy as fechaHoy, primerNombre } from './util.js';

const RUTAS = {
  hoy:      { vista: hoy,      nav: 'hoy' },
  clientes: { vista: clientes, nav: 'clientes' },
  cliente:  { vista: ficha,    nav: 'clientes' },
  mensajes: { vista: mensajes, nav: 'mensajes' },
  ajustes:  { vista: ajustes,  nav: 'ajustes' },
};

const $view = document.getElementById('view');
let rutaActual = '';
let navegaciones = 0;
let renderPendiente = false;
let ultimoDia = fechaHoy();

function leerRuta() {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const nombre = RUTAS[partes[0]] ? partes[0] : 'hoy';
  return { nombre, params: partes.slice(1), clave: location.hash || '#/hoy' };
}

export function navegar(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

function render() {
  if (sesionCerrada()) { $view.replaceChildren(); return; } // nada visible con la sesión cerrada
  const ruta = leerRuta();
  const { vista, nav } = RUTAS[ruta.nombre];
  const mismaRuta = ruta.clave === rutaActual;
  const scroll = window.scrollY;

  const root = document.createElement('div');
  vista.render(root, { params: ruta.params, navegar, puedeVolver: () => navegaciones > 1 });
  $view.replaceChildren(root);

  document.querySelectorAll('[data-nav]').forEach((a) => {
    const activo = a.dataset.nav === nav;
    a.classList.toggle('active', activo);
    if (activo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });

  if (mismaRuta) window.scrollTo(0, scroll);
  else { window.scrollTo(0, 0); rutaActual = ruta.clave; }
  renderPendiente = false;
  const pendientes = store.clientes().length ? pendientesHoy() : [];
  actualizarInsignia(pendientes.length);
  pintarTarjetaMenu(pendientes);
}

// Tarjeta con foto en el menú lateral (solo computador): lo más útil del momento
function pintarTarjetaMenu(pendientes) {
  const el = document.querySelector('[data-nav-card]');
  if (!el) return;
  const a = store.ajustes();
  const clientes = store.clientes();
  const n = pendientes.length;
  const mes = fechaHoy().slice(0, 7);
  const ventas = clientes.filter((c) => c.etapa === 'vendido' && (c.fechaCompra || '').startsWith(mes)).length;
  const meta = Number(a.metaVentas) || 0;
  let titulo, texto, extra = '';
  if (!clientes.length) {
    titulo = 'Empieza hoy';
    texto = 'Pasa los clientes de tu cuaderno en minutos.';
    extra = `<button class="btn btn-primary btn-sm btn-block" data-nav-importar>${icon('upload', 'i-sm')} Pasar clientes</button>`;
  } else if (n) {
    titulo = `${n} ${n === 1 ? 'mensaje' : 'mensajes'} para hoy`;
    texto = 'Ya están escritos. Solo toca enviar.';
    extra = `<button class="btn btn-wa btn-sm btn-block" data-nav-serie>${icon('send', 'i-sm')} Empezar a enviar</button>`;
  } else {
    titulo = 'Todo al día ✨';
    texto = 'No tienes mensajes pendientes.';
  }
  if (meta && clientes.length) {
    extra += `<div class="nav-meta"><span class="small muted">Meta del mes: <b>${ventas} de ${meta}</b></span>
      <div class="meta-bar ${ventas >= meta ? 'ok' : ''}"><span style="width:${Math.max(3, Math.min(100, (ventas / meta) * 100))}%"></span></div></div>`;
  }
  el.innerHTML = `
    <img src="img/mini/gtr-naranja.jpg" alt="" loading="lazy">
    <div class="nav-card-body"><b>${titulo}</b><span class="small muted">${texto}</span>${extra}</div>`;
}
document.querySelector('[data-nav-card]')?.addEventListener('click', (e) => {
  if (e.target.closest('[data-nav-serie]')) modoSerie(pendientesHoy());
  if (e.target.closest('[data-nav-importar]')) menuImportar();
});

// Si los datos cambian mientras la persona escribe en un campo de la pantalla,
// esperar a que termine para no borrarle lo que está escribiendo.
function escribiendoEnVista() {
  const a = document.activeElement;
  return a && $view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox';
}
store.suscribir(() => {
  aplicarTema();
  if (escribiendoEnVista()) renderPendiente = true; else render();
});
$view.addEventListener('focusout', () => {
  setTimeout(() => { if (renderPendiente && !escribiendoEnVista()) render(); }, 0);
});

window.addEventListener('hashchange', () => {
  navegaciones++;
  if (hojaAbierta()) cerrarHoja({ desdeHistorial: true });
  render();
});

// Al volver a la app (por ejemplo, después de enviar en WhatsApp), refrescar.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (fechaHoy() !== ultimoDia) { ultimoDia = fechaHoy(); render(); }
});

// Botón "+" de la barra
document.querySelector('[data-action="new-client"]').addEventListener('click', () => {
  abrirFormularioCliente(null, {
    alGuardar: (c) => aviso(`${primerNombre(c.nombre)} quedó registrado`, {
      ms: 5000, accion: { texto: 'Ver ficha', fn: () => navegar(`#/cliente/${c.id}`) },
    }),
  });
});

// Tema claro / oscuro
function aplicarTema() {
  const t = store.ajustes().tema;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const oscuro = temaOscuro();
  const btn = document.querySelector('.nav-tema');
  if (btn) btn.innerHTML = `${icon(oscuro ? 'sun' : 'moon')}<span>${oscuro ? 'Modo claro' : 'Modo oscuro'}</span>`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', oscuro ? '#0b0b0e' : '#121216');
}
// Cualquier botón con data-tema-toggle cambia entre claro y oscuro
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-tema-toggle]')) store.actualizarAjustes({ tema: temaOscuro() ? 'light' : 'dark' });
});
// Si está en automático y el celular cambia de modo, actualizar los botones
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { aplicarTema(); render(); });

// Funciona sin internet y se puede instalar (service worker)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  // Cuando se publica una versión nueva, el service worker nuevo toma el control:
  // recargar una vez para que se vea de inmediato (no aplica en la primera visita).
  const habiaVersion = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaVersion || recargando || hojaAbierta()) return;
    recargando = true;
    location.reload();
  });
}

// Cerrar sesión (menú lateral en computador; en celular está en Ajustes)
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-cerrar-sesion]')) cerrarSesion(() => render());
});

// --- Arranque ---
aplicarTema();
navegaciones = 1;
if (sesionCerrada()) {
  mostrarEntrada(() => render());
} else {
  render();
  if (!store.ajustes().bienvenidaVista && !store.clientes().length) {
    mostrarBienvenida(() => render());
  }
}
