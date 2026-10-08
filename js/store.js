// =============================================================================
// store.js — Los datos de la app y cómo se guardan.
//
// Todo vive en el navegador del dispositivo (localStorage), bajo una sola
// clave. Cada persona que abre la app tiene sus propios datos privados.
//
// ⚠️ Si cambias la forma de los datos (por ejemplo, un campo nuevo que
// necesita valor inicial), sube SCHEMA y agrega un paso en MIGRACIONES.
// Así los datos que ya tiene guardados la gente se actualizan solos y
// nadie pierde clientes.
// =============================================================================

import { PLANTILLAS_POR_DEFECTO, REGLAS_POR_DEFECTO, MODELOS_POR_DEFECTO } from './config.js';
import { uid } from './util.js';

const CLAVE = 'misclientes:datos';
export const SCHEMA = 2;
const MAX_ENVIOS = 5000; // historial global de envíos que se conserva

// Paso de migración: recibe los datos del schema N-1 y los deja en schema N.
// Ejemplo para el futuro:
//   2: (d) => { d.clientes.forEach(c => c.ciudad ??= ''); return d; },
const MIGRACIONES = {
  1: (d) => d,
  // 1.5.0: citas, datos de negociación y plantillas nuevas
  2: (d) => {
    d.citas = Array.isArray(d.citas) ? d.citas : [];
    (Array.isArray(d.clientes) ? d.clientes : []).forEach(completarCliente);
    d.plantillas = Array.isArray(d.plantillas) ? d.plantillas : [];
    for (const id of ['tpl-cita-confirmar', 'tpl-cita-hoy', 'tpl-docs']) {
      const p = PLANTILLAS_POR_DEFECTO.find((x) => x.id === id);
      if (p && !d.plantillas.some((x) => x.id === id)) d.plantillas.push({ ...p });
    }
    return d;
  },
};

/** Campos de negociación que pueden faltar en clientes viejos. */
function completarCliente(c) {
  c.version ??= '';
  c.color ??= '';
  c.precio ??= '';
  c.formaPago ??= '';
  c.retoma ??= '';
  c.documentos = Array.isArray(c.documentos) ? c.documentos : [];
  return c;
}

function ajustesPorDefecto() {
  return {
    nombre: '',
    codigoPais: '57',
    modelos: [...MODELOS_POR_DEFECTO],
    abrirWhatsApp: 'auto', // 'auto' | 'app' | 'web'
    tema: 'auto',          // 'auto' | 'light' | 'dark'
    ultimoRespaldo: null,
    creado: new Date().toISOString(),
    bienvenidaVista: false,
    metaVentas: 0,          // meta de ventas del mes (0 = sin meta)
    ocultarPasos: false,    // ocultar la tarjeta "Primeros pasos"
    recordatorioHora: 8,    // hora del recordatorio diario en el calendario
    recordatorioDias: 'diario', // 'diario' | 'lunsab'
    recordatorioAgregado: false,
  };
}

function datosVacios() {
  return {
    schema: SCHEMA,
    ajustes: ajustesPorDefecto(),
    clientes: [],
    plantillas: PLANTILLAS_POR_DEFECTO.map((p) => ({ ...p })),
    programados: [],
    reglas: structuredClone(REGLAS_POR_DEFECTO),
    envios: [],
    citas: [],
  };
}

/** Lleva cualquier copia de datos (vieja o de un respaldo) al schema actual. */
export function migrar(d) {
  if (!d || typeof d !== 'object') throw new Error('Datos inválidos');
  let v = Number(d.schema) || 1;
  if (v > SCHEMA) throw new Error('Este respaldo es de una versión más nueva de la app. Actualiza la app primero.');
  while (v < SCHEMA) { v += 1; d = MIGRACIONES[v](d); d.schema = v; }
  // Completar campos que falten (respaldos incompletos o editados a mano)
  const base = datosVacios();
  d.ajustes = { ...base.ajustes, ...(d.ajustes || {}) };
  d.reglas = { ...base.reglas, ...(d.reglas || {}) };
  for (const k of Object.keys(base.reglas)) d.reglas[k] = { ...base.reglas[k], ...d.reglas[k] };
  d.clientes = Array.isArray(d.clientes) ? d.clientes : [];
  d.plantillas = Array.isArray(d.plantillas) ? d.plantillas : base.plantillas;
  d.programados = Array.isArray(d.programados) ? d.programados : [];
  d.envios = Array.isArray(d.envios) ? d.envios : [];
  d.citas = Array.isArray(d.citas) ? d.citas : [];
  d.clientes.forEach((c) => { c.historial = Array.isArray(c.historial) ? c.historial : []; completarCliente(c); });
  d.schema = SCHEMA;
  return d;
}

