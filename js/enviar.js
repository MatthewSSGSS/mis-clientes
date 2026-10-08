// =============================================================================
// enviar.js — Ventanas para enviar mensajes por WhatsApp:
//   • abrirMensaje(): escribir a un cliente (con plantilla o en blanco)
//   • modoSerie(): ir enviando todos los pendientes uno tras otro
// =============================================================================

import * as store from './store.js';
import * as wa from './whatsapp.js';
import { CATEGORIAS } from './config.js';
import { llenarTexto, textoDe } from './engine.js';
import { abrirHoja, cerrarHoja, aviso, icon, avatar, pillCategoria, categoria, vacio } from './ui.js';
import { esc, uid, hoy, sumarDias, telefonoBonito, relativo } from './util.js';

// Opciones para "volver a escribirle en…" después de un seguimiento
const SIGUIENTE = [
  { dias: 3, txt: '3 días' },
  { dias: 7, txt: '1 semana' },
  { dias: 14, txt: '2 semanas' },
  { dias: 30, txt: '1 mes' },
  { dias: 0, txt: 'No' },
];

function htmlSiguiente(c) {
  const def = ['vendido', 'perdido'].includes(c.etapa) ? 0 : 7;
  return `
    <div class="field mt-16">
      <span class="label">Después, volver a escribirle en</span>
      <div class="chips chips-wrap" data-siguiente>
        ${SIGUIENTE.map((s) => `<button type="button" class="chip" data-dias="${s.dias}" aria-pressed="${s.dias === def}">${s.txt}</button>`).join('')}
      </div>
    </div>`;
}
function conectarSiguiente(el) {
  el.querySelectorAll('[data-siguiente] .chip').forEach((b) => b.addEventListener('click', () => {
    el.querySelectorAll('[data-siguiente] .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));
}
/** Pone la fecha del siguiente seguimiento. Devuelve una función para deshacerlo. */
function aplicarSiguiente(el, c) {
  const sel = el.querySelector('[data-siguiente] .chip[aria-pressed="true"]');
  const actual = store.cliente(c.id);
  if (!sel || !actual) return () => {};
  const anterior = actual.proximoSeguimiento;
  const dias = Number(sel.dataset.dias);
  actual.proximoSeguimiento = dias ? sumarDias(hoy(), dias) : '';
  store.guardarCliente(actual);
  return () => {
    const x = store.cliente(c.id);
    if (x) { x.proximoSeguimiento = anterior; store.guardarCliente(x); }
  };
}

function opcionesPlantillas(seleccion) {
  return CATEGORIAS.map((cat) => {
    const ps = store.plantillas().filter((p) => p.categoria === cat.id);
    if (!ps.length) return '';
    return `<optgroup label="${esc(cat.nombre)}">${ps.map((p) =>
      `<option value="${p.id}" ${p.id === seleccion ? 'selected' : ''}>${esc(p.titulo)}</option>`).join('')}</optgroup>`;
  }).join('');
}

function cabeceraCliente(c, extra = '') {
  return `
    <div class="serie-who">
      ${avatar(c.nombre)}
      <div class="li-body">
        <div class="li-title">${esc(c.nombre)}</div>
        <div class="li-sub">${icon('phone')} ${esc(telefonoBonito(c.telefono))}</div>
      </div>
      ${extra}
    </div>`;
}

/**
 * Ventana para escribirle a un cliente.
 * @param {object} c cliente
 * @param {object} [o]
 * @param {object} [o.item]        pendiente de engine.js (si viene de "Para hoy")
 * @param {string} [o.plantillaId] plantilla inicial
 */
export function abrirMensaje(c, { item, plantillaId } = {}) {
  if (!c.telefono) { aviso('Este cliente no tiene teléfono', { icono: 'x' }); return; }
  const inicial = item ? textoDe(item) : plantillaId ? llenarTexto(store.plantilla(plantillaId)?.texto, c) : '';
  const esSeguimiento = item?.tipo === 'seguimiento';

  abrirHoja({
    titulo: item ? item.titulo : 'Escribir por WhatsApp',
    alta: !item,
    cuerpo: `
      ${cabeceraCliente(c, item ? pillCategoria(item.categoria) : '')}
      ${item ? '' : `
        <div class="field">
          <label for="m-tpl">Plantilla</label>
          <select id="m-tpl" class="select">
            <option value="">Mensaje en blanco</option>
            ${opcionesPlantillas(plantillaId)}
          </select>
        </div>`}
      <div class="field">
        <label for="m-texto">Mensaje <span class="muted small">(puedes editarlo)</span></label>
        <textarea id="m-texto" class="textarea" rows="7" ${item ? '' : 'autofocus'}>${esc(inicial)}</textarea>
      </div>
      ${esSeguimiento ? htmlSiguiente(c) : ''}`,
    pie: `
      ${item ? `<button class="btn btn-outline" type="button" data-omitir>${icon('skip')} Omitir</button>` : ''}
      <a class="btn btn-wa btn-lg" data-enviar ${wa.atributos()} href="${esc(wa.enlace(c, inicial))}">${icon('send')} Enviar por WhatsApp</a>`,
    montar: (el) => {
      const ta = el.querySelector('#m-texto');
      const btn = el.querySelector('[data-enviar]');
      const actualizar = () => { btn.href = wa.enlace(c, ta.value); };
      ta.addEventListener('input', actualizar);
      el.querySelector('#m-tpl')?.addEventListener('change', (e) => {
        const p = store.plantilla(e.target.value);
        ta.value = p ? llenarTexto(p.texto, c) : '';
        actualizar();
      });
      if (esSeguimiento) conectarSiguiente(el);

      btn.addEventListener('click', () => {
        const tpl = store.plantilla(el.querySelector('#m-tpl')?.value);
        const key = item?.key || `manual:${uid()}`;
        store.registrarEnvio({
          key, clienteId: c.id, estado: 'enviado', texto: ta.value,
          categoria: item?.categoria || tpl?.categoria || '',
          titulo: item?.titulo || tpl?.titulo || 'Mensaje',
        });
        const deshacerSiguiente = esSeguimiento ? aplicarSiguiente(el, c) : () => {};
        // Esperar un instante para que el navegador abra WhatsApp antes de cerrar
        setTimeout(() => cerrarHoja(), 50);
        aviso(`Enviado a ${c.nombre.split(' ')[0]}`, {
          accion: { texto: 'Deshacer', fn: () => { store.deshacerEnvio(key); deshacerSiguiente(); } },
        });
      });
      el.querySelector('[data-omitir]')?.addEventListener('click', () => {
        store.registrarEnvio({ key: item.key, clienteId: c.id, estado: 'omitido', categoria: item.categoria, titulo: item.titulo });
        cerrarHoja();
        aviso('Mensaje omitido', { icono: 'skip', accion: { texto: 'Deshacer', fn: () => store.deshacerEnvio(item.key) } });
      });
    },
  });
}

/**
 * Envía una lista de pendientes uno tras otro.
 * Ideal para "Empezar a enviar": muestra el mensaje listo, ella toca Enviar,
 * WhatsApp se abre, y al volver ya está el siguiente.
 */
export function modoSerie(items) {
  const lista = items.filter((it) => store.cliente(it.clienteId));
  let i = 0, enviadosN = 0, omitidosN = 0;

  const render = (el) => {
    const body = el.querySelector('.sheet-body');
    const foot = el.querySelector('.sheet-foot');
    if (i >= lista.length) {
      body.innerHTML = `
        <div class="celebrate">
          <span class="icon-badge" data-color="green">${icon('check')}</span>
          <h3 style="font-size:22px">¡Listo por hoy!</h3>
          <p class="muted">${enviadosN} ${enviadosN === 1 ? 'mensaje enviado' : 'mensajes enviados'}${omitidosN ? ` · ${omitidosN} omitidos` : ''}.</p>
        </div>`;
      foot.innerHTML = `<button class="btn btn-primary btn-lg" type="button" data-fin>Terminar</button>`;
      foot.querySelector('[data-fin]').addEventListener('click', () => cerrarHoja());
      return;
    }
    const it = lista[i];
    const c = store.cliente(it.clienteId);
    const texto = textoDe(it);
    const barras = lista.length <= 30
      ? `<div class="serie-progress">${lista.map((_, k) => `<span class="${k < i ? 'done' : k === i ? 'current' : ''}"></span>`).join('')}</div>`
      : `<div class="camp-progress" style="margin-bottom:16px"><span style="width:${(i / lista.length) * 100}%"></span></div>`;
    const cat = categoria(it.categoria);
    body.innerHTML = `
      ${barras}
      <div class="hstack small muted" style="margin-bottom:12px">
        <b style="color:var(--text)">${i + 1} de ${lista.length}</b>
        <span class="spacer"></span>
        <span>${esc(relativo(it.fecha))}</span>
      </div>
      ${cabeceraCliente(c, `<span class="pill no-dot" data-color="${cat.color}">${icon(cat.icon, 'i-sm')}${esc(it.titulo)}</span>`)}
      <div class="field">
        <label for="s-texto">Mensaje</label>
        <textarea id="s-texto" class="textarea" rows="7">${esc(texto)}</textarea>
      </div>
      ${it.tipo === 'seguimiento' ? htmlSiguiente(c) : ''}`;
    foot.innerHTML = `
      <button class="btn btn-outline" type="button" data-omitir>${icon('skip')} Omitir</button>
      <a class="btn btn-wa btn-lg" data-enviar ${wa.atributos()} href="${esc(wa.enlace(c, texto))}">${icon('send')} Enviar</a>`;

    const ta = body.querySelector('#s-texto');
    const btn = foot.querySelector('[data-enviar]');
    ta.addEventListener('input', () => { btn.href = wa.enlace(c, ta.value); });
    if (it.tipo === 'seguimiento') conectarSiguiente(body);
    btn.addEventListener('click', () => {
      store.registrarEnvio({ key: it.key, clienteId: c.id, estado: 'enviado', texto: ta.value, categoria: it.categoria, titulo: it.titulo });
      if (it.tipo === 'seguimiento') aplicarSiguiente(body, c);
      enviadosN++; i++;
      setTimeout(() => render(el), 300);
    });
    foot.querySelector('[data-omitir]').addEventListener('click', () => {
      store.registrarEnvio({ key: it.key, clienteId: c.id, estado: 'omitido', categoria: it.categoria, titulo: it.titulo });
      omitidosN++; i++;
      render(el);
    });
  };

  abrirHoja({
    titulo: 'Enviar mensajes de hoy',
    alta: true,
    cuerpo: lista.length ? '' : vacio({ icono: 'check', color: 'green', titulo: 'No hay mensajes pendientes' }),
    pie: '<span></span>',
    montar: (el) => { if (lista.length) render(el); },
  });
}
