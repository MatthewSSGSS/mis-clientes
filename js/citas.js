// =============================================================================
// citas.js — Citas con clientes: pruebas de manejo, visitas, entregas, llamadas.
//
//   • abrirFormularioCita(): agendar o reprogramar
//   • abrirCita(): ver una cita y sus acciones (WhatsApp, hecha, calendario…)
//   • filaCita() + conectarCitas(): lista de citas reutilizable en cualquier vista
// El mensaje de confirmación del día antes lo genera engine.js (regla "citas").
// =============================================================================

import * as store from './store.js';
import { TIPOS_CITA } from './config.js';
import { tipoCita, horaCita, variablesCita } from './engine.js';
import { abrirMensaje } from './enviar.js';
import { abrirFormularioCliente } from './cliente-form.js';
import { abrirHoja, cerrarHoja, confirmar, aviso, icon, avatar } from './ui.js';
import {
  esc, hoy, sumarDias, fechaLarga, fechaCorta, relativo, primerNombre, norm, compartirODescargar, telefonoBonito,
} from './util.js';

// --- Consultas ----------------------------------------------------------------
const ordenCita = (a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora);
const conCliente = (ct) => !!store.cliente(ct.clienteId);

/** Citas pendientes de hoy y las que quedaron atrasadas (sin marcar). */
export const citasDeHoy = () =>
  store.citas().filter((ct) => ct.estado === 'pendiente' && ct.fecha <= hoy() && conCliente(ct)).sort(ordenCita);

/** Citas pendientes de los próximos días (sin contar hoy). */
export function proximasCitas(dias = 7) {
  const h = hoy(), hasta = sumarDias(h, dias);
  return store.citas().filter((ct) => ct.estado === 'pendiente' && ct.fecha > h && ct.fecha <= hasta && conCliente(ct)).sort(ordenCita);
}

export const citasDeCliente = (id) => store.citas().filter((ct) => ct.clienteId === id).sort(ordenCita);

// --- Lista reutilizable ----------------------------------------------------------
/**
 * Fila de una cita. Los botones usan data-cita-* y se conectan con conectarCitas().
 * @param {object} ct
 * @param {{mostrarCliente?:boolean, mostrarFecha?:boolean}} [o]
 */
export function filaCita(ct, { mostrarCliente = true, mostrarFecha = false } = {}) {
  const c = store.cliente(ct.clienteId);
  if (!c) return '';
  const t = tipoCita(ct.tipo);
  const h = hoy();
  const atrasada = ct.estado === 'pendiente' && ct.fecha < h;
  const [hh, ...resto] = horaCita(ct.hora).split(' '); // '10:00', 'a.', 'm.'
  const sufijo = resto.join(' ');
  const bloque = atrasada
    ? `<div class="cita-hora late"><b>!</b><span>Atrasada</span></div>`
    : mostrarFecha && ct.fecha !== h
      ? `<div class="cita-hora" data-color="${t.color}"><b>${esc(fechaCorta(ct.fecha).split(' ')[0])}</b><span>${esc((fechaCorta(ct.fecha).split(' ')[1] || '').slice(0, 3))}</span></div>`
      : `<div class="cita-hora" data-color="${t.color}"><b>${esc(hh)}</b><span>${esc(sufijo)}</span></div>`;
  const sub = [
    `${icon(t.icon, 'i-sm')} ${esc(t.nombre)}`,
    ct.vehiculo && esc(ct.vehiculo),
    (mostrarFecha || atrasada) && esc(`${relativo(ct.fecha)}${ct.hora ? ` · ${horaCita(ct.hora)}` : ''}`),
  ].filter(Boolean).join(' · ');
  const hecha = ct.estado === 'hecha', cancelada = ct.estado === 'cancelada';
  return `
    <div class="task cita-row ${hecha || cancelada ? 'cita-cerrada' : ''}">
      ${bloque}
      <button class="li-body cita-abrir" type="button" data-cita-abrir="${ct.id}">
        <div class="li-title">${mostrarCliente ? esc(c.nombre) : esc(t.nombre)}</div>
        <div class="li-sub">${mostrarCliente ? sub : esc([fechaLarga(ct.fecha), horaCita(ct.hora)].filter(Boolean).join(' · '))}</div>
      </button>
      <div class="task-actions">
        ${hecha ? '<span class="pill" data-color="green">Hecha</span>' : cancelada ? '<span class="pill" data-color="gray">Cancelada</span>' : `
          <button class="btn btn-wa btn-sm btn-icon" data-cita-wa="${ct.id}" aria-label="Escribir a ${esc(c.nombre)}">${icon('chat', 'i-sm')}</button>
          <button class="btn btn-outline btn-sm" data-cita-hecha="${ct.id}">${icon('check', 'i-sm')}<span class="solo-ancho"> Hecha</span></button>`}
      </div>
    </div>`;
}

