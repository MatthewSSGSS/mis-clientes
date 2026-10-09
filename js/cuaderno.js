// =============================================================================
// cuaderno.js — Pasar a la app las ventas del cuaderno.
//
// El cuaderno tiene una fila por venta con estas columnas:
//   Mes | Pedido | Vehículo | Nombre del cliente | P (póliza: ✓ sí / X no) |
//   Cédula | Celular | $ Venta | Fecha de entrega | $ Comisión | Fecha pago comisión
//
// Las filas pueden venir de:
//   • la foto o el PDF escaneado (leído con OCR: se equivoca bastante con la
//     letra a mano, por eso siempre hay una pantalla para revisar),
//   • el texto copiado de la foto con el iPhone ("Texto en vivo"),
//   • un Excel con esas columnas (lo maneja importar.js con los helpers de aquí).
//
// lineaAVenta() saca los datos de una línea por "forma": pedido (5 dígitos al
// inicio), celular (10 dígitos que empiezan por 3), plata ($ o números grandes),
// fechas ("08 ENE"), etc. No importa el orden ni los separadores.
//
// Lo leído queda como una "lista" (store.lecturas) con las columnas de ese
// cuaderno. Con IA, las columnas se detectan de la foto, así que sirve para
// cuadernos con otro formato (ver formato.js).
// =============================================================================

import * as store from './store.js';
import { FORMATO_CUADERNO } from './config.js';
import { formato, normalizarFormato, infoColumna, guardarFormato, ponerValor, textoValor, atributosEntrada, convertir } from './formato.js';
import { abrirHoja, cerrarHoja, aviso, icon, confirmar } from './ui.js';
import { esc, norm, plural, uid, telefonoInternacional, nombreMes, cuando } from './util.js';

const pad = (n) => String(n).padStart(2, '0');

// --- Helpers que también usa el importador de Excel --------------------------------
const MESES = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
  // Errores típicos del lector de fotos
  jon: 6, jum: 6, jue: 7, jol: 7, agc: 8, sef: 9, ocr: 10, oci: 10, dlc: 12,
};
// Formas completas de cada mes (para no confundir "MARIA" con "MAR" de marzo)
const FORMAS_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'sept',
  'octubre', 'noviembre', 'diciembre', ...Object.keys(MESES),
].sort((a, b) => b.length - a.length);
const MES_TEXTO = FORMAS_MES.join('|');
const RE_FECHA_MES = new RegExp(`(?:^|[^\\d])(\\d{1,2})\\s*(?:de\\s*)?(${MES_TEXTO})\\.?(?![a-z])(?:\\s*(?:de\\s*)?(\\d{4}))?`, 'i');
const RE_FECHA_MES_G = new RegExp(RE_FECHA_MES.source, 'gi');
const RE_MES_PALABRA = new RegExp(`(?:^|[^a-z])(${MES_TEXTO})\\.?(?![a-z])`, 'gi');

/** ¿Hay un mes sin día antes de la primera fecha? ("OCT 20 NOV": la entrega quedó sin día) */
function hayMesSinDia(texto, fechas) {
  if (fechas.length !== 1) return false;
  const ini = fechas[0].index, fin = ini + fechas[0][0].length;
  return [...texto.matchAll(RE_MES_PALABRA)].some((m) => m.index < ini && !(m.index >= ini && m.index < fin));
}

/** "08 ENE", "8 de enero", "25 MAYO 2026" → 'AAAA-MM-DD' (año por defecto si no trae). */
export function fechaConMes(texto, anio = new Date().getFullYear()) {
  const m = norm(texto).match(RE_FECHA_MES);
  if (!m) return '';
  const dia = Number(m[1]), mes = MESES[m[2].slice(0, 3)] ?? MESES[m[2]];
  if (!mes || dia < 1 || dia > 31) return '';
  return `${m[3] || anio}-${pad(mes)}-${pad(dia)}`;
}

