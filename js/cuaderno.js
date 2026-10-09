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
// =============================================================================

import * as store from './store.js';
import { abrirHoja, cerrarHoja, aviso, icon } from './ui.js';
import { esc, norm, plural, uid, telefonoInternacional, nombreMes } from './util.js';

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
  return lineas.map((l) => lineaAVenta(l, anio)).filter(Boolean);
}

// --- Revisar antes de guardar ------------------------------------------------------------
const celularOK = (t) => /^3\d{9}$/.test(String(t).replace(/\D/g, ''));
// Rango normal del valor de un Nissan (fuera de eso, seguro se leyó mal)
const valorOK = (v) => v >= 30_000_000 && v <= 450_000_000;
const fmt = (n) => (Number(n) ? Number(n).toLocaleString('es-CO') : '');

/**
 * Pantalla para revisar y corregir las ventas leídas, en forma de tabla con
 * las columnas del cuaderno. "Editar tabla" vuelve editables las casillas.
 * @param {object[]} ventas resultado de lineasAVentas() o del lector con IA
 * @param {{ocr?:boolean, ia?:boolean, origen?:string}} o
 *        ia: las leyó Claude (cada venta puede traer `dudas`: campos que no se entendieron bien)
 */
export function revisarVentas(ventas, { ocr = false, ia = false, origen = 'Importado del cuaderno' } = {}) {
  const cp = store.ajustes().codigoPais;
  const telefonos = new Set(store.clientes().map((c) => telefonoInternacional(c.telefono, cp)).filter(Boolean));
  const pedidos = new Set(store.clientes().map((c) => String(c.pedido || '')).filter(Boolean));
  const vecesPedido = {};
  for (const v of ventas) if (v.pedido) vecesPedido[v.pedido] = (vecesPedido[v.pedido] || 0) + 1;

  // Estado de cada fila (se corrige aquí mismo mientras se edita)
  const filas = ventas.map((v) => {
    const repetido = (v.telefono && telefonos.has(telefonoInternacional(v.telefono, cp))) || (v.pedido && pedidos.has(v.pedido));
    return {
      nombre: v.nombre || '', pedido: v.pedido || '', vehiculo: v.vehiculo || '', poliza: v.poliza || '',
      cedula: v.cedula || '', telefono: v.telefono || '', precio: Number(v.precio) || 0, fechaCompra: v.fechaCompra || '',
      comision: Number(v.comision) || 0, fechaPagoComision: v.fechaPagoComision || '', linea: v.linea || '',
      dudasIA: new Set(v.dudas || []), editados: new Set(), repetido, elegido: !repetido,
    };
  });
  let modo = 'ver'; // 'ver' | 'editar'

  // ¿Esta casilla está dudosa? (reglas + lo que marcó la IA, hasta que se corrija)
  const pedidoRepetido = (f) => !!f.pedido && filas.filter((x) => x.pedido === f.pedido).length > 1;
  const dudosa = (f, campo) => {
    const regla = {
      telefono: !celularOK(f.telefono),
      precio: !valorOK(f.precio),
      fechaCompra: !f.fechaCompra,
      nombre: f.nombre.trim().split(/\s+/).length < 2,
      pedido: (!!f.pedido && !/^\d{5}$/.test(f.pedido)) || pedidoRepetido(f),
    }[campo] || false;
    return regla || (f.dudasIA.has(campo) && !f.editados.has(campo));
  };

  // Columnas, en el orden del cuaderno
  const mesDe = (iso) => (iso ? (nombreMes(Number(iso.slice(5, 7))) || '').slice(0, 3).toUpperCase() : '—');
  const fechaCorta_ = (iso) => (iso ? `${iso.slice(8, 10)} ${mesDe(iso)}` : '');
  const COLS = [
    { f: 'pedido', t: 'Pedido', ver: (x) => esc(x.pedido), editar: 'inputmode="numeric"', ancho: 'c-ped' },
    { f: 'vehiculo', t: 'Vehículo', ver: (x) => esc(x.vehiculo), editar: 'list="dl-rv-modelos"', ancho: 'c-veh' },
    { f: 'nombre', t: 'Nombre del cliente', ver: (x) => esc(x.nombre), editar: 'autocapitalize="words"', ancho: 'c-nom' },
    { f: 'poliza', t: 'P', ver: (x) => (x.poliza === 'si' ? '✓' : x.poliza === 'no' ? 'X' : ''), ancho: 'c-pol' },
    { f: 'cedula', t: 'Cédula', ver: (x) => esc(x.cedula), editar: 'inputmode="numeric"', ancho: 'c-ced' },
    { f: 'telefono', t: 'Celular', ver: (x) => esc(x.telefono), editar: 'type="tel" inputmode="tel"', ancho: 'c-cel' },
    { f: 'precio', t: '$ Venta', ver: (x) => (x.precio ? `$${fmt(x.precio)}` : ''), editar: 'inputmode="numeric" data-dinero', ancho: 'c-pes' },
    { f: 'fechaCompra', t: 'Entrega', ver: (x) => fechaCorta_(x.fechaCompra), editar: 'type="date"', ancho: 'c-fec' },
    { f: 'comision', t: '$ Comi', ver: (x) => (x.comision ? `$${fmt(x.comision)}` : ''), editar: 'inputmode="numeric" data-dinero', ancho: 'c-pes' },
    { f: 'fechaPagoComision', t: 'Pago comi', ver: (x) => fechaCorta_(x.fechaPagoComision), editar: 'type="date"', ancho: 'c-fec' },
  ];
  const valorInput = (x, f) => (f === 'precio' || f === 'comision' ? fmt(x[f]) : x[f]);

  const celda = (x, i, c) => {
    const mala = dudosa(x, c.f) ? 'duda' : '';
    if (modo === 'ver') return `<td class="${c.ancho} ${mala}" data-celda="${i}:${c.f}">${c.ver(x) || '<span class="vacia">—</span>'}</td>`;
    if (c.f === 'poliza') {
      return `<td class="${c.ancho}"><select class="tc-input" data-i="${i}" data-f="poliza" aria-label="Póliza">
        <option value="" ${!x.poliza ? 'selected' : ''}>—</option><option value="si" ${x.poliza === 'si' ? 'selected' : ''}>✓</option><option value="no" ${x.poliza === 'no' ? 'selected' : ''}>X</option></select></td>`;
    }
    return `<td class="${c.ancho}"><input class="tc-input ${mala}" data-i="${i}" data-f="${c.f}" value="${esc(valorInput(x, c.f))}" ${c.editar || ''} aria-label="${esc(c.t)}"></td>`;
  };

  const pintarTabla = (el, foco) => {
    const n = filas.filter((x) => x.elegido).length;
    const malas = filas.reduce((t, x) => t + (x.elegido ? COLS.filter((c) => dudosa(x, c.f)).length : 0), 0);
    el.querySelector('[data-resumen]').innerHTML = `${plural(filas.length, 'venta', 'ventas')} · <b>${n}</b> para guardar${malas ? ` · <span style="color:var(--c-red);font-weight:700">${plural(malas, 'casilla por revisar', 'casillas por revisar')}</span>` : ' · todo se ve bien ✓'}`;
    el.querySelector('[data-modo]').innerHTML = modo === 'ver' ? `${icon('edit', 'i-sm')} Editar tabla` : `${icon('check', 'i-sm')} Ver tabla`;
    el.querySelector('[data-tabla]').className = `tabla-cuaderno ${modo === 'editar' ? 'editando' : ''}`;
    el.querySelector('[data-tabla]').innerHTML = `
      <thead><tr><th class="c-chk" title="Guardar">✓</th><th class="c-mes">Mes</th>${COLS.map((c) => `<th class="${c.ancho}">${c.t}</th>`).join('')}</tr></thead>
      <tbody>
        ${filas.map((x, i) => `
          <tr class="${x.elegido ? '' : 'off'}" ${x.linea ? `title="Leí: ${esc(x.linea)}"` : ''}>
            <td class="c-chk"><input type="checkbox" data-elegir="${i}" ${x.elegido ? 'checked' : ''} aria-label="Guardar esta venta"></td>
            <td class="c-mes">${mesDe(x.fechaCompra)}${x.repetido ? '<span class="ya-esta" title="Ya está en la app">●</span>' : ''}</td>
            ${COLS.map((c) => celda(x, i, c)).join('')}
          </tr>`).join('')}
      </tbody>`;
    const ok = el.querySelector('[data-ok]');
    ok.innerHTML = `${icon('check')} Guardar ${n}`;
    ok.disabled = !n;
    if (foco) {
      const inp = el.querySelector(`[data-i="${foco.i}"][data-f="${foco.f}"]`);
      if (inp) { inp.focus({ preventScroll: false }); inp.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    }
  };

  // Marca roja de una sola casilla al editar (sin redibujar la tabla y perder el foco)
  const actualizarCelda = (el, i, f) => {
    el.querySelector(`[data-i="${i}"][data-f="${f}"]`)?.classList.toggle('duda', dudosa(filas[i], f));
    if (f === 'pedido') {
      filas.forEach((x, k) => el.querySelector(`[data-i="${k}"][data-f="pedido"]`)?.classList.toggle('duda', dudosa(x, 'pedido')));
    }
  };

  abrirHoja({
    titulo: 'Revisa las ventas',
    alta: true,
    ancha: true,
    cuerpo: `
      ${ocr ? `<div class="banner warn">${icon('scan', 'i-lg')}<div><strong>Revisa los números</strong>
        Leí la letra de la foto. Los nombres suelen salir bien, pero <b>los números pueden tener errores</b>.</div></div>` : ''}
      ${ia ? `<div class="banner info">${icon('sparkles', 'i-lg')}<div><strong>Leído con inteligencia artificial</strong>
        Compara la tabla con tu cuaderno. Lo que está en <span style="color:var(--c-red);font-weight:700">rojo</span> no se entendía bien: tócalo para corregirlo.</div></div>` : ''}
      <div class="hstack mt-12" style="flex-wrap:wrap">
        <span class="small muted spacer" data-resumen></span>
        <button class="btn btn-primary btn-sm" type="button" data-modo></button>
      </div>
      <div class="tabla-scroll mt-12"><table data-tabla></table></div>
      <p class="small muted mt-8">Desliza la tabla hacia los lados para ver todas las columnas. Desmarca ✓ las ventas que no quieras guardar.</p>
      <datalist id="dl-rv-modelos">${(store.ajustes().modelos || []).map((m) => `<option value="${esc(m)}">`).join('')}</datalist>`,
    pie: `<button class="btn btn-outline" data-cancel>Cancelar</button><button class="btn btn-primary" data-ok>Guardar</button>`,
    montar: (el) => {
      pintarTabla(el);
      const tabla = el.querySelector('[data-tabla]');

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
        if (t.matches('[data-elegir]')) { filas[Number(t.dataset.elegir)].elegido = t.checked; pintarTabla(el); return; }
        if (t.matches('select[data-f="poliza"]')) { filas[Number(t.dataset.i)].poliza = t.value; }
      });
      tabla.addEventListener('input', (e) => {
        const t = e.target;
        if (!t.matches('input.tc-input')) return;
        const i = Number(t.dataset.i), f = t.dataset.f;
        const x = filas[i];
        if (t.matches('[data-dinero]')) {
          const n = aPesos(t.value);
          t.value = n ? n.toLocaleString('es-CO') : '';
          x[f] = n;
        } else x[f] = t.value.trim();
        x.editados.add(f);
        actualizarCelda(el, i, f);
      });
      // Al salir de una casilla, actualizar el resumen (sin perder lo escrito)
      tabla.addEventListener('focusout', () => {
        const n = filas.filter((x) => x.elegido).length;
        const malas = filas.reduce((t, x) => t + (x.elegido ? COLS.filter((c) => dudosa(x, c.f)).length : 0), 0);
        el.querySelector('[data-resumen]').innerHTML = `${plural(filas.length, 'venta', 'ventas')} · <b>${n}</b> para guardar${malas ? ` · <span style="color:var(--c-red);font-weight:700">${plural(malas, 'casilla por revisar', 'casillas por revisar')}</span>` : ' · todo se ve bien ✓'}`;
      });

      el.querySelector('[data-cancel]').addEventListener('click', () => cerrarHoja());
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const elegidas = filas.filter((x) => x.elegido);
        const sinNombre = elegidas.filter((x) => !x.nombre.trim()).length;
        if (sinNombre) {
          aviso(`${plural(sinNombre, 'venta marcada no tiene', 'ventas marcadas no tienen')} nombre. Escríbelo o desmárcala.`, { icono: 'x', ms: 6000 });
          if (modo !== 'editar') { modo = 'editar'; pintarTabla(el); }
          return;
        }
        const nuevos = elegidas.map((x) => store.nuevoCliente({
          nombre: x.nombre.trim(), telefono: x.telefono, cedula: x.cedula, pedido: x.pedido,
          etapa: 'vendido', vehiculoComprado: x.vehiculo, fechaCompra: x.fechaCompra,
          precio: x.precio || '', comision: x.comision || '', fechaPagoComision: x.fechaPagoComision,
          poliza: x.poliza,
          historial: [{ id: uid('h_'), fecha: new Date().toISOString(), tipo: 'creado', texto: origen }],
        }));
        store.agregarClientes(nuevos);
        cerrarHoja();
        const sinCel = nuevos.filter((c) => !celularOK(c.telefono)).length;
        aviso(`${plural(nuevos.length, 'venta guardada', 'ventas guardadas')}${sinCel ? ` · ${sinCel} sin celular válido (corrígelo en su ficha)` : ''}`, { ms: 6000 });
      });
    },
  });
}

// --- Plantilla de Excel con las columnas del cuaderno -----------------------------------
export const COLUMNAS_CUADERNO = [
  'Pedido', 'Vehículo', 'Nombre del cliente', 'Póliza (✓ o X)', 'Cédula', 'Celular',
  'Valor venta', 'Fecha de entrega', 'Comisión', 'Fecha pago comisión',
];

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