/** Conecta los botones de las filas de citas dentro de `root`. */
export function conectarCitas(root) {
  root.querySelectorAll('[data-cita-abrir]').forEach((b) => b.addEventListener('click', () => abrirCita(b.dataset.citaAbrir)));
  root.querySelectorAll('[data-cita-hecha]').forEach((b) => b.addEventListener('click', () => marcarHecha(b.dataset.citaHecha)));
  root.querySelectorAll('[data-cita-wa]').forEach((b) => b.addEventListener('click', () => escribirPorCita(b.dataset.citaWa)));
}

// --- Acciones ------------------------------------------------------------------------
function escribirPorCita(id) {
  const ct = store.cita(id);
  const c = ct && store.cliente(ct.clienteId);
  if (!c) return;
  const v = variablesCita(ct);
  abrirMensaje(c, { ayuda: `${v['{cita}']} · ${v['{cita_fecha}']} · ${v['{cita_hora}']}` });
}

export function marcarHecha(id) {
  const ct = store.cita(id);
  if (!ct) return;
  const t = tipoCita(ct.tipo);
  store.guardarCita({ ...ct, estado: 'hecha' });
  store.agregarHistorial(ct.clienteId, { tipo: 'cita', titulo: `${t.nombre} realizada`, texto: ct.vehiculo || '' });
  // Una entrega hecha significa que el carro se vendió
  const c = store.cliente(ct.clienteId);
  if (ct.tipo === 'entrega' && c && c.etapa !== 'vendido') store.cambiarEtapa(c.id, 'vendido');
  aviso(`¡Listo! ${t.nombre} marcada como hecha`, {
    ms: 6000,
    accion: ct.tipo === 'entrega' ? undefined : {
      texto: 'Seguimiento mañana',
      fn: () => {
        const x = store.cliente(ct.clienteId);
        if (x) { x.proximoSeguimiento = sumarDias(hoy(), 1); store.guardarCliente(x); aviso(`${primerNombre(x.nombre)} te aparecerá mañana`); }
      },
    },
  });
}

