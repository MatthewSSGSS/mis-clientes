// =============================================================================
// views/ficha.js — Ficha de un cliente: acciones rápidas, etapa, seguimiento,
// datos, próximos mensajes e historial.
// Ruta: #/cliente/<id>
// =============================================================================

import * as store from '../store.js';
import * as wa from '../whatsapp.js';
import { ETAPAS, FOTOS, FORMAS_PAGO, DOCUMENTOS_CREDITO } from '../config.js';
import { proximos, pendientesHoy, dinero, documentosPendientes } from '../engine.js';
import { citasDeCliente, filaCita, conectarCitas, abrirFormularioCita } from '../citas.js';
import { abrirMensaje } from '../enviar.js';
import { abrirFormularioCliente } from '../cliente-form.js';
import { abrirFormularioProgramado } from './mensajes.js';
import {
  icon, avatar, pillEtapa, etapa as infoEtapa, categoria, badgeCategoria, abrirHoja, cerrarHoja, confirmar, aviso, vacio, botonInicio,
} from '../ui.js';
import {
  esc, hoy, sumarDias, relativo, fechaCorta, fechaLarga, cumpleTexto, cuando, telefonoBonito, primerNombre,
} from '../util.js';

export function render(root, { params, navegar, puedeVolver }) {
  const c = store.cliente(params[0]);
  if (!c) {
    root.innerHTML = `<div class="page">${vacio({ icono: 'users', titulo: 'Cliente no encontrado', texto: 'Puede que lo hayas eliminado.', accion: '<a class="btn btn-primary" href="#/clientes">Ver clientes</a>' })}</div>`;
    return;
  }
  const h = hoy();
  const pendientes = [...pendientesHoy(), ...proximos(60)].filter((it) => it.clienteId === c.id);
  const veh = c.vehiculoComprado || c.vehiculoInteres;

  root.innerHTML = `
    <header class="profile">
      <img class="hero-img" src="img/${FOTOS.ficha}" alt="">
      <div class="profile-inner">
        <div class="profile-nav">
          <div class="left">
            <button class="btn btn-icon" data-atras aria-label="Volver">${icon('chev-l')}</button>
            ${botonInicio()}
          </div>
          <button class="btn btn-sm" data-editar>${icon('edit', 'i-sm')} Editar</button>
        </div>
        <div class="profile-id">
          ${avatar(c.nombre, 'avatar-lg')}
          <div>
            <h1>${esc(c.nombre)}</h1>
            <div class="sub">${pillEtapa(c.etapa)}${veh ? `<span>${icon('car', 'i-sm')} ${esc(veh)}</span>` : ''}</div>
          </div>
        </div>
        <div class="quick-actions">
          <button class="qa wa" data-wa>${icon('chat')} WhatsApp</button>
          <a class="qa" href="${esc(wa.enlaceLlamada(c))}">${icon('phone')} Llamar</a>
          <button class="qa" data-cita>${icon('calendar')} Cita</button>
          <button class="qa" data-nota>${icon('note')} Nota</button>
        </div>
      </div>
    </header>

    <div class="page">
      <section class="section">
        <div class="section-head"><h2 class="section-title">Etapa</h2></div>
        <div class="stage-picker">
          ${ETAPAS.map((e) => `<button type="button" data-color="${e.color}" data-etapa="${e.id}" class="${c.etapa === e.id ? 'on' : ''}">${esc(e.nombre)}</button>`).join('')}
        </div>
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">Próximo seguimiento</h2></div>
        <div class="card card-pad">
          <div class="hstack">
            <span class="icon-badge" data-color="${c.proximoSeguimiento && c.proximoSeguimiento < h ? 'red' : 'blue'}">${icon('clock')}</span>
            <div class="li-body">
              <div class="li-title">${c.proximoSeguimiento ? esc(relativo(c.proximoSeguimiento)) : 'Sin programar'}</div>
              <div class="li-sub">${c.proximoSeguimiento
                ? (c.proximoSeguimiento < h ? 'Atrasado — escríbele hoy'
                  : c.proximoSeguimiento === h ? 'Ya está en tu lista de Inicio'
                  : `Te aparecerá en "Inicio" el ${esc(fechaCorta(c.proximoSeguimiento))}`)
                : 'Elige cuándo volver a escribirle'}</div>
            </div>
          </div>
          <div class="chips chips-wrap mt-12">
            ${[[1, 'Mañana'], [3, '3 días'], [7, '1 semana'], [14, '2 semanas'], [30, '1 mes']].map(([d, t]) =>
              `<button class="chip" data-seg="${d}">${t}</button>`).join('')}
            <label class="chip" style="position:relative">${icon('calendar', 'i-sm')} Otra fecha
              <input type="date" data-seg-fecha style="position:absolute;inset:0;opacity:0;width:100%" aria-label="Elegir fecha">
            </label>
            ${c.proximoSeguimiento ? `<button class="chip" data-seg="">Quitar</button>` : ''}
          </div>
        </div>
      </section>

      ${c.etapa === 'vendido' ? seccionVenta(c) : ''}

      ${seccionCitas(c)}

      ${c.etapa === 'vendido' ? '' : seccionNegociacion(c)}

      <section class="section">
        <div class="section-head"><h2 class="section-title">Mensajes que vienen</h2><button class="link-btn" data-programar>+ Programar</button></div>
        ${pendientes.length ? `
        <div class="grouped">
          ${pendientes.slice(0, 6).map((it) => `
            <button class="g-row" data-pend="${esc(it.key)}">
              ${badgeCategoria(it.categoria)}
              <div class="li-body"><div class="li-title">${esc(it.titulo)}</div><div class="li-sub">${esc(fechaLarga(it.fecha))}</div></div>
              <span class="li-meta ${it.fecha < h ? 'late' : it.fecha === h ? 'today' : ''}">${esc(relativo(it.fecha))}</span>
            </button>`).join('')}
        </div>` : '<p class="small muted">No hay mensajes programados para este cliente.</p>'}
      </section>

      <section class="section">
        <div class="section-head"><h2 class="section-title">Datos</h2></div>
        <div class="card" style="padding:4px 18px">
          <div class="kv">
            ${kv('phone', 'Celular', telefonoBonito(c.telefono))}
            ${c.cumple ? kv('gift', 'Cumpleaños', cumpleTexto(c.cumple)) : ''}
            ${c.vehiculoInteres ? kv('car', 'Vehículo de interés', c.vehiculoInteres) : ''}
            ${c.cedula ? kv('contact', 'Cédula o NIT', c.cedula) : ''}
            ${c.origen ? kv('flag', '¿Cómo llegó?', c.origen) : ''}
            ${c.email ? kv('message', 'Correo', c.email) : ''}
            ${kv('calendar', 'Cliente desde', fechaCorta(c.creado.slice(0, 10)))}
          </div>
        </div>
      </section>

      ${c.notas ? `
      <section class="section">
        <div class="section-head"><h2 class="section-title">Notas</h2></div>
        <div class="card card-pad" style="white-space:pre-wrap">${esc(c.notas)}</div>
      </section>` : ''}

      <section class="section">
        <div class="section-head"><h2 class="section-title">Historial</h2><button class="link-btn" data-nota>+ Agregar nota</button></div>
        <div class="card card-pad">
          ${c.historial.length ? `<div class="timeline">${c.historial.slice(0, 60).map(itemHistorial).join('')}</div>` : '<p class="muted small">Sin movimientos todavía.</p>'}
        </div>
      </section>

      <section class="section">
        <button class="btn btn-danger btn-block" data-eliminar>${icon('trash')} Eliminar cliente</button>
      </section>
    </div>`;

  // Mostrar la etapa actual aunque quede al final de la fila
  requestAnimationFrame(() => {
    const on = root.querySelector('.stage-picker .on');
    if (on) on.parentElement.scrollLeft = on.offsetLeft - on.parentElement.offsetLeft - 16;
  });

  // --- Eventos ---
  root.querySelector('[data-atras]').addEventListener('click', () => {
    if (puedeVolver()) history.back(); else navegar('#/clientes');
  });
  root.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirFormularioCliente(c.id)));
  root.querySelector('[data-wa]').addEventListener('click', () => abrirMensaje(c));
  root.querySelector('[data-programar]').addEventListener('click', () =>
    abrirFormularioProgramado(null, { destino: { tipo: 'clientes', ids: [c.id] }, titulo: `Mensaje para ${primerNombre(c.nombre)}`, categoria: 'recordatorio' }));
  root.querySelectorAll('[data-nota]').forEach((b) => b.addEventListener('click', () => abrirNota(c)));
  root.querySelectorAll('[data-cita]').forEach((b) => b.addEventListener('click', () => abrirFormularioCita({ clienteId: c.id })));
  conectarCitas(root);

  // Negociación y documentos
  root.querySelectorAll('[data-editar-neg]').forEach((b) => b.addEventListener('click', () => abrirFormularioCliente(c.id, { negociacion: true })));
  const conDocs = (fn) => { const x = store.cliente(c.id); if (!x) return; fn(x); store.guardarCliente(x); };
  root.querySelectorAll('[data-doc]').forEach((cb) => cb.addEventListener('change', () =>
    conDocs((x) => { const d = x.documentos.find((y) => y.id === cb.dataset.doc); if (d) d.listo = cb.checked; })));
  root.querySelectorAll('[data-doc-borrar]').forEach((b) => b.addEventListener('click', () =>
    conDocs((x) => { x.documentos = x.documentos.filter((y) => y.id !== b.dataset.docBorrar); })));
  root.querySelector('[data-doc-form]')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = e.target.doc.value.trim();
    e.target.doc.blur(); // para que la lista se redibuje de inmediato
    if (nombre) conDocs((x) => { x.documentos.push({ id: `doc_${Date.now().toString(36)}`, nombre, listo: false }); });
  });
  root.querySelector('[data-doc-pedir]')?.addEventListener('click', () => {
    const x = store.cliente(c.id);
    const lista = documentosPendientes(x).map((d) => `• ${d.nombre}`).join('\n');
    abrirMensaje(x, { texto: `Hola ${primerNombre(x.nombre)}, para el crédito me hacen falta estos documentos:\n${lista}\n` });
  });
  root.querySelector('[data-doc-iniciar]')?.addEventListener('click', () => conDocs((x) => {
    x.documentos = DOCUMENTOS_CREDITO.map((nombre, i) => ({ id: `doc_${Date.now().toString(36)}_${i}`, nombre, listo: false }));
  }));

  root.querySelectorAll('[data-etapa]').forEach((b) => b.addEventListener('click', () => {
    const nueva = b.dataset.etapa;
    if (nueva === c.etapa) return;
    store.cambiarEtapa(c.id, nueva);
    if (nueva === 'vendido') {
      aviso(`¡Felicitaciones por la venta! 🎉`, { icono: 'star', ms: 7000, accion: { texto: 'Enviar gracias', fn: () => abrirMensaje(store.cliente(c.id)) } });
    } else {
      aviso(`Ahora está en "${infoEtapa(nueva).nombre}"`);
    }
  }));

  const ponerSeguimiento = (fecha) => {
    const actual = store.cliente(c.id);
    actual.proximoSeguimiento = fecha;
    store.guardarCliente(actual);
    aviso(fecha ? `Seguimiento: ${relativo(fecha).toLowerCase()}` : 'Seguimiento quitado');
  };
  root.querySelectorAll('[data-seg]').forEach((b) => b.addEventListener('click', () =>
    ponerSeguimiento(b.dataset.seg ? sumarDias(h, Number(b.dataset.seg)) : '')));
  root.querySelector('[data-seg-fecha]').addEventListener('change', (e) => { if (e.target.value) ponerSeguimiento(e.target.value); });

  root.querySelectorAll('[data-pend]').forEach((b) => b.addEventListener('click', () => {
    const it = pendientes.find((x) => x.key === b.dataset.pend);
    if (it) abrirMensaje(c, { item: it });
  }));

  root.querySelectorAll('[data-borrar-hist]').forEach((b) => b.addEventListener('click', async () => {
    if (await confirmar({ titulo: '¿Borrar esta nota?', si: 'Borrar', peligro: true })) store.eliminarHistorial(c.id, b.dataset.borrarHist);
  }));

  root.querySelector('[data-eliminar]').addEventListener('click', async () => {
    const ok = await confirmar({
      titulo: `¿Eliminar a ${c.nombre}?`, texto: 'Se borrará su ficha y su historial.', si: 'Eliminar', peligro: true,
    });
    if (!ok) return;
    const borrado = store.eliminarCliente(c.id);
    navegar('#/clientes');
    aviso('Cliente eliminado', { icono: 'trash', ms: 6000, accion: { texto: 'Deshacer', fn: () => store.restaurarCliente(borrado) } });
  });
}

