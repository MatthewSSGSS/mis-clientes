// =============================================================================
// views/clientes.js — Lista de clientes, organizada para encontrarlos rápido:
//   • etapa (Vendidos, Nuevo, …) y búsqueda,
//   • año y mes (vendidos: por fecha de entrega; los demás: por fecha de registro),
//   • filtros (póliza, vehículo, comisión, cómo llegó, datos incompletos),
//   • orden (fecha, nombre, valor, pedido, seguimiento).
// Agrupa por mes con totales. En computador, los vendidos se ven como tabla con
// las columnas del formato de la persona (formato.js).
// Ruta: #/clientes  o  #/clientes/<etapa>
// =============================================================================

import * as store from '../store.js';
import { ETAPAS } from '../config.js';
import { abrirFormularioCliente } from '../cliente-form.js';
import { menuImportar } from '../documentos.js';
import { vehiculoBonito } from '../cuaderno.js';
import { formato, valorDe, textoValor } from '../formato.js';
import { icon, avatar, pillEtapa, vacio, botonTema, botonInicio, abrirHoja, cerrarHoja } from '../ui.js';
import { esc, norm, relativo, hoy, plural, telefonoBonito, debounce, nombreMes, fechaCorta } from '../util.js';
import { dinero, dineroCorto } from '../engine.js';

const POR_PAGINA = 80;

// Se conservan mientras la app esté abierta (al volver de una ficha sigue igual)
let busqueda = '';
let orden = 'reciente';
let limite = POR_PAGINA;
let anio = 'todos';
let mes = 'todos';
let filtros = { poliza: '', vehiculo: '', comision: '', origen: '', incompletos: false };

// --- Datos de cada cliente para organizar ------------------------------------------
/** Fecha con que se organiza: entrega si ya compró; si no, cuándo se registró. */
const fechaDe = (c) => (c.etapa === 'vendido' ? c.fechaCompra || '' : (c.creado || '').slice(0, 10));
/** "New Versa Advance" → "Versa"; "Kicks Play" → "Kicks" */
function familia(c) {
  const p = String(c.vehiculoComprado || c.vehiculoInteres || '').trim().split(/\s+/).filter((w) => w && !/^new$/i.test(w));
  return p[0] ? vehiculoBonito(p[0]) : '';
}
function estadoComision(c) {
  if (!c.comision && !c.fechaPagoComision) return '';
  return c.fechaPagoComision && c.fechaPagoComision <= hoy() ? 'pagada' : 'pendiente';
}
const sinCelular = (c) => String(c.telefono || '').replace(/\D/g, '').length < 7;
const incompleto = (c) => sinCelular(c) || (c.etapa === 'vendido' && !c.fechaCompra);
const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const MES_CORTO = (m) => mayus(nombreMes(Number(m)).slice(0, 3));

const ORDENES = [
  { id: 'reciente', nombre: 'Más recientes' },
  { id: 'antiguo', nombre: 'Más antiguos' },
  { id: 'nombre', nombre: 'Nombre A–Z' },
  { id: 'valor', nombre: 'Mayor valor', si: (l) => l.some((c) => Number(c.precio)) },
  { id: 'pedido', nombre: 'Número de pedido', si: (l) => l.some((c) => c.pedido) },
  { id: 'seguimiento', nombre: 'Próximo seguimiento', si: (l, etapa) => etapa !== 'vendido' },
];

const FILTROS = {
  poliza: { nombre: 'Póliza', opciones: [['si', 'La tomó ✓'], ['no', 'No la tomó ✗'], ['sin', 'Sin dato']], de: (c) => c.poliza || 'sin', hay: (l) => l.some((c) => c.poliza) },
  comision: { nombre: 'Comisión', opciones: [['pendiente', 'Pendiente'], ['pagada', 'Ya pagada']], de: estadoComision, hay: (l) => l.some((c) => estadoComision(c)) },
  vehiculo: { nombre: 'Vehículo', de: familia, hay: (l) => l.some((c) => familia(c)) },
  origen: { nombre: '¿Cómo llegó?', de: (c) => c.origen, hay: (l) => l.some((c) => c.origen) },
};
const nFiltros = () => Object.entries(filtros).filter(([, v]) => v).length;

