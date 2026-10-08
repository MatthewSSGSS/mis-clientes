// =============================================================================
// views/ficha.js — Ficha de un cliente: acciones rápidas, etapa, seguimiento,
// datos, próximos mensajes e historial.
// Ruta: #/cliente/<id>
// =============================================================================

import * as store from '../store.js';
import * as wa from '../whatsapp.js';
import { ETAPAS, FOTOS } from '../config.js';
import { proximos, pendientesHoy } from '../engine.js';
import { abrirMensaje } from '../enviar.js';
import { abrirFormularioCliente } from '../cliente-form.js';
import { abrirFormularioProgramado } from './mensajes.js';
import {
  icon, avatar, pillEtapa, etapa as infoEtapa, categoria, badgeCategoria, abrirHoja, cerrarHoja, confirmar, aviso, vacio,
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
          <button class="btn btn-icon" data-atras aria-label="Volver">${icon('chev-l')}</button>
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
          <button class="qa" data-programar>${icon('calendar')} Programar</button>
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
                  : c.proximoSeguimiento === h ? 'Ya está en tu lista de "Hoy"'
                  : `Te aparecerá en "Hoy" el ${esc(fechaCorta(c.proximoSeguimiento))}`)
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

      ${pendientes.length ? `
      <section class="section">
        <div class="section-head"><h2 class="section-title">Mensajes que vienen</h2></div>
        <div class="grouped">
          ${pendientes.slice(0, 6).map((it) => `
            <button class="g-row" data-pend="${esc(it.key)}">
              ${badgeCategoria(it.categoria)}
              <div class="li-body"><div class="li-title">${esc(it.titulo)}</div><div class="li-sub">${esc(fechaLarga(it.fecha))}</div></div>
              <span class="li-meta ${it.fecha < h ? 'late' : it.fecha === h ? 'today' : ''}">${esc(relativo(it.fecha))}</span>
            </button>`).join('')}
        </div>
      </section>` : ''}

      <section class="section">
        <div class="section-head"><h2 class="section-title">Datos</h2></div>
        <div class="card" style="padding:4px 18px">
          <div class="kv">
            ${kv('phone', 'Celular', telefonoBonito(c.telefono))}
            ${c.cumple ? kv('gift', 'Cumpleaños', cumpleTexto(c.cumple)) : ''}
            ${c.vehiculoInteres ? kv('car', 'Vehículo de interés', c.vehiculoInteres) : ''}
            ${c.vehiculoComprado || c.fechaCompra ? kv('star', 'Compró', [c.vehiculoComprado, c.fechaCompra && fechaCorta(c.fechaCompra)].filter(Boolean).join(' · ')) : ''}
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
  root.querySelector('[data-editar]').addEventListener('click', () => abrirFormularioCliente(c.id));
  root.querySelector('[data-wa]').addEventListener('click', () => abrirMensaje(c));
  root.querySelector('[data-programar]').addEventListener('click', () =>
    abrirFormularioProgramado(null, { destino: { tipo: 'clientes', ids: [c.id] }, titulo: `Mensaje para ${primerNombre(c.nombre)}`, categoria: 'recordatorio' }));
  root.querySelectorAll('[data-nota]').forEach((b) => b.addEventListener('click', () => abrirNota(c)));

  root.querySelectorAll('[data-etapa]').forEach((b) => b.addEventListener('click', () => {
    const nueva = b.dataset.etapa;
    if (nueva === c.etapa) return;
    store.cambiarEtapa(c.id, nueva);
    if (nueva === 'vendido') {
      aviso(`¡Felicitaciones por la venta! 🎉`, { icono: 'star', ms: 7000, accion: { texto: 'Enviar gracias', fn: () => abrirMensaje(store.cliente(c.id), { plantillaId: 'tpl-post-gracias' }) } });
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
