// =============================================================================
// views/hoy.js — Pantalla de inicio: saludo, resumen, mensajes para hoy,
// próximos días y embudo de ventas.
// =============================================================================

import * as store from '../store.js';
import { ETAPAS, ETAPAS_ACTIVAS, FOTOS, DIAS_RECORDAR_RESPALDO, CATEGORIAS } from '../config.js';
import { pendientesHoy, proximos } from '../engine.js';
import { abrirMensaje, modoSerie } from '../enviar.js';
import { abrirFormularioCliente } from '../cliente-form.js';
import { guardarRespaldo } from '../importar.js';
import { menuImportar } from '../documentos.js';
import { icon, avatar, categoria, badgeCategoria, vacio, botonTema } from '../ui.js';
import {
  esc, hoy, saludo, fechaLarga, relativo, primerNombre, plural, esIOS, esMovil, esInstalada, diasEntre, fechaStr,
} from '../util.js';

let verTodosProximos = false;

export function render(root) {
  const a = store.ajustes();
  const clientes = store.clientes();
  const items = pendientesHoy();
  const prox = proximos();
  const h = hoy();
  const mes = h.slice(0, 7);
  const foto = FOTOS.hoy[new Date().getDay() % FOTOS.hoy.length];

  const activos = clientes.filter((c) => ETAPAS_ACTIVAS.includes(c.etapa)).length;
  const ventasMes = clientes.filter((c) => c.etapa === 'vendido' && (c.fechaCompra || '').startsWith(mes)).length;
  const cumplesMes = clientes.filter((c) => (c.cumple || '').startsWith(mes.slice(5))).length;
  const nombre = primerNombre(a.nombre);

  let resumen;
  if (!clientes.length) resumen = 'Empecemos: registra tu primer cliente y la app se encarga de recordarte cuándo escribirle.';
  else if (items.length) resumen = `Tienes ${plural(items.length, 'mensaje', 'mensajes')} para enviar hoy.`;
  else resumen = 'Todo al día. No tienes mensajes pendientes. ✨';

  root.innerHTML = `
    <header class="hero hero-home">
      <img class="hero-img" src="img/${foto}" alt="" fetchpriority="high">
      <div class="hero-top"><span class="hero-date">${esc(fechaLarga(h))}</span>${botonTema()}</div>
      <div class="hero-inner">
        <h1>${esc(saludo())}${nombre ? `, ${esc(nombre)}` : ''}</h1>
        <p>${esc(resumen)}</p>
        <div class="hero-cta">
          ${items.length ? `<button class="btn btn-wa btn-lg" data-serie>${icon('send')} Empezar a enviar (${items.length})</button>` : ''}
          ${!clientes.length ? `
            <button class="btn btn-primary btn-lg" data-nuevo>${icon('plus')} Registrar cliente</button>
            <button class="btn btn-glass btn-lg" data-importar>${icon('upload')} Pasar mis clientes</button>` : ''}
        </div>
      </div>
      <span class="photo-credit">Foto: Unsplash</span>
    </header>

    <div class="page">
      ${clientes.length ? `
      <div class="stats">
        <a class="stat" href="#/clientes" data-color="blue"><span class="stat-label">${icon('users')} En proceso</span><span class="stat-value">${activos}</span></a>
        <a class="stat" href="#/clientes" data-color="green"><span class="stat-label">${icon('star')} Ventas del mes</span><span class="stat-value">${ventasMes}</span></a>
        <div class="stat" data-color="red"><span class="stat-label">${icon('send')} Para hoy</span><span class="stat-value">${items.length}</span></div>
        <div class="stat" data-color="pink"><span class="stat-label">${icon('gift')} Cumples del mes</span><span class="stat-value">${cumplesMes}</span></div>
      </div>` : ''}

      ${avisos(a, clientes)}

      ${clientes.length ? `
      <section class="section">
        <div class="section-head">
          <h2 class="section-title">Para hoy</h2>
          ${items.length > 1 ? `<button class="link-btn" data-serie>Enviar todos</button>` : ''}
        </div>
        ${items.length ? grupos(items) : vacio({
          icono: 'check', color: 'green', titulo: 'Estás al día',
          texto: 'Cuando haya cumpleaños, seguimientos u ofertas programadas, aparecerán aquí.',
        })}
      </section>

      ${prox.length ? `
      <section class="section">
        <div class="section-head">
          <h2 class="section-title">Próximos días</h2>
          <span class="section-sub">${plural(prox.length, 'mensaje', 'mensajes')}</span>
        </div>
        <div class="grouped">
          ${(verTodosProximos ? prox : prox.slice(0, 6)).map(filaProximo).join('')}
          ${prox.length > 6 ? `<button class="g-row center" data-ver-prox style="justify-content:center;color:var(--accent);font-weight:700">${verTodosProximos ? 'Ver menos' : `Ver los ${prox.length}`}</button>` : ''}
        </div>
      </section>` : ''}

      <section class="section">
        <div class="section-head"><h2 class="section-title">Tus clientes</h2><a class="link-btn" href="#/clientes">Ver todos</a></div>
        <div class="card card-pad">${embudo(clientes)}</div>
      </section>` : bienvenidaVacia()}
    </div>`;

  // Eventos
  root.querySelectorAll('[data-serie]').forEach((b) => b.addEventListener('click', () => modoSerie(pendientesHoy())));
  root.querySelectorAll('[data-nuevo]').forEach((b) => b.addEventListener('click', () => abrirFormularioCliente()));
  root.querySelectorAll('[data-importar]').forEach((b) => b.addEventListener('click', () => menuImportar()));
  root.querySelector('[data-respaldo]')?.addEventListener('click', () => guardarRespaldo());
  root.querySelector('[data-ver-prox]')?.addEventListener('click', () => { verTodosProximos = !verTodosProximos; render(root); });
  root.querySelectorAll('[data-enviar]').forEach((b) => b.addEventListener('click', () => {
    const it = items.find((x) => x.key === b.dataset.enviar);
    const c = it && store.cliente(it.clienteId);
    if (c) abrirMensaje(c, { item: it });
  }));
}

