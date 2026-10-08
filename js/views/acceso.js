// =============================================================================
// views/acceso.js — Pantalla de iniciar sesión / crear cuenta / recuperar
// contraseña, y la ventana para poner una contraseña nueva.
// =============================================================================

import * as nube from '../nube.js';
import { FOTOS } from '../config.js';
import { abrirHoja, cerrarHoja, aviso, icon } from '../ui.js';
import { esc } from '../util.js';

/**
 * Muestra la pantalla de acceso.
 * @returns {Promise<{modo:'cuenta', usuario:object} | {modo:'local'}>}
 */
export function mostrarAcceso({ modoInicial = 'entrar', mensaje = '' } = {}) {
  return new Promise((resolve) => {
    document.querySelector('.acceso')?.remove();
    document.getElementById('toast').hidden = true;
    const el = document.createElement('div');
    el.className = 'welcome acceso';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Iniciar sesión');
    document.body.appendChild(el);
    let modo = modoInicial; // 'entrar' | 'crear' | 'recuperar'

    const terminar = (r) => {
      el.style.transition = 'opacity .3s'; el.style.opacity = '0';
      setTimeout(() => { el.remove(); resolve(r); }, 300);
    };

    const pintar = (aviso_ = mensaje) => {
      const titulos = {
        entrar: ['Tus clientes,<br><em>en todos tus equipos.</em>', 'Inicia sesión para ver tus clientes en el celular y en el computador.'],
        crear: ['Crea tu<br><em>cuenta gratis.</em>', 'Tus clientes quedan guardados en la nube: si cambias de celular, no pierdes nada.'],
        recuperar: ['¿Olvidaste tu<br><em>contraseña?</em>', 'Escribe tu correo y te enviamos un enlace para crear una nueva.'],
      };
      const [h1, lead] = titulos[modo];
      el.innerHTML = `
        <img class="hero-img" src="img/${FOTOS.bienvenida}" alt="">
        <div class="welcome-inner">
          <div class="brand"><img src="icons/icon-192.png" alt="" width="40" height="40"> Mis Clientes</div>
          <h1>${h1}</h1>
          <p class="lead">${lead}</p>
          ${modo !== 'recuperar' ? `
          <div class="segmented acceso-tabs" role="tablist">
            <button type="button" class="${modo === 'entrar' ? 'on' : ''}" data-modo="entrar" role="tab">Iniciar sesión</button>
            <button type="button" class="${modo === 'crear' ? 'on' : ''}" data-modo="crear" role="tab">Crear cuenta</button>
          </div>` : ''}
          <form data-form novalidate class="mt-16">
            ${modo === 'crear' ? `
            <div class="field">
              <label for="a-nombre">Tu nombre</label>
              <input id="a-nombre" class="input" name="nombre" autocomplete="given-name" autocapitalize="words" placeholder="Ej: Shirley">
            </div>` : ''}
            <div class="field">
              <label for="a-correo">Correo</label>
              <input id="a-correo" class="input" name="correo" type="email" inputmode="email" autocomplete="email" autocapitalize="off" placeholder="tucorreo@gmail.com">
            </div>
            ${modo !== 'recuperar' ? `
            <div class="field">
              <label for="a-clave">Contraseña</label>
              <div class="clave-wrap">
                <input id="a-clave" class="input" name="clave" type="password" autocomplete="${modo === 'crear' ? 'new-password' : 'current-password'}" placeholder="${modo === 'crear' ? 'Mínimo 6 caracteres' : 'Tu contraseña'}">
                <button type="button" class="ver-clave" data-ver aria-label="Mostrar contraseña">Ver</button>
              </div>
            </div>` : ''}
            <p class="acceso-msg" data-msg ${aviso_ ? '' : 'hidden'}>${esc(aviso_)}</p>
            <button class="btn btn-primary btn-lg btn-block" type="submit" data-enviar>
              ${modo === 'entrar' ? `${icon('lock')} Iniciar sesión` : modo === 'crear' ? `${icon('check')} Crear cuenta` : `${icon('send')} Enviar enlace`}
            </button>
          </form>
          <div class="entrada-links">
            ${modo === 'entrar' ? '<button type="button" class="link-claro" data-modo="recuperar">Olvidé mi contraseña</button>' : ''}
            ${modo === 'recuperar' ? '<button type="button" class="link-claro" data-modo="entrar">Volver a iniciar sesión</button>' : ''}
          </div>
          <div class="acceso-local">
            <button type="button" class="link-claro" data-local>Usar sin cuenta (solo en este equipo)</button>
          </div>
        </div>`;

      el.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => {
        const correo = el.querySelector('[name=correo]')?.value || '';
        modo = b.dataset.modo; pintar('');
        el.querySelector('[name=correo]').value = correo;
      }));
      el.querySelector('[data-ver]')?.addEventListener('click', (e) => {
        const i = el.querySelector('[name=clave]');
        i.type = i.type === 'password' ? 'text' : 'password';
        e.target.textContent = i.type === 'password' ? 'Ver' : 'Ocultar';
      });
      el.querySelector('[data-local]').addEventListener('click', () => terminar({ modo: 'local' }));

      const f = el.querySelector('[data-form]');
      const msg = el.querySelector('[data-msg]');
      const btn = el.querySelector('[data-enviar]');
      const mostrar = (t, ok = false) => { msg.textContent = t; msg.hidden = !t; msg.classList.toggle('ok', ok); };
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const correo = f.correo.value.trim();
        const clave = f.clave?.value || '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { mostrar('Escribe un correo válido.'); f.correo.focus(); return; }
        if (modo !== 'recuperar' && clave.length < 6) { mostrar('La contraseña debe tener al menos 6 caracteres.'); f.clave.focus(); return; }
        btn.disabled = true;
        const texto = btn.innerHTML;
        btn.textContent = 'Un momento…';
        try {
          if (modo === 'entrar') {
            const usuario = await nube.iniciarSesion(correo, clave);
            terminar({ modo: 'cuenta', usuario });
          } else if (modo === 'crear') {
            const r = await nube.registrarse(correo, clave, f.nombre.value || '');
            if (r.confirmar) {
              modo = 'entrar'; pintar('');
              el.querySelector('[name=correo]').value = correo;
              el.querySelector('[data-msg]').hidden = false;
              el.querySelector('[data-msg]').classList.add('ok');
              el.querySelector('[data-msg]').textContent = `Te enviamos un correo a ${correo}. Ábrelo, toca el enlace para confirmar y luego inicia sesión aquí.`;
            } else {
              terminar({ modo: 'cuenta', usuario: r.usuario, nuevo: true });
            }
          } else {
            await nube.enviarRecuperacion(correo);
            mostrar(`Listo. Revisa tu correo (${correo}) y toca el enlace para crear una contraseña nueva.`, true);
          }
        } catch (err) {
          mostrar(nube.traducirError(err));
        } finally {
          if (btn.isConnected) { btn.disabled = false; btn.innerHTML = texto; }
        }
      });
      (el.querySelector(modo === 'crear' ? '[name=nombre]' : '[name=correo]'))?.focus({ preventScroll: true });
    };
    pintar();
  });
}

