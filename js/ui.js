// =============================================================================
// ui.js — Piezas visuales reutilizables: íconos, hoja inferior (ventana),
// avisos (toast), confirmaciones, avatares y pastillas de color.
// =============================================================================

import { ETAPAS, CATEGORIAS } from './config.js';
import { esc, iniciales, colorDe } from './util.js';

export const icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export const etapa = (id) => ETAPAS.find((e) => e.id === id) || ETAPAS[0];
export const categoria = (id) => CATEGORIAS.find((c) => c.id === id) || { id, nombre: 'Otros', icon: 'message', color: 'gray' };

/** ¿Se está viendo en modo oscuro? (por elección o por el sistema) */
export function temaOscuro() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Botón redondo para cambiar entre claro y oscuro (main.js maneja el clic). */
export function botonTema() {
  const oscuro = temaOscuro();
  return `<button class="tema-btn" type="button" data-tema-toggle aria-label="${oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}">${icon(oscuro ? 'sun' : 'moon')}</button>`;
}

export const avatar = (nombre, cls = '') =>
  `<span class="avatar ${cls}" data-color="${colorDe(nombre)}" aria-hidden="true">${esc(iniciales(nombre))}</span>`;

export const pillEtapa = (id) => { const e = etapa(id); return `<span class="pill" data-color="${e.color}">${esc(e.nombre)}</span>`; };
export const pillCategoria = (id) => { const c = categoria(id); return `<span class="pill no-dot" data-color="${c.color}">${icon(c.icon, 'i-sm')}${esc(c.nombre)}</span>`; };
export const badgeCategoria = (id) => { const c = categoria(id); return `<span class="icon-badge" data-color="${c.color}">${icon(c.icon)}</span>`; };

// --- Hoja inferior (en computador se ve como ventana centrada) ----------------
const $sheet = () => document.getElementById('sheet');
const $backdrop = () => document.getElementById('sheetBackdrop');
let alCerrar = null;
let historialEmpujado = false;
let ignorarPop = false;
let focoAnterior = null;

/**
 * Abre una hoja.
 * @param {object} o
 * @param {string} o.titulo
 * @param {string} o.cuerpo   HTML del contenido
 * @param {string} [o.pie]    HTML de los botones de abajo
 * @param {boolean} [o.alta]  Ocupa casi toda la pantalla
 * @param {(el:HTMLElement)=>void} [o.montar] Para conectar eventos
 * @param {()=>void} [o.cerrar] Se llama al cerrar
 */
export function abrirHoja({ titulo, cuerpo, pie = '', alta = false, montar, cerrar }) {
  const el = $sheet();
  const yaAbierta = !el.hidden;
  if (yaAbierta && alCerrar) { const f = alCerrar; alCerrar = null; f(); }
  if (!yaAbierta) focoAnterior = document.activeElement;

  el.className = 'sheet' + (alta ? ' tall' : '');
  el.setAttribute('aria-label', titulo);
  el.innerHTML = `
    <div class="sheet-grip"></div>
    <header class="sheet-head">
      <h2>${esc(titulo)}</h2>
      <button class="btn btn-ghost btn-icon" type="button" data-cerrar aria-label="Cerrar">${icon('x')}</button>
    </header>
    <div class="sheet-body">${cuerpo}</div>
    ${pie ? `<footer class="sheet-foot">${pie}</footer>` : ''}`;
  el.hidden = false;
  $backdrop().hidden = false;
  document.body.style.overflow = 'hidden';
  document.body.classList.add('hoja-abierta');
  alCerrar = cerrar || null;

  el.querySelector('[data-cerrar]').addEventListener('click', () => cerrarHoja());
  montar?.(el);

  // El botón "atrás" del celular cierra la hoja en vez de salir de la vista
  if (!historialEmpujado) { history.pushState({ hoja: true }, ''); historialEmpujado = true; }

  const primero = el.querySelector('[autofocus]');
  (primero || el.querySelector('.sheet-head button')).focus({ preventScroll: true });
  return el;
}

export function cerrarHoja({ desdeHistorial = false } = {}) {
  const el = $sheet();
  if (el.hidden) return;
  el.hidden = true;
  el.innerHTML = '';
  $backdrop().hidden = true;
  document.body.style.overflow = '';
  document.body.classList.remove('hoja-abierta');
  if (alCerrar) { const f = alCerrar; alCerrar = null; f(); }
  if (historialEmpujado) {
    historialEmpujado = false;
    if (!desdeHistorial) { ignorarPop = true; history.back(); }
  }
  focoAnterior?.focus?.({ preventScroll: true });
}

export const hojaAbierta = () => !$sheet().hidden;

window.addEventListener('popstate', () => {
  if (ignorarPop) { ignorarPop = false; return; }
  if (hojaAbierta()) cerrarHoja({ desdeHistorial: true });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && hojaAbierta()) cerrarHoja(); });
document.addEventListener('click', (e) => { if (e.target.id === 'sheetBackdrop') cerrarHoja(); });

/** Pregunta Sí/No. Devuelve una promesa con true/false. */
export function confirmar({ titulo, texto = '', si = 'Sí', no = 'Cancelar', peligro = false }) {
  return new Promise((resolve) => {
    let respondido = false;
    abrirHoja({
      titulo,
      cuerpo: texto ? `<p class="muted">${texto}</p>` : '',
      pie: `<button class="btn btn-outline" data-no>${esc(no)}</button>
            <button class="btn ${peligro ? 'btn-danger' : 'btn-primary'}" data-si>${esc(si)}</button>`,
      montar: (el) => {
        el.querySelector('[data-si]').addEventListener('click', () => { respondido = true; cerrarHoja(); resolve(true); });
        el.querySelector('[data-no]').addEventListener('click', () => cerrarHoja());
      },
      cerrar: () => { if (!respondido) resolve(false); },
    });
  });
}

// --- Aviso temporal (toast) ---------------------------------------------------
let toastTimer;
/**
 * @param {string} mensaje
 * @param {{accion?:{texto:string, fn:()=>void}, ms?:number, icono?:string}} [o]
 */
export function aviso(mensaje, { accion, ms = 3800, icono = 'check' } = {}) {
  const el = document.getElementById('toast');
  clearTimeout(toastTimer);
  el.innerHTML = `${icono ? icon(icono) : ''}<span>${esc(mensaje)}</span>${accion ? `<button type="button">${esc(accion.texto)}</button>` : ''}`;
  el.hidden = false;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  if (accion) el.querySelector('button').addEventListener('click', () => { el.hidden = true; accion.fn(); });
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

/** Estado vacío con ícono, título y texto. */
export const vacio = ({ icono = 'sparkles', color = 'gray', titulo, texto = '', accion = '' }) => `
  <div class="empty">
    <span class="icon-badge" data-color="${color}">${icon(icono)}</span>
    <h3>${esc(titulo)}</h3>
    ${texto ? `<p>${texto}</p>` : ''}
    ${accion}
  </div>`;
