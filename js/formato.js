// =============================================================================
// formato.js — El "formato" de cada persona: las columnas de su cuaderno.
//
// Cada cuenta anota sus clientes a su manera (la mamá: Pedido, Vehículo, Nombre,
// Póliza…; otra persona: Placa, Financiera…). El formato es la lista de esas
// columnas, en su orden y con sus nombres, y se guarda en ajustes.formato:
//   [{ id: 'pedido', titulo: 'Pedido' }, { id: 'x_placa', titulo: 'Placa', tipo: 'texto' }, …]
// • id de un campo que la app conoce (config.js → CAMPOS): se guarda en ese campo
//   del cliente, y así funcionan los recordatorios, WhatsApp, totales, etc.
// • id que empieza por "x_": columna propia; se guarda en cliente.extras[id].
// Nombre y Celular siempre están (sin ellos no hay WhatsApp).
//
// Con el formato se arman: el formulario de agregar cliente / registrar venta, la
// tabla de las listas leídas, la tabla de clientes en computador, la ficha y la
// plantilla de Excel. Se detecta solo al leer una foto del cuaderno con IA.
// =============================================================================

import * as store from './store.js';
import { CAMPOS, FORMATO_CUADERNO, FORMATO_BASICO } from './config.js';
import { aPesos, aPoliza } from './cuaderno.js';
import { aFechaISO, aCumple } from './importar.js';
import { norm, fechaCorta, cumpleTexto } from './util.js';

export const esPropia = (id) => String(id || '').startsWith('x_');

/** Datos completos de una columna: { id, titulo, tipo, venta, fijo, propia } */
export function infoColumna(col) {
  const base = CAMPOS[col.id];
  if (base) return { ...base, id: col.id, titulo: String(col.titulo || '').trim() || base.titulo, propia: false };
  return { id: col.id, titulo: String(col.titulo || '').trim() || 'Columna', tipo: col.tipo || 'texto', venta: false, fijo: false, propia: true };
}

/** Limpia una lista de columnas: sin repetidas ni desconocidas, y con Nombre y Celular. */
export function normalizarFormato(lista) {
  const out = [];
  const vistos = new Set();
  for (const c of Array.isArray(lista) ? lista : []) {
    if (!c?.id || vistos.has(c.id) || (!CAMPOS[c.id] && !esPropia(c.id))) continue;
    vistos.add(c.id);
    out.push(infoColumna(c));
  }
  const faltan = ['nombre', 'telefono'].filter((id) => !vistos.has(id)).map((id) => infoColumna({ id }));
  return [...faltan, ...out];
}

/** ¿La persona ya eligió (o detectó) su formato? */
export const tieneFormato = () => Array.isArray(store.ajustes().formato) && store.ajustes().formato.length > 0;

/** Las columnas de esta persona, en su orden. */
export function formato() {
  return normalizarFormato(tieneFormato() ? store.ajustes().formato : FORMATO_BASICO);
}

export function guardarFormato(lista) {
  const limpia = normalizarFormato(lista).map(({ id, titulo, tipo, propia }) => (propia ? { id, titulo, tipo } : { id, titulo }));
  store.actualizarAjustes({ formato: limpia });
}

export const PRESETS = [
  { id: 'cuaderno', nombre: 'Cuaderno de ventas', sub: 'Pedido, vehículo, póliza, valor, entrega y comisión', columnas: FORMATO_CUADERNO },
  { id: 'basico', nombre: 'Básico', sub: 'Nombre, celular, vehículo, fecha de compra, valor y cumpleaños', columnas: FORMATO_BASICO },
];

/** Id para una columna propia nueva ("Placa" → "x_placa"), sin chocar con otras. */
export function idPropio(titulo, usados = []) {
  const base = 'x_' + (norm(titulo).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'columna');
  let id = base, n = 2;
  while (usados.includes(id)) id = `${base}_${n++}`;
  return id;
}

/** Busca en el formato una columna propia con ese nombre (para no crear repetidas). */
export function columnaPorTitulo(titulo, cols = formato()) {
  const t = norm(titulo).replace(/[^a-z0-9]/g, '');
  return t ? cols.find((c) => norm(c.titulo).replace(/[^a-z0-9]/g, '') === t) : undefined;
}

// --- Valores ----------------------------------------------------------------------
export const valorDe = (c, col) => (esPropia(col.id) ? c.extras?.[col.id] ?? '' : c[col.id] ?? '');

export function ponerValor(c, col, v) {
  if (esPropia(col.id)) c.extras = { ...(c.extras || {}), [col.id]: v };
  else c[col.id] = v;
}

/** Texto leído (foto, Excel, tabla) → valor guardado según el tipo de la columna. */
export function convertir(v, tipo, anio) {
  if (v == null) return '';
  switch (tipo) {
    case 'dinero': return aPesos(v) || '';
    case 'sino': return aPoliza(v);
    case 'fecha': return aFechaISO(v, anio);
    case 'cumple': return aCumple(v);
    case 'tel': return String(v).trim().replace(/\.0$/, '');
    case 'numero': return String(v).trim().replace(/\.0$/, '');
    default: return String(v).trim();
  }
}

const pesos = (n) => (Number(n) ? `$${Number(n).toLocaleString('es-CO')}` : '');

/**
 * Valor para mostrar.
 * @param {'tabla'|'ficha'} [modo] en la tabla la póliza va como ✓ / X (igual que en el cuaderno)
 */
export function textoValor(v, col, modo = 'ficha') {
  if (v === '' || v == null) return '';
  switch (col.tipo) {
    case 'dinero': return pesos(v);
    case 'fecha': return /^\d{4}-\d{2}-\d{2}$/.test(v) ? fechaCorta(v) : String(v);
    case 'cumple': return /^\d{2}-\d{2}$/.test(v) ? cumpleTexto(v) : String(v);
    case 'sino':
      if (modo === 'tabla') return v === 'si' ? '✓' : v === 'no' ? 'X' : '';
      return v === 'si' ? 'Sí' : v === 'no' ? 'No' : '';
    default: return String(v);
  }
}

/** Atributos del campo para escribir (teclado adecuado en el celular). */
export function atributosEntrada(col) {
  return {
    numero: 'inputmode="numeric"',
    tel: 'type="tel" inputmode="tel"',
    dinero: 'inputmode="numeric" data-dinero',
    fecha: 'type="date"',
    email: 'type="email" inputmode="email"',
    vehiculo: 'list="dl-modelos"',
    texto: col.id === 'nombre' ? 'autocapitalize="words"' : '',
  }[col.tipo] || '';
}

/** Ejemplo para el campo vacío. */
export function ejemplo(col) {
  return {
    pedido: 'Ej: 55480', vehiculoComprado: 'Ej: Kicks Play Advance', cedula: 'Ej: 1052037922', precio: 'Ej: 100.960.100',
    comision: 'Ej: 743.289', email: 'opcional', nombre: 'Ej: María Fernanda Gómez', telefono: 'Ej: 300 123 4567',
  }[col.id] || (col.tipo === 'dinero' ? 'Ej: 1.500.000' : '');
}
