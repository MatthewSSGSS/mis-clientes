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
import { abrirRecordatorio, textoRecordatorio, estadoInsignia, activarInsignia } from '../recordatorios.js';
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
  root.querySelector('[data-insignia]')?.addEventListener('click', () => activarInsignia());
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

function instrucciones() {
  const ios = `
    <p class="small" style="font-weight:700;margin-bottom:10px">iPhone (Safari)</p>
    <ol class="install-steps">
      <li>Abre este link en <b>Safari</b>.</li>
      <li>Toca el botón <b>Compartir</b> (cuadrado con flecha hacia arriba).</li>
      <li>Elige <b>"Agregar a inicio"</b> y luego <b>Agregar</b>.</li>
      <li>Abre la app desde el ícono nuevo en tu pantalla.</li>
    </ol>`;
  const android = `
    <p class="small" style="font-weight:700;margin-bottom:10px">Android (Chrome)</p>
    <ol class="install-steps">
      <li>Abre este link en <b>Chrome</b>.</li>
      <li>Toca el menú <b>⋮</b> (arriba a la derecha).</li>
      <li>Elige <b>"Instalar app"</b> o <b>"Agregar a pantalla principal"</b>.</li>
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