/** Aplica etapa, búsqueda y filtros (sin año ni mes). */
function base(etapa) {
  const q = norm(busqueda);
  const qDig = busqueda.replace(/\D/g, '');
  let lista = store.clientes();
  if (etapa !== 'todos') lista = lista.filter((c) => c.etapa === etapa);
  if (q) {
    lista = lista.filter((c) =>
      norm(c.nombre).includes(q) ||
      norm(c.vehiculoInteres).includes(q) || norm(c.vehiculoComprado).includes(q) ||
      norm(c.email).includes(q) || norm(c.notas).includes(q) ||
      Object.values(c.extras || {}).some((v) => norm(v).includes(q)) ||
      (qDig.length >= 3 && [c.telefono, c.cedula, c.pedido].some((x) => String(x || '').replace(/\D/g, '').includes(qDig))));
  }
  for (const [k, f] of Object.entries(FILTROS)) {
    if (filtros[k]) lista = lista.filter((c) => f.de(c) === filtros[k]);
  }
  if (filtros.incompletos) lista = lista.filter(incompleto);
  return lista;
}

function ordenar(lista) {
  const copia = [...lista];
  const porFecha = (a, b) => fechaDe(b).localeCompare(fechaDe(a)) || String(b.pedido || '').localeCompare(String(a.pedido || ''), 'es', { numeric: true });
  if (orden === 'nombre') copia.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  else if (orden === 'valor') copia.sort((a, b) => (Number(b.precio) || 0) - (Number(a.precio) || 0));
  else if (orden === 'pedido') copia.sort((a, b) => String(a.pedido || '~').localeCompare(String(b.pedido || '~'), 'es', { numeric: true }));
  else if (orden === 'seguimiento') copia.sort((a, b) => (a.proximoSeguimiento || '9999').localeCompare(b.proximoSeguimiento || '9999'));
  else if (orden === 'antiguo') copia.sort((a, b) => -porFecha(a, b));
  else copia.sort(porFecha);
  return copia;
}

