// =============================================================================
// formato-editor.js — Pantalla "Tu formato": elegir las columnas con que la
// persona anota a sus clientes (orden, nombres, agregar y quitar).
// Se guarda solo con cada cambio. Quitar una columna no borra datos: solo deja
// de pedirse y de mostrarse.
// =============================================================================

import { CAMPOS, TIPOS_COLUMNA } from './config.js';
import { formato, guardarFormato, infoColumna, idPropio, columnaPorTitulo, PRESETS, tieneFormato } from './formato.js';
import { abrirHoja, cerrarHoja, aviso, icon, confirmar } from './ui.js';
import { esc, debounce } from './util.js';
import * as nube from './nube.js';

const NOMBRE_TIPO = { texto: 'Texto', numero: 'Número', tel: 'Celular', vehiculo: 'Vehículo', dinero: 'Plata', fecha: 'Fecha', cumple: 'Día y mes', sino: 'Sí / No', email: 'Correo', largo: 'Texto largo' };

/** Descripción corta de una columna ("Plata · la app la entiende"). */
function detalle(c) {
  if (c.fijo) return `${NOMBRE_TIPO[c.tipo]} · siempre se pide`;
  if (c.propia) return `${NOMBRE_TIPO[c.tipo] || 'Texto'} · columna tuya`;
  const base = CAMPOS[c.id];
  return `${NOMBRE_TIPO[c.tipo]}${base && base.titulo !== c.titulo ? ` · es "${base.titulo}"` : ''}`;
}

export function abrirEditorFormato() {
  let cols = formato();

  const firma = () => JSON.stringify(cols.map(({ id, titulo, tipo }) => [id, titulo, tipo]));
  let guardado = firma();
  const guardar = () => { if (firma() !== guardado) { guardarFormato(cols); guardado = firma(); } };
  const guardarLuego = debounce(guardar, 500);

  const pintar = (el) => {
    el.querySelector('[data-cols]').innerHTML = cols.map((c, i) => `
      <div class="fmt-fila" data-i="${i}">
        <div class="fmt-mover">
          <button class="btn btn-ghost btn-icon btn-sm" type="button" data-subir="${i}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${icon('chev-l', 'i-sm rot-90')}</button>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" data-bajar="${i}" aria-label="Bajar" ${i === cols.length - 1 ? 'disabled' : ''}>${icon('chev-r', 'i-sm rot-90')}</button>
        </div>
        <div class="fmt-cuerpo">
          <input class="input" data-titulo="${i}" value="${esc(c.titulo)}" aria-label="Nombre de la columna">
          <span class="small muted">${esc(detalle(c))}</span>
        </div>
        ${c.fijo ? `<span class="fmt-candado" title="Siempre se pide">${icon('lock', 'i-sm')}</span>`
          : `<button class="btn btn-ghost btn-icon btn-sm" type="button" data-quitar="${i}" aria-label="Quitar columna">${icon('trash', 'i-sm')}</button>`}
      </div>`).join('');
  };

  abrirHoja({
    titulo: 'Tu formato',
    alta: true,
    cuerpo: `
      <p class="small muted">Son las columnas con que anotas a tus clientes, como en tu cuaderno. Con ellas se arman el formulario para <b>registrar una venta</b>, la tabla de clientes y la plantilla de Excel.</p>
      ${nube.enCuenta() ? `<div class="banner info mt-12">${icon('sparkles', 'i-lg')}<div><strong>¿Tienes cuaderno?</strong> Lee una foto de tu cuaderno con IA y la app te propone tus columnas tal cual.
        <div class="mt-8"><button class="btn btn-outline btn-sm" type="button" data-leer>${icon('scan', 'i-sm')} Leer una foto</button></div></div></div>` : ''}
      <div class="fmt-lista mt-12" data-cols></div>
      <div class="hstack mt-12" style="flex-wrap:wrap">
        <button class="btn btn-outline" type="button" data-agregar>${icon('plus', 'i-sm')} Agregar columna</button>
        <button class="btn btn-ghost" type="button" data-preset>${icon('repeat', 'i-sm')} Empezar con un modelo</button>
      </div>
      <p class="small muted mt-12">Quitar una columna no borra lo que ya escribiste: solo deja de pedirse. Nombre y Celular siempre van, porque sin celular no hay WhatsApp.</p>`,
    pie: `<button class="btn btn-primary btn-block" data-listo>${icon('check')} Listo</button>`,
    cerrar: () => guardar(),
    montar: (el) => {
      pintar(el);
      const lista = el.querySelector('[data-cols]');
      lista.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.subir) { const i = Number(b.dataset.subir); [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]; }
        else if (b.dataset.bajar) { const i = Number(b.dataset.bajar); [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]]; }
        else if (b.dataset.quitar) cols.splice(Number(b.dataset.quitar), 1);
        else return;
        guardar();
        pintar(el);
      });
      lista.addEventListener('input', (e) => {
        const i = e.target.dataset.titulo;
        if (i === undefined) return;
        cols[Number(i)] = { ...cols[Number(i)], titulo: e.target.value };
        guardarLuego();
      });
      lista.addEventListener('focusout', (e) => {
        const i = e.target.dataset.titulo;
        if (i !== undefined && !e.target.value.trim()) { cols[Number(i)] = infoColumna({ ...cols[Number(i)], titulo: '' }); guardar(); pintar(el); }
      });
      el.querySelector('[data-listo]').addEventListener('click', () => { guardar(); cerrarHoja(); aviso('Formato guardado'); });
      el.querySelector('[data-agregar]').addEventListener('click', () => { guardar(); elegirColumna(cols); });
      el.querySelector('[data-preset]').addEventListener('click', () => { guardar(); elegirModelo(); });
      el.querySelector('[data-leer]')?.addEventListener('click', async () => {
        guardar();
        cerrarHoja();
        const { importarDocumento } = await import('./documentos.js');
        importarDocumento();
      });
    },
  });
}

