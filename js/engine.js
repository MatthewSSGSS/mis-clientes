// =============================================================================
// engine.js — Calcula qué mensajes tocan cada día.
//
// Un "pendiente" es un mensaje para un cliente en una fecha. Sale de:
//   • reglas automáticas (cumpleaños, seguimiento, aniversario, mantenimiento)
//   • mensajes programados (una vez, semanal, mensual o anual)
// Cada pendiente tiene una `key` única; cuando se envía u omite, se guarda
// esa key en store.envios y deja de aparecer.
//
// Para agregar una regla nueva: añádela en REGLAS_POR_DEFECTO (config.js),
// en DESCRIPCION_REGLAS (abajo) y genera sus pendientes en `pendientesDeReglas`.
// =============================================================================

import * as store from './store.js';
import { CATEGORIAS, DIAS_ATRASO, DIAS_PROXIMOS } from './config.js';
import {
  hoy, sumarDias, rangoFechas, coincideMesDia, diasEntre, sumarMeses, primerNombre,
} from './util.js';

export const DESCRIPCION_REGLAS = {
  cumpleanos:    { titulo: 'Cumpleaños', categoria: 'cumpleanos', texto: 'El día del cumpleaños de cada cliente.' },
  seguimiento:   { titulo: 'Seguimiento', categoria: 'seguimiento', texto: 'Cuando llega la fecha de "próximo seguimiento" que le pusiste a un cliente.' },
  aniversario:   { titulo: 'Aniversario de compra', categoria: 'postventa', texto: 'Cada año, el día en que el cliente compró su vehículo.' },
  mantenimiento: { titulo: 'Mantenimiento', categoria: 'postventa', texto: 'Cada cierto número de meses después de la compra.' },
};

export const REPETICIONES = [
  { id: 'no', nombre: 'Una sola vez' },
  { id: 'semanal', nombre: 'Cada semana' },
  { id: 'mensual', nombre: 'Cada mes' },
  { id: 'anual', nombre: 'Cada año' },
];

const ORDEN_CAT = Object.fromEntries(CATEGORIAS.map((c, i) => [c.id, i]));

// --- Texto de los mensajes ----------------------------------------------------
export const vehiculoDe = (c) => c?.vehiculoComprado || c?.vehiculoInteres || 'vehículo';

/** Reemplaza {nombre}, {vehiculo}, etc. con los datos del cliente. */
export function llenarTexto(texto, c) {
  const a = store.ajustes();
  return String(texto ?? '')
    .replaceAll('{nombre}', primerNombre(c?.nombre) || '')
    .replaceAll('{nombre_completo}', (c?.nombre || '').trim())
    .replaceAll('{vehiculo}', vehiculoDe(c))
    .replaceAll('{mi_nombre}', a.nombre || '')
    .replace(/[ \t]+([.,!?])/g, '$1');
}

/** Texto final de un pendiente para su cliente. */
export function textoDe(item) {
  const c = store.cliente(item.clienteId);
  const base = item.texto ?? store.plantilla(item.plantillaId)?.texto ?? '';
  return llenarTexto(base, c);
}

// --- Destinatarios de un mensaje programado -----------------------------------
export function destinatarios(prog) {
  const todos = store.clientes().filter((c) => c.telefono);
  const d = prog.destino || { tipo: 'todos' };
  if (d.tipo === 'etapas') return todos.filter((c) => (d.etapas || []).includes(c.etapa));
  if (d.tipo === 'clientes') {
    const ids = new Set(d.ids || []);
    return todos.filter((c) => ids.has(c.id));
  }
  return todos;
}

