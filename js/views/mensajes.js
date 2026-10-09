// =============================================================================
// views/mensajes.js — Mensajes programados y recordatorios automáticos.
// No hay plantillas: cada mensaje lo escribe la persona.
// Rutas: #/mensajes/programados | #/mensajes/automaticos
// =============================================================================

import * as store from '../store.js';
import { CATEGORIAS, ETAPAS, VARIABLES, FOTOS } from '../config.js';
import {
  DESCRIPCION_REGLAS, REPETICIONES, destinatarios, proximaFecha, avanceProgramado, llenarTexto,
} from '../engine.js';
import {
  icon, avatar, categoria, badgeCategoria, abrirHoja, cerrarHoja, confirmar, aviso, vacio, botonTema, botonInicio,
} from '../ui.js';
import { esc, hoy, relativo, fechaCorta, plural, norm, sumarDias } from '../util.js';

const TABS = [
  { id: 'programados', nombre: 'Programados' },
  { id: 'automaticos', nombre: 'Recordatorios' },
];

// Ideas para programar con un toque (el texto lo escribe ella)
function ideas() {
  const y = new Date().getFullYear();
  const h = hoy();
  const fechaFutura = (mmdd) => (`${y}-${mmdd}` >= h ? `${y}-${mmdd}` : `${y + 1}-${mmdd}`);
  return [
    { titulo: 'Saludo a mis clientes', categoria: 'postventa', fecha: sumarDias(h, 1), repetir: 'no', destino: { tipo: 'etapas', etapas: ['vendido'] } },
    { titulo: 'Feliz Navidad', categoria: 'especiales', fecha: fechaFutura('12-24'), repetir: 'anual', destino: { tipo: 'todos' } },
    { titulo: 'Feliz año nuevo', categoria: 'especiales', fecha: fechaFutura('12-31'), repetir: 'anual', destino: { tipo: 'todos' } },
    { titulo: 'Oferta del mes', categoria: 'ofertas', fecha: sumarDias(h, 1), repetir: 'no', destino: { tipo: 'todos' } },
  ];
}

export function render(root, { params }) {
  const tab = TABS.some((t) => t.id === params[0]) ? params[0] : 'programados';

  root.innerHTML = `
    <header class="hero hero-sm">
      ${botonInicio()}${botonTema()}
      <img class="hero-img" src="img/${FOTOS.mensajes}" alt="">
      <div class="hero-inner">
        <h1>Mensajes</h1>
        <p>Escribe tu mensaje y elige cuándo enviarlo. Ese día te aparece en Inicio listo para mandar por WhatsApp.</p>
      </div>
      <span class="photo-credit">Foto: Unsplash</span>
    </header>
    <div class="page">
      <nav class="segmented mt-16" aria-label="Tipo de mensajes">
        ${TABS.map((t) => `<a href="#/mensajes/${t.id}" class="${t.id === tab ? 'on' : ''}" ${t.id === tab ? 'aria-current="page"' : ''}>${t.nombre}</a>`).join('')}
      </nav>
      <div data-tab></div>
    </div>`;

  const cont = root.querySelector('[data-tab]');
  if (tab === 'programados') tabProgramados(cont);
  else tabAutomaticos(cont);
}

// --- Programados --------------------------------------------------------------
function tabProgramados(el) {
  const lista = store.programados();
  const h = hoy();
  el.innerHTML = `
    <button class="btn btn-primary btn-block btn-lg mt-16" data-nuevo>${icon('calendar')} Programar mensaje</button>
    ${lista.length ? `
      <div class="list mt-16">
        ${lista.map((p) => {
          const prox = proximaFecha(p, h);
          const av = avanceProgramado(p);
          const n = destinatarios(p).length;
          const rep = REPETICIONES.find((r) => r.id === (p.repetir || 'no'));
          const texto = p.texto || store.plantilla(p.plantillaId)?.texto || '';
          return `
            <button class="list-item" data-editar="${p.id}" style="align-items:flex-start">
              ${badgeCategoria(p.categoria)}
              <div class="li-body">
                <div class="li-title">${esc(p.titulo || 'Mensaje programado')}</div>
                <div class="li-sub">${p.activa === false ? '<b>Pausado</b> · ' : ''}${prox ? `${esc(relativo(prox))}` : 'Ya pasó'} · ${esc(rep.nombre)} · ${plural(n, 'cliente', 'clientes')}</div>
                ${texto ? `<div class="small muted mt-8 recorte-2">“${esc(texto)}”</div>` : ''}
                ${av && av.total ? `<div class="camp-progress" title="${av.listos} de ${av.total} enviados"><span style="width:${(av.listos / av.total) * 100}%"></span></div>
                  <div class="small muted mt-8">${av.listos} de ${av.total} enviados (${esc(relativo(av.fecha).toLowerCase())})</div>` : ''}
              </div>
              ${icon('chev-r', 'chev')}
            </button>`;
        }).join('')}
      </div>` : `
      ${vacio({ icono: 'calendar', color: 'red', titulo: 'Nada programado todavía', texto: 'Escribe un saludo, una oferta o un recordatorio y elige el día. Toca una idea para empezar:' })}
      <div class="grouped">
        ${ideas().map((it, i) => `
          <button class="g-row" data-idea="${i}">
            ${badgeCategoria(it.categoria)}
            <div class="li-body"><div class="li-title">${esc(it.titulo)}</div><div class="li-sub">${esc(fechaCorta(it.fecha))} · ${esc(REPETICIONES.find((r) => r.id === it.repetir).nombre)}</div></div>
            ${icon('plus', 'chev')}
          </button>`).join('')}
      </div>`}`;

  el.querySelector('[data-nuevo]').addEventListener('click', () => abrirFormularioProgramado());
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirFormularioProgramado(b.dataset.editar)));
  el.querySelectorAll('[data-idea]').forEach((b) => b.addEventListener('click', () => abrirFormularioProgramado(null, ideas()[Number(b.dataset.idea)])));
}