// --- Estado en memoria y persistencia ----------------------------------------
let datos;
export let almacenamientoOK = true;
const oyentes = new Set();

function leer() {
  try {
    const raw = localStorage.getItem(CLAVE);
    return raw ? migrar(JSON.parse(raw)) : datosVacios();
  } catch (e) {
    console.error('No se pudieron leer los datos', e);
    almacenamientoOK = false;
    return datosVacios();
  }
}

function escribir() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
    almacenamientoOK = true;
  } catch (e) {
    console.error('No se pudieron guardar los datos', e);
    almacenamientoOK = false;
  }
}

datos = leer();
// Guardar de una vez los datos ya migrados (si venían de una versión anterior)
try { if (localStorage.getItem(CLAVE)) escribir(); } catch { /* sin almacenamiento */ }

// Pedir al navegador que no borre los datos por falta de espacio
navigator.storage?.persist?.().catch(() => {});

// Si la app está abierta en dos pestañas, mantenerlas sincronizadas
window.addEventListener('storage', (e) => {
  if (e.key === CLAVE) { datos = leer(); notificar(); }
});

export function suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
function notificar() { _enviados = null; oyentes.forEach((fn) => fn()); }
function cambio() { escribir(); notificar(); }

export const get = () => datos;
export const ajustes = () => datos.ajustes;

// --- Ajustes -----------------------------------------------------------------
export function actualizarAjustes(cambios) {
  Object.assign(datos.ajustes, cambios);
  cambio();
}

// --- Clientes ----------------------------------------------------------------
export const clientes = () => datos.clientes;
export const cliente = (id) => datos.clientes.find((c) => c.id === id);

export function nuevoCliente(campos = {}) {
  return {
    id: uid('c_'),
    nombre: '', telefono: '', email: '', cumple: '',
    etapa: 'nuevo', origen: '', vehiculoInteres: '', vehiculoComprado: '', fechaCompra: '',
    proximoSeguimiento: '', notas: '', historial: [],
    version: '', color: '', precio: '', formaPago: '', retoma: '', documentos: [],
    creado: new Date().toISOString(), actualizado: new Date().toISOString(),
    ...campos,
  };
}

export function guardarCliente(c) {
  c.actualizado = new Date().toISOString();
  const i = datos.clientes.findIndex((x) => x.id === c.id);
  if (i >= 0) datos.clientes[i] = c;
  else {
    c.historial = c.historial?.length ? c.historial : [{ id: uid('h_'), fecha: c.creado, tipo: 'creado', texto: 'Cliente registrado' }];
    datos.clientes.unshift(c);
  }
  cambio();
  return c;
}

export function agregarClientes(lista) {
  datos.clientes.unshift(...lista);
  cambio();
}

export function eliminarCliente(id) {
  const i = datos.clientes.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const [c] = datos.clientes.splice(i, 1);
  cambio();
  return { cliente: c, indice: i };
}

/** Borra todos los clientes que cumplan la condición (y sus envíos). */
export function eliminarClientesDonde(condicion) {
  const borrar = new Set(datos.clientes.filter(condicion).map((c) => c.id));
  datos.clientes = datos.clientes.filter((c) => !borrar.has(c.id));
  datos.envios = datos.envios.filter((e) => !borrar.has(e.clienteId));
  datos.citas = datos.citas.filter((x) => !borrar.has(x.clienteId));
  datos.programados.forEach((p) => { if (p.destino?.ids) p.destino.ids = p.destino.ids.filter((id) => !borrar.has(id)); });
  cambio();
  return borrar.size;
}

export function restaurarCliente({ cliente: c, indice }) {
  datos.clientes.splice(Math.min(indice, datos.clientes.length), 0, c);
  cambio();
}

export function agregarHistorial(clienteId, entrada) {
  const c = cliente(clienteId);
  if (!c) return;
  c.historial.unshift({ id: uid('h_'), fecha: new Date().toISOString(), ...entrada });
  c.actualizado = new Date().toISOString();
  cambio();
}

export function eliminarHistorial(clienteId, histId) {
  const c = cliente(clienteId);
  if (!c) return;
  c.historial = c.historial.filter((h) => h.id !== histId);
  cambio();
}

export function cambiarEtapa(clienteId, etapa) {
  const c = cliente(clienteId);
  if (!c || c.etapa === etapa) return;
  c.etapa = etapa;
  if (etapa === 'vendido' && !c.fechaCompra) {
    const d = new Date();
    c.fechaCompra = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!c.vehiculoComprado) c.vehiculoComprado = c.vehiculoInteres;
  }
  c.historial.unshift({ id: uid('h_'), fecha: new Date().toISOString(), tipo: 'etapa', texto: etapa });
  c.actualizado = new Date().toISOString();
  cambio();
}

