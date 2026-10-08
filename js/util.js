// =============================================================================
// util.js — Funciones pequeñas reutilizables (fechas, texto, teléfonos…).
// Las fechas se guardan como texto 'AAAA-MM-DD' en hora local; los
// cumpleaños como 'MM-DD' (no hace falta el año).
// =============================================================================

export const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// --- Texto -------------------------------------------------------------------
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Quita tildes y pasa a minúsculas, para buscar sin importar acentos. */
export const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const primerNombre = (nombre) => String(nombre ?? '').trim().split(/\s+/)[0] || '';

export function iniciales(nombre) {
  const p = String(nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

const AVATAR_COLORES = ['blue', 'violet', 'amber', 'green', 'red', 'pink'];
export function colorDe(texto) {
  let h = 0;
  for (const ch of String(texto ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORES[h % AVATAR_COLORES.length];
}

export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// --- Fechas ------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');

export function fechaStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function aFecha(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export const hoy = () => fechaStr(new Date());
export function sumarDias(str, n) {
  const d = aFecha(str);
  d.setDate(d.getDate() + n);
  return fechaStr(d);
}
export function diasEntre(a, b) {
  return Math.round((aFecha(b) - aFecha(a)) / 86400000);
}
export const diasDelMes = (y, m) => new Date(y, m, 0).getDate(); // m: 1-12
export const esBisiesto = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Lista de fechas 'AAAA-MM-DD' desde `desde` hasta `hasta` (inclusive). */
export function rangoFechas(desde, hasta) {
  const out = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) out.push(f);
  return out;
}

/** ¿El 'MM-DD' cae en la fecha dada? (el 29 de feb se celebra el 28 en años no bisiestos) */
export function coincideMesDia(mmdd, fecha) {
  if (!mmdd) return false;
  const [y, m, d] = fecha.split('-').map(Number);
  let [mm, dd] = mmdd.split('-').map(Number);
  if (mm === 2 && dd === 29 && !esBisiesto(y)) dd = 28;
  return mm === m && dd === d;
}

const fmt = (opts) => new Intl.DateTimeFormat('es', opts);
const fmtLarga = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fmtCorta = fmt({ day: 'numeric', month: 'short' });
const fmtCortaAnio = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const fmtHora = fmt({ hour: 'numeric', minute: '2-digit' });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (m) => MESES[m - 1];

export const fechaLarga = (str) => fmtLarga.format(aFecha(str));
export function fechaCorta(str) {
  const d = aFecha(str);
  return (d.getFullYear() === new Date().getFullYear() ? fmtCorta : fmtCortaAnio).format(d).replace('.', '');
}
export function cumpleTexto(mmdd) {
  if (!mmdd) return '';
  const [m, d] = mmdd.split('-').map(Number);
  return `${d} de ${MESES[m - 1]}`;
}

/** "Hoy", "Mañana", "Ayer", "En 3 días", "Hace 2 días", o la fecha. */
export function relativo(str) {
  const n = diasEntre(hoy(), str);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Ayer';
  if (n > 1 && n < 7) return `En ${n} días`;
  if (n < -1 && n > -15) return `Hace ${-n} días`;
  return fechaCorta(str);
}

/** Fecha y hora de un ISO (para el historial) */
export function cuando(iso) {
  const d = new Date(iso);
  return `${relativo(fechaStr(d))} · ${fmtHora.format(d)}`;
}

export function saludo() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Suma meses a una fecha, ajustando al último día si el mes es más corto. */
export function sumarMeses(str, n) {
  const [y, m, d] = str.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12), nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, diasDelMes(ny, nm)))}`;
}

// --- Teléfonos ---------------------------------------------------------------
/**
 * Convierte lo que haya escrito el usuario en un número internacional sin "+".
 *  "+57 300 123 4567" → "573001234567"
 *  "300 123 4567" (código país 57) → "573001234567"
 */
export function telefonoInternacional(tel, codigoPais) {
  const raw = String(tel ?? '').trim();
  let dig = raw.replace(/\D/g, '');
  if (!dig) return '';
  if (raw.startsWith('+')) return dig;
  if (dig.startsWith('00')) return dig.slice(2);
  const cp = String(codigoPais || '').replace(/\D/g, '');
  if (cp && dig.startsWith(cp) && dig.length > 10) return dig;
  if (dig.length <= 10) return cp + dig.replace(/^0+/, '');
  return dig;
}

export function telefonoBonito(tel) {
  const dig = String(tel ?? '').replace(/\D/g, '');
  if (dig.length === 10) return `${dig.slice(0, 3)} ${dig.slice(3, 6)} ${dig.slice(6)}`;
  return String(tel ?? '').trim();
}

// --- Plataforma --------------------------------------------------------------
const ua = navigator.userAgent || '';
export const esIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const esAndroid = /Android/i.test(ua);
export const esMovil = esIOS || esAndroid || /Mobi/i.test(ua);
export const esInstalada = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

// --- Varios ------------------------------------------------------------------
export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function descargarArchivo(nombre, contenido, tipo = 'application/octet-stream') {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Intenta compartir el archivo (menú de compartir del celular); si no se puede, lo descarga. */
export async function compartirODescargar(nombre, contenido, tipo) {
  const file = new File([contenido], nombre, { type: tipo });
  if (esMovil && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: nombre });
      return 'compartido';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado';
    }
  }
  descargarArchivo(nombre, file);
  return 'descargado';
}

export function leerArchivo(file, como = 'text') {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    if (como === 'buffer') r.readAsArrayBuffer(file); else r.readAsText(file);
  });
}

/** Abre el selector de archivos y devuelve el archivo elegido (o null). */
export function elegirArchivo(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files?.[0] || null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}