const contar = (l, fn) => l.reduce((m, c) => { const k = fn(c); if (k) m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
const suma = (l, campo) => l.reduce((t, c) => t + (Number(c[campo]) || 0), 0);

// --- Vista -------------------------------------------------------------------------------
export function render(root, { params }) {
  const etapa = ETAPAS.some((e) => e.id === params[0]) ? params[0] : 'todos';
  const todos = store.clientes();

  root.innerHTML = `
    <div class="page ${etapa === 'vendido' ? 'page-wide' : ''}">
      <div class="page-head">
        <div>
          <h1>Clientes</h1>
          <p>${plural(todos.length, 'cliente', 'clientes')}</p>
        </div>
        <div class="hstack">${botonInicio()}${botonTema()}<button class="btn btn-ghost btn-icon" data-importar aria-label="Importar clientes">${icon('upload')}</button><button class="btn btn-primary" data-nuevo>${icon('plus')} ${etapa === 'vendido' ? 'Venta' : 'Nuevo'}</button></div>
      </div>

      <div class="sticky-tools">
        <div class="tools-row">
          <label class="search">
            ${icon('search')}
            <span class="sr-only">Buscar</span>
            <input class="input" type="search" placeholder="Buscar nombre, celular, cédula, pedido…" value="${esc(busqueda)}" data-buscar enterkeyhint="search">
          </label>
        </div>
        <div class="chips" role="group" aria-label="Filtrar por etapa">
          <a class="chip" href="#/clientes" aria-pressed="${etapa === 'todos'}">Todos <span class="count">${todos.length}</span></a>
          ${[...ETAPAS.filter((e) => e.id === 'vendido'), ...ETAPAS.filter((e) => e.id !== 'vendido')].map((e) => {
            const n = todos.filter((c) => c.etapa === e.id).length;
            return `<a class="chip" href="#/clientes/${e.id}" aria-pressed="${etapa === e.id}">${esc(e.id === 'vendido' ? 'Vendidos' : e.nombre)} <span class="count">${n}</span></a>`;
          }).join('')}
        </div>
      </div>

      <div data-organizar></div>
      <div data-lista class="mt-8"></div>
    </div>`;

  const lista = root.querySelector('[data-lista]');
  const org = root.querySelector('[data-organizar]');
  const pintar = () => { pintarOrganizar(org, etapa, pintar); pintarLista(lista, etapa, pintar); };
  pintar();

  root.querySelector('[data-nuevo]').addEventListener('click', () => abrirFormularioCliente(null, { venta: etapa === 'vendido' }));
  root.querySelector('[data-importar]').addEventListener('click', () => menuImportar());
  root.querySelector('[data-buscar]').addEventListener('input', debounce((e) => {
    busqueda = e.target.value; limite = POR_PAGINA; pintar();
  }, 120));
}

/** Año, mes, filtros y orden. */
function pintarOrganizar(el, etapa, pintar) {
  const l = base(etapa);
  if (!store.clientes().length) { el.innerHTML = ''; return; }
  const anios = [...contar(l, (c) => fechaDe(c).slice(0, 4)).entries()].sort((a, b) => b[0].localeCompare(a[0]));
  if (anio !== 'todos' && !anios.some(([a]) => a === anio)) { anio = 'todos'; mes = 'todos'; }
  const delAnio = anio === 'todos' ? [] : l.filter((c) => fechaDe(c).startsWith(anio));
  const meses = [...contar(delAnio, (c) => fechaDe(c).slice(5, 7)).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (mes !== 'todos' && !meses.some(([m]) => m === mes)) mes = 'todos';
  const ordenes = ORDENES.filter((o) => !o.si || o.si(l, etapa));
  if (!ordenes.some((o) => o.id === orden)) orden = 'reciente';
  const activos = Object.entries(filtros).filter(([, v]) => v);
  const etiquetaFiltro = (k, v) => (k === 'incompletos' ? 'Datos incompletos'
    : `${FILTROS[k].nombre}: ${(FILTROS[k].opciones?.find(([id]) => id === v)?.[1]) || v}`);

  el.innerHTML = `
    ${anios.length ? `
    <div class="chips mt-8" role="group" aria-label="Año">
      <button class="chip chip-sm" data-anio="todos" aria-pressed="${anio === 'todos'}">Todos los años</button>
      ${anios.map(([a, n]) => `<button class="chip chip-sm" data-anio="${a}" aria-pressed="${anio === a}">${a} <span class="count">${n}</span></button>`).join('')}
    </div>` : ''}
    ${anio !== 'todos' && meses.length ? `
    <div class="chips mt-8" role="group" aria-label="Mes">
      <button class="chip chip-sm" data-mes="todos" aria-pressed="${mes === 'todos'}">Todo ${anio}</button>
      ${meses.map(([m, n]) => `<button class="chip chip-sm" data-mes="${m}" aria-pressed="${mes === m}">${MES_CORTO(m)} <span class="count">${n}</span></button>`).join('')}
    </div>` : ''}
    <div class="org-barra mt-8">
      <button class="btn btn-outline btn-sm" data-filtrar>${icon('sliders', 'i-sm')} Filtrar${nFiltros() ? ` <span class="org-n">${nFiltros()}</span>` : ''}</button>
      <label class="org-orden">
        <span class="sr-only">Ordenar</span>
        ${icon('repeat', 'i-sm')}
        <select class="select" data-orden aria-label="Ordenar">
          ${ordenes.map((o) => `<option value="${o.id}" ${orden === o.id ? 'selected' : ''}>${o.nombre}</option>`).join('')}
        </select>
      </label>
    </div>
    ${activos.length ? `<div class="chips chips-wrap mt-8">${activos.map(([k, v]) => `<button class="chip chip-sm on" data-quitar="${k}">${esc(etiquetaFiltro(k, v))} ${icon('x', 'i-sm')}</button>`).join('')}</div>` : ''}
    ${etapa === 'todos' && orden.match(/reciente|antiguo/) ? '<p class="small muted mt-8">Los vendidos van por fecha de entrega; los demás, por la fecha en que los registraste.</p>' : ''}`;

  el.querySelectorAll('[data-anio]').forEach((b) => b.addEventListener('click', () => { anio = b.dataset.anio; mes = 'todos'; limite = POR_PAGINA; pintar(); }));
  el.querySelectorAll('[data-mes]').forEach((b) => b.addEventListener('click', () => { mes = b.dataset.mes; limite = POR_PAGINA; pintar(); }));
  el.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => {
    filtros = { ...filtros, [b.dataset.quitar]: b.dataset.quitar === 'incompletos' ? false : '' }; pintar();
  }));
  el.querySelector('[data-orden]').addEventListener('change', (e) => { orden = e.target.value; limite = POR_PAGINA; pintar(); });
  el.querySelector('[data-filtrar]').addEventListener('click', () => abrirFiltros(etapa, pintar));
}

/** Ventana de filtros: se aplican al tocarlos. */
function abrirFiltros(etapa, pintar) {
  const pintarCuerpo = (el) => {
    // Cada filtro cuenta con los demás aplicados (menos él mismo)
    const sin = (k) => { const g = filtros[k]; filtros[k] = k === 'incompletos' ? false : ''; const l = base(etapa); filtros[k] = g; return l; };
    const secciones = Object.entries(FILTROS).map(([k, f]) => {
      const l = sin(k);
      if (!f.hay(store.clientes().filter((c) => etapa === 'todos' || c.etapa === etapa)) && !filtros[k]) return '';
      const conteo = contar(l, f.de);
      const opciones = f.opciones || [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => [v, v]);
      return `
        <div class="field">
          <span class="label">${esc(f.nombre)}</span>
          <div class="chips chips-wrap">
            <button class="chip chip-sm" data-f="${k}" data-v="" aria-pressed="${!filtros[k]}">Todos</button>
            ${opciones.map(([v, t]) => `<button class="chip chip-sm" data-f="${k}" data-v="${esc(v)}" aria-pressed="${filtros[k] === v}">${esc(t)} <span class="count">${conteo.get(v) || 0}</span></button>`).join('')}
          </div>
        </div>`;
    }).join('');
    const nInc = sin('incompletos').filter(incompleto).length;
    el.querySelector('[data-secciones]').innerHTML = `${secciones}
      <div class="field">
        <label class="hstack" style="cursor:pointer">
          <span class="switch"><input type="checkbox" data-incompletos ${filtros.incompletos ? 'checked' : ''}><span></span></span>
          <span><b>Solo con datos incompletos</b> <span class="muted small">(${nInc}) sin celular o sin fecha de entrega</span></span>
        </label>
      </div>`;
    const n = base(etapa).length;
    el.querySelector('[data-ver]').textContent = `Ver ${plural(n, 'cliente', 'clientes')}`;
    el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
      filtros = { ...filtros, [b.dataset.f]: b.dataset.v };
      limite = POR_PAGINA; pintar(); pintarCuerpo(el);
    }));
    el.querySelector('[data-incompletos]').addEventListener('change', (e) => {
      filtros = { ...filtros, incompletos: e.target.checked };
      limite = POR_PAGINA; pintar(); pintarCuerpo(el);
    });
  };
  abrirHoja({
    titulo: 'Filtrar clientes',
    cuerpo: '<div data-secciones></div>',
    pie: `<button class="btn btn-outline" data-limpiar>Quitar filtros</button><button class="btn btn-primary" data-ver>Ver</button>`,
    montar: (el) => {
      pintarCuerpo(el);
      el.querySelector('[data-ver]').addEventListener('click', () => cerrarHoja());
      el.querySelector('[data-limpiar]').addEventListener('click', () => {
        filtros = { poliza: '', vehiculo: '', comision: '', origen: '', incompletos: false };
        pintar(); pintarCuerpo(el);
      });
    },
  });
}