// --- Citas --------------------------------------------------------------------
// { id, clienteId, tipo, fecha 'AAAA-MM-DD', hora 'HH:MM', vehiculo, notas,
//   estado: 'pendiente' | 'hecha' | 'cancelada', creado }
export const citas = () => datos.citas;
export const cita = (id) => datos.citas.find((x) => x.id === id);

export function guardarCita(ct) {
  const nueva = !ct.id;
  if (nueva) { ct.id = uid('cita_'); ct.creado = new Date().toISOString(); ct.estado = 'pendiente'; }
  const i = datos.citas.findIndex((x) => x.id === ct.id);
  if (i >= 0) datos.citas[i] = ct; else datos.citas.push(ct);
  cambio();
  return ct;
}

export function eliminarCita(id) {
  datos.citas = datos.citas.filter((x) => x.id !== id);
  cambio();
}

// --- Plantillas --------------------------------------------------------------
export const plantillas = () => datos.plantillas;
export const plantilla = (id) => datos.plantillas.find((p) => p.id === id);

export function guardarPlantilla(p) {
  if (!p.id) p.id = uid('tpl_');
  const i = datos.plantillas.findIndex((x) => x.id === p.id);
  if (i >= 0) datos.plantillas[i] = p; else datos.plantillas.push(p);
  cambio();
  return p;
}

export function eliminarPlantilla(id) {
  datos.plantillas = datos.plantillas.filter((p) => p.id !== id);
  cambio();
}

/** ¿Alguna regla o mensaje programado usa esta plantilla? */
export function plantillaEnUso(id) {
  return Object.values(datos.reglas).some((r) => r.plantillaId === id) ||
    datos.programados.some((p) => p.plantillaId === id);
}

// --- Mensajes programados ----------------------------------------------------
export const programados = () => datos.programados;
export const programado = (id) => datos.programados.find((p) => p.id === id);

export function guardarProgramado(p) {
  if (!p.id) { p.id = uid('prog_'); p.creado = new Date().toISOString(); }
  const i = datos.programados.findIndex((x) => x.id === p.id);
  if (i >= 0) datos.programados[i] = p; else datos.programados.unshift(p);
  cambio();
  return p;
}

export function eliminarProgramado(id) {
  datos.programados = datos.programados.filter((p) => p.id !== id);
  cambio();
}

// --- Reglas automáticas ------------------------------------------------------
export const reglas = () => datos.reglas;
export function actualizarRegla(id, cambios) {
  datos.reglas[id] = { ...datos.reglas[id], ...cambios };
  cambio();
}

// --- Envíos (lo que ya se mandó u omitió) -------------------------------------
let _enviados = null;
/** Conjunto de claves de mensajes ya enviados u omitidos. */
export function enviados() {
  if (!_enviados) _enviados = new Set(datos.envios.map((e) => e.key));
  return _enviados;
}
export const envios = () => datos.envios;

/**
 * Registra un mensaje como enviado u omitido.
 * @param {{key:string, clienteId:string, categoria?:string, titulo?:string, texto?:string, estado:'enviado'|'omitido'}} e
 */
export function registrarEnvio(e) {
  const fecha = new Date().toISOString();
  datos.envios.unshift({ ...e, fecha });
  if (datos.envios.length > MAX_ENVIOS) datos.envios.length = MAX_ENVIOS;
  if (e.estado === 'enviado') {
    const c = cliente(e.clienteId);
    if (c) c.historial.unshift({ id: uid('h_'), fecha, tipo: 'mensaje', key: e.key, categoria: e.categoria, titulo: e.titulo, texto: e.texto });
  }
  cambio();
}

export function deshacerEnvio(key) {
  datos.envios = datos.envios.filter((e) => e.key !== key);
  datos.clientes.forEach((c) => { c.historial = c.historial.filter((h) => h.key !== key); });
  cambio();
}

// --- Respaldo y datos completos -----------------------------------------------
export function exportarTodo() {
  return JSON.stringify({ app: 'mis-clientes', exportado: new Date().toISOString(), ...datos }, null, 2);
}

export function reemplazarTodo(nuevos) {
  datos = migrar(nuevos);
  delete datos.app; delete datos.exportado;
  cambio();
}

export function borrarTodo() {
  const nombre = datos.ajustes.nombre;
  const codigoPais = datos.ajustes.codigoPais;
  datos = datosVacios();
  Object.assign(datos.ajustes, { nombre, codigoPais, bienvenidaVista: true });
  cambio();
}

export function marcarRespaldo() {
  datos.ajustes.ultimoRespaldo = new Date().toISOString();
  cambio();
}