/**
 * Formulario de mensaje programado: un cuadro en blanco para escribir,
 * la fecha y a quién.
 * @param {string|null} id  programado a editar (o null para uno nuevo)
 * @param {object} [base]   valores iniciales para uno nuevo
 */
export function abrirFormularioProgramado(id, base = {}) {
  const existente = id ? store.programado(id) : null;
  const p = existente ? structuredClone(existente) : {
    titulo: '', categoria: 'ofertas', texto: '', fecha: hoy(), repetir: 'no',
    destino: { tipo: 'todos' }, activa: true, ...structuredClone(base),
  };
  // Programados viejos con plantilla: se pasa su texto al cuadro para que lo edite
  if (!p.texto && p.plantillaId) p.texto = store.plantilla(p.plantillaId)?.texto || '';
  delete p.plantillaId;
  p.destino = { tipo: 'todos', etapas: [], ids: [], ...p.destino };
  let busqueda = '';

  abrirHoja({
    titulo: existente ? 'Editar mensaje programado' : 'Programar mensaje',
    alta: true,
    cuerpo: `
      <form id="f-prog" novalidate>
        <div class="field">
          <label for="p-texto">Tu mensaje</label>
          <textarea id="p-texto" class="textarea" name="texto" rows="6" placeholder="Escribe aquí tu mensaje…" ${existente ? '' : 'autofocus'}>${esc(p.texto || '')}</textarea>
          <span class="hint">Si es para varios clientes, toca para poner el dato de cada uno:</span>
          <div class="var-chips">
            ${VARIABLES.map((v) => `<button type="button" class="var-chip" data-var="${v.clave}" title="${esc(v.desc)}">+ ${esc(v.boton)}</button>`).join('')}
          </div>
          <div class="wa-preview mt-8" data-preview hidden><div class="bubble"></div></div>
          <span class="hint" data-preview-hint></span>
        </div>
        <div class="row">
          <div class="field">
            <label for="p-fecha">¿Qué día?</label>
            <input id="p-fecha" class="input" type="date" name="fecha" value="${esc(p.fecha)}" required>
          </div>
          <div class="field">
            <label for="p-rep">Repetir</label>
            <select id="p-rep" class="select" name="repetir">
              ${REPETICIONES.map((r) => `<option value="${r.id}" ${p.repetir === r.id ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="field">
          <span class="label">¿A quién?</span>
          <div class="segmented" data-destino>
            <button type="button" data-tipo="todos" class="${p.destino.tipo === 'todos' ? 'on' : ''}">Todos</button>
            <button type="button" data-tipo="etapas" class="${p.destino.tipo === 'etapas' ? 'on' : ''}">Por etapa</button>
            <button type="button" data-tipo="clientes" class="${p.destino.tipo === 'clientes' ? 'on' : ''}">Elegir</button>
          </div>
          <div data-etapas class="chips chips-wrap mt-8" ${p.destino.tipo === 'etapas' ? '' : 'hidden'}>
            ${ETAPAS.map((e) => `<button type="button" class="chip" data-etapa="${e.id}" aria-pressed="${p.destino.etapas.includes(e.id)}">${esc(e.nombre)}</button>`).join('')}
          </div>
          <div data-elegir class="mt-8" ${p.destino.tipo === 'clientes' ? '' : 'hidden'}>
            <label class="search" style="display:block;margin-bottom:8px">${icon('search')}<input class="input" type="search" placeholder="Buscar cliente…" data-buscar></label>
            <div class="pick-list" data-pick></div>
          </div>
          <div class="banner info mt-8">${icon('users')}<div data-resumen></div></div>
        </div>
        <div class="field">
          <label for="p-titulo">Nombre para recordarlo <span class="muted small">(opcional)</span></label>
          <input id="p-titulo" class="input" name="titulo" value="${esc(p.titulo)}" placeholder="Ej: Saludo de Navidad">
        </div>
        <div class="field">
          <span class="label">Tipo <span class="muted small">(opcional, para ordenarlo)</span></span>
          <div class="chips chips-wrap" data-cats>
            ${CATEGORIAS.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${p.categoria === c.id}">${icon(c.icon, 'i-sm')} ${esc(c.nombre)}</button>`).join('')}
          </div>
        </div>
        ${existente ? `
        <label class="g-row card" style="cursor:pointer">
          <div class="li-body"><b>Activo</b><span class="small muted">Si lo pausas, no aparecerá en Inicio.</span></div>
          <span class="switch"><input type="checkbox" name="activa" ${p.activa !== false ? 'checked' : ''}><span></span></span>
        </label>` : ''}
      </form>`,
    pie: `
      ${existente ? `<button class="btn btn-danger btn-icon" type="button" data-borrar aria-label="Eliminar">${icon('trash')}</button>` : `<button class="btn btn-outline" type="button" data-cancel>Cancelar</button>`}
      <button class="btn btn-primary" type="submit" form="f-prog">${icon('check')} ${existente ? 'Guardar' : 'Programar'}</button>`,
    montar: (el) => {
      const f = el.querySelector('#f-prog');
      const ta = f.texto;

      // Vista previa solo si usa datos del cliente ({nombre}…)
      const pintarPreview = () => {
        const usaVariables = /\{[a-z_]+\}/.test(ta.value);
        el.querySelector('[data-preview]').hidden = !usaVariables;
        const ejemplo = destinatarios(p)[0] || store.clientes()[0] || { nombre: 'María Gómez', vehiculoInteres: 'Kicks' };
        el.querySelector('[data-preview] .bubble').textContent = llenarTexto(ta.value, ejemplo);
        el.querySelector('[data-preview-hint]').textContent = usaVariables ? `Así le llega a ${ejemplo.nombre.split(' ')[0]}. Cada cliente verá sus propios datos.` : '';
      };
      const pintarResumen = () => {
        const n = destinatarios(p).length;
        el.querySelector('[data-resumen]').innerHTML = n
          ? `Le aparecerá para enviar a <b>${plural(n, 'cliente', 'clientes')}</b>.`
          : 'Todavía no hay clientes que cumplan esta condición.';
      };
      const pintarPick = () => {
        const q = norm(busqueda);
        const ids = new Set(p.destino.ids);
        const lista = store.clientes().filter((c) => !q || norm(c.nombre).includes(q) || norm(c.vehiculoInteres).includes(q) || norm(c.vehiculoComprado).includes(q));
        el.querySelector('[data-pick]').innerHTML = lista.length ? lista.slice(0, 300).map((c) => `
          <label class="pick-row">
            <input type="checkbox" value="${c.id}" ${ids.has(c.id) ? 'checked' : ''}>
            ${avatar(c.nombre)}
            <div class="li-body"><div class="li-title">${esc(c.nombre)}</div><div class="li-sub">${esc(c.vehiculoComprado || c.vehiculoInteres || '')}</div></div>
          </label>`).join('') : '<p class="muted small center" style="padding:16px">Sin resultados</p>';
        el.querySelectorAll('[data-pick] input').forEach((cb) => cb.addEventListener('change', () => {
          const s = new Set(p.destino.ids);
          cb.checked ? s.add(cb.value) : s.delete(cb.value);
          p.destino.ids = [...s];
          pintarResumen();
        }));
      };

      pintarPreview(); pintarResumen();
      if (p.destino.tipo === 'clientes') pintarPick();

      ta.addEventListener('input', pintarPreview);
      el.querySelectorAll('[data-var]').forEach((b) => b.addEventListener('click', () => {
        const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
        ta.value = ta.value.slice(0, s) + b.dataset.var + ta.value.slice(e);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = s + b.dataset.var.length;
        pintarPreview();
      }));
      el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
        p.categoria = b.dataset.cat;
        el.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }));

      el.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => {
        p.destino.tipo = b.dataset.tipo;
        el.querySelectorAll('[data-tipo]').forEach((x) => x.classList.toggle('on', x === b));
        el.querySelector('[data-etapas]').hidden = p.destino.tipo !== 'etapas';
        el.querySelector('[data-elegir]').hidden = p.destino.tipo !== 'clientes';
        if (p.destino.tipo === 'clientes') pintarPick();
        pintarResumen(); pintarPreview();
      }));
      el.querySelectorAll('[data-etapa]').forEach((b) => b.addEventListener('click', () => {
        const s = new Set(p.destino.etapas);
        s.has(b.dataset.etapa) ? s.delete(b.dataset.etapa) : s.add(b.dataset.etapa);
        p.destino.etapas = [...s];
        b.setAttribute('aria-pressed', String(s.has(b.dataset.etapa)));
        pintarResumen();
      }));
      el.querySelector('[data-buscar]').addEventListener('input', (e) => { busqueda = e.target.value; pintarPick(); });

      el.querySelector('[data-cancel]')?.addEventListener('click', () => cerrarHoja());
      el.querySelector('[data-borrar]')?.addEventListener('click', async () => {
        if (await confirmar({ titulo: '¿Eliminar este mensaje programado?', texto: 'Los mensajes que ya enviaste quedan en el historial de cada cliente.', si: 'Eliminar', peligro: true })) {
          store.eliminarProgramado(existente.id);
          aviso('Mensaje programado eliminado', { icono: 'trash' });
        }
      });

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!ta.value.trim()) { aviso('Escribe el mensaje', { icono: 'x' }); ta.focus(); return; }
        if (!f.fecha.value) { aviso('Elige el día', { icono: 'x' }); return; }
        if (p.destino.tipo === 'etapas' && !p.destino.etapas.length) { aviso('Elige al menos una etapa', { icono: 'x' }); return; }
        if (p.destino.tipo === 'clientes' && !p.destino.ids.length) { aviso('Elige al menos un cliente', { icono: 'x' }); return; }
        const texto = ta.value.trim();
        Object.assign(p, {
          titulo: f.titulo.value.trim() || texto.split('\n')[0].slice(0, 40),
          texto,
          fecha: f.fecha.value,
          repetir: f.repetir.value,
          activa: f.activa ? f.activa.checked : true,
        });
        store.guardarProgramado(p);
        cerrarHoja();
        const cuando = p.fecha <= hoy() ? 'Ya está en Inicio para enviar' : `Te aparecerá en Inicio el ${fechaCorta(p.fecha)}`;
        aviso(existente ? 'Cambios guardados' : `Programado. ${cuando}`, { ms: 5000 });
      });
    },
  });
}

// --- Recordatorios automáticos ------------------------------------------------------
function tabAutomaticos(el) {
  const r = store.reglas();
  el.innerHTML = `
    <div class="banner info mt-16">${icon('repeat', 'i-lg')}<div><strong>Te avisan solos</strong>
      El día que toca, el cliente aparece en Inicio. Tú escribes el mensaje y tocas <b>Enviar</b>.</div></div>
    <div class="stack mt-16">
      ${Object.entries(DESCRIPCION_REGLAS).map(([id, d]) => {
        const regla = r[id] || {};
        const cat = categoria(d.categoria);
        return `
          <div class="card rule-card">
            <div class="rule-top">
              <span class="icon-badge" data-color="${cat.color}">${icon(cat.icon)}</span>
              <div class="li-body"><b>${esc(d.titulo)}</b><p>${esc(d.texto)}</p></div>
              <span class="switch"><input type="checkbox" data-activa="${id}" ${regla.activa ? 'checked' : ''} aria-label="Activar ${esc(d.titulo)}"><span></span></span>
            </div>
            ${id === 'mantenimiento' && regla.activa ? `
            <div class="field" style="margin:0">
              <label for="r-meses">Cada cuántos meses</label>
              <input id="r-meses" class="input" type="number" min="1" max="24" inputmode="numeric" value="${Number(regla.meses) || 6}" data-meses>
            </div>` : ''}
          </div>`;
      }).join('')}
    </div>`;

  el.querySelectorAll('[data-activa]').forEach((cb) => cb.addEventListener('change', () => {
    store.actualizarRegla(cb.dataset.activa, { activa: cb.checked });
    aviso(cb.checked ? 'Activado' : 'Desactivado', { icono: cb.checked ? 'check' : 'x' });
  }));
  el.querySelector('[data-meses]')?.addEventListener('change', (e) => {
    const n = Math.min(24, Math.max(1, Number(e.target.value) || 6));
    store.actualizarRegla('mantenimiento', { meses: n });
    aviso(`Mantenimiento cada ${n} meses`);
  });
}
