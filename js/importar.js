// =============================================================================
// importar.js — Entrada y salida de datos:
//   • Copia de seguridad (guardar / restaurar archivo .json)
//   • Importar clientes desde Excel o CSV
//   • Importar contactos (.vcf, por ejemplo exportados de iCloud o Google)
//   • Exportar clientes a Excel
//   • Clientes de ejemplo para probar la app
// La librería de Excel (SheetJS) se descarga solo cuando hace falta.
// =============================================================================

import * as store from './store.js';
import { abrirHoja, cerrarHoja, aviso, confirmar, icon, avatar } from './ui.js';
import {
  esc, norm, hoy, sumarDias, sumarMeses, plural, uid, telefonoInternacional, telefonoBonito,
  compartirODescargar, descargarArchivo, elegirArchivo, leerArchivo, cargarScript,
} from './util.js';

const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const cargarXLSX = () => cargarScript(XLSX_URL, 'XLSX');

// --- Copia de seguridad --------------------------------------------------------
export async function guardarRespaldo() {
  const nombre = `mis-clientes-respaldo-${hoy()}.json`;
  const r = await compartirODescargar(nombre, store.exportarTodo(), 'application/json');
  if (r === 'cancelado') return;
  store.marcarRespaldo();
  aviso(r === 'compartido' ? 'Copia lista. Guárdala en un lugar seguro.' : 'Copia descargada', { ms: 5000 });
}

export async function restaurarRespaldo() {
  const file = await elegirArchivo('.json,application/json');
  if (!file) return;
  let datos;
  try {
    datos = JSON.parse(await leerArchivo(file));
    if (!Array.isArray(datos.clientes)) throw new Error();
  } catch {
    aviso('Ese archivo no es una copia de seguridad válida', { icono: 'x', ms: 5000 });
    return;
  }
  const ok = await confirmar({
    titulo: '¿Restaurar esta copia?',
    texto: `La copia tiene <b>${plural(datos.clientes.length, 'cliente', 'clientes')}</b>${datos.exportado ? ` y es del ${esc(new Date(datos.exportado).toLocaleDateString('es'))}` : ''}.
      Va a <b>reemplazar</b> lo que tienes ahora (${plural(store.clientes().length, 'cliente', 'clientes')}).`,
    si: 'Restaurar',
  });
  if (!ok) return;
  try {
    store.reemplazarTodo(datos);
    aviso('Copia restaurada');
  } catch (e) {
    aviso(e.message || 'No se pudo restaurar', { icono: 'x', ms: 6000 });
  }
}

