// =============================================================================
// views/mensajes.js — Mensajes programados, plantillas (por secciones) y
// mensajes automáticos.
// Rutas: #/mensajes/programados | #/mensajes/plantillas | #/mensajes/automaticos
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
  { id: 'plantillas', nombre: 'Plantillas' },
  { id: 'automaticos', nombre: 'Automáticos' },
];

// Ideas para programar con un toque
function ideas() {
  const y = new Date().getFullYear();
  const h = hoy();
  const fechaFutura = (mmdd) => (`${y}-${mmdd}` >= h ? `${y}-${mmdd}` : `${y + 1}-${mmdd}`);
  return [
    { titulo: 'Oferta del mes', categoria: 'ofertas', plantillaId: 'tpl-ofe-1', fecha: sumarDias(h, 1), repetir: 'no', destino: { tipo: 'etapas', etapas: ['nuevo', 'cotizado', 'negociando'] } },
    { titulo: 'Feliz Navidad', categoria: 'especiales', plantillaId: 'tpl-esp-navidad', fecha: fechaFutura('12-24'), repetir: 'anual', destino: { tipo: 'todos' } },
    { titulo: 'Feliz año nuevo', categoria: 'especiales', plantillaId: 'tpl-esp-anio', fecha: fechaFutura('12-31'), repetir: 'anual', destino: { tipo: 'todos' } },
    { titulo: 'Retomar contacto', categoria: 'seguimiento', plantillaId: 'tpl-seg-2', fecha: sumarDias(h, 1), repetir: 'no', destino: { tipo: 'etapas', etapas: ['cotizado'] } },
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
        <p>Programa saludos y ofertas. El día que toca te aparecen en "Inicio" listos para enviar.</p>
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
  else if (tab === 'plantillas') tabPlantillas(cont);
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
          return `
            <button class="list-item" data-editar="${p.id}" style="align-items:flex-start">
              ${badgeCategoria(p.categoria)}
              <div class="li-body">
                <div class="li-title">${esc(p.titulo || 'Mensaje programado')}</div>
                <div class="li-sub">${p.activa === false ? '<b>Pausado</b> · ' : ''}${prox ? `${esc(relativo(prox))}` : 'Ya pasó'} · ${esc(rep.nombre)} · ${plural(n, 'cliente', 'clientes')}</div>
                ${av && av.total ? `<div class="camp-progress" title="${av.listos} de ${av.total} enviados"><span style="width:${(av.listos / av.total) * 100}%"></span></div>
                  <div class="small muted mt-8">${av.listos} de ${av.total} enviados (${esc(relativo(av.fecha).toLowerCase())})</div>` : ''}
              </div>
              ${icon('chev-r', 'chev')}
            </button>`;
        }).join('')}
      </div>` : `
      ${vacio({ icono: 'calendar', color: 'red', titulo: 'Nada programado todavía', texto: 'Programa una oferta, un saludo de Navidad o un recordatorio. Toca una idea para empezar:' })}
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
 * Formulario de mensaje programado.
 * @param {string|null} id  programado a editar (o null para uno nuevo)
 * @param {object} [base]   valores iniciales para uno nuevo
 */
