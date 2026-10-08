// =============================================================================
// sesion.js — Cerrar sesión, pantalla de entrada y PIN opcional.
//
// La app no tiene cuentas: los datos viven en el dispositivo. "Cerrar sesión"
// oculta todo detrás de una pantalla de entrada. Si hay PIN, hay que
// escribirlo para entrar. El PIN se guarda cifrado (hash SHA-256), pero los
// datos en sí no se cifran: el PIN evita que alguien que toma el celular vea
// los clientes, no es una protección contra expertos.
// =============================================================================

import * as store from './store.js';
import { FOTOS } from './config.js';
import { abrirHoja, cerrarHoja, aviso, icon } from './ui.js';
import { esc, primerNombre } from './util.js';

const SAL = 'mis-clientes:pin:';

async function hashPin(pin) {
  const texto = SAL + pin;
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Respaldo si el navegador no tiene crypto.subtle (no debería pasar en https)
  let h = 0;
  for (const ch of texto) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `s${h}`;
}

export const tienePin = () => !!store.ajustes().pinHash;
export const sesionCerrada = () => !!store.ajustes().sesionCerrada;

/** Cierra la sesión y muestra la pantalla de entrada. */
export function cerrarSesion(alEntrar) {
  cerrarHoja();
  store.actualizarAjustes({ sesionCerrada: true });
  document.getElementById('view').replaceChildren(); // que no quede nada visible detrás
  mostrarEntrada(alEntrar);
  if (!tienePin()) {
    setTimeout(() => aviso('Para que nadie más pueda entrar, crea un PIN en Ajustes.', { icono: 'lock', ms: 6000 }), 400);
  }
}

/** Pantalla de entrada (con o sin PIN). */
export function mostrarEntrada(alEntrar) {
  document.querySelector('.entrada')?.remove();
  document.getElementById('toast').hidden = true; // que ningún aviso tape la entrada
  const a = store.ajustes();
  const nombre = primerNombre(a.nombre);
  const conPin = tienePin();
  const el = document.createElement('div');
  el.className = 'welcome entrada';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Entrar');
  el.innerHTML = `
    <img class="hero-img" src="img/${FOTOS.bienvenida}" alt="">
    <div class="welcome-inner">
      <div class="brand"><img src="icons/icon-192.png" alt="" width="40" height="40"> Mis Clientes</div>
      <h1>Hola de nuevo${nombre ? `,<br><em>${esc(nombre)}</em>` : ''}</h1>
      <p class="lead">${conPin ? 'Escribe tu PIN para entrar.' : 'Tu sesión está cerrada. Tus clientes siguen guardados.'}</p>
      <form data-form novalidate>
        ${conPin ? `
        <div class="field">
          <label for="e-pin">PIN</label>
          <input id="e-pin" class="input pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••">
          <span class="field-error" data-error hidden>PIN incorrecto. Intenta de nuevo.</span>
        </div>` : ''}
        <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('lock')} Entrar</button>
      </form>
      <div class="entrada-links">
        ${conPin ? '<button type="button" class="link-claro" data-olvide>Olvidé mi PIN</button>' : ''}
        <button type="button" class="link-claro" data-cero>Empezar de cero en este equipo</button>
      </div>
      <div class="entrada-aviso" data-panel hidden></div>
    </div>`;
  document.body.appendChild(el);
  const pin = el.querySelector('#e-pin');
  (pin || el.querySelector('button[type=submit]')).focus({ preventScroll: true });

  const entrar = () => {
    store.actualizarAjustes({ sesionCerrada: false });
    el.style.transition = 'opacity .3s'; el.style.opacity = '0';
    setTimeout(() => { el.remove(); alEntrar?.(); }, 300);
  };

  el.querySelector('[data-form]').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!conPin) { entrar(); return; }
    if ((await hashPin(pin.value)) === store.ajustes().pinHash) { entrar(); return; }
    el.querySelector('[data-error]').hidden = false;
    pin.value = '';
    pin.classList.add('invalid');
    pin.focus();
  });
  // Entrar solo al completar los 4 números
  pin?.addEventListener('input', () => {
    pin.value = pin.value.replace(/\D/g, '').slice(0, 4);
    pin.classList.remove('invalid');
    el.querySelector('[data-error]').hidden = true;
    if (pin.value.length === 4) el.querySelector('[data-form]').requestSubmit();
  });

  const panel = el.querySelector('[data-panel]');
  const mostrarPanel = (html) => {
    panel.innerHTML = html; panel.hidden = false;
    panel.querySelector('[data-no]')?.addEventListener('click', () => { panel.hidden = true; });
    panel.querySelector('[data-si]')?.addEventListener('click', () => {
      store.reiniciar();
      location.reload();
    });
  };
  const textoBorrar = `
    <div class="hstack" style="justify-content:flex-end;gap:8px;margin-top:12px">
      <button type="button" class="btn btn-sm btn-glass" data-no>Volver</button>
      <button type="button" class="btn btn-sm btn-primary" data-si>Borrar todo</button>
    </div>`;
  el.querySelector('[data-olvide]')?.addEventListener('click', () => mostrarPanel(`
    <b>¿Olvidaste tu PIN?</b>
    <p>Sin el PIN no se puede abrir la app. Puedes borrar los datos de este equipo y luego <b>restaurar tu copia de seguridad</b> (Ajustes → Restaurar una copia). Lo que no esté en la copia se pierde.</p>
    ${textoBorrar}`));
  el.querySelector('[data-cero]').addEventListener('click', () => mostrarPanel(`
    <b>¿Empezar de cero en este equipo?</b>
    <p>Se borrarán todos los clientes, mensajes y citas guardados en este equipo. Úsalo si este computador o celular no es tuyo. Si tienes una copia de seguridad, podrás restaurarla después.</p>
    ${textoBorrar}`));
}