// --- Lectura de columnas -------------------------------------------------------
const SINONIMOS = {
  nombre: ['nombre completo', 'nombres', 'nombre', 'cliente', 'full name', 'name', 'razon social'],
  apellido: ['apellidos', 'apellido', 'last name', 'surname'],
  telefono: ['celular', 'telefono', 'movil', 'whatsapp', 'tel', 'phone', 'numero', 'cel', 'contacto'],
  email: ['correo electronico', 'correo', 'email', 'e-mail', 'mail'],
  cumple: ['cumpleanos', 'cumple', 'fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'birthday'],
  vehiculoComprado: ['vehiculo comprado', 'modelo comprado', 'compro'],
  fechaCompra: ['fecha de compra', 'fecha compra', 'fecha de venta', 'fecha venta', 'fecha entrega'],
  vehiculoInteres: ['vehiculo de interes', 'vehiculo', 'modelo', 'carro', 'interes', 'auto', 'referencia', 'version'],
  etapa: ['etapa', 'estado', 'status'],
  origen: ['origen', 'fuente', 'canal', 'medio'],
  proximoSeguimiento: ['proximo seguimiento', 'seguimiento', 'proximo contacto'],
  notas: ['observaciones', 'observacion', 'comentarios', 'notas', 'nota'],
};
export const ETIQUETAS = {
  nombre: 'Nombre', apellido: 'Apellido', telefono: 'Celular', email: 'Correo', cumple: 'Cumpleaños',
  vehiculoInteres: 'Vehículo de interés', vehiculoComprado: 'Vehículo comprado', fechaCompra: 'Fecha de compra',
  etapa: 'Etapa', origen: 'Origen', proximoSeguimiento: 'Seguimiento', notas: 'Notas',
};

function mapearColumnas(encabezados) {
  const mapa = {};
  const usados = new Set();
  const hs = encabezados.map((h) => norm(h));
  // Primero coincidencias exactas, luego parciales
  for (const modo of ['exacta', 'parcial']) {
    for (const [campo, sins] of Object.entries(SINONIMOS)) {
      if (mapa[campo] !== undefined) continue;
      for (const s of sins) {
        const i = hs.findIndex((h, k) => !usados.has(k) && h && (modo === 'exacta' ? h === s : h.includes(s)));
        if (i >= 0) { mapa[campo] = i; usados.add(i); break; }
      }
    }
  }
  return mapa;
}

const pad = (n) => String(n).padStart(2, '0');
/** Convierte fechas de Excel/texto a 'AAAA-MM-DD' ('' si no se entiende). */
export function aFechaISO(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 59 && v < 80000) { // número de serie de Excel
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/); // día/mes/año (formato latino)
  if (m) {
    const y = m[3].length === 2 ? (Number(m[3]) > 30 ? '19' : '20') + m[3] : m[3];
    return `${y}-${pad(m[2])}-${pad(m[1])}`;
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}
/** Cumpleaños a 'MM-DD'. Acepta fecha completa o solo día/mes. */
export function aCumple(v) {
  const iso = aFechaISO(v);
  if (iso) return iso.slice(5);
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^--(\d{2})-?(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}`;
  return '';
}
function aEtapa(v) {
  const s = norm(v);
  if (!s) return 'nuevo';
  if (s.includes('vend') || s.includes('compr') && !s.includes('no')) return 'vendido';
  if (s.includes('cotiz')) return 'cotizado';
  if (s.includes('negoc')) return 'negociando';
  if (s.includes('perd') || s.includes('no compr') || s.includes('descart')) return 'perdido';
  return 'nuevo';
}

/** Filas (arrays) → clientes. La primera fila son los encabezados. */
export function filasAClientes(filas, origen = 'Importado') {
  const limpias = filas.filter((f) => Array.isArray(f) && f.some((x) => String(x ?? '').trim() !== ''));
  if (limpias.length < 2) return { clientes: [], mapa: {}, encabezados: [] };
  const encabezados = limpias[0].map((x) => String(x ?? '').trim());
  const mapa = mapearColumnas(encabezados);
  const val = (f, campo) => (mapa[campo] === undefined ? '' : f[mapa[campo]]);
  const txt = (f, campo) => String(val(f, campo) ?? '').trim();

  const clientes = limpias.slice(1).map((f) => {
    const nombre = [txt(f, 'nombre'), txt(f, 'apellido')].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const etapa = aEtapa(txt(f, 'etapa'));
    const fechaCompra = aFechaISO(val(f, 'fechaCompra'));
    return store.nuevoCliente({
      nombre,
      telefono: txt(f, 'telefono').replace(/\.0$/, ''),
      email: txt(f, 'email'),
      cumple: aCumple(val(f, 'cumple')),
      vehiculoInteres: txt(f, 'vehiculoInteres'),
      vehiculoComprado: txt(f, 'vehiculoComprado'),
      fechaCompra,
      etapa: fechaCompra && etapa === 'nuevo' ? 'vendido' : etapa,
      origen: txt(f, 'origen'),
      proximoSeguimiento: aFechaISO(val(f, 'proximoSeguimiento')),
      notas: txt(f, 'notas'),
      historial: [{ id: uid('h_'), fecha: new Date().toISOString(), tipo: 'creado', texto: origen }],
    });
  });
  return { clientes, mapa, encabezados };
}

/** Lector de CSV sencillo (por si no hay internet para la librería de Excel). */
function parsearCSV(texto) {
  const primera = texto.split(/\r?\n/)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += ch;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// --- Importar Excel / CSV -----------------------------------------------------
export async function importarExcel() {
  const file = await elegirArchivo('.xlsx,.xls,.csv,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel');
  if (!file) return;
  let filas;
  try {
    if (/\.csv$/i.test(file.name)) {
      filas = parsearCSV((await leerArchivo(file)).replace(/^﻿/, ''));
    } else {
      aviso('Leyendo el archivo…', { icono: 'clock' });
      const XLSX = await cargarXLSX();
      const wb = XLSX.read(await leerArchivo(file, 'buffer'), { type: 'array', cellDates: true });
      const hoja = wb.Sheets[wb.SheetNames[0]];
      filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: '' });
    }
  } catch (e) {
    aviso(e.message === 'Sin conexión'
      ? 'Necesitas internet para leer archivos de Excel. También puedes guardarlo como CSV.'
      : 'No se pudo leer el archivo', { icono: 'x', ms: 6000 });
    return;
  }
  const { clientes, mapa, encabezados } = filasAClientes(filas);
  if (mapa.nombre === undefined || mapa.telefono === undefined) {
    abrirHoja({
      titulo: 'No encontré las columnas',
      cuerpo: `<p>Para importar, la primera fila del Excel debe tener los títulos de las columnas. Como mínimo una columna <b>Nombre</b> y otra <b>Celular</b> (o Teléfono).</p>
        <p class="muted small mt-12">Columnas encontradas: ${encabezados.map(esc).join(', ') || 'ninguna'}</p>
        <p class="muted small mt-12">También reconozco: Correo, Cumpleaños, Vehículo, Etapa, Origen, Fecha de compra y Notas.</p>`,
      pie: `<button class="btn btn-primary" data-ok>Entendido</button>`,
      montar: (el) => el.querySelector('[data-ok]').addEventListener('click', () => cerrarHoja()),
    });
    return;
  }
  vistaPreviaImportacion(clientes, Object.keys(mapa).map((k) => `${ETIQUETAS[k]} ← "${encabezados[mapa[k]]}"`));
}

export function separarDuplicados(lista) {
  const cp = store.ajustes().codigoPais;
  const existentes = new Set(store.clientes().map((c) => telefonoInternacional(c.telefono, cp)));
  const nuevos = [], repetidos = [], invalidos = [];
  for (const c of lista) {
    const n = telefonoInternacional(c.telefono, cp);
    if (!c.nombre || n.length < 7) { invalidos.push(c); continue; }
    if (existentes.has(n)) { repetidos.push(c); continue; }
    existentes.add(n);
    nuevos.push(c);
  }
  return { nuevos, repetidos, invalidos };
}

export function vistaPreviaImportacion(lista, columnas) {
  const { nuevos, repetidos, invalidos } = separarDuplicados(lista);
  abrirHoja({
    titulo: 'Importar clientes',
    alta: true,
    cuerpo: `
      <div class="stats" style="margin-top:0;grid-template-columns:repeat(3,1fr)">
        <div class="stat" data-color="green"><span class="stat-label">${icon('check')} Nuevos</span><span class="stat-value">${nuevos.length}</span></div>
        <div class="stat" data-color="amber"><span class="stat-label">${icon('users')} Ya existen</span><span class="stat-value">${repetidos.length}</span></div>
        <div class="stat" data-color="gray"><span class="stat-label">${icon('x')} Incompletos</span><span class="stat-value">${invalidos.length}</span></div>
      </div>
      <p class="small muted mt-16">Columnas reconocidas:</p>
      <div class="chips chips-wrap mt-8">${columnas.map((c) => `<span class="chip" style="height:28px;font-size:12px">${esc(c)}</span>`).join('')}</div>
      ${nuevos.length ? `
      <h3 class="mt-24" style="font-size:15px">Así se van a ver</h3>
      <div class="grouped mt-8">
        ${nuevos.slice(0, 8).map((c) => `
          <div class="g-row">${avatar(c.nombre)}<div class="li-body"><div class="li-title">${esc(c.nombre)}</div>
          <div class="li-sub">${esc(telefonoBonito(c.telefono))}${c.vehiculoInteres ? ` · ${esc(c.vehiculoInteres)}` : ''}${c.cumple ? ` · 🎂 ${esc(c.cumple.split('-').reverse().join('/'))}` : ''}</div></div></div>`).join('')}
        ${nuevos.length > 8 ? `<div class="g-row small muted">…y ${nuevos.length - 8} más</div>` : ''}
      </div>` : ''}
      ${repetidos.length ? `<p class="small muted mt-12">Los que ya existen (mismo celular) no se importan, para no duplicarlos.</p>` : ''}`,
    pie: `<button class="btn btn-outline" data-cancel>Cancelar</button>
      <button class="btn btn-primary" data-ok ${nuevos.length ? '' : 'disabled'}>${icon('upload')} Importar ${nuevos.length}</button>`,
    montar: (el) => {
      el.querySelector('[data-cancel]').addEventListener('click', () => cerrarHoja());
      el.querySelector('[data-ok]').addEventListener('click', () => {
        store.agregarClientes(nuevos);
        cerrarHoja();
        aviso(`${plural(nuevos.length, 'cliente importado', 'clientes importados')}`);
      });
    },
  });
}

// --- Importar contactos (.vcf) ------------------------------------------------
function parsearVCF(texto) {
  const lineas = texto.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out = [];
  let actual = null;
  const valor = (l) => l.slice(l.indexOf(':') + 1).trim().replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, ' ');
  for (const l of lineas) {
    const u = l.toUpperCase();
    if (u.startsWith('BEGIN:VCARD')) actual = { tels: [] };
    else if (u.startsWith('END:VCARD')) { if (actual) out.push(actual); actual = null; }
    else if (!actual) continue;
    else if (u.startsWith('FN')) actual.fn = valor(l);
    else if (u.startsWith('N:') || u.startsWith('N;')) {
      const [ap, no] = valor(l).split(';');
      actual.n = [no, ap].filter(Boolean).join(' ');
    } else if (u.startsWith('TEL') || /^ITEM\d+\.TEL/.test(u)) actual.tels.push({ num: valor(l), cel: /CELL|IPHONE|MOBILE/.test(u) });
    else if (u.startsWith('EMAIL') || /^ITEM\d+\.EMAIL/.test(u)) actual.email ??= valor(l);
    else if (u.startsWith('BDAY')) actual.bday = valor(l);
    else if (u.startsWith('NOTE')) actual.nota = valor(l);
  }
  return out
    .map((v) => {
      const tel = (v.tels.find((t) => t.cel) || v.tels[0])?.num || '';
      return store.nuevoCliente({
        nombre: (v.fn || v.n || '').trim(),
        telefono: tel,
        email: v.email || '',
        cumple: v.bday ? aCumple(v.bday.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')) : '',
        notas: v.nota || '',
        historial: [{ id: uid('h_'), fecha: new Date().toISOString(), tipo: 'creado', texto: 'Importado de contactos' }],
      });
    })
    .filter((c) => c.nombre && c.telefono);
}

export async function importarContactos() {
  const file = await elegirArchivo('.vcf,text/vcard,text/x-vcard');
  if (!file) return;
  let lista;
  try { lista = parsearVCF(await leerArchivo(file)); } catch { lista = []; }
  const { nuevos } = separarDuplicados(lista);
  if (!nuevos.length) {
    aviso(lista.length ? 'Todos esos contactos ya están en tu lista' : 'No encontré contactos con nombre y teléfono', { icono: 'x', ms: 5000 });
    return;
  }
  const elegidos = new Set();
  let q = '';
  abrirHoja({
    titulo: 'Elegir contactos',
    alta: true,
    cuerpo: `
      <p class="small muted">Encontré ${plural(nuevos.length, 'contacto', 'contactos')}. Marca los que son clientes.</p>
      <div class="tools-row mt-12">
        <label class="search" style="flex:1">${icon('search')}<input class="input" type="search" placeholder="Buscar…" data-q></label>
        <button class="btn btn-outline btn-sm" data-todos>Todos</button>
      </div>
      <div class="pick-list mt-12" data-pick style="max-height:none"></div>`,
    pie: `<button class="btn btn-outline" data-cancel>Cancelar</button><button class="btn btn-primary" data-ok disabled>Importar 0</button>`,
    montar: (el) => {
      const ok = el.querySelector('[data-ok]');
      const contar = () => { ok.textContent = `Importar ${elegidos.size}`; ok.disabled = !elegidos.size; };
      const pintar = () => {
        const nq = norm(q);
        const vis = nuevos.filter((c) => !nq || norm(c.nombre).includes(nq));
        el.querySelector('[data-pick]').innerHTML = vis.slice(0, 500).map((c) => `
          <label class="pick-row"><input type="checkbox" value="${c.id}" ${elegidos.has(c.id) ? 'checked' : ''}>
          ${avatar(c.nombre)}<div class="li-body"><div class="li-title">${esc(c.nombre)}</div><div class="li-sub">${esc(telefonoBonito(c.telefono))}</div></div></label>`).join('');
        el.querySelectorAll('[data-pick] input').forEach((cb) => cb.addEventListener('change', () => {
          cb.checked ? elegidos.add(cb.value) : elegidos.delete(cb.value); contar();
        }));
      };
      pintar();
      el.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; pintar(); });
      el.querySelector('[data-todos]').addEventListener('click', () => {
        const nq = norm(q);
        const vis = nuevos.filter((c) => !nq || norm(c.nombre).includes(nq));
        const todos = vis.every((c) => elegidos.has(c.id));
        vis.forEach((c) => (todos ? elegidos.delete(c.id) : elegidos.add(c.id)));
        pintar(); contar();
      });
      el.querySelector('[data-cancel]').addEventListener('click', () => cerrarHoja());
      ok.addEventListener('click', () => {
        store.agregarClientes(nuevos.filter((c) => elegidos.has(c.id)));
        cerrarHoja();
        aviso(`${plural(elegidos.size, 'cliente importado', 'clientes importados')}`);
      });
    },
  });
}

// --- Exportar a Excel ---------------------------------------------------------
export async function exportarExcel() {
  const etapas = { nuevo: 'Nuevo', cotizado: 'Cotizado', negociando: 'Negociando', vendido: 'Vendido', perdido: 'No compró' };
  const filas = store.clientes().map((c) => ({
    Nombre: c.nombre,
    Celular: c.telefono,
    Correo: c.email,
    Cumpleaños: c.cumple ? c.cumple.split('-').reverse().join('/') : '',
    Etapa: etapas[c.etapa] || c.etapa,
    'Vehículo de interés': c.vehiculoInteres,
    'Vehículo comprado': c.vehiculoComprado,
    'Fecha de compra': c.fechaCompra,
    Origen: c.origen,
    'Próximo seguimiento': c.proximoSeguimiento,
    Notas: c.notas,
    'Registrado': (c.creado || '').slice(0, 10),
  }));
  if (!filas.length) { aviso('No hay clientes para exportar', { icono: 'x' }); return; }
  const nombre = `mis-clientes-${hoy()}`;
  try {
    const XLSX = await cargarXLSX();
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = Object.keys(filas[0]).map((k) => ({ wch: Math.max(12, k.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    await compartirODescargar(`${nombre}.xlsx`, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch {
    // Sin internet: CSV que Excel abre bien (separado por ; y con BOM)
    const cols = Object.keys(filas[0]);
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = '﻿' + [cols.map(q).join(';'), ...filas.map((f) => cols.map((k) => q(f[k])).join(';'))].join('\r\n');
    descargarArchivo(`${nombre}.csv`, csv, 'text/csv;charset=utf-8');
  }
}

// --- Clientes de ejemplo ------------------------------------------------------
// Usan números falsos (000…) para que nunca se le escriba a una persona real.
export function cargarEjemplo() {
  const h = hoy();
  const mmdd = (f) => f.slice(5);
  const datos = [
    { nombre: 'Laura Restrepo', vehiculoInteres: 'Kicks', etapa: 'cotizado', cumple: mmdd(h), proximoSeguimiento: h, origen: 'Vitrina', notas: 'Le gustó el color gris. Va a pagar con crédito.' },
    { nombre: 'Andrés Felipe Ruiz', vehiculoInteres: 'Frontier', etapa: 'negociando', proximoSeguimiento: sumarDias(h, -2), origen: 'Referido', notas: 'Tiene retoma: Hilux 2017.' },
    { nombre: 'Carolina Mejía', vehiculoComprado: 'X-Trail', etapa: 'vendido', fechaCompra: sumarMeses(h, -12), origen: 'Redes sociales' },
    { nombre: 'Jorge Iván Pardo', vehiculoComprado: 'Versa', etapa: 'vendido', fechaCompra: sumarMeses(h, -6), cumple: mmdd(sumarDias(h, 3)) },
    { nombre: 'Natalia Gómez', vehiculoInteres: 'Sentra', etapa: 'nuevo', proximoSeguimiento: sumarDias(h, 1), origen: 'WhatsApp' },
    { nombre: 'Santiago Cárdenas', vehiculoInteres: 'Kicks Play', etapa: 'nuevo', proximoSeguimiento: sumarDias(h, 4), cumple: mmdd(sumarDias(h, 9)) },
    { nombre: 'Paola Andrea Vélez', vehiculoInteres: 'Qashqai', etapa: 'cotizado', origen: 'Evento', notas: 'Pidió cotización y no volvió a escribir.' },
    { nombre: 'Ricardo Salazar', vehiculoInteres: 'Pathfinder', etapa: 'perdido', notas: 'Compró en otra marca por precio.' },
    { nombre: 'Diana Marcela Ortiz', vehiculoComprado: 'Kicks', etapa: 'vendido', fechaCompra: sumarDias(h, -20), cumple: mmdd(sumarDias(h, 1)), origen: 'Referido' },
  ];
  const lista = datos.map((d, i) => store.nuevoCliente({
    ...d, telefono: `000 000 ${String(1000 + i)}`, ejemplo: true,
    creado: new Date(Date.now() - i * 86400000 * 3).toISOString(),
    historial: [{ id: uid('h_'), fecha: new Date().toISOString(), tipo: 'creado', texto: 'Cliente de ejemplo' }],
  }));
  store.agregarClientes(lista);
}

export const hayEjemplos = () => store.clientes().some((c) => c.ejemplo);

export async function borrarEjemplo() {
  const ok = await confirmar({ titulo: '¿Borrar los clientes de ejemplo?', texto: 'Tus clientes reales no se tocan.', si: 'Borrar ejemplos', peligro: true });
  if (!ok) return;
  store.eliminarClientesDonde((c) => c.ejemplo);
  aviso('Ejemplos borrados');
}