export function abrirFormularioProgramado(id, base = {}) {
  const existente = id ? store.programado(id) : null;
  const p = existente ? structuredClone(existente) : {
    titulo: '', categoria: 'ofertas', plantillaId: '', texto: '', fecha: hoy(), repetir: 'no',
    destino: { tipo: 'todos' }, activa: true, ...structuredClone(base),
  };
  if (!p.plantillaId && !p.texto) {
    p.plantillaId = store.plantillas().find((t) => t.categoria === p.categoria)?.id || '';
  }
  p.destino = { tipo: 'todos', etapas: [], ids: [], ...p.destino };
  let busqueda = '';

  abrirHoja({
    titulo: existente ? 'Editar mensaje programado' : 'Programar mensaje',
    alta: true,
    cuerpo: `
      <form id="f-prog" novalidate>
        <div class="field">
          <label for="p-titulo">Nombre</label>
          <input id="p-titulo" class="input" name="titulo" value="${esc(p.titulo)}" placeholder="Ej: Oferta Kicks octubre">
        </div>
        <div class="field">
          <span class="label">Sección</span>
          <div class="chips chips-wrap" data-cats>
            ${CATEGORIAS.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${p.categoria === c.id}">${icon(c.icon, 'i-sm')} ${esc(c.nombre)}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label for="p-tpl">Mensaje</label>
          <select id="p-tpl" class="select" name="plantillaId"></select>
          <textarea class="textarea mt-8" name="texto" rows="5" placeholder="Escribe tu mensaje. Puedes usar {nombre}, {vehiculo}…" ${p.plantillaId ? 'hidden' : ''}>${esc(p.texto || '')}</textarea>
          <div class="wa-preview mt-8" data-preview><div class="bubble"></div></div>
          <span class="hint" data-preview-hint></span>
        </div>
        <div class="row">
          <div class="field">
            <label for="p-fecha">Fecha</label>
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
        ${existente ? `
        <label class="g-row card" style="cursor:pointer">
          <div class="li-body"><b>Activo</b><span class="small muted">Si lo pausas, no aparecerá en "Inicio".</span></div>
          <span class="switch"><input type="checkbox" name="activa" ${p.activa !== false ? 'checked' : ''}><span></span></span>
        </label>` : ''}
      </form>`,
    pie: `
      ${existente ? `<button class="btn btn-danger btn-icon" type="button" data-borrar aria-label="Eliminar">${icon('trash')}</button>` : `<button class="btn btn-outline" type="button" data-cancel>Cancelar</button>`}
      <button class="btn btn-primary" type="submit" form="f-prog">${icon('check')} ${existente ? 'Guardar' : 'Programar'}</button>`,
    montar: (el) => {
      const f = el.querySelector('#f-prog');
      const selTpl = f.plantillaId;
      const ta = f.texto;
      const ejemplo = destinatarios(p)[0] || store.clientes()[0] || { nombre: 'María Gómez', vehiculoInteres: 'Kicks' };

      const pintarPlantillas = () => {
        const ps = store.plantillas().filter((t) => t.categoria === p.categoria);
        const otras = store.plantillas().filter((t) => t.categoria !== p.categoria);
        selTpl.innerHTML = `
          ${ps.map((t) => `<option value="${t.id}">${esc(t.titulo)}</option>`).join('')}
          ${otras.length ? `<optgroup label="Otras secciones">${otras.map((t) => `<option value="${t.id}">${esc(t.titulo)}</option>`).join('')}</optgroup>` : ''}
          <option value="">✏️ Escribir mi propio mensaje</option>`;
        selTpl.value = p.plantillaId || '';
        if (p.plantillaId && selTpl.value !== p.plantillaId) { p.plantillaId = ps[0]?.id || ''; selTpl.value = p.plantillaId; }
      };
      const pintarPreview = () => {
        const texto = p.plantillaId ? store.plantilla(p.plantillaId)?.texto : ta.value;
        ta.hidden = !!p.plantillaId;
        el.querySelector('[data-preview] .bubble').textContent = llenarTexto(texto || '…', ejemplo);
        el.querySelector('[data-preview-hint]').textContent = `Vista previa con ${ejemplo.nombre.split(' ')[0]}. Cada cliente verá su propio nombre.`;
      };
      const pintarResumen = () => {
        const n = destinatarios(p).length;
        el.querySelector('[data-resumen]').innerHTML = n
          ? `Le llegará a <b>${plural(n, 'cliente', 'clientes')}</b>.`
          : 'Todavía no hay clientes que cumplan esta condición.';
      };
      const pintarPick = () => {
        const q = norm(busqueda);
        const ids = new Set(p.destino.ids);
        const lista = store.clientes().filter((c) => !q || norm(c.nombre).includes(q) || norm(c.vehiculoInteres).includes(q));
        el.querySelector('[data-pick]').innerHTML = lista.length ? lista.slice(0, 300).map((c) => `
          <label class="pick-row">
            <input type="checkbox" value="${c.id}" ${ids.has(c.id) ? 'checked' : ''}>
            ${avatar(c.nombre)}
            <div class="li-body"><div class="li-title">${esc(c.nombre)}</div><div class="li-sub">${esc(c.vehiculoInteres || '')}</div></div>
          </label>`).join('') : '<p class="muted small center" style="padding:16px">Sin resultados</p>';
        el.querySelectorAll('[data-pick] input').forEach((cb) => cb.addEventListener('change', () => {
          const s = new Set(p.destino.ids);
          cb.checked ? s.add(cb.value) : s.delete(cb.value);
          p.destino.ids = [...s];
          pintarResumen();
        }));
      };

      pintarPlantillas(); pintarPreview(); pintarResumen();
      if (p.destino.tipo === 'clientes') pintarPick();

      el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
        p.categoria = b.dataset.cat;
        el.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (p.plantillaId) p.plantillaId = store.plantillas().find((t) => t.categoria === p.categoria)?.id || '';
        pintarPlantillas(); pintarPreview();
      }));
      selTpl.addEventListener('change', () => { p.plantillaId = selTpl.value; pintarPreview(); if (!p.plantillaId) ta.focus(); });
      ta.addEventListener('input', pintarPreview);

      el.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => {
        p.destino.tipo = b.dataset.tipo;
        el.querySelectorAll('[data-tipo]').forEach((x) => x.classList.toggle('on', x === b));
        el.querySelector('[data-etapas]').hidden = p.destino.tipo !== 'etapas';
        el.querySelector('[data-elegir]').hidden = p.destino.tipo !== 'clientes';
        if (p.destino.tipo === 'clientes') pintarPick();
        pintarResumen();
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
        if (!f.fecha.value) { aviso('Elige una fecha', { icono: 'x' }); return; }
        if (!p.plantillaId && !ta.value.trim()) { aviso('Escribe el mensaje', { icono: 'x' }); ta.focus(); return; }
        if (p.destino.tipo === 'etapas' && !p.destino.etapas.length) { aviso('Elige al menos una etapa', { icono: 'x' }); return; }
        if (p.destino.tipo === 'clientes' && !p.destino.ids.length) { aviso('Elige al menos un cliente', { icono: 'x' }); return; }
        Object.assign(p, {
          titulo: f.titulo.value.trim() || store.plantilla(p.plantillaId)?.titulo || 'Mensaje programado',
          texto: p.plantillaId ? '' : ta.value.trim(),
          fecha: f.fecha.value,
          repetir: f.repetir.value,
          activa: f.activa ? f.activa.checked : true,
        });
        store.guardarProgramado(p);
        cerrarHoja();
        const cuando = p.fecha <= hoy() ? 'Ya está en "Inicio" para enviar' : `Te aparecerá en "Inicio" el ${fechaCorta(p.fecha)}`;
        aviso(existente ? 'Cambios guardados' : `Programado. ${cuando}`, { ms: 5000 });
      });
    },
  });
}

