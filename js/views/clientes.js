// =============================================================================
// views/clientes.js — Lista de clientes con búsqueda, filtro por etapa y orden.
// Ruta: #/clientes  o  #/clientes/<etapa>
// =============================================================================

import * as store from '../store.js';
import { ETAPAS } from '../config.js';
import { abrirFormularioCliente } from '../cliente-form.js';
import { menuImportar } from '../documentos.js';
import { icon, avatar, pillEtapa, vacio, botonTema, botonInicio } from '../ui.js';
import { esc, norm, relativo, hoy, plural, telefonoBonito, debounce, nombreMes, fechaCorta } from '../util.js';
import { dinero, dineroCorto } from '../engine.js';

const ORDENES = [
  { id: 'recientes', nombre: 'Recientes' },
  { id: 'nombre', nombre: 'A–Z' },
  { id: 'seguimiento', nombre: 'Seguimiento' },
];
const POR_PAGINA = 80;

// Se conservan mientras la app esté abierta
let busqueda = '';
let orden = 'recientes';
let limite = POR_PAGINA;

export function render(root, { params }) {
  const filtro = ETAPAS.some((e) => e.id === params[0]) ? params[0] : 'todos';
  const todos = store.clientes();

  root.innerHTML = `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Clientes</h1>
          <p>${plural(todos.length, 'cliente', 'clientes')}</p>
        </div>
        <div class="hstack">${botonInicio()}${botonTema()}<button class="btn btn-ghost btn-icon" data-importar aria-label="Importar clientes">${icon('upload')}</button><button class="btn btn-primary" data-nuevo>${icon('plus')} ${filtro === 'vendido' ? 'Venta' : 'Nuevo'}</button></div>
      </div>

      <div class="sticky-tools">
        <div class="tools-row">
          <label class="search">
            ${icon('search')}
            <span class="sr-only">Buscar</span>
            <input class="input" type="search" placeholder="Buscar por nombre, celular o carro…" value="${esc(busqueda)}" data-buscar enterkeyhint="search">
          </label>
        </div>
        <div class="chips" role="group" aria-label="Filtrar por etapa">
          <a class="chip" href="#/clientes" aria-pressed="${filtro === 'todos'}">Todos <span class="count">${todos.length}</span></a>
          ${[...ETAPAS.filter((e) => e.id === 'vendido'), ...ETAPAS.filter((e) => e.id !== 'vendido')].map((e) => {
            const n = todos.filter((c) => c.etapa === e.id).length;
            return `<a class="chip" href="#/clientes/${e.id}" aria-pressed="${filtro === e.id}">${esc(e.nombre)} <span class="count">${n}</span></a>`;
          }).join('')}
        </div>
        <div class="hstack small" ${filtro === 'vendido' ? 'hidden' : ''}>
          <span class="muted">Ordenar:</span>
          <div class="chips">
            ${ORDENES.map((o) => `<button class="chip" style="height:30px" data-orden="${o.id}" aria-pressed="${orden === o.id}">${o.nombre}</button>`).join('')}
          </div>
        </div>
      </div>

      <div data-lista class="mt-8"></div>
    </div>`;

  const lista = root.querySelector('[data-lista]');
  const pintar = () => pintarLista(lista, filtro);
  pintar();

  root.querySelector('[data-nuevo]').addEventListener('click', () => abrirFormularioCliente(null, { venta: filtro === 'vendido' }));
  root.querySelector('[data-importar]').addEventListener('click', () => menuImportar());
  root.querySelector('[data-buscar]').addEventListener('input', debounce((e) => {
    busqueda = e.target.value; limite = POR_PAGINA; pintar();
  }, 120));
  root.querySelectorAll('[data-orden]').forEach((b) => b.addEventListener('click', () => {
    orden = b.dataset.orden;
    root.querySelectorAll('[data-orden]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    pintar();
  }));
}

function filtrar(filtro) {
  const q = norm(busqueda);
  const qDig = busqueda.replace(/\D/g, '');
  let lista = store.clientes();
  if (filtro !== 'todos') lista = lista.filter((c) => c.etapa === filtro);
  if (q) {
    lista = lista.filter((c) =>
      norm(c.nombre).includes(q) ||
      norm(c.vehiculoInteres).includes(q) || norm(c.vehiculoComprado).includes(q) ||
      norm(c.email).includes(q) || norm(c.notas).includes(q) ||
      (qDig.length >= 3 && [c.telefono, c.cedula, c.pedido].some((x) => String(x || '').replace(/\D/g, '').includes(qDig))));
  }
  const copia = [...lista];
  if (orden === 'nombre') copia.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  else if (orden === 'seguimiento') copia.sort((a, b) => (a.proximoSeguimiento || '9999').localeCompare(b.proximoSeguimiento || '9999'));
  else copia.sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || ''));
  return copia;
}

