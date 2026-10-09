// =============================================================================
// store.js — Los datos de la app y cómo se guardan.
//
// Los datos viven en el navegador (localStorage) bajo una clave:
//   • 'misclientes:datos'              → modo "sin cuenta" (solo este equipo)
//   • 'misclientes:cuenta:<idUsuario>' → copia local de una cuenta en la nube
// nube.js se encarga de sincronizar la copia local con Supabase.
//
// ⚠️ Si cambias la forma de los datos (por ejemplo, un campo nuevo que
// necesita valor inicial), sube SCHEMA y agrega un paso en MIGRACIONES.
// Así los datos que ya tiene guardados la gente se actualizan solos y
// nadie pierde clientes.
//
// Para que la sincronización funcione, todo lo que se guarde debe:
//   • llevar `actualizado` (fecha ISO) cuando cambia, y
//   • marcarse en `borrados` cuando se elimina (marcarBorrado).
// =============================================================================

import { PLANTILLAS_POR_DEFECTO, REGLAS_POR_DEFECTO, MODELOS_POR_DEFECTO } from './config.js';
import { uid } from './util.js';

export const CLAVE_LOCAL = 'misclientes:datos';
export const claveCuenta = (idUsuario) => `misclientes:cuenta:${idUsuario}`;
let CLAVE = CLAVE_LOCAL;

export const SCHEMA = 5;
const MAX_ENVIOS = 5000; // historial global de envíos que se conserva
const DIAS_BORRADOS = 90; // cuánto se recuerda que algo se borró (para sincronizar)

// Ajustes que son de este equipo y no se sincronizan
export const AJUSTES_LOCALES = ['sesionCerrada', 'pinHash', 'pushActivo'];

const ahora = () => new Date().toISOString();

// Paso de migración: recibe los datos del schema N-1 y los deja en schema N.
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
  // 2.0.0: sincronización en la nube (registro de borrados)
  3: (d) => {
    d.borrados = d.borrados && typeof d.borrados === 'object' ? d.borrados : {};
    return d;
  },
  // 2.1.0: datos de la venta (cuaderno de ventas)
  4: (d) => {
    (Array.isArray(d.clientes) ? d.clientes : []).forEach(completarCliente);
    return d;
  },
  // 2.4.0: listas leídas del cuaderno (se guardan para revisarlas después)
  5: (d) => {
    d.lecturas = Array.isArray(d.lecturas) ? d.lecturas : [];
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
  // Venta (como en el cuaderno): precio = valor de venta, fechaCompra = fecha de entrega
  c.pedido ??= '';
  c.cedula ??= '';
  c.poliza ??= '';            // 'si' (la tomó en Nissan) | 'no' | ''
  c.comision ??= '';
  c.fechaPagoComision ??= '';
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
    creado: ahora(),
    bienvenidaVista: false,
    metaVentas: 0,          // meta de ventas del mes (0 = sin meta)
    ocultarPasos: false,    // ocultar la tarjeta "Primeros pasos"
    recordatorioHora: 8,    // hora del recordatorio diario en el calendario
    recordatorioDias: 'diario', // 'diario' | 'lunsab'
    recordatorioAgregado: false,
    avisoHora: 8,           // hora de la notificación diaria (cuenta en la nube)
    sesionCerrada: false,   // pantalla de entrada activa (modo sin cuenta)
    pinHash: '',            // PIN de acceso (hash), vacío = sin PIN
    pushActivo: false,      // este equipo recibe notificaciones push
    actualizado: '',        // última vez que se cambiaron los ajustes
  };
}

export function datosVacios() {
  return {
    schema: SCHEMA,
    ajustes: ajustesPorDefecto(),
    clientes: [],
    plantillas: [], // ya no se usan: cada mensaje lo escribe la persona
    programados: [],
    reglas: structuredClone(REGLAS_POR_DEFECTO),
    reglasActualizado: '',
    envios: [],
    citas: [],
    lecturas: [],
    borrados: {},
  };
}

