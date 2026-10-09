// =============================================================================
// nube.js — Cuentas, sincronización y notificaciones push (Supabase).
//
// • Cuentas: correo y contraseña (Supabase Auth).
// • Sincronización: cada cuenta tiene una fila en `datos_usuario` con todos
//   sus datos (jsonb) y un número de `version`. Al subir, solo se escribe si
//   la versión de la nube es la que conocemos; si otro equipo subió algo
//   antes, se traen sus cambios, se unen (sincro.js) y se vuelve a subir.
// • Notificaciones: la app calcula "momentos" (hora del resumen diario y 1
//   hora antes de cada cita) y los sube. Un servidor (supabase/functions/avisos)
//   revisa cada 10 minutos y envía un push a quien le toque. El texto lo arma
//   el service worker con el resumen guardado en este equipo (escribirResumen).
// La librería supabase-js está en js/vendor/supabase.js (funciona sin internet).
// =============================================================================

import * as store from './store.js';
import { NUBE, TIPOS_CITA } from './config.js';
import { fusionar } from './sincro.js';
import { pendientesHoy, proximos, horaCita } from './engine.js';
import { hoy, sumarDias, aFecha, primerNombre, esIOS, esInstalada, telefonoInternacional } from './util.js';

const CLAVE_MODO = 'misclientes:modo'; // 'local' si eligió usar la app sin cuenta
const claveMeta = (id) => `misclientes:sync:${id}`;
const CACHE_DATOS = 'datos-mis-clientes'; // el service worker lee de aquí (no empieza por "mis-clientes-")

let sb = null;
let usuario = null;
let estado = 'apagado'; // apagado | sincronizando | sincronizado | pendiente | sin-conexion | error
let ultimaSync = null;
const oyentesEstado = new Set();

// --- Básico ---------------------------------------------------------------------
export const disponible = () => !!(window.supabase?.createClient && NUBE.url && NUBE.clave);
export const usuarioActual = () => usuario;
export const enCuenta = () => !!usuario;
export const estadoSync = () => ({ estado, ultimaSync });
export const modoGuardado = () => { try { return localStorage.getItem(CLAVE_MODO); } catch { return null; } };
export const elegirModoLocal = () => { try { localStorage.setItem(CLAVE_MODO, 'local'); } catch { /* */ } };
export const olvidarModoLocal = () => { try { localStorage.removeItem(CLAVE_MODO); } catch { /* */ } };

export function cliente() {
  if (!sb) {
    sb = window.supabase.createClient(NUBE.url, NUBE.clave, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'misclientes:auth' },
    });
  }
  return sb;
}

function setEstado(e) {
  estado = e;
  if (e === 'sincronizado') ultimaSync = new Date();
  oyentesEstado.forEach((fn) => fn(estado));
}
export function alCambiarEstado(fn) { oyentesEstado.add(fn); return () => oyentesEstado.delete(fn); }

const urlApp = () => location.origin + location.pathname;

// --- Cuentas ------------------------------------------------------------------------
export async function sesionActual() {
  if (!disponible()) return null;
  const { data } = await cliente().auth.getSession();
  return data?.session || null;
}

export function alCambiarSesion(fn) {
  if (!disponible()) return () => {};
  const { data } = cliente().auth.onAuthStateChange((evento, sesion) => fn(evento, sesion));
  return () => data.subscription.unsubscribe();
}