/** Archivo de calendario (.ics) de una cita, con aviso 1 hora antes. */
function icsCita(ct, c) {
  const t = tipoCita(ct.tipo);
  const escIcs = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const [hh, mm] = (ct.hora || '10:00').split(':');
  const inicio = `${ct.fecha.replace(/-/g, '')}T${hh.padStart(2, '0')}${(mm || '00').padStart(2, '0')}00`;
  const ahora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const titulo = `${t.nombre}: ${c.nombre}`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mis Clientes//Citas//ES', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ct.id}@mis-clientes`,
    `DTSTAMP:${ahora}`,
    `DTSTART:${inicio}`,
    'DURATION:PT1H',
    `SUMMARY:${escIcs(titulo)}`,
    `DESCRIPTION:${escIcs([ct.vehiculo, telefonoBonito(c.telefono), ct.notas].filter(Boolean).join('\n'))}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escIcs(titulo)}`, 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

async function agregarAlCalendario(ct) {
  const c = store.cliente(ct.clienteId);
  if (!c) return;
  const nombre = `cita-${norm(primerNombre(c.nombre)).replace(/[^a-z0-9]/g, '') || 'cliente'}-${ct.fecha}.ics`;
  const r = await compartirODescargar(nombre, icsCita(ct, c), 'text/calendar');
  if (r !== 'cancelado') aviso('Ábrelo para agregar la cita a tu calendario', { icono: 'calendar', ms: 5000 });
}

// --- Ventana de una cita ---------------------------------------------------------------
export function abrirCita(id) {
  const ct = store.cita(id);
  const c = ct && store.cliente(ct.clienteId);
  if (!c) return;
  const t = tipoCita(ct.tipo);
  const pendiente = ct.estado === 'pendiente';
  abrirHoja({
    titulo: t.nombre,
    cuerpo: `
      <div class="serie-who">
        ${avatar(c.nombre)}
        <div class="li-body"><div class="li-title">${esc(c.nombre)}</div><div class="li-sub">${icon('phone', 'i-sm')} ${esc(telefonoBonito(c.telefono))}</div></div>
        <span class="pill" data-color="${pendiente ? t.color : ct.estado === 'hecha' ? 'green' : 'gray'}">${pendiente ? 'Pendiente' : ct.estado === 'hecha' ? 'Hecha' : 'Cancelada'}</span>
      </div>
      <div class="card" style="padding:4px 18px">
        <div class="kv">
          <div class="kv-row">${icon('calendar')}<div><div class="kv-k">Fecha</div><div class="kv-v">${esc(fechaLarga(ct.fecha))} · ${esc(horaCita(ct.hora))}</div></div></div>
          ${ct.vehiculo ? `<div class="kv-row">${icon('car')}<div><div class="kv-k">Vehículo</div><div class="kv-v">${esc(ct.vehiculo)}</div></div></div>` : ''}
          ${ct.notas ? `<div class="kv-row">${icon('note')}<div><div class="kv-k">Notas</div><div class="kv-v" style="white-space:pre-wrap">${esc(ct.notas)}</div></div></div>` : ''}
        </div>
      </div>
      <div class="grouped mt-16">
        ${pendiente ? `
        <button class="g-row" data-a="wa"><span class="icon-badge" data-color="green">${icon('chat')}</span><div class="li-body"><b>${ct.fecha === hoy() ? 'Recordarle por WhatsApp' : 'Confirmarle por WhatsApp'}</b></div>${icon('chev-r', 'chev')}</button>
        <button class="g-row" data-a="hecha"><span class="icon-badge" data-color="green">${icon('check')}</span><div class="li-body"><b>Marcar como hecha</b></div>${icon('chev-r', 'chev')}</button>
        <button class="g-row" data-a="editar"><span class="icon-badge" data-color="blue">${icon('edit')}</span><div class="li-body"><b>Reprogramar o editar</b></div>${icon('chev-r', 'chev')}</button>
        <button class="g-row" data-a="calendario"><span class="icon-badge" data-color="violet">${icon('calendar')}</span><div class="li-body"><b>Agregar a mi calendario</b><span class="small muted">Te avisa 1 hora antes</span></div>${icon('chev-r', 'chev')}</button>` : ''}
        <a class="g-row" href="#/cliente/${c.id}"><span class="icon-badge" data-color="gray">${icon('users')}</span><div class="li-body"><b>Ver ficha de ${esc(primerNombre(c.nombre))}</b></div>${icon('chev-r', 'chev')}</a>
        ${pendiente
          ? `<button class="g-row" data-a="cancelar"><span class="icon-badge" data-color="red">${icon('x')}</span><div class="li-body"><b>Cancelar cita</b></div></button>`
          : `<button class="g-row" data-a="borrar"><span class="icon-badge" data-color="red">${icon('trash')}</span><div class="li-body"><b>Borrar del registro</b></div></button>`}
      </div>`,
    montar: (el) => {
      const on = (a, fn) => el.querySelector(`[data-a="${a}"]`)?.addEventListener('click', fn);
      on('wa', () => escribirPorCita(id));
      on('hecha', () => { cerrarHoja(); marcarHecha(id); });
      on('editar', () => abrirFormularioCita({ citaId: id }));
      on('calendario', () => agregarAlCalendario(ct));
      on('cancelar', async () => {
        if (!(await confirmar({ titulo: '¿Cancelar esta cita?', si: 'Cancelar cita', no: 'Volver', peligro: true }))) return;
        store.guardarCita({ ...store.cita(id), estado: 'cancelada' });
        store.agregarHistorial(ct.clienteId, { tipo: 'cita', titulo: `${t.nombre} cancelada`, texto: `${fechaLarga(ct.fecha)} · ${horaCita(ct.hora)}` });
        aviso('Cita cancelada', { icono: 'x' });
      });
      on('borrar', async () => {
        if (!(await confirmar({ titulo: '¿Borrar esta cita del registro?', si: 'Borrar', peligro: true }))) return;
        store.eliminarCita(id);
        aviso('Cita borrada', { icono: 'trash' });
      });
    },
  });
}

// --- Elegir cliente (cuando se agenda desde Inicio) -------------------------------------
function elegirCliente(alElegir) {
  abrirHoja({
    titulo: '¿Para qué cliente?',
    alta: true,
    cuerpo: `
      <label class="search" style="display:block">${icon('search')}<input class="input" type="search" placeholder="Buscar por nombre o celular…" data-q autofocus></label>
      <div class="grouped mt-12" data-lista></div>
      <button class="btn btn-outline btn-block mt-12" data-nuevo>${icon('plus')} Es un cliente nuevo</button>`,
    montar: (el) => {
      const lista = el.querySelector('[data-lista]');
      const pintar = (q = '') => {
        const nq = norm(q), qd = q.replace(/\D/g, '');
        const res = store.clientes()
          .filter((c) => !nq || norm(c.nombre).includes(nq) || (qd.length >= 3 && String(c.telefono).replace(/\D/g, '').includes(qd)))
          .slice(0, 30);
        lista.innerHTML = res.length ? res.map((c) => `
          <button class="g-row" data-id="${c.id}">${avatar(c.nombre)}
            <div class="li-body"><div class="li-title">${esc(c.nombre)}</div><div class="li-sub">${esc(c.vehiculoInteres || telefonoBonito(c.telefono))}</div></div>
            ${icon('chev-r', 'chev')}</button>`).join('')
          : '<div class="g-row small muted">No encontré ese cliente.</div>';
        lista.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => alElegir(b.dataset.id)));
      };
      pintar();
      el.querySelector('[data-q]').addEventListener('input', (e) => pintar(e.target.value));
      el.querySelector('[data-nuevo]').addEventListener('click', () => {
        const q = el.querySelector('[data-q]').value.trim();
        abrirFormularioCliente(null, { campos: { nombre: /\d/.test(q) ? '' : q }, alGuardar: (c) => setTimeout(() => alElegir(c.id), 80) });
      });
    },
  });
}