function grupos(items) {
  return CATEGORIAS.map((cat) => {
    const del = items.filter((it) => it.categoria === cat.id);
    if (!del.length) return '';
    return `
      <div class="group-label" data-color="${cat.color}">${icon(cat.icon)} ${esc(cat.nombre)} <span class="count">${del.length}</span></div>
      <div class="list">${del.map(tarea).join('')}</div>`;
  }).join('') + (() => {
    const otros = items.filter((it) => !CATEGORIAS.some((c) => c.id === it.categoria));
    return otros.length ? `<div class="group-label">${icon('message')} Otros</div><div class="list">${otros.map(tarea).join('')}</div>` : '';
  })();
}

function tarea(it) {
  const c = store.cliente(it.clienteId);
  if (!c) return '';
  const tarde = it.fecha < hoy();
  return `
    <div class="task">
      ${avatar(c.nombre)}
      <div class="li-body">
        <div class="li-title"><a href="#/cliente/${c.id}">${esc(c.nombre)}</a></div>
        <div class="li-sub">${esc(it.titulo)} · <span class="li-meta ${tarde ? 'late' : 'today'}">${esc(relativo(it.fecha))}</span></div>
      </div>
      <div class="task-actions">
        <button class="btn btn-wa btn-sm" data-enviar="${esc(it.key)}" aria-label="Enviar a ${esc(c.nombre)}">${icon('chat', 'i-sm')} Enviar</button>
      </div>
    </div>`;
}

function filaProximo(it) {
  const c = store.cliente(it.clienteId);
  if (!c) return '';
  return `
    <a class="g-row" href="#/cliente/${c.id}">
      ${badgeCategoria(it.categoria)}
      <div class="li-body">
        <div class="li-title">${esc(c.nombre)}</div>
        <div class="li-sub">${esc(it.titulo)}</div>
      </div>
      <span class="li-meta">${esc(relativo(it.fecha))}</span>
    </a>`;
}