/** Mensajes de error de Supabase, en español y sin tecnicismos. */
export function traducirError(e) {
  const m = String(e?.message || e || '').toLowerCase();
  if (!navigator.onLine || m.includes('failed to fetch') || m.includes('network')) return 'No hay conexión a internet. Intenta de nuevo cuando tengas señal.';
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ese correo ya tiene una cuenta. Inicia sesión.';
  if (m.includes('email not confirmed')) return 'Primero confirma tu correo: te enviamos un enlace.';
  if (m.includes('password should be') || m.includes('at least 6')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (m.includes('invalid email') || m.includes('unable to validate email') || m.includes('email address') && m.includes('invalid')) return 'Revisa el correo: parece que está mal escrito.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar.';
  if (m.includes('same password') || m.includes('different from the old')) return 'La nueva contraseña debe ser distinta a la anterior.';
  if (m.includes('sending confirmation') || m.includes('sending recovery') || m.includes('sending') && m.includes('email')) return 'No pudimos enviarte el correo. Intenta de nuevo en unos minutos; si sigue pasando, avísale a quien administra la app.';
  return 'Algo salió mal. Intenta de nuevo.';
}

export async function iniciarSesion(correo, contrasena) {
  const { data, error } = await cliente().auth.signInWithPassword({ email: correo.trim(), password: contrasena });
  if (error) throw error;
  return data.user;
}

/** Devuelve { usuario, confirmar } — confirmar = true si hay que confirmar el correo. */
export async function registrarse(correo, contrasena, nombre) {
  const { data, error } = await cliente().auth.signUp({
    email: correo.trim(), password: contrasena,
    options: { data: { nombre: nombre.trim() }, emailRedirectTo: urlApp() },
  });
  if (error) throw error;
  // Si el correo ya existe, Supabase devuelve un usuario sin identidades
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('already registered');
  }
  return { usuario: data.user, confirmar: !data.session };
}

export async function enviarRecuperacion(correo) {
  const { error } = await cliente().auth.resetPasswordForEmail(correo.trim(), { redirectTo: urlApp() });
  if (error) throw error;
}

export async function cambiarContrasena(nueva) {
  const { error } = await cliente().auth.updateUser({ password: nueva });
  if (error) throw error;
}

// --- Conectar una cuenta a la app -----------------------------------------------------
let quitarOyenteStore = null;

/**
 * Empieza a usar la cuenta: cambia al almacén local de esa cuenta y sincroniza.
 * @param {object} u usuario de Supabase
 * @param {{preguntarImportar?:(n:number)=>Promise<boolean>}} [o]
 */
export async function conectar(u, { preguntarImportar } = {}) {
  usuario = u;
  store.usarAlmacen(store.claveCuenta(u.id));
  quitarOyenteStore?.();
  quitarOyenteStore = store.suscribir((info) => {
    if (info.origen === 'local') { marcarPendiente(); programarSubida(); }
    programarResumen();
  });
  window.addEventListener('online', alVolverInternet);
  document.addEventListener('visibilitychange', alCambiarVisibilidad);

  await sincronizar();

  // ¿Hay clientes guardados en este equipo sin cuenta? Ofrecer subirlos
  // (sin los de ejemplo ni los que ya están en la cuenta con el mismo celular).
  const local = store.leerClave(store.CLAVE_LOCAL);
  const cp = store.ajustes().codigoPais;
  const yaEnCuenta = new Set(store.clientes().map((c) => telefonoInternacional(c.telefono, cp)));
  const reales = (local?.clientes || []).filter((c) => !c.ejemplo && !yaEnCuenta.has(telefonoInternacional(c.telefono, cp)));
  const noPreguntar = (() => { try { return localStorage.getItem(`misclientes:noImportar:${u.id}`); } catch { return null; } })();
  if (reales.length && !noPreguntar && preguntarImportar) {
    const si = await preguntarImportar(reales.length);
    if (si) {
      local.clientes = reales;
      store.reemplazarTodo(fusionar(store.get(), local), { origen: 'local' });
      marcarPendiente();
      await subir();
      if (estado === 'sincronizado') store.borrarClave(store.CLAVE_LOCAL);
    } else {
      try { localStorage.setItem(`misclientes:noImportar:${u.id}`, '1'); } catch { /* */ }
    }
  }
  // Volver a registrar este equipo para notificaciones (por si cambió de cuenta)
  if (window.Notification?.permission === 'granted') activarPush({ pedirPermiso: false }).catch(() => {});
  escribirResumen();
}

