// =============================================================================
// recordatorios.js — Avisos que llegan aunque la app esté cerrada.
//
//   • Recordatorio diario: un evento repetido en el calendario del celular,
//     con alerta a la hora elegida. Los archivos .ics están en cal/ (los genera
//     tools/generar_calendarios.py). Funciona en iPhone, Android y computador.
//   • Número en el ícono: la cantidad de mensajes pendientes sobre el ícono
//     de la app instalada (como el globito de WhatsApp). En iPhone necesita
//     iOS 16.4 o más nuevo, la app instalada y permiso de notificaciones.
//
// Las notificaciones "push" con texto personalizado necesitarían un servidor;
// ver README.
// =============================================================================

import * as store from './store.js';
import { abrirHoja, cerrarHoja, aviso, icon } from './ui.js';
import { esIOS, esAndroid, esMovil, esInstalada } from './util.js';

export const HORAS = Array.from({ length: 16 }, (_, i) => i + 6); // 6 a 21
const DIAS = [
  { id: 'diario', nombre: 'Todos los días' },
  { id: 'lunsab', nombre: 'Lunes a sábado' },
];

export function horaBonita(h) {
  if (h === 12) return '12:00 m.';
  return h < 12 ? `${h}:00 a. m.` : `${h - 12}:00 p. m.`;
}

export const enlaceCalendario = (hora, dias) =>
  `cal/recordatorio-${String(hora).padStart(2, '0')}-${dias === 'lunsab' ? 'lunsab' : 'diario'}.ics`;

export function textoRecordatorio() {
  const a = store.ajustes();
  if (!a.recordatorioAgregado) return '';
  const d = DIAS.find((x) => x.id === a.recordatorioDias)?.nombre || 'Todos los días';
  return `${d} a las ${horaBonita(Number(a.recordatorioHora) || 8)}`;
}

/** Ventana para agregar el recordatorio diario al calendario. */
export function abrirRecordatorio() {
  const a = store.ajustes();
  let hora = Number(a.recordatorioHora) || 8;
  let dias = a.recordatorioDias === 'lunsab' ? 'lunsab' : 'diario';

  const pasos = esIOS
    ? ['Toca <b>"Agregar a mi calendario"</b>.', 'En la ventana que aparece, toca <b>"Agregar todo"</b> (o "Agregar evento").', 'Listo: cada día te llegará el aviso del Calendario.']
    : esAndroid
      ? ['Toca <b>"Agregar a mi calendario"</b>.', 'Abre el archivo que se descarga con <b>Google Calendar</b> y guárdalo.', 'Listo: cada día te llegará el aviso.']
      : ['Haz clic en <b>"Agregar a mi calendario"</b>.', 'Abre el archivo que se descarga: se agrega a Outlook, Google Calendar o Calendario de Apple.', 'Listo: cada día te llegará el aviso.'];

  abrirHoja({
    titulo: 'Recordatorio diario',
    cuerpo: `
      <p class="muted">Tu celular te avisará cada día para que abras la app y envíes los mensajes del día. <b>Funciona aunque la app esté cerrada</b>, porque el aviso lo da tu calendario.</p>
      <div class="row mt-16">
        <div class="field">
          <label for="r-hora">Hora del aviso</label>
          <select id="r-hora" class="select" data-hora>
            ${HORAS.map((h) => `<option value="${h}" ${h === hora ? 'selected' : ''}>${horaBonita(h)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="r-dias">¿Qué días?</label>
          <select id="r-dias" class="select" data-dias>
            ${DIAS.map((d) => `<option value="${d.id}" ${d.id === dias ? 'selected' : ''}>${d.nombre}</option>`).join('')}
          </select>
        </div>
      </div>
      <ol class="install-steps">${pasos.map((p) => `<li><span>${p}</span></li>`).join('')}</ol>
      ${a.recordatorioAgregado ? `<div class="banner info mt-16">${icon('bell')}<div>Ya agregaste uno (${textoRecordatorio().toLowerCase()}). Si quieres cambiar la hora, <b>borra primero el evento anterior</b> en tu calendario para no recibir dos avisos.</div></div>` : ''}`,
    pie: `<a class="btn btn-primary btn-lg" data-agregar target="_blank" rel="noopener" href="${enlaceCalendario(hora, dias)}">${icon('calendar')} Agregar a mi calendario</a>`,
    montar: (el) => {
      const btn = el.querySelector('[data-agregar]');
      const actualizar = () => { btn.href = enlaceCalendario(hora, dias); };
      el.querySelector('[data-hora]').addEventListener('change', (e) => { hora = Number(e.target.value); actualizar(); });
      el.querySelector('[data-dias]').addEventListener('change', (e) => { dias = e.target.value; actualizar(); });
      btn.addEventListener('click', () => {
        store.actualizarAjustes({ recordatorioHora: hora, recordatorioDias: dias, recordatorioAgregado: true });
        setTimeout(() => cerrarHoja(), 300);
        aviso(`Recordatorio: ${horaBonita(hora)}`, { ms: 5000 });
      });
    },
  });
}

// --- Número en el ícono de la app ------------------------------------------------
export const insigniaDisponible = () => 'setAppBadge' in navigator;

/** Estado del número en el ícono: 'activo' | 'falta-permiso' | 'instalar' | 'no-disponible' */
export function estadoInsignia() {
  if (!insigniaDisponible()) return esMovil && !esInstalada() ? 'instalar' : 'no-disponible';
  if (esIOS && window.Notification?.permission !== 'granted') return 'falta-permiso';
  return 'activo';
}

export async function activarInsignia() {
  if (!window.Notification) { aviso('Primero instala la app en tu celular', { icono: 'x' }); return; }
  const p = await Notification.requestPermission();
  if (p === 'granted') aviso('Listo. Verás el número de pendientes en el ícono.');
  else aviso('No se dio el permiso. Puedes activarlo en Configuración del celular → Notificaciones.', { icono: 'x', ms: 7000 });
  store.actualizarAjustes({}); // refrescar la pantalla
}

/** Pone o quita el número sobre el ícono de la app instalada. */
export function actualizarInsignia(n) {
  if (!insigniaDisponible()) return;
  const p = n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge();
  p?.catch?.(() => {});
}