// --- Citas del cliente ---------------------------------------------------------
function seccionCitas(c) {
  const todas = citasDeCliente(c.id);
  const pendientes = todas.filter((ct) => ct.estado === 'pendiente');
  const pasadas = todas.filter((ct) => ct.estado !== 'pendiente').slice(-2).reverse();
  return `
    <section class="section">
      <div class="section-head"><h2 class="section-title">Citas</h2><button class="link-btn" data-cita>+ Agendar</button></div>
      ${todas.length ? `<div class="list">
        ${[...pendientes, ...pasadas].map((ct) => filaCita(ct, { mostrarCliente: false, mostrarFecha: true })).join('')}
      </div>` : `
      <button class="card card-pad meta-card meta-vacia" data-cita>
        <img class="thumb" src="img/mini/xterra-montana-sq.jpg" alt="" loading="lazy">
        <div class="li-body"><b>Agendar prueba de manejo o visita</b><span class="small muted">Te recuerda confirmarle el día antes</span></div>
        ${icon('chev-r', 'chev')}
      </button>`}
    </section>`;
}

// --- Venta (como en el cuaderno) ---------------------------------------------------
function seccionVenta(c) {
  const fila = (k, v, extra = '') => `<div class="venta-item"><span class="kv-k">${k}</span><span class="kv-v">${v}</span>${extra}</div>`;
  const comiPagada = c.fechaPagoComision && c.fechaPagoComision <= hoy();
  return `
    <section class="section">
      <div class="section-head"><h2 class="section-title">Venta</h2><button class="link-btn" data-editar>Editar</button></div>
      <div class="card neg-card">
        <div class="neg-precio">
          <span class="small muted">Valor de la venta</span>
          <b>${c.precio ? esc(dinero(c.precio)) : '—'}</b>
          ${c.poliza ? `<span class="pill" data-color="${c.poliza === 'si' ? 'green' : 'gray'}">${c.poliza === 'si' ? 'Póliza Nissan ✓' : 'Sin póliza Nissan'}</span>` : ''}
        </div>
        <div class="venta-grid">
          ${fila('Vehículo', esc(c.vehiculoComprado || c.vehiculoInteres || '—'))}
          ${fila('Pedido', esc(c.pedido || '—'))}
          ${fila('Entrega', c.fechaCompra ? esc(fechaCorta(c.fechaCompra)) : '—')}
          ${fila('Comisión', c.comision ? esc(dinero(c.comision)) : '—')}
          ${fila('Pago comisión', c.fechaPagoComision ? esc(fechaCorta(c.fechaPagoComision)) : '—',
            c.fechaPagoComision ? `<span class="small" style="color:var(--c-${comiPagada ? 'green' : 'amber'});font-weight:700">${comiPagada ? 'Ya pasó la fecha' : 'Pendiente'}</span>` : '')}
        </div>
      </div>
    </section>`;
}