/** Cierra la sesión: sube lo pendiente, quita las notificaciones y borra la copia local. */
export async function desconectar() {
  if (usuario && leerMeta().pendiente && navigator.onLine) await subir().catch(() => {});
  await desactivarPush().catch(() => {});
  const id = usuario?.id;
  quitarOyenteStore?.();
  window.removeEventListener('online', alVolverInternet);
  document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  await cliente().auth.signOut().catch(() => {});
  if (id) { store.borrarClave(store.claveCuenta(id)); store.borrarClave(claveMeta(id)); }
  usuario = null;
  setEstado('apagado');
}

export const hayCambiosSinSubir = () => !!(usuario && leerMeta().pendiente);

// --- Sincronización ---------------------------------------------------------------------
function leerMeta() {
  try { return JSON.parse(localStorage.getItem(claveMeta(usuario.id))) || {}; } catch { return {}; }
}
function guardarMeta(cambios) {
  try { localStorage.setItem(claveMeta(usuario.id), JSON.stringify({ ...leerMeta(), ...cambios })); } catch { /* */ }
}
function marcarPendiente() {
  guardarMeta({ pendiente: true });
  if (estado !== 'sincronizando') setEstado(navigator.onLine ? 'pendiente' : 'sin-conexion');
}

let timerSubida = null;
function programarSubida(ms = 1500) {
  clearTimeout(timerSubida);
  timerSubida = setTimeout(() => subir().catch(() => {}), ms);
}
function alVolverInternet() { if (usuario) sincronizar(); }
function alCambiarVisibilidad() {
  if (!usuario) return;
  if (document.visibilityState === 'hidden' && leerMeta().pendiente) subir().catch(() => {}); // guardar al salir
  if (document.visibilityState === 'visible') sincronizar(); // traer lo hecho en otro equipo
}

function datosParaSubir() {
  const d = structuredClone(store.get());
  for (const k of store.AJUSTES_LOCALES) delete d.ajustes[k];
  return d;
}

let ocupado = null;
/** Trae los cambios de la nube y sube los de este equipo. */
export function sincronizar() {
  if (!usuario) return Promise.resolve();
  if (ocupado) return ocupado;
  ocupado = (async () => {
    if (!navigator.onLine) { setEstado('sin-conexion'); return; }
    setEstado('sincronizando');
    try {
      const { data, error } = await cliente().from('datos_usuario').select('datos, version').eq('user_id', usuario.id).maybeSingle();
      if (error) throw error;
      const meta = leerMeta();
      if (!data) { // primera vez de esta cuenta: crear la fila con lo de este equipo
        await escribirNube(null);
        return;
      }
      if (data.version !== meta.version) {
        // Hay algo nuevo en la nube
        const nuevos = meta.pendiente ? fusionar(store.get(), data.datos) : data.datos;
        store.reemplazarTodo(nuevos, { origen: 'remoto' });
        guardarMeta({ version: data.version });
      }
      if (leerMeta().pendiente) await escribirNube(data.version);
      else setEstado('sincronizado');
    } catch (e) {
      console.error('sincronizar', e);
      setEstado(navigator.onLine ? 'error' : 'sin-conexion');
    }
  })().finally(() => { ocupado = null; });
  return ocupado;
}

/** Sube los datos si hay cambios pendientes. */
export async function subir() {
  if (!usuario) return;
  if (ocupado) { await ocupado; if (!leerMeta().pendiente) return; }
  if (!navigator.onLine) { setEstado('sin-conexion'); return; }
  ocupado = (async () => {
    setEstado('sincronizando');
    try {
      await escribirNube(leerMeta().version ?? null);
    } catch (e) {
      console.error('subir', e);
      setEstado(navigator.onLine ? 'error' : 'sin-conexion');
    }
  })().finally(() => { ocupado = null; });
  return ocupado;
}

/**
 * Escribe en la nube solo si la versión allá es `versionEsperada`.
 * Si otro equipo subió antes, une sus cambios y reintenta.
 */