/** Lleva cualquier copia de datos (vieja o de un respaldo) al schema actual. */
export function migrar(d) {
  if (!d || typeof d !== 'object') throw new Error('Datos inválidos');
  let v = Number(d.schema) || 1;
  if (v > SCHEMA) throw new Error('Estos datos son de una versión más nueva de la app. Actualiza la app primero.');
  while (v < SCHEMA) { v += 1; d = MIGRACIONES[v](d); d.schema = v; }
  // Completar campos que falten (respaldos incompletos o editados a mano)
  const base = datosVacios();
  d.ajustes = { ...base.ajustes, ...(d.ajustes || {}) };
  d.reglas = { ...base.reglas, ...(d.reglas || {}) };
  for (const k of Object.keys(base.reglas)) d.reglas[k] = { ...base.reglas[k], ...d.reglas[k] };
  d.reglasActualizado ??= '';
  d.clientes = Array.isArray(d.clientes) ? d.clientes : [];
  d.plantillas = Array.isArray(d.plantillas) ? d.plantillas : base.plantillas;
  d.programados = Array.isArray(d.programados) ? d.programados : [];
  d.envios = Array.isArray(d.envios) ? d.envios : [];
  d.citas = Array.isArray(d.citas) ? d.citas : [];
  d.lecturas = Array.isArray(d.lecturas) ? d.lecturas : [];
  d.borrados = d.borrados && typeof d.borrados === 'object' ? d.borrados : {};
  d.clientes.forEach((c) => { c.historial = Array.isArray(c.historial) ? c.historial : []; completarCliente(c); });
  d.schema = SCHEMA;
  return d;
}

// --- Estado en memoria y persistencia ----------------------------------------
let datos;
export let almacenamientoOK = true;
const oyentes = new Set();

/** Lee y migra los datos guardados en una clave (o null si no hay). */
export function leerClave(clave) {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? migrar(JSON.parse(raw)) : null;
  } catch (e) {
    console.error('No se pudieron leer los datos', e);
    return null;
  }
}

export function borrarClave(clave) {
  try { localStorage.removeItem(clave); } catch { /* sin almacenamiento */ }
}

function leer() {
  try {
    localStorage.getItem(CLAVE); // ¿hay acceso al almacenamiento?
  } catch {
    almacenamientoOK = false;
    return datosVacios();
  }
  return leerClave(CLAVE) || datosVacios();
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
  if (e.key === CLAVE) { datos = leer(); notificar({ origen: 'otra-pestana' }); }
});

/** Cambia de dónde se leen y guardan los datos (modo local o una cuenta). */
export function usarAlmacen(clave) {
  CLAVE = clave;
  datos = leer();
  try { if (localStorage.getItem(CLAVE)) escribir(); } catch { /* sin almacenamiento */ }
  notificar({ origen: 'almacen' });
}
export const claveActual = () => CLAVE;
export const hayDatosGuardados = () => { try { return !!localStorage.getItem(CLAVE); } catch { return false; } };

/**
 * Avisa a quien escucha que hubo cambios. `info.origen`:
 *   'local' (lo hizo la persona), 'remoto' (llegó de la nube), 'almacen', 'otra-pestana'
 */
export function suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }
function notificar(info = { origen: 'local' }) { _enviados = null; oyentes.forEach((fn) => fn(info)); }
function cambio() { escribir(); notificar({ origen: 'local' }); }

export const get = () => datos;
export const ajustes = () => datos.ajustes;

/** Marca algo como borrado (para que no reaparezca al sincronizar). */
function marcarBorrado(id) {
  datos.borrados[id] = ahora();
}
/** Olvida borrados muy viejos para que la lista no crezca sin fin. */
function limpiarBorrados() {
  const limite = new Date(Date.now() - DIAS_BORRADOS * 86400000).toISOString();
  for (const [id, f] of Object.entries(datos.borrados)) if (f < limite) delete datos.borrados[id];
}

// --- Ajustes -----------------------------------------------------------------
export function actualizarAjustes(cambios) {
  Object.assign(datos.ajustes, cambios);
  if (Object.keys(cambios).some((k) => !AJUSTES_LOCALES.includes(k))) datos.ajustes.actualizado = ahora();
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
    pedido: '', cedula: '', poliza: '', comision: '', fechaPagoComision: '',
    creado: ahora(), actualizado: ahora(),
    ...campos,
  };
}