/** Agregar una columna: una que la app conoce o una propia. */
function elegirColumna(cols) {
  const ids = new Set(cols.map((c) => c.id));
  const disponibles = Object.entries(CAMPOS).filter(([id]) => !ids.has(id));
  abrirHoja({
    titulo: 'Agregar columna',
    cuerpo: `
      ${disponibles.length ? `<p class="small muted">Columnas que la app entiende (con ellas funcionan los recordatorios y los totales):</p>
      <div class="chips chips-wrap mt-8">${disponibles.map(([id, c]) => `<button class="chip" type="button" data-campo="${id}">${icon('plus', 'i-sm')} ${esc(c.titulo)}</button>`).join('')}</div>` : ''}
      <form class="mt-16" data-propia>
        <p class="small muted">O una columna tuya (por ejemplo <i>Placa</i>, <i>Financiera</i>, <i>Asesor</i>):</p>
        <div class="row mt-8">
          <div class="field"><label for="fc-nombre">Nombre</label><input id="fc-nombre" class="input" name="titulo" placeholder="Ej: Placa" autocapitalize="sentences"></div>
          <div class="field"><label for="fc-tipo">Tipo</label><select id="fc-tipo" class="select" name="tipo">${TIPOS_COLUMNA.map((t) => `<option value="${t.id}">${esc(t.nombre)}</option>`).join('')}</select></div>
        </div>
        <button class="btn btn-primary btn-block" type="submit">${icon('plus')} Agregar</button>
      </form>`,
    montar: (el) => {
      const agregar = (col) => {
        cols.push(infoColumna(col));
        guardarFormato(cols);
        aviso(`"${col.titulo || CAMPOS[col.id]?.titulo}" agregada`);
        abrirEditorFormato();
      };
      el.querySelectorAll('[data-campo]').forEach((b) => b.addEventListener('click', () => agregar({ id: b.dataset.campo })));
      el.querySelector('[data-propia]').addEventListener('submit', (e) => {
        e.preventDefault();
        const titulo = e.target.titulo.value.trim();
        if (!titulo) { e.target.titulo.focus(); return; }
        if (columnaPorTitulo(titulo, cols)) { aviso('Ya tienes una columna con ese nombre', { icono: 'x' }); return; }
        agregar({ id: idPropio(titulo, cols.map((c) => c.id)), titulo, tipo: e.target.tipo.value });
      });
    },
    cerrar: () => setTimeout(() => { if (!document.querySelector('.sheet:not([hidden])')) abrirEditorFormato(); }, 0),
  });
}

/** Reemplazar el formato por uno de los modelos. */
function elegirModelo() {
  abrirHoja({
    titulo: 'Empezar con un modelo',
    cuerpo: `
      <p class="small muted">Reemplaza tus columnas por las de un modelo. Después puedes cambiarlas como quieras.</p>
      <div class="grouped mt-12">
        ${PRESETS.map((p) => `<button class="g-row" type="button" data-p="${p.id}"><span class="icon-badge" data-color="blue">${icon('sheet')}</span><div class="li-body"><b>${esc(p.nombre)}</b><span class="small muted">${esc(p.sub)}</span></div>${icon('chev-r', 'chev')}</button>`).join('')}
      </div>`,
    montar: (el) => el.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', async () => {
      const p = PRESETS.find((x) => x.id === b.dataset.p);
      const ok = !tieneFormato() || await confirmar({ titulo: `¿Usar "${p.nombre}"?`, texto: 'Tus columnas actuales se reemplazan. Los datos de tus clientes no se borran.', si: 'Usar este modelo' });
      if (ok) { guardarFormato(p.columnas); aviso('Formato actualizado'); }
      abrirEditorFormato();
    })),
  });
}