/** Ventana para poner una contraseña nueva (después del enlace de recuperación o desde Ajustes). */
export function pedirNuevaContrasena({ titulo = 'Crea una contraseña nueva' } = {}) {
  abrirHoja({
    titulo,
    cuerpo: `
      <div class="field">
        <label for="n-clave">Contraseña nueva</label>
        <input id="n-clave" class="input" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres" autofocus>
      </div>
      <div class="field">
        <label for="n-clave2">Repítela</label>
        <input id="n-clave2" class="input" type="password" autocomplete="new-password">
      </div>`,
    pie: `<button class="btn btn-outline" data-cancel>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`,
    montar: (el) => {
      el.querySelector('[data-cancel]').addEventListener('click', () => cerrarHoja());
      el.querySelector('[data-ok]').addEventListener('click', async () => {
        const a = el.querySelector('#n-clave').value, b = el.querySelector('#n-clave2').value;
        if (a.length < 6) { aviso('Mínimo 6 caracteres', { icono: 'x' }); return; }
        if (a !== b) { aviso('Las dos contraseñas no coinciden', { icono: 'x' }); return; }
        try {
          await nube.cambiarContrasena(a);
          cerrarHoja();
          aviso('Contraseña cambiada', { icono: 'lock' });
        } catch (err) {
          aviso(nube.traducirError(err), { icono: 'x', ms: 6000 });
        }
      });
    },
  });
}

/** Pregunta si subir a la cuenta los clientes que había en este equipo. */
export function preguntarImportar(n) {
  return new Promise((resolve) => {
    let respondido = false;
    abrirHoja({
      titulo: 'Clientes en este equipo',
      cuerpo: `
        <div class="celebrate" style="padding-top:4px">
          <span class="icon-badge" data-color="blue">${icon('upload')}</span>
          <h3 style="font-size:19px">Encontré ${n} ${n === 1 ? 'cliente guardado' : 'clientes guardados'} en este equipo</h3>
          <p class="muted">¿Los agrego a tu cuenta? Así los verás en todos tus equipos y quedan respaldados en la nube.</p>
        </div>`,
      pie: '<button class="btn btn-outline" data-no>No, gracias</button><button class="btn btn-primary" data-si>Sí, agregarlos</button>',
      montar: (el) => {
        el.querySelector('[data-si]').addEventListener('click', () => { respondido = true; cerrarHoja(); resolve(true); });
        el.querySelector('[data-no]').addEventListener('click', () => { respondido = true; cerrarHoja(); resolve(false); });
      },
      cerrar: () => { if (!respondido) resolve(false); },
    });
  });
}
