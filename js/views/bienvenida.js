// =============================================================================
// views/bienvenida.js — Pantalla de la primera vez: nombre, país y opción
// de cargar clientes de ejemplo.
// =============================================================================

import * as store from '../store.js';
import { PAISES, FOTOS } from '../config.js';
import { cargarEjemplo } from '../importar.js';
import { icon } from '../ui.js';
import { esc } from '../util.js';

/** País sugerido según el idioma/región del navegador. */
function paisSugerido() {
  const region = (navigator.language || '').split('-')[1]?.toUpperCase();
  const mapa = { CO: '57', MX: '52', PE: '51', CL: '56', EC: '593', VE: '58', AR: '54', PA: '507', CR: '506', GT: '502', SV: '503', HN: '504', BO: '591', PY: '595', UY: '598', US: '1', DO: '1', PR: '1', ES: '34' };
  return mapa[region] || '57';
}

export function mostrarBienvenida(alTerminar, { nombre = "", cuenta = false } = {}) {
  const el = document.createElement('div');
  el.className = 'welcome';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Bienvenida');
  const sugerido = paisSugerido();
  el.innerHTML = `
    <img class="hero-img" src="img/${FOTOS.bienvenida}" alt="">
    <div class="welcome-inner">
      <div class="brand"><img src="icons/icon-192.png" alt="" width="40" height="40"> Mis Clientes</div>
      <h1>${cuenta ? `¡Hola${nombre ? `, ${esc(nombre)}` : ""}!<br><em>Ya casi está.</em>` : "Tus clientes,<br><em>siempre a mano.</em>"}</h1>
      <p class="lead">${cuenta ? "Confirma tu nombre y tu país. Tus clientes se guardarán en tu cuenta." : "Registra a tus clientes, recibe recordatorios y envía mensajes de WhatsApp en segundos."}</p>
      <ul class="feature-list">
        <li>${icon('users')} Todos tus clientes en un solo lugar</li>
        <li>${icon('gift')} Cumpleaños y seguimientos automáticos</li>
        <li>${icon('send')} Mensajes listos para WhatsApp</li>
      </ul>
      <form data-form novalidate>
        <div class="field">
          <label for="w-nombre">¿Cómo te llamas?</label>
          <input id="w-nombre" class="input" name="nombre" value="${esc(nombre)}" placeholder="Tu nombre" autocomplete="given-name" autocapitalize="words">
        </div>
        <div class="field">
          <label for="w-pais">País</label>
          <select id="w-pais" class="select" name="pais">
            ${PAISES.map((p) => `<option value="${p.codigo}" ${p.codigo === sugerido ? 'selected' : ''}>${esc(p.nombre)} (+${p.codigo})</option>`).join('')}
          </select>
        </div>
        <label class="check"><input type="checkbox" name="ejemplo"> Cargar clientes de ejemplo para probar</label>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Empezar ${icon('chev-r')}</button>
        <p class="small center mt-16" style="color:rgba(255,255,255,.6)">${cuenta ? "Tus clientes se guardan en tu cuenta. Solo tú puedes verlos." : "Tus datos se guardan solo en este dispositivo. Nadie más los ve."}</p>
      </form>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#w-nombre').focus({ preventScroll: true });

  el.querySelector('[data-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    store.actualizarAjustes({ nombre: f.nombre.value.trim(), codigoPais: f.pais.value, bienvenidaVista: true });
    if (f.ejemplo.checked) cargarEjemplo();
    el.style.transition = 'opacity .35s'; el.style.opacity = '0';
    setTimeout(() => { el.remove(); alTerminar?.(); }, 350);
  });
}
