// =============================================================================
// views/ajustes.js — Perfil, WhatsApp, apariencia, copias de seguridad,
// importar/exportar, instalación y datos.
// =============================================================================

import * as store from '../store.js';
import { APP_VERSION, PAISES, MODELOS_POR_DEFECTO, FOTOS } from '../config.js';
import {
  guardarRespaldo, restaurarRespaldo, importarExcel, importarContactos, exportarExcel,
  cargarEjemplo, borrarEjemplo, hayEjemplos,
} from '../importar.js';
import { importarDocumento, escribirLista } from '../documentos.js';
import { abrirListas } from '../cuaderno.js';
import { formato, tieneFormato } from '../formato.js';
import { abrirEditorFormato } from '../formato-editor.js';
import { abrirRecordatorio, textoRecordatorio, estadoInsignia, activarInsignia } from '../recordatorios.js';
import { tienePin, configurarPin, quitarPin } from '../sesion.js';
import * as nube from '../nube.js';
import { pedirNuevaContrasena } from './acceso.js';
import { horaBonita, HORAS } from '../recordatorios.js';
import { icon, abrirHoja, cerrarHoja, confirmar, aviso, categoria, avatar, botonTema, botonInicio } from '../ui.js';
import { esc, cuando, plural, esIOS, esAndroid, esInstalada, debounce } from '../util.js';