// --- Plantillas ---------------------------------------------------------------
function tabPlantillas(el) {
  el.innerHTML = `
    <p class="muted small mt-16">Mensajes listos para usar. Al enviarlos, <b>{nombre}</b> se cambia por el nombre del cliente, <b>{vehiculo}</b> por su carro, etc.</p>
    ${CATEGORIAS.map((cat) => {
      const ps = store.plantillas().filter((p) => p.categoria === cat.id);
      return `
        <div class="cat-head">
          <span class="icon-badge" data-color="${cat.color}">${icon(cat.icon)}</span>
          <h3>${esc(cat.nombre)}</h3>
          <button class="btn btn-ghost btn-sm" data-nueva="${cat.id}">${icon('plus', 'i-sm')} Nueva</button>
        </div>
        <div class="list">
          ${ps.length ? ps.map((p) => `
            <button class="tpl-card" data-editar="${p.id}">
              <h4>${esc(p.titulo)}</h4>
              <p>${esc(p.texto)}</p>
            </button>`).join('') : '<p class="muted small">Sin plantillas en esta sección.</p>'}
        </div>`;
    }).join('')}`;

  el.querySelectorAll('[data-nueva]').forEach((b) => b.addEventListener('click', () => abrirFormularioPlantilla(null, b.dataset.nueva)));
  el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => abrirFormularioPlantilla(b.dataset.editar)));
}

export function abrirFormularioPlantilla(id, cat = 'ofertas') {
  const existente = id ? store.plantilla(id) : null;
  const p = existente ? { ...existente } : { titulo: '', categoria: cat, texto: '' };
  const ejemplo = store.clientes()[0] || { nombre: 'María Gómez', vehiculoInteres: 'Kicks' };

  abrirHoja({
    titulo: existente ? 'Editar plantilla' : 'Nueva plantilla',
    alta: true,
    cuerpo: `
      <form id="f-tpl" novalidate>
        <div class="field">
          <label for="t-titulo">Nombre de la plantilla</label>
          <input id="t-titulo" class="input" name="titulo" value="${esc(p.titulo)}" placeholder="Ej: Bono de retoma" ${existente ? '' : 'autofocus'}>
        </div>
        <div class="field">
          <label for="t-cat">Sección</label>
          <select id="t-cat" class="select" name="categoria">
            ${CATEGORIAS.map((c) => `<option value="${c.id}" ${p.categoria === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="t-texto">Mensaje</label>
          <textarea id="t-texto" class="textarea" name="texto" rows="7" placeholder="Hola {nombre}, …">${esc(p.texto)}</textarea>
          <span class="hint">Toca para insertar:</span>
          <div class="var-chips">
            ${VARIABLES.map((v) => `<button type="button" class="var-chip" data-var="${v.clave}" title="${esc(v.desc)}">${esc(v.clave)}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <span class="label">Vista previa</span>
          <div class="wa-preview"><div class="bubble" data-bubble></div></div>
        </div>
      </form>`,
    pie: `
      ${existente ? `<button class="btn btn-danger btn-icon" type="button" data-borrar aria-label="Eliminar">${icon('trash')}</button>` : `<button class="btn btn-outline" type="button" data-cancel>Cancelar</button>`}
      <button class="btn btn-primary" type="submit" form="f-tpl">${icon('check')} Guardar</button>`,
    montar: (el) => {
      const f = el.querySelector('#f-tpl');
      const ta = f.texto;
      const prev = () => { el.querySelector('[data-bubble]').textContent = llenarTexto(ta.value || '…', ejemplo); };
      prev();
      ta.addEventListener('input', prev);
      el.querySelectorAll('[data-var]').forEach((b) => b.addEventListener('click', () => {
        const s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? ta.value.length;
        ta.value = ta.value.slice(0, s) + b.dataset.var + ta.value.slice(e);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = s + b.dataset.var.length;
        prev();
      }));
      el.querySelector('[data-cancel]')?.addEventListener('click', () => cerrarHoja());
      el.querySelector('[data-borrar]')?.addEventListener('click', async () => {
        if (store.plantillaEnUso(existente.id)) {
          aviso('Esta plantilla la usa un mensaje automático o programado. Cámbialo primero.', { icono: 'x', ms: 6000 });
          return;
        }
        if (await confirmar({ titulo: `¿Eliminar "${existente.titulo}"?`, si: 'Eliminar', peligro: true })) {
          store.eliminarPlantilla(existente.id);
          aviso('Plantilla eliminada', { icono: 'trash' });
        }
      });
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!ta.value.trim()) { aviso('Escribe el mensaje', { icono: 'x' }); ta.focus(); return; }
        Object.assign(p, { titulo: f.titulo.value.trim() || 'Sin nombre', categoria: f.categoria.value, texto: ta.value.trim() });
        store.guardarPlantilla(p);
        cerrarHoja();
        aviso('Plantilla guardada');
      });
    },
  });
}