// --- Negociación y documentos del crédito -----------------------------------------
function seccionNegociacion(c) {
  const hayDatos = c.version || c.color || c.precio || c.formaPago || c.retoma;
  const pago = FORMAS_PAGO.find((p) => p.id === c.formaPago)?.nombre;
  const docs = c.documentos || [];
  const listos = docs.filter((d) => d.listo).length;
  const faltan = documentosPendientes(c).length;

  const tarjeta = hayDatos ? `
    <div class="card neg-card">
      <div class="neg-precio">
        <span class="small muted">Precio cotizado</span>
        <b>${c.precio ? esc(dinero(c.precio)) : '—'}</b>
        ${pago ? `<span class="pill" data-color="${c.formaPago === 'credito' ? 'violet' : 'green'}">${esc(pago)}</span>` : ''}
      </div>
      <div class="neg-grid">
        ${[
          ['car', 'Vehículo', [c.vehiculoInteres || c.vehiculoComprado, c.version].filter(Boolean).join(' · ')],
          ['sparkles', 'Color', c.color],
          ['repeat', 'Retoma', c.retoma],
        ].filter(([, , v]) => v).map(([ic, k, v]) => `<div class="neg-item">${icon(ic, 'i-sm')}<div><span class="kv-k">${k}</span><span class="kv-v">${esc(v)}</span></div></div>`).join('')}
      </div>
    </div>` : `
    <button class="card card-pad meta-card meta-vacia" data-editar-neg>
      <img class="thumb" src="img/mini/frontier-negra-sq.jpg" alt="" loading="lazy">
      <div class="li-body"><b>Agregar datos de la negociación</b><span class="small muted">Versión, precio, contado o crédito, retoma</span></div>
      ${icon('chev-r', 'chev')}
    </button>`;

  const documentos = c.formaPago === 'credito' || docs.length ? `
    <div class="card card-pad docs mt-12">
      <div class="hstack">
        <div class="li-body"><b>Documentos del crédito</b><span class="small muted">${docs.length ? `${listos} de ${docs.length} recibidos` : 'Sin lista todavía'}</span></div>
        ${!docs.length ? '<button class="btn btn-sm btn-outline" data-doc-iniciar>Crear lista</button>' : ''}
      </div>
      ${docs.length ? `
      <div class="meta-bar mt-12 ${faltan ? '' : 'ok'}"><span style="width:${Math.max(3, (listos / docs.length) * 100)}%"></span></div>
      <div class="doc-list mt-8">
        ${docs.map((d) => `
          <label class="doc-row ${d.listo ? 'listo' : ''}">
            <input type="checkbox" data-doc="${esc(d.id)}" ${d.listo ? 'checked' : ''}>
            <span>${esc(d.nombre)}</span>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" data-doc-borrar="${esc(d.id)}" aria-label="Quitar ${esc(d.nombre)}">${icon('x', 'i-sm')}</button>
          </label>`).join('')}
      </div>
      <form class="tools-row mt-8" data-doc-form>
        <input class="input" name="doc" placeholder="Agregar otro documento" style="min-height:40px">
        <button class="btn btn-outline btn-icon" aria-label="Agregar">${icon('plus')}</button>
      </form>
      ${faltan ? `<button class="btn btn-wa btn-block mt-12" data-doc-pedir>${icon('chat')} Pedirle los ${faltan} que faltan por WhatsApp</button>`
        : `<p class="small mt-12" style="color:var(--c-green);font-weight:700">${icon('check', 'i-sm')} ¡Todos los documentos recibidos!</p>`}` : ''}
    </div>` : '';

  return `
    <section class="section">
      <div class="section-head"><h2 class="section-title">Negociación</h2>${hayDatos ? '<button class="link-btn" data-editar-neg>Editar</button>' : ''}</div>
      ${tarjeta}
      ${documentos}
    </section>`;
}