/** "$100'960.100", "100.960.100", 100960100 → 100960100 (0 si no hay número). */
export function aPesos(v) {
  if (typeof v === 'number') return Math.round(v);
  const dig = String(v ?? '').replace(/[oO](?=[\d.'’,])/g, '0').replace(/\D/g, '');
  return dig ? Number(dig) : 0;
}

/** ✓ / V / si → 'si'; X / no → 'no'; otra cosa → '' */
export function aPoliza(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return '';
  if (/^(x|no|n|k|%)/.test(s)) return 'no';
  if (/^(✓|✔|v|si|sí|s|j|\/|√|ok|y)/.test(s)) return 'si';
  return '';
}

// --- Leer una línea del cuaderno -----------------------------------------------------
// Palabras que forman el nombre de los vehículos Nissan (para separar vehículo y nombre)
const PALABRAS_VEHICULO = [
  'kicks', 'play', 'premium', 'advance', 'adv', 'exc', 'exclusive', 'sense', 'versa', 'new', 'sr', 'sentra',
  'plat', 'platinum', 'x-trail', 'xtrail', 'trail', 'qashqai', 'kait', 'kaitsense', 'p16', 'frontier', 'march',
  'pathfinder', 'murano', 'navara', 'leaf', 'ariya', 'patrol', 'magnite', 'e-power', 'epower', 'plus', 'le', 'xe', 'se',
];
// Cómo suele leer el OCR algunas de esas palabras
const ARREGLOS_VEHICULO = { pig: 'P16', pic: 'P16', p1g: 'P16', ptg: 'P16', klcks: 'Kicks', kices: 'Kicks', kiccs: 'Kicks', kicrs: 'Kicks', qashbai: 'Qashqai', gashbai: 'Qashqai' };

function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}
function esPalabraVehiculo(tok) {
  const t = norm(tok).replace(/[^a-z0-9-]/g, '');
  if (!t) return false;
  if (ARREGLOS_VEHICULO[t]) return true;
  return PALABRAS_VEHICULO.some((p) => p === t || (t.length >= 4 && p.length >= 4 && distancia(t, p) <= (p.length >= 6 ? 2 : 1)));
}
function arreglarPalabraVehiculo(tok) {
  const t = norm(tok).replace(/[^a-z0-9-]/g, '');
  if (ARREGLOS_VEHICULO[t]) return ARREGLOS_VEHICULO[t];
  let mejor = null, dist = 9;
  for (const p of PALABRAS_VEHICULO) {
    const dd = distancia(t, p);
    if (dd < dist) { dist = dd; mejor = p; }
  }
  const w = dist <= 2 && mejor ? mejor : t;
  const bonitos = { adv: 'Advance', exc: 'Exclusive', sr: 'SR', plat: 'Platinum', 'x-trail': 'X-Trail', xtrail: 'X-Trail', p16: 'P16', new: 'New', le: 'LE', xe: 'XE', se: 'SE', 'e-power': 'e-Power', epower: 'e-Power' };
  return bonitos[w] || w.charAt(0).toUpperCase() + w.slice(1);
}

function capitalizar(nombre) {
  return nombre.toLowerCase().split(/\s+/).filter(Boolean).map((p) =>
    ['de', 'del', 'la', 'las', 'los', 'y'].includes(p) ? p : p.replace(/^(\(?)(\p{L})/u, (_, a, b) => a + b.toUpperCase())).join(' ')
    .replace(/\bS\.?a\.?s\b\.?/i, 'S.A.S.');
}

/** Corrige letras que el OCR confunde con números dentro de un "número". */
const aDigitos = (s) => s.replace(/[Oo]/g, '0').replace(/[Il|!]/g, '1').replace(/[Ss$]/g, '5').replace(/[B]/g, '8').replace(/[Zz]/g, '2').replace(/[Gb]/g, '6');

/**
 * Saca los datos de venta de una línea del cuaderno.
 * @returns {object|null} null si la línea no parece una venta
 */
export function lineaAVenta(linea, anio = new Date().getFullYear()) {
  const original = String(linea || '').replace(/\s+/g, ' ').trim();
  if (original.length < 12) return null;
  let resto = ` ${original.replace(/[|]/g, ' | ')} `;
  const r = { linea: original, pedido: '', vehiculo: '', nombre: '', poliza: '', cedula: '', telefono: '', precio: 0, fechaCompra: '', comision: 0, fechaPagoComision: '' };

  // Quitar el mes de la sección (ENERO, FEBRERO…) si viene al inicio
  resto = resto.replace(/^\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|sept)\b/i, ' ');

  // Fechas "08 ENE": la primera es la entrega, la segunda el pago de la comisión
  const fechas = [...norm(resto).matchAll(RE_FECHA_MES_G)];
  // "OCT 20 NOV": la entrega quedó sin día; la única fecha completa es el pago de la comisión
  const mesSinDia = hayMesSinDia(norm(resto), fechas);
  if (mesSinDia) r.fechaPagoComision = fechaConMes(fechas[0][0], anio);
  else {
    if (fechas[0]) r.fechaCompra = fechaConMes(fechas[0][0], anio);
    if (fechas[1]) r.fechaPagoComision = fechaConMes(fechas[1][0], anio);
  }
  if (r.fechaCompra && r.fechaPagoComision && r.fechaPagoComision < r.fechaCompra) {
    r.fechaPagoComision = `${Number(r.fechaPagoComision.slice(0, 4)) + 1}${r.fechaPagoComision.slice(4)}`;
  }
  resto = resto.replace(new RegExp(`\\b\\d{1,2}\\s*(?:de\\s*)?(?:${MES_TEXTO})\\.?(?![a-z])(?:\\s*\\d{4})?`, 'gi'), ' | ');
  if (mesSinDia) resto = resto.replace(RE_MES_PALABRA, (m0, mes) => `${m0.slice(0, m0.toLowerCase().indexOf(mes.toLowerCase()))} | `);

  // Pedido: 5 dígitos al inicio (el OCR a veces lee la S como 5 y al revés)
  const ped = resto.match(/^\s*([0-9SsOoIlB]{5})(?=\W)/);
  if (ped && /^[0-9]{5}$/.test(aDigitos(ped[1])) && /\d/.test(ped[1])) {
    r.pedido = aDigitos(ped[1]);
    resto = resto.replace(ped[0], ' | ');
  }

  // Plata: venta (millones) y comisión (cientos de miles)
  const montos = [];
  resto = resto.replace(/\$?\s*\d[\d.'’,\s]{4,}\d(?:\s*-)?/g, (m) => {
    const dig = m.replace(/\D/g, '');
    if (dig.length === 10 && dig.startsWith('3') && !/[$.'’]/.test(m)) return m; // es un celular
    if (dig.length >= 6 && /[$.'’]/.test(m)) { montos.push(aPesos(m)); return ' | '; }
    return m;
  });
  for (const v of montos) {
    if (v >= 10_000_000 && v <= 3_000_000_000 && !r.precio) r.precio = v;
    else if (v >= 50_000 && v < 10_000_000 && !r.comision) r.comision = v;
  }

  // Celular: 10 dígitos que empiezan por 3
  const cel = resto.match(/(^|\D)(3\d{9})(?!\d)/) || resto.match(/(^|\D)(3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})(?!\d)/);
  if (cel) {
    r.telefono = cel[2].replace(/\D/g, '');
    resto = resto.replace(cel[2], ' | ');
  }

  // Cédula o NIT (puede tener puntos o guion) y la marca de póliza justo antes
  const ced = resto.match(/(?:^|\s)([xXkK%✓✔vVjJ/√]{1,2}[oOdD]?)?\s*\|?\s*([0-9OoIl][0-9OoIl.,'’\s-]{5,14}[0-9OoIl])(?=\s|\||$)/);
  if (ced) {
    const num = aDigitos(ced[2]).replace(/[^\d-]/g, '');
    if (num.replace(/\D/g, '').length >= 6) {
      r.cedula = num.replace(/-+$/, '');
      if (ced[1]) r.poliza = aPoliza(ced[1]);
      resto = resto.replace(ced[0], ' | ');
    }
  }
  if (!r.poliza) {
    const marca = resto.match(/\s([xX✓✔√])\s*[oOdD]?\s*\|?\s*$/) || resto.match(/\s([xX✓✔√])[oOdD]?\s/);
    if (marca) { r.poliza = aPoliza(marca[1]); resto = resto.replace(marca[0], ' '); }
  }

  // Lo que queda: vehículo y nombre. Si hay columnas (|), se usan; si no, por palabras.
  const partes = resto.split('|').map((p) => p.replace(/[^\p{L}\d\s.()&-]/gu, ' ').replace(/\s+/g, ' ').trim()).filter((p) => /\p{L}{2,}/u.test(p));
  let palabras;
  const conColumnas = (original.match(/\|/g) || []).length >= 3; // el OCR detectó columnas
  if (partes.length >= 2 && (conColumnas || partes[0].split(' ').every(esPalabraVehiculo))) {
    r.vehiculo = partes[0].split(' ').map(arreglarPalabraVehiculo).join(' ');
    palabras = partes.slice(1).join(' ').split(' ');
  } else {
    palabras = partes.join(' ').split(' ');
    const veh = [];
    while (palabras.length && veh.length < 5 && esPalabraVehiculo(palabras[0])) veh.push(arreglarPalabraVehiculo(palabras.shift()));
    r.vehiculo = veh.join(' ');
  }
  // Sin restos con números (pedazos de valores mal leídos) ni marcas sueltas
  r.nombre = capitalizar(palabras.filter((w) => /\p{L}/u.test(w) && !/\d/.test(w) && !/^[xXvV✓]$/.test(w)).join(' '));

  // ¿Parece una venta? (al menos 3 datos además del nombre)
  const datos = [r.pedido, r.telefono, r.precio, r.fechaCompra, r.cedula, r.vehiculo].filter(Boolean).length;
  if (!r.nombre || datos < 3) return null;
  return r;
}

/** ¿Este texto parece el cuaderno de ventas? */
export function pareceCuaderno(lineas) {
  const n = lineas.filter((l) => lineaAVenta(l)).length;
  return n >= 2 && n >= lineas.filter((l) => l.trim().length > 12).length * 0.3;
}

/** Año del cuaderno ("AÑO 2026") o el actual. */
function anioDe(lineas) {
  for (const l of lineas.slice(0, 6)) {
    const m = l.match(/a[ñn]o\W{0,6}(20\d{2})/i) || l.match(/\b(20[2-4]\d)\b/);
    if (m) return Number(m[1]);
  }
  return new Date().getFullYear();
}

export function lineasAVentas(lineas) {
  const anio = anioDe(lineas);
  return lineas.map((l) => lineaAVenta(l, anio)).filter(Boolean).map(({ vehiculo, ...v }) => ({ ...v, vehiculoComprado: vehiculo }));
}

// --- Revisar antes de guardar ------------------------------------------------------------
const celularOK = (t) => /^3\d{9}$/.test(String(t).replace(/\D/g, ''));
// Rango normal del valor de un vehículo (fuera de eso, seguro se leyó mal)
const valorOK = (v) => v >= 30_000_000 && v <= 450_000_000;
const fmt = (n) => (Number(n) ? Number(n).toLocaleString('es-CO') : '');
// Campos que indican que la lista es de ventas (clientes que ya compraron)
const CAMPOS_DE_VENTA = ['pedido', 'fechaCompra', 'precio', 'comision', 'vehiculoComprado', 'fechaPagoComision'];

/** Columnas para una lista leída sin IA: las del formato + las que el lector encontró. */
function columnasLeidas(filas) {
  const cols = formato();
  const ids = new Set(cols.map((c) => c.id));
  const extra = FORMATO_CUADERNO.filter((c) => !ids.has(c.id) && filas.some((x) => x[c.id] !== '' && x[c.id] != null && x[c.id] !== 0));
  return [...cols, ...extra.map(infoColumna)];
}

const columnasGuardables = (cols) => cols.map(({ id, titulo, tipo, propia }) => (propia ? { id, titulo, tipo } : { id, titulo }));

/**
 * Guarda las filas recién leídas como una "lista" y abre su tabla.
 * Toda lectura queda guardada (aunque se cierre la tabla), porque leer con IA cuesta.
 * @param {object[]} filas una por cliente, con los valores por id de columna; `dudas`: ids que no se entendieron bien
 * @param {{columnas?:object[], ocr?:boolean, ia?:boolean, origen?:string, nombre?:string}} o
 *        columnas: las del cuaderno, en su orden (si no vienen, las del formato de la persona)
 */
export function revisarVentas(filas, { columnas, ocr = false, ia = false, origen = 'Importado del cuaderno', nombre = '' } = {}) {
  const cols = normalizarFormato(columnas || columnasLeidas(filas));
  const cp = store.ajustes().codigoPais;
  const telefonos = new Set(store.clientes().map((c) => telefonoInternacional(c.telefono, cp)).filter(Boolean));
  const pedidos = new Set(store.clientes().map((c) => String(c.pedido || '')).filter(Boolean));
  const lista = store.guardarLectura({
    nombre: nombre || (/^Importado de /.test(origen) && origen !== 'Importado de una lista' ? origen.slice(13) : 'Lista escrita o pegada'),
    origen,
    fuente: ia ? 'ia' : ocr ? 'ocr' : 'texto',
    columnas: columnasGuardables(cols),
    filas: filas.map((v) => {
      const repetido = (v.telefono && telefonos.has(telefonoInternacional(v.telefono, cp))) || (v.pedido && pedidos.has(String(v.pedido)));
      const fila = { linea: v.linea || '', dudasIA: v.dudas || [], editados: [], elegido: !repetido, pasada: false, repetido: !!repetido };
      for (const c of cols) fila[c.id] = v[c.id] ?? (c.tipo === 'dinero' ? 0 : '');
      return fila;
    }),
  });
  abrirLista(lista.id);
}

// Fecha corta "08 ENE"
const mesDe = (iso) => (/^\d{4}-\d{2}/.test(iso || '') ? (nombreMes(Number(iso.slice(5, 7))) || '').slice(0, 3).toUpperCase() : '—');
const fechaCuaderno = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? `${iso.slice(8, 10)} ${mesDe(iso)}` : esc(iso || ''));

// Ancho de cada columna en la tabla
const ANCHO = { pedido: 'c-ped', vehiculoComprado: 'c-veh', nombre: 'c-nom', cedula: 'c-ced', telefono: 'c-cel' };
const anchoDe = (c) => ANCHO[c.id] || { sino: 'c-pol', dinero: 'c-pes', fecha: 'c-fec', cumple: 'c-fec', tel: 'c-cel', numero: 'c-ced' }[c.tipo] || 'c-txt';

/** Columnas de una lista guardada, con sus datos completos (tipo, ancho…). */
export function columnasDeLista(l) {
  return normalizarFormato(l.columnas || FORMATO_CUADERNO).map((c) => ({ ...c, ancho: anchoDe(c) }));
}

/** Lo que se ve en una casilla de la tabla. */
function verCelda(x, c) {
  const v = x[c.id];
  if (c.tipo === 'fecha') return fechaCuaderno(v);
  if (c.tipo === 'cumple') return esc(/^\d{2}-\d{2}$/.test(v || '') ? `${v.slice(3)}/${v.slice(0, 2)}` : v || '');
  return esc(textoValor(v, c, 'tabla'));
}

/** ¿Esta casilla está dudosa? (reglas + lo que marcó la IA, hasta que se corrija) */
function dudosa(filas, x, campo) {
  if (x.pasada) return false;
  let regla = false;
  if (campo === 'telefono') regla = !celularOK(x.telefono);
  else if (campo === 'precio') regla = !!x.precio && !valorOK(x.precio);
  else if (campo === 'fechaCompra') regla = !x.fechaCompra;
  else if (campo === 'nombre') regla = String(x.nombre || '').trim().split(/\s+/).length < 2;
  else if (campo === 'pedido' && x.pedido) {
    // Todos los pedidos de la lista suelen tener la misma cantidad de dígitos
    const largos = filas.map((y) => String(y.pedido || '').length).filter(Boolean);
    const comun = largos.sort((a, b) => largos.filter((n) => n === b).length - largos.filter((n) => n === a).length)[0];
    regla = !/^\d+$/.test(x.pedido) || (largos.length >= 3 && String(x.pedido).length !== comun)
      || filas.filter((y) => y.pedido === x.pedido).length > 1;
  }
  return regla || ((x.dudasIA || []).includes(campo) && !(x.editados || []).includes(campo));
}

/** Resumen de una lista: cuántas filas, cuántas pasadas y cuántas casillas por revisar */
export function resumenLista(l) {
  const cols = columnasDeLista(l);
  const pendientes = l.filas.filter((x) => !x.pasada);
  const malas = pendientes.reduce((t, x) => t + (x.elegido ? cols.filter((c) => dudosa(l.filas, x, c.id)).length : 0), 0);
  return { total: l.filas.length, pasadas: l.filas.length - pendientes.length, pendientes: pendientes.length, malas };
}

/** Firma de unas columnas (para comparar formatos). */
const firma = (cols) => cols.map((c) => c.id).join('|');

/** Abre la tabla de una lista guardada para revisarla, editarla y pasarla a clientes. */
export function abrirLista(id) {
  const l = store.lectura(id);
  if (!l) { aviso('Esa lista ya no existe', { icono: 'x' }); return; }
  const filas = structuredClone(l.filas);
  const cols = columnasDeLista(l);
  const conMes = cols.some((c) => c.id === 'fechaCompra');
  const deVentas = cols.some((c) => CAMPOS_DE_VENTA.includes(c.id));
  // ¿Proponer estas columnas como su formato? (solo si las leyó la IA y son distintas)
  const proponer = l.fuente === 'ia' && firma(cols) !== firma(formato()) && store.ajustes().formatoDescartado !== firma(cols);
  let modo = 'ver'; // 'ver' | 'editar'
  let timer = null;

  // Guardar los cambios en la lista (poco después de cada edición)
  const guardar = () => {
    clearTimeout(timer);
    const actual = store.lectura(id);
    if (actual) store.guardarLectura({ ...actual, filas: structuredClone(filas) });
  };
  const guardarLuego = () => { clearTimeout(timer); timer = setTimeout(guardar, 700); };

  const valorInput = (x, c) => (c.tipo === 'dinero' ? fmt(x[c.id]) : x[c.id] ?? '');
  const celda = (x, i, c) => {
    const mala = dudosa(filas, x, c.id) ? 'duda' : '';
    if (modo === 'ver' || x.pasada) {
      return `<td class="${c.ancho} ${mala}" ${x.pasada ? '' : `data-celda="${i}:${c.id}"`}>${verCelda(x, c) || '<span class="vacia">—</span>'}</td>`;
    }
    if (c.tipo === 'sino') {
      const v = x[c.id];
      return `<td class="${c.ancho}"><select class="tc-input" data-i="${i}" data-f="${c.id}" aria-label="${esc(c.titulo)}">
        <option value="" ${!v ? 'selected' : ''}>—</option><option value="si" ${v === 'si' ? 'selected' : ''}>✓</option><option value="no" ${v === 'no' ? 'selected' : ''}>X</option></select></td>`;
    }
    const attrs = c.tipo === 'cumple' ? 'placeholder="dd/mm"' : atributosEntrada(c);
    return `<td class="${c.ancho}"><input class="tc-input ${mala}" data-i="${i}" data-f="${c.id}" value="${esc(valorInput(x, c))}" ${attrs} aria-label="${esc(c.titulo)}"></td>`;
  };

  const pintarResumen = (el) => {
    const r = resumenLista({ filas, columnas: l.columnas });
    const porPasar = filas.filter((x) => x.elegido && !x.pasada).length;
    const cosa = deVentas ? ['venta', 'ventas'] : ['cliente', 'clientes'];
    el.querySelector('[data-resumen]').innerHTML = `${plural(r.total, ...cosa)}`
      + `${r.pasadas ? ` · <span style="color:var(--c-green);font-weight:700">${r.pasadas} en clientes</span>` : ''}`
      + `${r.pendientes ? ` · <b>${porPasar}</b> por pasar` : ''}`
      + `${r.malas ? ` · <span style="color:var(--c-red);font-weight:700">${plural(r.malas, 'casilla por revisar', 'casillas por revisar')}</span>` : r.pendientes ? ' · todo se ve bien ✓' : ''}`;
    const ok = el.querySelector('[data-ok]');
    ok.innerHTML = `${icon('check')} Pasar ${porPasar}<span class="solo-ancho">&nbsp;a clientes</span>`;
    ok.disabled = !porPasar;
  };

  const pintarTabla = (el, foco) => {
    const hayPendientes = filas.some((x) => !x.pasada);
    const btnModo = el.querySelector('[data-modo]');
    btnModo.hidden = !hayPendientes;
    btnModo.innerHTML = modo === 'ver' ? `${icon('edit', 'i-sm')} Editar tabla` : `${icon('check', 'i-sm')} Ver tabla`;
    const tabla = el.querySelector('[data-tabla]');
    tabla.className = `tabla-cuaderno ${modo === 'editar' ? 'editando' : ''}`;
    tabla.innerHTML = `
      <thead><tr><th class="c-chk" title="Pasar a clientes">✓</th>${conMes ? '<th class="c-mes">Mes</th>' : ''}${cols.map((c) => `<th class="${c.ancho}">${esc(c.titulo)}</th>`).join('')}</tr></thead>
      <tbody>
        ${filas.map((x, i) => `
          <tr class="${x.pasada ? 'pasada' : x.elegido ? '' : 'off'}" ${x.linea ? `title="Leí: ${esc(x.linea)}"` : ''}>
            <td class="c-chk">${x.pasada
              ? `<span class="en-clientes" title="Ya está en clientes">${icon('check', 'i-sm')}</span>`
              : `<input type="checkbox" data-elegir="${i}" ${x.elegido ? 'checked' : ''} aria-label="Pasar esta fila a clientes">`}</td>
            ${conMes ? `<td class="c-mes">${mesDe(x.fechaCompra)}${x.repetido && !x.pasada ? '<span class="ya-esta" title="Puede que ya esté en la app">●</span>' : ''}</td>` : ''}
            ${cols.map((c) => celda(x, i, c)).join('')}
          </tr>`).join('')}
      </tbody>`;
    pintarResumen(el);
    if (foco) {
      const inp = el.querySelector(`[data-i="${foco.i}"][data-f="${foco.f}"]`);
      if (inp) { inp.focus({ preventScroll: false }); inp.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    }
  };

  const fuente = { ia: 'Leída con inteligencia artificial', ocr: 'Leída con el lector gratis', texto: 'Escrita o pegada' }[l.fuente] || '';
  abrirHoja({
    titulo: l.nombre || 'Lista del cuaderno',
    alta: true,
    ancha: true,
    cuerpo: `
      ${proponer ? `<div class="banner ok formato-propuesta" data-propuesta>${icon('sparkles', 'i-lg')}<div><strong>Así anotas a tus clientes</strong>
        Encontré estas columnas en tu cuaderno: <b>${cols.map((c) => esc(c.titulo)).join(' · ')}</b>.
        ¿Quieres que la app use este formato? Al agregar un cliente te pedirá lo mismo y en el mismo orden.
        <div class="hstack mt-8" style="flex-wrap:wrap"><button class="btn btn-primary btn-sm" type="button" data-usar-formato>${icon('check', 'i-sm')} Usar este formato</button><button class="btn btn-ghost btn-sm" type="button" data-no-formato>Ahora no</button></div></div></div>` : ''}
      ${l.fuente === 'ia' || l.fuente === 'ocr' ? `<div class="banner ${l.fuente === 'ia' ? 'info' : 'warn'} ${proponer ? 'mt-12' : ''}">${icon(l.fuente === 'ia' ? 'sparkles' : 'scan', 'i-lg')}<div><strong>${fuente}</strong>
        Compara la tabla con tu cuaderno. Lo que está en <span style="color:var(--c-red);font-weight:700">rojo</span> no se entendía bien: tócalo para corregirlo. La lista se guarda sola; puedes seguir después en <b>Listas leídas</b>.</div></div>` : ''}
      <div class="hstack mt-12" style="flex-wrap:wrap">
        <span class="small muted spacer" data-resumen></span>
        <button class="btn btn-primary btn-sm" type="button" data-modo></button>
      </div>
      <div class="tabla-scroll mt-12"><table data-tabla></table></div>
      <p class="small muted mt-8">Desliza la tabla hacia los lados para ver todas las columnas. Desmarca ✓ las filas que no quieras pasar a clientes.</p>
      <datalist id="dl-modelos">${(store.ajustes().modelos || []).map((m) => `<option value="${esc(m)}">`).join('')}</datalist>`,
    pie: `<button class="btn btn-outline" data-luego>${icon('download', 'i-sm')} Guardar<span class="solo-ancho">&nbsp;para después</span></button><button class="btn btn-primary" data-ok>Pasar a clientes</button>`,
    cerrar: () => guardar(),
    montar: (el) => {
      pintarTabla(el);
      const tabla = el.querySelector('[data-tabla]');

      el.querySelector('[data-usar-formato]')?.addEventListener('click', () => {
        guardarFormato(cols);
        el.querySelector('[data-propuesta]').remove();
        aviso('Listo. Ahora "Registrar venta" te pide estas columnas.', { ms: 6000 });
      });
      el.querySelector('[data-no-formato]')?.addEventListener('click', () => {
        store.actualizarAjustes({ formatoDescartado: firma(cols) });
        el.querySelector('[data-propuesta]').remove();
      });

      el.querySelector('[data-modo]').addEventListener('click', () => {
        modo = modo === 'ver' ? 'editar' : 'ver';
        pintarTabla(el);
      });
      // En "ver", tocar una casilla abre la edición justo ahí
      tabla.addEventListener('click', (e) => {
        const td = e.target.closest('[data-celda]');
        if (!td || modo !== 'ver') return;
        const [i, f] = td.dataset.celda.split(':');
        modo = 'editar';
        pintarTabla(el, { i, f });
      });
      tabla.addEventListener('change', (e) => {
        const t = e.target;
        if (t.matches('[data-elegir]')) { filas[Number(t.dataset.elegir)].elegido = t.checked; pintarTabla(el); guardarLuego(); return; }
        if (t.matches('select[data-f]')) {
          const x = filas[Number(t.dataset.i)];
          x[t.dataset.f] = t.value;
          if (!x.editados.includes(t.dataset.f)) x.editados.push(t.dataset.f);
          guardarLuego();
        }
      });
      tabla.addEventListener('input', (e) => {
        const t = e.target;
        if (!t.matches('input.tc-input')) return;
        const i = Number(t.dataset.i), f = t.dataset.f;
        const x = filas[i];
        const col = cols.find((c) => c.id === f);
        if (t.matches('[data-dinero]')) {
          const n = aPesos(t.value);
          t.value = n ? n.toLocaleString('es-CO') : '';
          x[f] = n;
        } else if (col?.tipo === 'cumple') x[f] = convertir(t.value, 'cumple') || t.value.trim();
        else x[f] = t.value.trim();
        if (!x.editados.includes(f)) x.editados.push(f);
        t.classList.toggle('duda', dudosa(filas, x, f));
        if (f === 'pedido') filas.forEach((y, k) => el.querySelector(`[data-i="${k}"][data-f="pedido"]`)?.classList.toggle('duda', dudosa(filas, y, 'pedido')));
        guardarLuego();
      });
      tabla.addEventListener('focusout', () => pintarResumen(el));

      el.querySelector('[data-luego]').addEventListener('click', () => {
        guardar();
        cerrarHoja();
        aviso('Lista guardada. Puedes seguir después en "Listas leídas".', { icono: 'download', ms: 6000, accion: { texto: 'Ver listas', fn: () => abrirListas() } });
      });
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const porPasar = filas.filter((x) => x.elegido && !x.pasada);
        const sinNombre = porPasar.filter((x) => !String(x.nombre || '').trim()).length;
        if (sinNombre) {
          aviso(`${plural(sinNombre, 'fila marcada no tiene', 'filas marcadas no tienen')} nombre. Escríbelo o desmárcala.`, { icono: 'x', ms: 6000 });
          if (modo !== 'editar') { modo = 'editar'; pintarTabla(el); }
          return;
        }
        const nuevos = porPasar.map((x) => {
          const c = store.nuevoCliente({
            etapa: deVentas ? 'vendido' : 'nuevo',
            historial: [{ id: uid('h_'), fecha: new Date().toISOString(), tipo: 'creado', texto: l.origen || 'Importado del cuaderno' }],
          });
          for (const col of cols) {
            const v = x[col.id];
            if (v === undefined) continue;
            ponerValor(c, col, col.tipo === 'dinero' ? Number(v) || '' : col.tipo === 'cumple' ? convertir(v, 'cumple') : typeof v === 'string' ? v.trim() : v);
          }
          x.pasada = true;
          x.clienteId = c.id;
          return c;
        });
        store.agregarClientes(nuevos);
        guardar();
        cerrarHoja();
        const sinCel = nuevos.filter((c) => !celularOK(c.telefono)).length;
        aviso(`${plural(nuevos.length, deVentas ? 'venta pasada' : 'cliente pasado', deVentas ? 'ventas pasadas' : 'clientes pasados')} a clientes${sinCel ? ` · ${sinCel} sin celular válido (corrígelo en su ficha)` : ''}`, { ms: 6000 });
      });
    },
  });
}

/** Pantalla con todas las listas leídas guardadas. */
export function abrirListas() {
  const pintar = (el) => {
    const ls = [...store.lecturas()].sort((a, b) => (b.creado || '').localeCompare(a.creado || ''));
    el.querySelector('[data-listas]').innerHTML = ls.length ? ls.map((l) => {
      const r = resumenLista(l);
      const estado = !r.pendientes ? '<span class="pill" data-color="green">Todo en clientes</span>'
        : r.pasadas ? `<span class="pill" data-color="amber">${r.pendientes} sin pasar</span>`
          : '<span class="pill" data-color="blue">Sin pasar</span>';
      return `
        <div class="g-row g-wrap">
          <span class="icon-badge" data-color="${l.fuente === 'ia' ? 'violet' : 'gray'}">${icon(l.fuente === 'ia' ? 'sparkles' : 'sheet')}</span>
          <button class="li-body lista-abrir" type="button" data-abrir="${l.id}">
            <b class="una-linea">${esc(l.nombre || 'Lista del cuaderno')}</b>
            <span class="small muted">${esc(cuando(l.creado))} · ${plural(r.total, 'fila', 'filas')}${r.malas ? ` · <span style="color:var(--c-red)">${plural(r.malas, 'casilla por revisar', 'casillas por revisar')}</span>` : ''}</span>
          </button>
          <div class="row-actions">${estado}<button class="btn btn-ghost btn-icon btn-sm" type="button" data-borrar="${l.id}" aria-label="Eliminar lista">${icon('trash', 'i-sm')}</button></div>
        </div>`;
    }).join('') : `<div class="g-row"><div class="li-body"><b>Todavía no hay listas</b><span class="small muted">Cuando leas una foto o PDF del cuaderno, la lista queda guardada aquí.</span></div></div>`;
    el.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', () => abrirLista(b.dataset.abrir)));
    el.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
      const l = store.lectura(b.dataset.borrar);
      const ok = await confirmar({
        titulo: '¿Eliminar esta lista?',
        texto: 'Se borra solo la lista. Los clientes que ya pasaste se quedan.',
        si: 'Eliminar lista', peligro: true,
      });
      if (ok && l) { store.eliminarLectura(l.id); aviso('Lista eliminada', { icono: 'trash' }); abrirListas(); }
      else abrirListas();
    }));
  };
  abrirHoja({
    titulo: 'Listas leídas',
    alta: true,
    cuerpo: `
      <p class="small muted">Cada vez que lees el cuaderno, la lista se guarda aquí para que la revises, la corrijas y la pases a clientes cuando quieras.</p>
      <div class="grouped mt-12" data-listas></div>`,
    montar: (el) => pintar(el),
  });
}

/** "MARIBEL MARTINEZ TORRES" → "Maribel Martinez Torres" (solo si viene todo en mayúsculas). */
export function nombreBonito(t) {
  const s = String(t || '').trim().replace(/\s+/g, ' ');
  return s && s === s.toUpperCase() && /\p{Lu}{3}/u.test(s) ? capitalizar(s) : s;
}

/** "NEW VERSA ADV" → "New Versa Advance"; "KICKS P16 SENSE" → "Kicks P16 Sense" */
export function vehiculoBonito(t) {
  const s = String(t || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s.split(' ').map((w) => (esPalabraVehiculo(w) ? arreglarPalabraVehiculo(w) : nombreBonito(w))).join(' ');
}