export function render(root) {
  const a = store.ajustes();
  const nEnvios = store.envios().filter((e) => e.estado === 'enviado').length;
  const ultimo = a.ultimoRespaldo ? cuando(a.ultimoRespaldo) : 'Nunca';

  root.innerHTML = `
    <header class="hero hero-sm">
      ${botonInicio()}${botonTema()}
      <img class="hero-img" src="img/${FOTOS.ajustes}" alt="">
      <div class="hero-inner">
        <h1>Ajustes</h1>
        <p>Tu información, copias de seguridad y más.</p>
      </div>
      <span class="photo-credit">Foto: Unsplash</span>
    </header>

    <div class="page">
      ${grupoCuenta()}

      <div class="settings-group">
        <h2>Tu perfil</h2>
        <div class="card card-pad">
          <div class="field">
            <label for="a-nombre">Tu nombre</label>
            <input id="a-nombre" class="input" value="${esc(a.nombre)}" placeholder="Así firmas tus mensajes" data-nombre autocapitalize="words">
            <span class="hint">Se usa en los mensajes donde aparece {mi_nombre}.</span>
          </div>
          <div class="field" style="margin:0">
            <label for="a-pais">País (código para WhatsApp)</label>
            <select id="a-pais" class="select" data-pais>
              ${PAISES.map((p) => `<option value="${p.codigo}" ${a.codigoPais === p.codigo ? 'selected' : ''}>${esc(p.nombre)} (+${p.codigo})</option>`).join('')}
            </select>
            <span class="hint">Si escribes un número sin "+", se le agrega este código.</span>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <h2>Cómo anotas a tus clientes</h2>
        <div class="grouped">
          <button class="g-row" data-formato>
            <span class="icon-badge" data-color="green">${icon('sheet')}</span>
            <div class="li-body"><b>Tu formato${tieneFormato() ? '' : ' (básico)'}</b>
              <span class="small muted recorte-2" style="font-style:normal">${esc(formato().map((c) => c.titulo).join(' · '))}</span></div>
            ${icon('chev-r', 'chev')}
          </button>
        </div>
        <p class="hint mt-8">Son las columnas de tu cuaderno. Así te pide los datos al registrar una venta.</p>
      </div>

      <div class="settings-group">
        <h2>WhatsApp y apariencia</h2>
        <div class="card card-pad">
          <div class="field">
            <label for="a-wa">Abrir los mensajes en</label>
            <select id="a-wa" class="select" data-wa>
              <option value="auto" ${a.abrirWhatsApp === 'auto' ? 'selected' : ''}>Automático (recomendado)</option>
              <option value="app" ${a.abrirWhatsApp === 'app' ? 'selected' : ''}>La app de WhatsApp</option>
              <option value="web" ${a.abrirWhatsApp === 'web' ? 'selected' : ''}>WhatsApp Web / enlace wa.me</option>
            </select>
            <span class="hint">Si al tocar "Enviar" no se abre WhatsApp, prueba con la otra opción.</span>
          </div>
          <div class="field" style="margin:0">
            <span class="label">Tema</span>
            <div class="segmented" data-tema>
              ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, t]) =>
                `<button type="button" data-v="${v}" class="${a.tema === v ? 'on' : ''}">${t}</button>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <h2>Recordatorios y avisos</h2>
        <div class="grouped">
          <div class="g-row g-wrap" data-push-fila>
            <span class="icon-badge" data-color="red">${icon('bell')}</span>
            <div class="li-body"><b>Notificaciones en este equipo</b><span class="small muted">Revisando…</span></div>
          </div>
          <button class="g-row" data-recordatorio>
            <span class="icon-badge" data-color="red">${icon('bell')}</span>
            <div class="li-body"><b>Recordatorio diario</b>
              <span class="small muted">${a.recordatorioAgregado ? `${esc(textoRecordatorio())} · en tu calendario` : 'Tu celular te avisa cada día, aunque la app esté cerrada'}</span></div>
            ${a.recordatorioAgregado ? `<span class="pill" data-color="green">Activo</span>` : icon('chev-r', 'chev')}
          </button>
          ${(() => {
            const e = estadoInsignia();
            if (e === 'no-disponible') return '';
            const sub = {
              activo: 'Muestra cuántos mensajes tienes pendientes hoy',
              'falta-permiso': 'Muestra cuántos mensajes tienes pendientes hoy',
              instalar: 'Disponible cuando instalas la app (en iPhone, iOS 16.4 o más nuevo)',
            }[e];
            const fin = e === 'activo' ? '<span class="pill" data-color="green">Activo</span>'
              : e === 'falta-permiso' ? '<button class="btn btn-sm btn-primary" data-insignia>Activar</button>' : '';
            return `<div class="g-row"><span class="icon-badge" data-color="blue">${icon('home')}</span>
              <div class="li-body"><b>Número en el ícono de la app</b><span class="small muted">${sub}</span></div>${fin}</div>`;
          })()}
        </div>
      </div>

      <div class="settings-group">
        <h2>Modelos de vehículos</h2>
        <div class="card card-pad">
          <div class="field" style="margin:0">
            <label for="a-modelos">Sugerencias al escribir el vehículo (uno por línea)</label>
            <textarea id="a-modelos" class="textarea" rows="6" data-modelos>${esc((a.modelos || []).join('\n'))}</textarea>
            <div class="hstack mt-8"><span class="hint spacer">Se guarda solo.</span><button class="btn btn-ghost btn-sm" data-modelos-reset>Restaurar lista</button></div>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <h2>Copia de seguridad</h2>
        <div class="grouped">
          <div class="g-row">
            <span class="icon-badge" data-color="green">${icon('shield')}</span>
            <div class="li-body"><b>Tus datos viven en este dispositivo</b>
              <span class="small muted">Guarda una copia de vez en cuando (en Archivos, Drive o enviándola a tu correo). Última copia: <b>${esc(ultimo)}</b></span></div>
          </div>
          <button class="g-row" data-respaldo>${icon('download')}<div class="li-body"><b>Guardar copia</b></div>${icon('chev-r', 'chev')}</button>
          <button class="g-row" data-restaurar>${icon('upload')}<div class="li-body"><b>Restaurar una copia</b><span class="small muted">Por ejemplo, al cambiar de celular</span></div>${icon('chev-r', 'chev')}</button>
        </div>
      </div>

      <div class="settings-group">
        <h2>Importar y exportar</h2>
        <div class="grouped">
          <button class="g-row" data-listas><span class="icon-badge" data-color="blue">${icon('sheet')}</span><div class="li-body"><b>Listas leídas del cuaderno</b><span class="small muted">${store.lecturas().length ? plural(store.lecturas().length, 'lista guardada', 'listas guardadas') : 'Aquí quedan las fotos o PDF del cuaderno que leas'}</span></div>${icon('chev-r', 'chev')}</button>
          <button class="g-row" data-imp-doc><span class="icon-badge" data-color="red">${icon('scan')}</span><div class="li-body"><b>Importar desde PDF, Word o foto</b><span class="small muted">Por ejemplo, una foto de tu cuaderno de clientes</span></div>${icon('chev-r', 'chev')}</button>
          <button class="g-row" data-imp-lista><span class="icon-badge" data-color="amber">${icon('note')}</span><div class="li-body"><b>Escribir o pegar una lista</b><span class="small muted">Un cliente por línea</span></div>${icon('chev-r', 'chev')}</button>
          <button class="g-row" data-imp-excel><span class="icon-badge" data-color="green">${icon('sheet')}</span><div class="li-body"><b>Importar desde Excel</b><span class="small muted">Archivo .xlsx o .csv con columnas Nombre y Celular</span></div>${icon('chev-r', 'chev')}</button>
          <button class="g-row" data-imp-vcf><span class="icon-badge" data-color="blue">${icon('contact')}</span><div class="li-body"><b>Importar contactos</b><span class="small muted">Archivo .vcf (desde iCloud.com, Google Contactos o tu celular)</span></div>${icon('chev-r', 'chev')}</button>
          <button class="g-row" data-exp-excel><span class="icon-badge" data-color="violet">${icon('download')}</span><div class="li-body"><b>Exportar clientes a Excel</b></div>${icon('chev-r', 'chev')}</button>
        </div>
      </div>

      <div class="settings-group">
        <h2>Instalar en tu celular</h2>
        <div class="card card-pad">
          ${esInstalada() ? `<div class="hstack">${icon('check')} <b>La app ya está instalada en este dispositivo.</b></div>` : instrucciones()}
        </div>
      </div>

      <div class="settings-group">
        <h2>Actividad</h2>
        <div class="grouped">
          <button class="g-row" data-historial>${icon('send')}<div class="li-body"><b>Historial de envíos</b><span class="small muted">${plural(nEnvios, 'mensaje enviado', 'mensajes enviados')}</span></div>${icon('chev-r', 'chev')}</button>
          ${a.ocultarPasos ? `<button class="g-row" data-ver-pasos>${icon('check')}<div class="li-body"><b>Mostrar "Primeros pasos" en Inicio</b></div>${icon('chev-r', 'chev')}</button>` : ''}
          ${hayEjemplos()
            ? `<button class="g-row" data-ej-borrar>${icon('trash')}<div class="li-body"><b>Borrar clientes de ejemplo</b></div>${icon('chev-r', 'chev')}</button>`
            : `<button class="g-row" data-ej-cargar>${icon('sparkles')}<div class="li-body"><b>Cargar clientes de ejemplo</b><span class="small muted">Para probar cómo funciona</span></div>${icon('chev-r', 'chev')}</button>`}
        </div>
      </div>

      ${nube.enCuenta() ? "" : `<div class="settings-group">
        <h2>Sesión y seguridad</h2>
        <div class="grouped">
          <div class="g-row g-wrap">
            <span class="icon-badge" data-color="${tienePin() ? 'green' : 'gray'}">${icon('lock')}</span>
            <div class="li-body"><b>PIN de acceso</b>
              <span class="small muted">${tienePin() ? 'Activado: se pide al entrar después de cerrar sesión' : 'Protege tus clientes con un PIN de 4 números'}</span></div>
            <div class="row-actions">
              ${tienePin()
                ? '<button class="btn btn-sm btn-outline" data-pin>Cambiar</button><button class="btn btn-sm btn-ghost" data-pin-quitar>Quitar</button>'
                : '<button class="btn btn-sm btn-primary" data-pin>Crear PIN</button>'}
            </div>
          </div>
        </div>
        <button class="btn btn-outline btn-block btn-lg mt-12" data-cerrar-sesion>${icon('logout')} Cerrar sesión</button>
      </div>`}

      <div class="settings-group">
        <h2>Zona de cuidado</h2>
        <button class="btn btn-danger btn-block" data-borrar-todo>${icon('trash')} Borrar todos mis datos</button>
      </div>

      <p class="center small muted mt-24">Mis Clientes · versión ${APP_VERSION}<br>
        Fotos de <a href="https://unsplash.com" target="_blank" rel="noopener">Unsplash</a> (licencia libre).</p>
    </div>`;

  // Perfil (se guarda solo)
  root.querySelector('[data-nombre]').addEventListener('input', debounce((e) => store.actualizarAjustes({ nombre: e.target.value.trim() }), 500));
  root.querySelector('[data-pais]').addEventListener('change', (e) => { store.actualizarAjustes({ codigoPais: e.target.value }); aviso('País actualizado'); });
  root.querySelector('[data-wa]').addEventListener('change', (e) => { store.actualizarAjustes({ abrirWhatsApp: e.target.value }); aviso('Listo'); });
  root.querySelectorAll('[data-tema] button').forEach((b) => b.addEventListener('click', () => store.actualizarAjustes({ tema: b.dataset.v })));
  root.querySelector('[data-modelos]').addEventListener('input', debounce((e) => {
    const modelos = [...new Set(e.target.value.split('\n').map((m) => m.trim()).filter(Boolean))];
    store.actualizarAjustes({ modelos });
  }, 600));
  root.querySelector('[data-modelos-reset]').addEventListener('click', () => {
    store.actualizarAjustes({ modelos: [...MODELOS_POR_DEFECTO] });
    aviso('Lista restaurada');
  });

  root.querySelector('[data-respaldo]').addEventListener('click', () => guardarRespaldo());
  root.querySelector('[data-restaurar]').addEventListener('click', () => restaurarRespaldo());
  root.querySelector('[data-recordatorio]').addEventListener('click', () => abrirRecordatorio());
  root.querySelector('[data-pin]')?.addEventListener('click', () => configurarPin());
  conectarCuenta(root);
  pintarFilaPush(root);
  root.querySelector('[data-pin-quitar]')?.addEventListener('click', async () => {
    if (await confirmar({ titulo: '¿Quitar el PIN?', texto: 'Al cerrar sesión ya no se pedirá PIN para entrar.', si: 'Quitar PIN' })) quitarPin();
  });
  root.querySelector('[data-insignia]')?.addEventListener('click', () => activarInsignia());
  root.querySelector('[data-listas]').addEventListener('click', () => abrirListas());
  root.querySelector('[data-formato]').addEventListener('click', () => abrirEditorFormato());
  root.querySelector('[data-imp-doc]').addEventListener('click', () => importarDocumento());
  root.querySelector('[data-imp-lista]').addEventListener('click', () => escribirLista());
  root.querySelector('[data-imp-excel]').addEventListener('click', () => importarExcel());
  root.querySelector('[data-imp-vcf]').addEventListener('click', () => importarContactos());
  root.querySelector('[data-exp-excel]').addEventListener('click', () => exportarExcel());
  root.querySelector('[data-historial]').addEventListener('click', () => verHistorial());
  root.querySelector('[data-ej-cargar]')?.addEventListener('click', () => { cargarEjemplo(); aviso('Clientes de ejemplo cargados. Mira la pantalla de Inicio.', { ms: 5000 }); });
  root.querySelector('[data-ej-borrar]')?.addEventListener('click', () => borrarEjemplo());
  root.querySelector('[data-ver-pasos]')?.addEventListener('click', () => { store.actualizarAjustes({ ocultarPasos: false }); aviso('Listo, están de nuevo en Inicio'); });

  root.querySelector('[data-borrar-todo]').addEventListener('click', async () => {
    const n = store.clientes().length;
    const ok = await confirmar({
      titulo: '¿Borrar todos tus datos?',
      texto: `Se borrarán ${plural(n, 'cliente', 'clientes')}, tus plantillas y mensajes programados. <b>No se puede deshacer.</b> Te recomendamos guardar una copia antes.`,
      si: 'Sí, borrar todo', peligro: true,
    });
    if (!ok) return;
    store.borrarTodo();
    aviso('Datos borrados', { icono: 'trash' });
  });
}

// --- Cuenta en la nube ------------------------------------------------------------
function textoEstado() {
  const { estado, ultimaSync } = nube.estadoSync();
  if (estado === 'sincronizando') return { t: 'Guardando en la nube…', c: 'blue' };
  if (estado === 'pendiente') return { t: 'Cambios por guardar…', c: 'amber' };
  if (estado === 'sin-conexion') return { t: 'Sin internet: se guardará cuando vuelva la señal', c: 'amber' };
  if (estado === 'error') return { t: 'No se pudo sincronizar. Toca "Sincronizar" para intentar de nuevo.', c: 'red' };
  if (estado === 'sincronizado') return { t: `Todo guardado en la nube${ultimaSync ? ` · ${cuando(ultimaSync.toISOString()).toLowerCase()}` : ''}`, c: 'green' };
  return { t: 'Conectando…', c: 'gray' };
}

function grupoCuenta() {
  if (!nube.disponible()) return '';
  if (!nube.enCuenta()) {
    return `
      <div class="settings-group">
        <h2>Cuenta en la nube</h2>
        <div class="card card-pad">
          <div class="hstack" style="align-items:flex-start">
            <span class="icon-badge" data-color="blue">${icon('shield')}</span>
            <div class="li-body"><b>Estás usando la app sin cuenta</b>
              <span class="small muted">Con una cuenta gratis tus clientes se guardan en internet, los ves en el celular y en el computador, y recibes notificaciones.</span></div>
          </div>
          <button class="btn btn-primary btn-block mt-12" data-ir-cuenta>${icon('lock')} Crear cuenta o iniciar sesión</button>
        </div>
      </div>`;
  }
  const u = nube.usuarioActual();
  const e = textoEstado();
  return `
    <div class="settings-group">
      <h2>Tu cuenta</h2>
      <div class="grouped">
        <div class="g-row">
          <span class="icon-badge" data-color="${e.c}">${icon('shield')}</span>
          <div class="li-body"><b class="una-linea" title="${esc(u.email)}">${esc(u.email)}</b><span class="small muted" data-estado-sync>${esc(e.t)}</span></div>
          <button class="btn btn-sm btn-outline" data-sincronizar>Sincronizar</button>
        </div>
        <button class="g-row" data-cambiar-clave>${icon('lock')}<div class="li-body"><b>Cambiar contraseña</b></div>${icon('chev-r', 'chev')}</button>
      </div>
      <button class="btn btn-outline btn-block btn-lg mt-12" data-cerrar-sesion>${icon('logout')} Cerrar sesión</button>
    </div>`;
}

function conectarCuenta(root) {
  root.querySelector('[data-ir-cuenta]')?.addEventListener('click', () => {
    nube.olvidarModoLocal();
    location.replace(location.pathname + location.search); // al recargar aparece la pantalla de iniciar sesión
  });
  root.querySelector('[data-sincronizar]')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    await nube.sincronizar();
    const est = nube.estadoSync().estado;
    aviso(est === 'sincronizado' ? 'Todo guardado en la nube' : 'No se pudo sincronizar ahora', { icono: est === 'sincronizado' ? 'check' : 'x' });
  });
  root.querySelector('[data-cambiar-clave]')?.addEventListener('click', () => pedirNuevaContrasena({ titulo: 'Cambiar contraseña' }));
}

/** Apple o Google rechazaron la notificación: mostrar el motivo exacto (para quien administra la app). */
function explicarRechazo(r) {
  const e = (r.errores || [])[0] || {};
  const servicio = /apple/.test(e.servicio || '') ? 'Apple' : /google|fcm/.test(e.servicio || '') ? 'Google' : (e.servicio || 'El servicio de notificaciones');
  const motivo = (() => { try { return JSON.parse(e.razon).reason || e.razon; } catch { return e.razon || ''; } })();
  abrirHoja({
    titulo: 'No se pudo enviar la prueba',
    cuerpo: `
      <p>${esc(servicio)} no aceptó la notificación.${r.sujetoOk === false ? ' <b>El correo de contacto del servidor (VAPID_SUBJECT) no tiene el formato que pide Apple.</b>' : ''}</p>
      <p class="small muted mt-12">Toma una captura de esta ventana y envíasela a quien administra la app. Con esto sabe qué arreglar:</p>
      <div class="card card-pad mt-8" style="font-family:ui-monospace,monospace;font-size:13px;word-break:break-word">
        ${esc(servicio)} · código ${esc(String(e.status ?? '?'))}${motivo ? ` · ${esc(motivo)}` : ''}${r.sujetoOk === false ? '<br>VAPID_SUBJECT inválido' : ''}
      </div>`,
    pie: '<button class="btn btn-primary" data-ok>Entendido</button>',
    montar: (el) => el.querySelector('[data-ok]').addEventListener('click', () => cerrarHoja()),
  });
}

// --- Notificaciones push ------------------------------------------------------------
async function pintarFilaPush(root) {
  const fila = root.querySelector('[data-push-fila]');
  if (!fila) return;
  if (!nube.disponible()) { fila.remove(); return; }
  const a = store.ajustes();
  const base = (color, titulo, sub, acciones = '') => `
    <span class="icon-badge" data-color="${color}">${icon('bell')}</span>
    <div class="li-body"><b>${titulo}</b><span class="small muted">${sub}</span></div>
    ${acciones ? `<div class="row-actions">${acciones}</div>` : ''}`;

  if (!nube.enCuenta()) {
    fila.innerHTML = base('gray', 'Notificaciones', 'Para recibir avisos de tus clientes y citas, crea una cuenta o inicia sesión.');
    return;
  }
  const estado = await nube.estadoPush();
  if (!fila.isConnected) return;
  const selectHora = `
    <select class="select select-sm" data-aviso-hora aria-label="Hora del resumen diario">
      ${HORAS.map((h) => `<option value="${h}" ${Number(a.avisoHora ?? 8) === h ? 'selected' : ''}>${horaBonita(h)}</option>`).join('')}
    </select>`;
  if (estado === 'activo') {
    fila.innerHTML = base('green', 'Notificaciones activadas',
      'Te llega un resumen cada mañana y un aviso 1 hora antes de cada cita.',
      `${selectHora}<button class="btn btn-sm btn-outline" data-push-probar>Probar</button><button class="btn btn-sm btn-ghost" data-push-quitar>Desactivar</button>`);
  } else if (estado === 'instalar') {
    fila.innerHTML = base('amber', 'Notificaciones', 'En iPhone, primero instala la app: Safari → Compartir → "Agregar a inicio". Luego ábrela desde el ícono y vuelve aquí.');
  } else if (estado === 'bloqueado') {
    fila.innerHTML = base('red', 'Notificaciones bloqueadas', esIOS
      ? 'Actívalas en Ajustes del iPhone → Notificaciones → Mis Clientes.'
      : 'Actívalas en la configuración del navegador (el candado junto a la dirección → Notificaciones → Permitir).');
  } else if (estado === 'no-soportado') {
    fila.innerHTML = base('gray', 'Notificaciones', 'Este navegador no permite notificaciones. Prueba con Chrome, Edge o Safari actualizado.');
  } else {
    fila.innerHTML = base('red', 'Activa las notificaciones', 'Un resumen cada mañana con tus clientes del día y un aviso 1 hora antes de cada cita.',
      '<button class="btn btn-sm btn-primary" data-push-activar>Activar</button>');
  }

  fila.querySelector('[data-push-activar]')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      await nube.activarPush();
      aviso('¡Listo! Te llegarán las notificaciones. Toca "Probar" para ver una.', { ms: 6000 });
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg === 'permiso') aviso('No se dio el permiso para notificaciones', { icono: 'x', ms: 6000 });
      else if (msg.startsWith('servicio-push') || /conect|connect|servidor|server|network|load failed|push service/i.test(msg)) {
        // El celular no logró hablar con el servicio de notificaciones de Apple/Google
        abrirHoja({
          titulo: 'No se pudo activar',
          cuerpo: `<p>Tu celular no logró conectarse con el servicio de notificaciones de ${esIOS ? 'Apple' : 'Google'}. Casi siempre es por la conexión. Prueba esto y vuelve a tocar <b>Activar</b>:</p>
            <ol class="install-steps mt-12">
              <li><span>Cambia de red: si estás en WiFi, usa los <b>datos móviles</b> (o al revés).</span></li>
              <li><span>Si tienes una <b>VPN</b> o un bloqueador de anuncios, apágalo un momento.</span></li>
              <li><span>${esIOS ? 'Revisa que el iPhone esté actualizado (Ajustes → General → Actualización de software).' : 'Revisa que Chrome esté actualizado.'}</span></li>
              <li><span>Cierra la app por completo y ábrela de nuevo desde el ícono.</span></li>
            </ol>
            <p class="small muted mt-12">Detalle técnico: ${esc(msg.replace(/^servicio-push:\s*/, ''))}</p>`,
          pie: '<button class="btn btn-primary" data-ok>Entendido</button>',
          montar: (el) => el.querySelector('[data-ok]').addEventListener('click', () => cerrarHoja()),
        });
      } else aviso(msg || nube.traducirError(err), { icono: 'x', ms: 7000 });
    }
    pintarFilaPush(root);
  });
  fila.querySelector('[data-push-probar]')?.addEventListener('click', async (e) => {
    const boton = e.currentTarget; // después de un await, e.currentTarget ya no existe
    boton.disabled = true;
    try {
      let r = await nube.probarPush();
      // El servidor no tenía este equipo (o la suscripción venció): registrarlo de nuevo y reintentar
      if (!r?.enviados && !r?.fallidos) {
        aviso('Volviendo a registrar este equipo…', { icono: 'clock' });
        await nube.reactivarPush();
        r = await nube.probarPush();
      }
      if (r?.fallidos) { explicarRechazo(r); return; }
      aviso(r?.enviados ? 'Enviada. Debería llegarte en unos segundos.'
        : 'No se pudo registrar este equipo. Toca "Desactivar" y vuelve a activar las notificaciones.',
      { icono: r?.enviados ? 'bell' : 'x', ms: 7000 });
    } catch (err) {
      aviso(`No se pudo enviar la prueba: ${nube.traducirError(err)} (${String(err?.message || err).slice(0, 80)})`, { icono: 'x', ms: 9000 });
    }
    setTimeout(() => { if (boton.isConnected) boton.disabled = false; }, 3000);
  });
  fila.querySelector('[data-push-quitar]')?.addEventListener('click', async () => {
    await nube.desactivarPush();
    aviso('Notificaciones desactivadas en este equipo', { icono: 'bell' });
    pintarFilaPush(root);
  });
  fila.querySelector('[data-aviso-hora]')?.addEventListener('change', (e) => {
    store.actualizarAjustes({ avisoHora: Number(e.target.value) });
    aviso(`El resumen te llegará a las ${horaBonita(Number(e.target.value))}`);
  });
}

function instrucciones() {
  const ios = `
    <p class="small" style="font-weight:700;margin-bottom:10px">iPhone (Safari)</p>
    <ol class="install-steps">
      <li><span>Abre este link en <b>Safari</b>.</span></li>
      <li><span>Toca el botón <b>Compartir</b> (cuadrado con flecha hacia arriba).</span></li>
      <li><span>Elige <b>"Agregar a inicio"</b> y luego <b>Agregar</b>.</span></li>
      <li><span>Abre la app desde el ícono nuevo en tu pantalla.</span></li>
    </ol>`;
  const android = `
    <p class="small" style="font-weight:700;margin-bottom:10px">Android (Chrome)</p>
    <ol class="install-steps">
      <li><span>Abre este link en <b>Chrome</b>.</span></li>
      <li><span>Toca el menú <b>⋮</b> (arriba a la derecha).</span></li>
      <li><span>Elige <b>"Instalar app"</b> o <b>"Agregar a pantalla principal"</b>.</span></li>
    </ol>`;
  if (esIOS) return ios;
  if (esAndroid) return android;
  return `${ios}<hr style="border:0;border-top:1px solid var(--border);margin:18px 0">${android}
    <p class="small muted mt-16">En computador, Chrome y Edge muestran un ícono de instalar en la barra de direcciones.</p>`;
}

function verHistorial() {
  const lista = store.envios().filter((e) => e.estado === 'enviado').slice(0, 100);
  abrirHoja({
    titulo: 'Historial de envíos',
    alta: true,
    cuerpo: lista.length ? `
      <div class="grouped">
        ${lista.map((e) => {
          const c = store.cliente(e.clienteId);
          const cat = categoria(e.categoria);
          return `
            <a class="g-row" href="${c ? `#/cliente/${c.id}` : '#/ajustes'}">
              ${c ? avatar(c.nombre) : `<span class="icon-badge" data-color="${cat.color}">${icon(cat.icon)}</span>`}
              <div class="li-body"><div class="li-title">${esc(c?.nombre || 'Cliente eliminado')}</div>
              <div class="li-sub">${esc(e.titulo || 'Mensaje')} · ${esc(cuando(e.fecha))}</div></div>
            </a>`;
        }).join('')}
      </div>
      ${store.envios().length > 100 ? '<p class="small muted center mt-12">Se muestran los últimos 100.</p>' : ''}`
      : '<p class="muted">Todavía no has enviado mensajes desde la app.</p>',
    pie: `<button class="btn btn-primary" data-ok>Cerrar</button>`,
    montar: (el) => el.querySelector('[data-ok]').addEventListener('click', () => cerrarHoja()),
  });
}