export function guardarCliente(c) {
  c.actualizado = ahora();
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
  const t = ahora();
  lista.forEach((c) => { c.actualizado = t; });
  datos.clientes.unshift(...lista);
  cambio();
}

export function eliminarCliente(id) {
  const i = datos.clientes.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const [c] = datos.clientes.splice(i, 1);
  marcarBorrado(id);
  cambio();
  return { cliente: c, indice: i };
}

/** Borra todos los clientes que cumplan la condición (y sus envíos y citas). */
export function eliminarClientesDonde(condicion) {
  const borrar = new Set(datos.clientes.filter(condicion).map((c) => c.id));
  datos.clientes = datos.clientes.filter((c) => !borrar.has(c.id));
  datos.envios = datos.envios.filter((e) => !borrar.has(e.clienteId));
  datos.citas.filter((x) => borrar.has(x.clienteId)).forEach((x) => marcarBorrado(x.id));
  datos.citas = datos.citas.filter((x) => !borrar.has(x.clienteId));
  datos.programados.forEach((p) => {
    if (p.destino?.ids?.some((id) => borrar.has(id))) {
      p.destino.ids = p.destino.ids.filter((id) => !borrar.has(id));
      p.actualizado = ahora();
    }
  });
  borrar.forEach(marcarBorrado);
  cambio();
  return borrar.size;
}

export function restaurarCliente({ cliente: c, indice }) {
  delete datos.borrados[c.id];
  c.actualizado = ahora();
  datos.clientes.splice(Math.min(indice, datos.clientes.length), 0, c);
  cambio();
}

export function agregarHistorial(clienteId, entrada) {
  const c = cliente(clienteId);
  if (!c) return;
  c.historial.unshift({ id: uid('h_'), fecha: ahora(), ...entrada });
  c.actualizado = ahora();
  cambio();
}

export function eliminarHistorial(clienteId, histId) {
  const c = cliente(clienteId);
  if (!c) return;
  c.historial = c.historial.filter((h) => h.id !== histId);
  c.actualizado = ahora();
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
  c.historial.unshift({ id: uid('h_'), fecha: ahora(), tipo: 'etapa', texto: etapa });
  c.actualizado = ahora();
  cambio();
}

// --- Citas --------------------------------------------------------------------
// { id, clienteId, tipo, fecha 'AAAA-MM-DD', hora 'HH:MM', vehiculo, notas,
//   estado: 'pendiente' | 'hecha' | 'cancelada', creado, actualizado }
export const citas = () => datos.citas;
export const cita = (id) => datos.citas.find((x) => x.id === id);

export function guardarCita(ct) {
  const nueva = !ct.id;
  if (nueva) { ct.id = uid('cita_'); ct.creado = ahora(); ct.estado = 'pendiente'; }
  ct.actualizado = ahora();
  const i = datos.citas.findIndex((x) => x.id === ct.id);
  if (i >= 0) datos.citas[i] = ct; else datos.citas.push(ct);
  cambio();
  return ct;
}

export function eliminarCita(id) {
  datos.citas = datos.citas.filter((x) => x.id !== id);
  marcarBorrado(id);
  cambio();
}

// --- Listas leídas del cuaderno ----------------------------------------------
// { id, nombre, fuente: 'ia'|'ocr'|'texto', creado, actualizado,
//   filas: [{ pedido, vehiculo, nombre, poliza, cedula, telefono, precio,
//             fechaCompra, comision, fechaPagoComision, linea,
//             dudasIA: [], editados: [], elegido, pasada, clienteId }] }
export const lecturas = () => datos.lecturas;
export const lectura = (id) => datos.lecturas.find((x) => x.id === id);

export function guardarLectura(l) {
  if (!l.id) { l.id = uid('lect_'); l.creado = ahora(); }
  l.actualizado = ahora();
  const i = datos.lecturas.findIndex((x) => x.id === l.id);
  if (i >= 0) datos.lecturas[i] = l; else datos.lecturas.unshift(l);
  cambio();
  return l;
}

export function eliminarLectura(id) {
  datos.lecturas = datos.lecturas.filter((x) => x.id !== id);
  marcarBorrado(id);
  cambio();
}

// --- Plantillas --------------------------------------------------------------
export const plantillas = () => datos.plantillas;
export const plantilla = (id) => datos.plantillas.find((p) => p.id === id);