function pintarLista(el, filtro) {
  const lista = filtrar(filtro);
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
  if (!lista.length) {
    el.innerHTML = vacio({ icono: 'search', titulo: 'Sin resultados', texto: busqueda ? `No hay clientes que coincidan con "${esc(busqueda)}".` : 'No hay clientes en esta etapa.' });
    return;
  }
  if (filtro === 'vendido') { pintarVentas(el, lista); return; }
  const h = hoy();
  el.innerHTML = `
    <div class="list">
      ${lista.slice(0, limite).map((c) => {
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
      }).join('')}
    </div>
    ${lista.length > limite ? `<button class="btn btn-outline btn-block mt-16" data-mas>Mostrar más (${lista.length - limite})</button>` : ''}`;
  el.querySelector('[data-mas]')?.addEventListener('click', () => { limite += POR_PAGINA; pintarLista(el, filtro); });
}

// --- Vendidos: agrupados por mes de entrega, como el cuaderno ------------------------
function pintarVentas(el, lista) {
  const grupos = new Map();
  for (const c of [...lista].sort((a, b) => (b.fechaCompra || '').localeCompare(a.fechaCompra || '') || (b.pedido || '').localeCompare(a.pedido || ''))) {
    const k = (c.fechaCompra || '').slice(0, 7) || 'sin-fecha';
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(c);
  }
  const suma = (l, campo) => l.reduce((t, c) => t + (Number(c[campo]) || 0), 0);
  el.innerHTML = [...grupos.entries()].map(([k, l]) => {
    const titulo = k === 'sin-fecha' ? 'Sin fecha de entrega' : `${nombreMes(Number(k.slice(5, 7)))} ${k.slice(0, 4)}`;
    const total = suma(l, 'precio'), comi = suma(l, 'comision');
    return `
      <section class="mes-ventas">
        <div class="mes-head">
          <h2>${esc(titulo.charAt(0).toUpperCase() + titulo.slice(1))}</h2>
          <span class="mes-tot">${plural(l.length, 'venta', 'ventas')}${total ? ` · ${esc(dineroCorto(total))}` : ''}${comi ? ` · Comisión ${esc(dinero(comi))}` : ''}</span>
        </div>
        <div class="list">
          ${l.map((c) => `
            <a class="list-item venta-row" href="#/cliente/${c.id}">
              <div class="venta-ped"><b>${esc(c.pedido || '—')}</b><span>${c.fechaCompra ? esc(fechaCorta(c.fechaCompra)) : ''}</span></div>
              <div class="li-body">
                <div class="li-title">${esc(c.nombre)}</div>
                <div class="li-sub">${icon('car')} ${esc(c.vehiculoComprado || c.vehiculoInteres || 'Sin vehículo')}${c.poliza === 'si' ? ' · Póliza ✓' : ''}</div>
              </div>
              <div class="li-end" style="flex-direction:column;align-items:flex-end;gap:2px">
                <b class="venta-valor">${c.precio ? esc(dineroCorto(c.precio)) : ''}</b>
                ${c.comision ? `<span class="li-meta">Com. ${esc(dinero(c.comision))}</span>` : ''}
              </div>
            </a>`).join('')}
        </div>
      </section>`;
  }).join('');
}