const kv = (ic, k, v) => `
  <div class="kv-row">${icon(ic)}<div><div class="kv-k">${esc(k)}</div><div class="kv-v">${esc(v)}</div></div></div>`;

function itemHistorial(hi) {
  let color = 'gray', titulo = '', texto = '';
  if (hi.tipo === 'mensaje') {
    const cat = categoria(hi.categoria);
    color = hi.categoria ? cat.color : 'green';
    titulo = `WhatsApp · ${hi.titulo || 'Mensaje'}`;
    texto = hi.texto || '';
  } else if (hi.tipo === 'nota') {
    color = 'amber'; titulo = 'Nota'; texto = hi.texto;
  } else if (hi.tipo === 'etapa') {
    const e = infoEtapa(hi.texto);
    color = e.color; titulo = `Pasó a "${e.nombre}"`;
  } else if (hi.tipo === 'cita') {
    color = /cancelada/.test(hi.titulo || '') ? 'gray' : /realizada/.test(hi.titulo || '') ? 'green' : 'blue';
    titulo = hi.titulo || 'Cita'; texto = hi.texto || '';
  } else if (hi.tipo === 'creado') {
    color = 'blue'; titulo = 'Cliente registrado';
  } else {
    titulo = hi.titulo || hi.tipo; texto = hi.texto || '';
  }
  return `
    <div class="tl-item" data-color="${color}" style="--c:var(--c-${color})">
      <div class="hstack" style="gap:6px">
        <span class="tl-title">${esc(titulo)}</span><span class="spacer"></span>
        ${hi.tipo === 'nota' ? `<button class="btn btn-ghost btn-icon btn-sm" data-borrar-hist="${esc(hi.id)}" aria-label="Borrar nota">${icon('trash', 'i-sm')}</button>` : ''}
      </div>
      <div class="tl-when">${esc(cuando(hi.fecha))}</div>
      ${texto ? `<div class="tl-text mt-8">${esc(texto.length > 280 ? texto.slice(0, 280) + '…' : texto)}</div>` : ''}
    </div>`;
}

function abrirNota(c) {
  abrirHoja({
    titulo: `Nota sobre ${primerNombre(c.nombre)}`,
    cuerpo: `
      <div class="field">
        <label for="n-texto">¿Qué pasó?</label>
        <textarea id="n-texto" class="textarea" rows="5" autofocus placeholder="Ej: Vino a la prueba de manejo, le gustó el color gris. Espera la aprobación del crédito."></textarea>
      </div>`,
    pie: `<button class="btn btn-outline" data-cancel>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar nota</button>`,
    montar: (el) => {
      el.querySelector('[data-cancel]').addEventListener('click', () => cerrarHoja());
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const t = el.querySelector('#n-texto').value.trim();
        if (!t) return;
        store.agregarHistorial(c.id, { tipo: 'nota', texto: t });
        cerrarHoja();
        aviso('Nota guardada');
      });
    },
  });
}