function embudo(clientes) {
  const total = clientes.length || 1;
  const conteo = ETAPAS.map((e) => ({ ...e, n: clientes.filter((c) => c.etapa === e.id).length }));
  return `
    <div class="hstack" style="justify-content:space-between;margin-bottom:12px">
      <span class="small muted" style="font-weight:700">${plural(clientes.length, 'cliente', 'clientes')} en total</span>
    </div>
    <div class="funnel" role="img" aria-label="${conteo.map((e) => `${e.nombre}: ${e.n}`).join(', ')}">
      ${conteo.filter((e) => e.n).map((e) => `<span data-color="${e.color}" style="flex:${e.n / total}" title="${esc(e.nombre)}: ${e.n}"></span>`).join('')}
    </div>
    <div class="funnel-legend">
      ${conteo.map((e) => `<a href="#/clientes/${e.id}" data-color="${e.color}">${esc(e.nombre)} <b>${e.n}</b></a>`).join('')}
    </div>`;
}

function avisos(a, clientes) {
  const out = [];
  if (!store.almacenamientoOK) {
    out.push(`<div class="banner warn">${icon('shield', 'i-lg')}<div><strong>No se están guardando los datos</strong>
      Tu navegador está bloqueando el almacenamiento (¿modo incógnito?). Abre la app en una ventana normal.</div></div>`);
  }
  if (esMovil && !esInstalada()) {
    out.push(`<div class="banner info">${icon('download', 'i-lg')}<div><strong>Instala la app en tu celular</strong>
      ${esIOS
        ? 'En Safari toca <b>Compartir</b> (el cuadrado con flecha) y luego <b>"Agregar a inicio"</b>. Así tus datos quedan protegidos y la abres como una app.'
        : 'Toca el menú <b>⋮</b> del navegador y luego <b>"Instalar app"</b> o <b>"Agregar a pantalla principal"</b>.'}
      <div class="banner-actions"><a class="btn btn-sm btn-outline" href="#/ajustes">Ver cómo</a></div></div></div>`);
  }
  if (clientes.length >= 3) {
    const ult = a.ultimoRespaldo ? diasEntre(fechaStr(new Date(a.ultimoRespaldo)), hoy()) : Infinity;
    if (ult >= DIAS_RECORDAR_RESPALDO) {
      out.push(`<div class="banner warn">${icon('shield', 'i-lg')}<div><strong>Haz una copia de seguridad</strong>
        ${a.ultimoRespaldo ? `Tu última copia fue hace ${ult} días.` : 'Aún no has guardado ninguna copia.'} Si cambias o pierdes el celular, con la copia recuperas todo.
        <div class="banner-actions"><button class="btn btn-sm btn-primary" data-respaldo>${icon('download', 'i-sm')} Guardar copia ahora</button></div></div></div>`);
    }
  }
  return out.length ? `<div class="stack mt-16">${out.join('')}</div>` : '';
}

function bienvenidaVacia() {
  return `
    <section class="section">
      <div class="grouped">
        <div class="g-row">${badgeCategoria('seguimiento')}<div class="li-body"><b>Registra a tus clientes</b><span class="small muted">Nombre, celular, el carro que le interesa y su cumpleaños.</span></div></div>
        <div class="g-row">${badgeCategoria('cumpleanos')}<div class="li-body"><b>La app te avisa cuándo escribir</b><span class="small muted">Cumpleaños, seguimientos, mantenimientos y aniversarios de compra.</span></div></div>
        <div class="g-row">${badgeCategoria('ofertas')}<div class="li-body"><b>Programa ofertas y saludos</b><span class="small muted">Elige a quién, cuándo y con qué mensaje. Tú solo tocas "Enviar".</span></div></div>
      </div>
    </section>`;
}