// --- Automáticos --------------------------------------------------------------
function tabAutomaticos(el) {
  const r = store.reglas();
  el.innerHTML = `
    <div class="banner info mt-16">${icon('repeat', 'i-lg')}<div><strong>Funcionan solos</strong>
      El día que toca, el mensaje aparece en "Inicio" ya escrito. Tú solo revisas y tocas <b>Enviar</b>.</div></div>
    <div class="stack mt-16">
      ${Object.entries(DESCRIPCION_REGLAS).map(([id, d]) => {
        const regla = r[id];
        const cat = categoria(d.categoria);
        return `
          <div class="card rule-card">
            <div class="rule-top">
              <span class="icon-badge" data-color="${cat.color}">${icon(cat.icon)}</span>
              <div class="li-body"><b>${esc(d.titulo)}</b><p>${esc(d.texto)}</p></div>
              <span class="switch"><input type="checkbox" data-activa="${id}" ${regla.activa ? 'checked' : ''} aria-label="Activar ${esc(d.titulo)}"><span></span></span>
            </div>
            <div class="${id === 'mantenimiento' ? 'row' : ''}" style="${id === 'mantenimiento' ? 'grid-template-columns:1.6fr 1fr' : ''}" ${regla.activa ? '' : 'hidden'} data-opciones="${id}">
              <div class="field" style="margin:0">
                <label for="r-${id}">Plantilla</label>
                <select id="r-${id}" class="select" data-tpl="${id}">
                  ${CATEGORIAS.map((c) => {
                    const ps = store.plantillas().filter((p) => p.categoria === c.id);
                    return ps.length ? `<optgroup label="${esc(c.nombre)}">${ps.map((p) => `<option value="${p.id}" ${p.id === regla.plantillaId ? 'selected' : ''}>${esc(p.titulo)}</option>`).join('')}</optgroup>` : '';
                  }).join('')}
                </select>
              </div>
              ${id === 'mantenimiento' ? `
              <div class="field" style="margin:0">
                <label for="r-meses">Cada cuántos meses</label>
                <input id="r-meses" class="input" type="number" min="1" max="24" inputmode="numeric" value="${Number(regla.meses) || 6}" data-meses>
              </div>` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;

  el.querySelectorAll('[data-activa]').forEach((cb) => cb.addEventListener('change', () => {
    store.actualizarRegla(cb.dataset.activa, { activa: cb.checked });
    aviso(cb.checked ? 'Activado' : 'Desactivado', { icono: cb.checked ? 'check' : 'x' });
  }));
  el.querySelectorAll('[data-tpl]').forEach((s) => s.addEventListener('change', () => {
    store.actualizarRegla(s.dataset.tpl, { plantillaId: s.value });
    aviso('Plantilla actualizada');
  }));
  el.querySelector('[data-meses]')?.addEventListener('change', (e) => {
    const n = Math.min(24, Math.max(1, Number(e.target.value) || 6));
    store.actualizarRegla('mantenimiento', { meses: n });
    aviso(`Mantenimiento cada ${n} meses`);
  });
}