async function escribirNube(versionEsperada, intentos = 3) {
  const { momentos } = calcularAgenda();
  const fila = { datos: datosParaSubir(), momentos, actualizado: new Date().toISOString() };
  let resultado;
  if (versionEsperada == null) {
    resultado = await cliente().from('datos_usuario').insert({ ...fila, user_id: usuario.id, version: 1 }).select('version');
    if (resultado.error?.code === '23505') { // ya existía: traer, unir y reintentar
      return reintentar(intentos);
    }
  } else {
    resultado = await cliente().from('datos_usuario')
      .update({ ...fila, version: versionEsperada + 1 })
      .eq('user_id', usuario.id).eq('version', versionEsperada)
      .select('version');
    if (!resultado.error && resultado.data.length === 0) return reintentar(intentos);
  }
  if (resultado.error) throw resultado.error;
  guardarMeta({ version: resultado.data[0].version, pendiente: false });
  setEstado('sincronizado');
}

async function reintentar(intentos) {
  if (intentos <= 0) throw new Error('No se pudo sincronizar (conflicto)');
  const { data, error } = await cliente().from('datos_usuario').select('datos, version').eq('user_id', usuario.id).maybeSingle();
  if (error) throw error;
  if (data) {
    store.reemplazarTodo(fusionar(store.get(), data.datos), { origen: 'remoto' });
    guardarMeta({ version: data.version, pendiente: true });
  }
  return escribirNube(data ? data.version : null, intentos - 1);
}

// --- Agenda para las notificaciones ------------------------------------------------------
const DIAS_AGENDA = 21;

/** Texto corto del día: "Cumpleaños de Laura · 2 seguimientos · Prueba de manejo 10:00 a. m." */
function textoDelDia(items, citasDia) {
  const partes = [];
  const cumples = items.filter((it) => it.categoria === 'cumpleanos').map((it) => primerNombre(store.cliente(it.clienteId)?.nombre));
  if (cumples.length) partes.push(`🎂 Cumpleaños de ${cumples.slice(0, 2).join(' y ')}${cumples.length > 2 ? ` y ${cumples.length - 2} más` : ''}`);
  const seg = items.filter((it) => it.tipo === 'seguimiento').length;
  if (seg) partes.push(`${seg} ${seg === 1 ? 'seguimiento' : 'seguimientos'}`);
  const otros = items.length - cumples.length - seg;
  if (otros > 0) partes.push(`${otros} ${otros === 1 ? 'mensaje más' : 'mensajes más'}`);
  for (const ct of citasDia.slice(0, 2)) {
    const t = TIPOS_CITA.find((x) => x.id === ct.tipo)?.nombre || 'Cita';
    partes.push(`📅 ${t} ${horaCita(ct.hora)} (${primerNombre(store.cliente(ct.clienteId)?.nombre)})`);
  }
  return partes.join(' · ');
}

/** Calcula cuándo avisar (momentos, en hora UTC) y el resumen que mostrará el aviso. */
export function calcularAgenda() {
  const a = store.ajustes();
  const h = hoy();
  const horaAviso = Number(a.avisoHora ?? 8);
  const ahora = Date.now();
  const pend = store.clientes().length ? pendientesHoy() : [];
  const prox = store.clientes().length ? proximos(DIAS_AGENDA) : [];
  const citasPend = store.citas().filter((ct) => ct.estado === 'pendiente' && ct.fecha >= h && store.cliente(ct.clienteId));
  const momentos = [];
  const dias = {};

  for (let i = 0; i <= DIAS_AGENDA; i++) {
    const dia = sumarDias(h, i);
    const items = i === 0 ? pend : prox.filter((it) => it.fecha === dia);
    const citasDia = citasPend.filter((ct) => ct.fecha === dia).sort((x, y) => (x.hora || '').localeCompare(y.hora || ''));
    if (!items.length && !citasDia.length) continue;
    dias[dia] = { texto: textoDelDia(items, citasDia), mensajes: items.length, citas: citasDia.length };
    const momento = aFecha(dia);
    momento.setHours(horaAviso, 0, 0, 0);
    if (momento.getTime() > ahora) momentos.push({ t: momento.toISOString(), tipo: 'dia' });
  }

  const citas = [];
  for (const ct of citasPend) {
    if (!ct.hora) continue;
    const [hh, mm] = ct.hora.split(':').map(Number);
    const inicio = aFecha(ct.fecha);
    inicio.setHours(hh, mm || 0, 0, 0);
    const aviso = inicio.getTime() - 60 * 60000;
    const c = store.cliente(ct.clienteId);
    citas.push({
      id: ct.id, inicio: inicio.toISOString(),
      tipo: TIPOS_CITA.find((x) => x.id === ct.tipo)?.nombre || 'Cita',
      texto: [c?.nombre, ct.vehiculo].filter(Boolean).join(' · '),
    });
    if (aviso > ahora) momentos.push({ t: new Date(aviso).toISOString(), tipo: 'cita', id: ct.id });
  }
  momentos.sort((x, y) => x.t.localeCompare(y.t));
  return { momentos, resumen: { nombre: primerNombre(a.nombre), dias, citas, generado: new Date().toISOString() } };
}