// --- PIN en Ajustes -------------------------------------------------------------
export function configurarPin() {
  const cambiar = tienePin();
  abrirHoja({
    titulo: cambiar ? 'Cambiar PIN' : 'Crear PIN',
    cuerpo: `
      <p class="muted">Con un PIN de 4 números, al cerrar sesión nadie más podrá ver tus clientes en este equipo.</p>
      <div class="row mt-16">
        <div class="field">
          <label for="p1">PIN nuevo</label>
          <input id="p1" class="input pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" autofocus>
        </div>
        <div class="field">
          <label for="p2">Repítelo</label>
          <input id="p2" class="input pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off">
        </div>
      </div>
      <p class="small muted">${icon('shield', 'i-sm')} Anótalo en un lugar seguro. Si lo olvidas, tendrás que restaurar tu copia de seguridad.</p>`,
    pie: `<button class="btn btn-outline" data-cancel>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar PIN</button>`,
    montar: (el) => {
      const p1 = el.querySelector('#p1'), p2 = el.querySelector('#p2');
      [p1, p2].forEach((x) => x.addEventListener('input', () => { x.value = x.value.replace(/\D/g, '').slice(0, 4); if (x === p1 && x.value.length === 4) p2.focus(); }));
      el.querySelector('[data-cancel]').addEventListener('click', () => cerrarHoja());
      el.querySelector('[data-ok]').addEventListener('click', async () => {
        if (p1.value.length !== 4) { aviso('El PIN debe tener 4 números', { icono: 'x' }); p1.focus(); return; }
        if (p1.value !== p2.value) { aviso('Los dos PIN no coinciden', { icono: 'x' }); p2.value = ''; p2.focus(); return; }
        store.actualizarAjustes({ pinHash: await hashPin(p1.value) });
        cerrarHoja();
        aviso(cambiar ? 'PIN cambiado' : 'PIN creado. Te lo pediremos al entrar después de cerrar sesión.', { icono: 'lock', ms: 5000 });
      });
    },
  });
}

export function quitarPin() {
  store.actualizarAjustes({ pinHash: '' });
  aviso('PIN quitado', { icono: 'lock' });
}