/** ¿El programado ocurre en `fecha`? */
export function ocurreEn(prog, fecha) {
  if (!prog.fecha || fecha < prog.fecha) return false;
  switch (prog.repetir) {
    case 'semanal': return diasEntre(prog.fecha, fecha) % 7 === 0;
    case 'mensual': {
      const meses = diasEntreMeses(prog.fecha, fecha);
      return meses >= 0 && sumarMeses(prog.fecha, meses) === fecha;
    }
    case 'anual': return coincideMesDia(prog.fecha.slice(5), fecha);
    default: return fecha === prog.fecha;
  }
}
function diasEntreMeses(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** Próxima fecha (desde hoy) en que sale un programado, o null. */
export function proximaFecha(prog, desde = hoy()) {
  if (prog.repetir === 'no' || !prog.repetir) return prog.fecha >= desde ? prog.fecha : null;
  for (let i = 0; i <= 400; i++) {
    const f = sumarDias(desde, i);
    if (ocurreEn(prog, f)) return f;
  }
  return null;
}

// --- Generación de pendientes -------------------------------------------------
function pendientesDeReglas(desde, hasta) {
  const r = store.reglas();
  const out = [];
  const dias = rangoFechas(desde, hasta);
  for (const c of store.clientes()) {
    if (!c.telefono) continue;
    if (r.cumpleanos.activa && c.cumple) {
      for (const f of dias) if (coincideMesDia(c.cumple, f)) out.push(item('cumpleanos', c, f, r.cumpleanos.plantillaId, 'Cumpleaños', 'cumpleanos'));
    }
    if (r.aniversario.activa && c.fechaCompra && c.etapa === 'vendido') {
      for (const f of dias) {
        if (f.slice(0, 4) > c.fechaCompra.slice(0, 4) && coincideMesDia(c.fechaCompra.slice(5), f)) {
          const anios = Number(f.slice(0, 4)) - Number(c.fechaCompra.slice(0, 4));
          out.push(item('aniversario', c, f, r.aniversario.plantillaId, `${anios} ${anios === 1 ? 'año' : 'años'} con su vehículo`, 'postventa'));
        }
      }
    }
    if (r.mantenimiento.activa && c.fechaCompra && c.etapa === 'vendido') {
      const cada = Math.max(1, Number(r.mantenimiento.meses) || 6);
      for (const f of dias) {
        const m = diasEntreMeses(c.fechaCompra, f);
        // Si coincide con el aniversario, no duplicar el mensaje ese día
        if (m > 0 && m % cada === 0 && !(m % 12 === 0 && r.aniversario.activa) && sumarMeses(c.fechaCompra, m) === f) {
          out.push(item('mantenimiento', c, f, r.mantenimiento.plantillaId, 'Mantenimiento', 'postventa'));
        }
      }
    }
    if (r.seguimiento.activa && c.proximoSeguimiento && c.proximoSeguimiento <= hasta) {
      out.push(item('seguimiento', c, c.proximoSeguimiento, r.seguimiento.plantillaId, 'Seguimiento', 'seguimiento'));
    }
  }
  return out;
}

function item(tipo, c, fecha, plantillaId, titulo, categoria) {
  const prefijo = tipo === 'seguimiento' ? 'seg' : tipo;
  return { key: `${prefijo}:${c.id}:${fecha}`, tipo, origen: 'regla', clienteId: c.id, fecha, plantillaId, titulo, categoria };
}

function pendientesDeProgramados(desde, hasta) {
  const out = [];
  const dias = rangoFechas(desde, hasta);
  for (const p of store.programados()) {
    if (p.activa === false) continue;
    const fechas = dias.filter((f) => ocurreEn(p, f));
    if (!fechas.length) continue;
    const dest = destinatarios(p);
    for (const f of fechas) {
      for (const c of dest) {
        out.push({
          key: `prog:${p.id}:${c.id}:${f}`, tipo: 'programado', origen: 'programado', progId: p.id,
          clienteId: c.id, fecha: f, plantillaId: p.plantillaId, texto: p.plantillaId ? undefined : p.texto,
          titulo: p.titulo || 'Mensaje programado', categoria: p.categoria || store.plantilla(p.plantillaId)?.categoria || 'ofertas',
        });
      }
    }
  }
  return out;
}

const ordenar = (a, b) =>
  a.fecha.localeCompare(b.fecha) || (ORDEN_CAT[a.categoria] ?? 99) - (ORDEN_CAT[b.categoria] ?? 99);

/** Mensajes para enviar hoy (incluye atrasados recientes y seguimientos vencidos). */
export function pendientesHoy() {
  const h = hoy();
  const maxAtraso = Math.max(...Object.values(DIAS_ATRASO));
  const desde = sumarDias(h, -maxAtraso);
  const hechos = store.enviados();
  const lista = [...pendientesDeReglas(desde, h), ...pendientesDeProgramados(desde, h)];
  return lista.filter((it) => {
    if (hechos.has(it.key)) return false;
    if (it.tipo === 'seguimiento') return it.fecha <= h; // los seguimientos vencidos no caducan
    const atraso = DIAS_ATRASO[it.tipo] ?? DIAS_ATRASO.programado;
    return it.fecha >= sumarDias(h, -atraso);
  }).sort(ordenar);
}

/** Mensajes de los próximos días (sin contar hoy). */
export function proximos(dias = DIAS_PROXIMOS) {
  const h = hoy();
  const desde = sumarDias(h, 1), hasta = sumarDias(h, dias);
  const hechos = store.enviados();
  return [...pendientesDeReglas(desde, hasta), ...pendientesDeProgramados(desde, hasta)]
    .filter((it) => !hechos.has(it.key) && it.fecha >= desde)
    .sort(ordenar);
}

/** Resumen de avance de un programado en su ocurrencia más reciente. */
export function avanceProgramado(p) {
  const h = hoy();
  let f = null;
  for (let i = 0; i <= DIAS_ATRASO.programado; i++) {
    const d = sumarDias(h, -i);
    if (ocurreEn(p, d)) { f = d; break; }
  }
  if (!f) return null;
  const dest = destinatarios(p);
  const hechos = store.enviados();
  const listos = dest.filter((c) => hechos.has(`prog:${p.id}:${c.id}:${f}`)).length;
  return { fecha: f, total: dest.length, listos };
}