function pintarLista(el, etapa, pintar) {
  if (!store.clientes().length) {
    el.innerHTML = vacio({
      icono: 'users', color: 'blue', titulo: 'Aún no tienes clientes',
      texto: 'Registra el primero con el botón <b>+</b>, o pásalos desde un Excel, PDF, Word o foto de tu cuaderno.',
      accion: `<div class="hstack"><button class="btn btn-primary" data-n>${icon('plus')} Registrar</button><button class="btn btn-outline" data-i>${icon('upload')} Importar</button></div>`,
    });
    el.querySelector('[data-n]').addEventListener('click', () => abrirFormularioCliente());
    el.querySelector('[data-i]').addEventListener('click', () => menuImportar());
    return;
  }
  let lista = base(etapa);
  if (anio !== 'todos') lista = lista.filter((c) => fechaDe(c).startsWith(anio));
  if (anio !== 'todos' && mes !== 'todos') lista = lista.filter((c) => fechaDe(c).slice(5, 7) === mes);
  lista = ordenar(lista);

  if (!lista.length) {
    const hayFiltros = nFiltros() || anio !== 'todos';
    el.innerHTML = vacio({
      icono: 'search', titulo: 'Sin resultados',
      texto: busqueda ? `No hay clientes que coincidan con "${esc(busqueda)}".` : hayFiltros ? 'Ningún cliente cumple esos filtros.' : 'No hay clientes en esta etapa.',
      accion: hayFiltros ? '<button class="btn btn-outline" data-limpiar>Quitar filtros</button>' : '',
    });
    el.querySelector('[data-limpiar]')?.addEventListener('click', () => {
      filtros = { poliza: '', vehiculo: '', comision: '', origen: '', incompletos: false }; anio = 'todos'; mes = 'todos'; pintar();
    });
    return;
  }

  const visibles = lista.slice(0, limite);
  const porMes = orden === 'reciente' || orden === 'antiguo';
  const cols = formato();
  let html = etapa === 'vendido' ? resumenVentas(lista) : `<p class="small muted mt-8">${plural(lista.length, 'cliente', 'clientes')}</p>`;

  // Grupos por mes (o uno solo si se ordena por otra cosa)
  const grupos = new Map();
  for (const c of visibles) {
    const k = porMes ? fechaDe(c).slice(0, 7) || 'sin-fecha' : 'todo';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(c);
  }
  const tituloDe = (k) => (k === 'sin-fecha' ? (etapa === 'vendido' ? 'Sin fecha de entrega' : 'Sin fecha') : `${mayus(nombreMes(Number(k.slice(5, 7))))} ${k.slice(0, 4)}`);
  // Totales del mes completo (no solo de lo que se alcanza a ver)
  const totalDe = (k) => totales(lista.filter((c) => (fechaDe(c).slice(0, 7) || 'sin-fecha') === k));
  const h = hoy();
  html += `<div class="${etapa === 'vendido' ? 'solo-movil' : ''}">${[...grupos.entries()].map(([k, l]) => `
    <section class="${porMes ? 'mes-ventas' : 'mt-12'}">
      ${porMes ? `<div class="mes-head"><h2>${esc(tituloDe(k))}</h2><span class="mes-tot">${totalDe(k)}</span></div>` : ''}
      <div class="list">${l.map((c) => (c.etapa === 'vendido' ? filaVenta(c) : filaCliente(c, h))).join('')}</div>
    </section>`).join('')}</div>`;
  // En computador, los vendidos en una sola tabla (columnas alineadas), con una fila por mes
  if (etapa === 'vendido') html += tablaVentas(grupos, cols, porMes ? (k) => `<b>${esc(tituloDe(k))}</b><span>${totalDe(k)}</span>` : null);
  if (lista.length > limite) html += `<button class="btn btn-outline btn-block mt-16" data-mas>Mostrar más (${lista.length - limite})</button>`;
  el.innerHTML = html;

  el.querySelector('[data-mas]')?.addEventListener('click', () => { limite += POR_PAGINA; pintarLista(el, etapa, pintar); });
  el.querySelectorAll('tr[data-ir]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (!e.target.closest('a')) location.hash = tr.dataset.ir;
  }));
}