// --- Formulario de cita ------------------------------------------------------------------
/**
 * @param {{clienteId?:string, citaId?:string, tipo?:string}} [o]
 */
export function abrirFormularioCita({ clienteId, citaId, tipo } = {}) {
  const existente = citaId ? store.cita(citaId) : null;
  const idCliente = existente?.clienteId || clienteId;
  if (!idCliente) { elegirCliente((id) => abrirFormularioCita({ clienteId: id, tipo })); return; }
  const c = store.cliente(idCliente);
  if (!c) return;
  const ct = existente ? { ...existente } : {
    clienteId: c.id, tipo: tipo || 'prueba', fecha: sumarDias(hoy(), 1), hora: '10:00',
    vehiculo: c.vehiculoInteres || c.vehiculoComprado || '', notas: '',
  };
  const modelos = store.ajustes().modelos || [];

  abrirHoja({
    titulo: existente ? 'Editar cita' : `Agendar cita con ${primerNombre(c.nombre)}`,
    alta: true,
    cuerpo: `
      <form id="f-cita" novalidate>
        <div class="field">
          <span class="label">Tipo de cita</span>
          <div class="chips chips-wrap" data-tipos>
            ${TIPOS_CITA.map((t) => `<button type="button" class="chip" data-tipo="${t.id}" aria-pressed="${ct.tipo === t.id}">${icon(t.icon, 'i-sm')} ${esc(t.nombre)}</button>`).join('')}
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label for="ci-fecha">Día</label>
            <input id="ci-fecha" class="input" type="date" name="fecha" value="${esc(ct.fecha)}" required>
          </div>
          <div class="field">
            <label for="ci-hora">Hora</label>
            <input id="ci-hora" class="input" type="time" name="hora" value="${esc(ct.hora)}" step="900" required>
          </div>
        </div>
        <div class="chips chips-wrap" style="margin:-6px 0 16px" data-dias>
          ${[[0, 'Hoy'], [1, 'Mañana'], [2, 'Pasado mañana']].map(([d, t]) => `<button type="button" class="chip" style="height:30px" data-d="${d}">${t}</button>`).join('')}
        </div>
        <div class="field">
          <label for="ci-veh">Vehículo</label>
          <input id="ci-veh" class="input" name="vehiculo" list="dl-cita-modelos" value="${esc(ct.vehiculo)}" placeholder="Ej: Kicks Exclusive">
          <datalist id="dl-cita-modelos">${modelos.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label for="ci-notas">Notas</label>
          <textarea id="ci-notas" class="textarea" name="notas" rows="3" placeholder="Ej: viene con la esposa, quiere probar en carretera">${esc(ct.notas)}</textarea>
        </div>
        ${store.reglas().citas?.activa ? `<p class="small muted">${icon('bell', 'i-sm')} El día antes te aparecerá en Inicio un mensaje para confirmarle la cita.</p>` : ''}
      </form>`,
    pie: `
      ${existente ? `<button class="btn btn-outline" type="button" data-cancel>Volver</button>` : `<button class="btn btn-outline" type="button" data-cancel>Cancelar</button>`}
      <button class="btn btn-primary" type="submit" form="f-cita">${icon('check')} ${existente ? 'Guardar' : 'Agendar'}</button>`,
    montar: (el) => {
      const f = el.querySelector('#f-cita');
      el.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => {
        ct.tipo = b.dataset.tipo;
        el.querySelectorAll('[data-tipo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }));
      el.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { f.fecha.value = sumarDias(hoy(), Number(b.dataset.d)); }));
      el.querySelector('[data-cancel]').addEventListener('click', () => cerrarHoja());
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!f.fecha.value || !f.hora.value) { aviso('Elige el día y la hora', { icono: 'x' }); return; }
        const cambioFecha = existente && (existente.fecha !== f.fecha.value || existente.hora !== f.hora.value);
        Object.assign(ct, { fecha: f.fecha.value, hora: f.hora.value, vehiculo: f.vehiculo.value.trim(), notas: f.notas.value.trim() });
        const guardada = store.guardarCita(ct);
        const t = tipoCita(guardada.tipo);
        if (!existente || cambioFecha) {
          store.agregarHistorial(c.id, {
            tipo: 'cita', titulo: `${t.nombre} ${existente ? 'reprogramada' : 'agendada'}`,
            texto: `${fechaLarga(guardada.fecha)} · ${horaCita(guardada.hora)}${guardada.vehiculo ? ` · ${guardada.vehiculo}` : ''}`,
          });
        }
        if (existente) { cerrarHoja(); aviso('Cita actualizada'); return; }
        citaAgendada(guardada);
      });
    },
  });
}