export function guardarPlantilla(p) {
  if (!p.id) p.id = uid('tpl_');
  p.actualizado = ahora();
  const i = datos.plantillas.findIndex((x) => x.id === p.id);
  if (i >= 0) datos.plantillas[i] = p; else datos.plantillas.push(p);
  cambio();
  return p;
}

export function eliminarPlantilla(id) {
  datos.plantillas = datos.plantillas.filter((p) => p.id !== id);
  marcarBorrado(id);
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
  if (!p.id) { p.id = uid('prog_'); p.creado = ahora(); }
  p.actualizado = ahora();
  const i = datos.programados.findIndex((x) => x.id === p.id);
  if (i >= 0) datos.programados[i] = p; else datos.programados.unshift(p);
  cambio();
  return p;
}

export function eliminarProgramado(id) {
  datos.programados = datos.programados.filter((p) => p.id !== id);
  marcarBorrado(id);
  cambio();
}

// --- Reglas automáticas ------------------------------------------------------
export const reglas = () => datos.reglas;
export function actualizarRegla(id, cambios) {
  datos.reglas[id] = { ...datos.reglas[id], ...cambios };
  datos.reglasActualizado = ahora();
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
  const fecha = ahora();
  delete datos.borrados[`envio:${e.key}`];
  datos.envios.unshift({ ...e, fecha });
  if (datos.envios.length > MAX_ENVIOS) datos.envios.length = MAX_ENVIOS;
  if (e.estado === 'enviado') {
    const c = cliente(e.clienteId);
    if (c) {
      c.historial.unshift({ id: uid('h_'), fecha, tipo: 'mensaje', key: e.key, categoria: e.categoria, titulo: e.titulo, texto: e.texto });
      c.actualizado = fecha;
    }
  }
  cambio();
}

export function deshacerEnvio(key) {
  datos.envios = datos.envios.filter((e) => e.key !== key);
  marcarBorrado(`envio:${key}`);
  const t = ahora();
  datos.clientes.forEach((c) => {
    const antes = c.historial.length;
    c.historial = c.historial.filter((h) => h.key !== key);
    if (c.historial.length !== antes) c.actualizado = t;
  });
  cambio();
}

// --- Respaldo y datos completos -----------------------------------------------
export function exportarTodo() {
  return JSON.stringify({ app: 'mis-clientes', exportado: ahora(), ...datos }, null, 2);
}

/** Reemplaza todos los datos (respaldo restaurado o datos traídos de la nube). */
export function reemplazarTodo(nuevos, { origen = 'local' } = {}) {
  const locales = Object.fromEntries(AJUSTES_LOCALES.map((k) => [k, datos.ajustes[k]]));
  datos = migrar(structuredClone(nuevos));
  delete datos.app; delete datos.exportado;
  if (origen === 'remoto') Object.assign(datos.ajustes, locales); // el PIN y la sesión son de este equipo
  limpiarBorrados();
  escribir();
  notificar({ origen });
}

export function borrarTodo() {
  const nombre = datos.ajustes.nombre;
  const codigoPais = datos.ajustes.codigoPais;
  const borrados = { ...datos.borrados };
  // Todo lo que existía queda marcado como borrado (para que no vuelva desde la nube)
  const t = ahora();
  [...datos.clientes, ...datos.citas, ...datos.plantillas, ...datos.programados, ...datos.lecturas].forEach((x) => { borrados[x.id] = t; });
  datos.envios.forEach((e) => { borrados[`envio:${e.key}`] = t; });
  datos = datosVacios();
  datos.borrados = borrados;
  datos.plantillas.forEach((p) => { delete datos.borrados[p.id]; p.actualizado = t; });
  Object.assign(datos.ajustes, { nombre, codigoPais, bienvenidaVista: true, actualizado: t });
  cambio();
}

/** Borra absolutamente todo de este dispositivo (vuelve a la bienvenida). */
export function reiniciar() {
  borrarClave(CLAVE);
  datos = datosVacios();
  notificar({ origen: 'almacen' });
}

export function marcarRespaldo() {
  datos.ajustes.ultimoRespaldo = ahora();
  datos.ajustes.actualizado = ahora();
  cambio();
}