/** "12 ventas · $1.200M · Comisión $8.400.000" (o "5 clientes") */
function totales(l) {
  const ventas = l.filter((c) => c.etapa === 'vendido');
  const otros = l.length - ventas.length;
  const total = suma(ventas, 'precio'), comi = suma(ventas, 'comision');
  return [
    ventas.length ? plural(ventas.length, 'venta', 'ventas') : '',
    otros ? plural(otros, 'cliente', 'clientes') : '',
    total ? esc(dineroCorto(total)) : '',
    comi ? `Comisión ${esc(dinero(comi))}` : '',
  ].filter(Boolean).join(' · ');
}

/** Tarjeta con el resumen de lo que se está viendo (vendidos). */
function resumenVentas(l) {
  const total = suma(l, 'precio'), comi = suma(l, 'comision');
  const conPoliza = l.filter((c) => c.poliza);
  const pctPoliza = conPoliza.length ? Math.round((conPoliza.filter((c) => c.poliza === 'si').length / conPoliza.length) * 100) : null;
  const pendiente = suma(l.filter((c) => estadoComision(c) === 'pendiente'), 'comision');
  const periodo = anio === 'todos' ? 'en total' : mes === 'todos' ? `en ${anio}` : `en ${nombreMes(Number(mes))} ${anio}`;
  const dato = (t, v, color = '') => `<div class="stat" ${color ? `data-color="${color}"` : ''}><span class="stat-label">${t}</span><span class="stat-value">${v}</span></div>`;
  return `
    <div class="stats org-resumen mt-8">
      ${dato(`Ventas ${esc(periodo)}`, l.length, 'green')}
      ${total ? dato('Vendido', esc(dineroCorto(total)), 'blue') : ''}
      ${comi ? dato('Comisión', esc(dineroCorto(comi)), 'violet') : ''}
      ${pendiente ? dato('Por cobrar', esc(dineroCorto(pendiente)), 'amber') : pctPoliza !== null ? dato('Con póliza', `${pctPoliza}%`, 'amber') : ''}
    </div>`;
}