/** Después de agendar: ofrecer avisarle al cliente y agregar al calendario. */
function citaAgendada(ct) {
  const c = store.cliente(ct.clienteId);
  const t = tipoCita(ct.tipo);
  abrirHoja({
    titulo: 'Cita agendada',
    cuerpo: `
      <div class="celebrate" style="padding-top:6px">
        <span class="icon-badge" data-color="${t.color}">${icon(t.icon)}</span>
        <h3 style="font-size:20px">${esc(t.nombre)} con ${esc(primerNombre(c.nombre))}</h3>
        <p class="muted">${esc(fechaLarga(ct.fecha))} · ${esc(horaCita(ct.hora))}${ct.vehiculo ? ` · ${esc(ct.vehiculo)}` : ''}</p>
      </div>
      <div class="grouped mt-16">
        <button class="g-row" data-a="wa"><span class="icon-badge" data-color="green">${icon('chat')}</span><div class="li-body"><b>Enviarle la confirmación por WhatsApp</b><span class="small muted">Con el día y la hora ya escritos</span></div>${icon('chev-r', 'chev')}</button>
        <button class="g-row" data-a="calendario"><span class="icon-badge" data-color="violet">${icon('calendar')}</span><div class="li-body"><b>Agregar a mi calendario</b><span class="small muted">Te avisa 1 hora antes</span></div>${icon('chev-r', 'chev')}</button>
      </div>`,
    pie: '<button class="btn btn-primary btn-lg" data-ok>Listo</button>',
    montar: (el) => {
      el.querySelector('[data-ok]').addEventListener('click', () => cerrarHoja());
      el.querySelector('[data-a="wa"]').addEventListener('click', () => escribirPorCita(ct.id));
      el.querySelector('[data-a="calendario"]').addEventListener('click', () => agregarAlCalendario(ct));
    },
  });
}