let timerResumen = null;
function programarResumen() { clearTimeout(timerResumen); timerResumen = setTimeout(escribirResumen, 2000); }

/** Guarda el resumen donde el service worker lo puede leer al llegar un aviso. */
export async function escribirResumen() {
  if (!('caches' in window)) return;
  try {
    const { resumen } = calcularAgenda();
    const c = await caches.open(CACHE_DATOS);
    await c.put('./__resumen', new Response(JSON.stringify(resumen), { headers: { 'Content-Type': 'application/json' } }));
  } catch { /* sin caché disponible */ }
}

// --- Notificaciones push -------------------------------------------------------------------
function b64uABytes(b64u) {
  const s = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

export const pushSoportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** 'activo' | 'inactivo' | 'bloqueado' | 'instalar' (iPhone sin instalar) | 'no-soportado' */
export async function estadoPush() {
  if (!pushSoportado()) return esIOS && !esInstalada() ? 'instalar' : 'no-soportado';
  if (Notification.permission === 'denied') return 'bloqueado';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo';
  } catch { return 'inactivo'; }
}

export async function activarPush({ pedirPermiso = true } = {}) {
  if (!usuario) throw new Error('Inicia sesión para activar las notificaciones');
  if (!pushSoportado()) throw new Error(esIOS ? 'Instala la app en tu pantalla de inicio para recibir notificaciones' : 'Este navegador no permite notificaciones');
  const permiso = pedirPermiso ? await Notification.requestPermission() : Notification.permission;
  if (permiso !== 'granted') throw new Error('permiso');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const pedir = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uABytes(NUBE.vapidPublica) });
    try { sub = await pedir(); } catch {
      // A veces el servicio de Apple/Google no responde a la primera: reintentar una vez
      await new Promise((r) => setTimeout(r, 2500));
      try { sub = await pedir(); } catch (e2) { throw new Error(`servicio-push: ${e2?.message || e2}`); }
    }
  }
  const j = sub.toJSON();
  const { error } = await cliente().rpc('registrar_push', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh || '', p_auth: j.keys?.auth || '' });
  if (error) throw error;
  store.actualizarAjustes({ pushActivo: true });
  await escribirResumen();
  programarSubida(200); // subir los momentos de aviso
}

export async function desactivarPush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  if (usuario) await cliente().rpc('quitar_push', { p_endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
  if (usuario) store.actualizarAjustes({ pushActivo: false });
}

/** Pide al servidor una notificación de prueba ya mismo. */
export async function probarPush() {
  const c = await caches.open(CACHE_DATOS);
  await c.put('./__prueba', new Response(JSON.stringify({ t: Date.now() }), { headers: { 'Content-Type': 'application/json' } }));
  const { data, error } = await cliente().functions.invoke(NUBE.funcionAvisos || 'avisos', { body: { prueba: true } });
  if (error) throw error;
  return data; // { enviados, fallidos, total }
}