/** Tabla de vendidos para computador, con las columnas del formato de la persona. */
function tablaVentas(grupos, cols, cabeza) {
  const celda = (c, col) => {
    const v = valorDe(c, col);
    if (col.id === 'nombre') return `<td class="c-nom"><a href="#/cliente/${c.id}">${esc(c.nombre)}</a></td>`;
    const txt = col.tipo === 'fecha' && v ? fechaCorta(v) : textoValor(v, col, 'tabla');
    return `<td class="${col.tipo === 'dinero' ? 'c-pes' : col.tipo === 'sino' ? 'c-pol' : ''}">${esc(txt) || '<span class="vacia">—</span>'}</td>`;
  };
  return `
    <div class="tabla-scroll tabla-pagina solo-pc mt-12">
      <table class="tabla-cuaderno tabla-clientes">
        <thead><tr>${cols.map((col) => `<th class="${col.tipo === 'dinero' ? 'c-pes' : col.tipo === 'sino' ? 'c-pol' : ''}">${esc(col.titulo)}</th>`).join('')}</tr></thead>
        <tbody>${[...grupos.entries()].map(([k, l]) => `
          ${cabeza ? `<tr class="fila-mes"><td colspan="${cols.length}"><div class="fila-mes-in">${cabeza(k)}</div></td></tr>` : ''}
          ${l.map((c) => `<tr data-ir="#/cliente/${c.id}">${cols.map((col) => celda(c, col)).join('')}</tr>`).join('')}`).join('')}
        </tbody>
      </table>
    </div>`;
}

function filaVenta(c) {
  return `
    <a class="list-item venta-row" href="#/cliente/${c.id}">
      <div class="venta-ped"><b>${esc(c.pedido || '—')}</b><span>${c.fechaCompra ? esc(fechaCorta(c.fechaCompra)) : ''}</span></div>
      <div class="li-body">
        <div class="li-title">${esc(c.nombre)}</div>
        <div class="li-sub">${icon('car')} ${esc(c.vehiculoComprado || c.vehiculoInteres || 'Sin vehículo')}${c.poliza === 'si' ? ' · Póliza ✓' : ''}${sinCelular(c) ? ' · <span style="color:var(--c-red)">sin celular</span>' : ''}</div>
      </div>
      <div class="li-end" style="flex-direction:column;align-items:flex-end;gap:2px">
        <b class="venta-valor">${c.precio ? esc(dineroCorto(c.precio)) : ''}</b>
        ${c.comision ? `<span class="li-meta">Com. ${esc(dinero(c.comision))}</span>` : ''}
      </div>
    </a>`;
}

function filaCliente(c, h) {
  const veh = c.vehiculoComprado || c.vehiculoInteres;
  const seg = c.proximoSeguimiento;
  return `
    <a class="list-item" href="#/cliente/${c.id}">
      ${avatar(c.nombre)}
      <div class="li-body">
        <div class="li-title">${esc(c.nombre)}</div>
        <div class="li-sub">${veh ? `${icon('car')} ${esc(veh)} · ` : ''}${esc(telefonoBonito(c.telefono))}</div>
      </div>
      <div class="li-end" style="flex-direction:column;align-items:flex-end;gap:4px">
        ${pillEtapa(c.etapa)}
        ${seg ? `<span class="li-meta ${seg < h ? 'late' : seg === h ? 'today' : ''}">${icon('clock', 'i-sm')} ${esc(relativo(seg))}</span>` : ''}
      </div>
    </a>`;
}
