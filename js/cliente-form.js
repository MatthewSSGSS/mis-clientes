// =============================================================================
// cliente-form.js — Formulario para crear o editar un cliente.
// Para agregar un campo nuevo: ponlo en el HTML de abajo, léelo en `leer()`,
// y agrégalo con su valor inicial en store.nuevoCliente().
// =============================================================================

import * as store from './store.js';
import { ETAPAS, ORIGENES } from './config.js';
import { abrirHoja, cerrarHoja, aviso, icon } from './ui.js';
import { esc, hoy, sumarDias, nombreMes, diasDelMes, norm, telefonoInternacional } from './util.js';

const RAPIDOS = [
  { dias: 1, txt: 'Mañana' },
  { dias: 2, txt: 'En 2 días' },
  { dias: 7, txt: '1 semana' },
  { dias: 14, txt: '2 semanas' },
  { dias: 30, txt: '1 mes' },
];

/**
 * @param {string} [id] si viene, edita ese cliente; si no, crea uno nuevo
 * @param {{alGuardar?:(c:object)=>void, campos?:object}} [o]
 */
export function abrirFormularioCliente(id, { alGuardar, campos } = {}) {
  const existente = id ? store.cliente(id) : null;
  const c = existente ? structuredClone(existente) : store.nuevoCliente({ proximoSeguimiento: sumarDias(hoy(), 2), ...campos });
  const [cMes, cDia] = (c.cumple || '').split('-').map((x) => Number(x) || '');
  const modelos = store.ajustes().modelos || [];

  abrirHoja({
    titulo: existente ? 'Editar cliente' : 'Nuevo cliente',
    alta: true,
    cuerpo: `
      <form id="f-cliente" novalidate autocomplete="off">
        <div class="field">
          <label for="f-nombre">Nombre completo *</label>
          <input id="f-nombre" class="input" name="nombre" value="${esc(c.nombre)}" placeholder="Ej: María Fernanda Gómez" autocapitalize="words" ${existente ? '' : 'autofocus'} required>
        </div>
        <div class="field">
          <label for="f-tel">Celular / WhatsApp *</label>
          <input id="f-tel" class="input" name="telefono" type="tel" inputmode="tel" value="${esc(c.telefono)}" placeholder="Ej: 300 123 4567" required>
          <span class="hint" data-tel-aviso></span>
        </div>

        <div class="field">
          <span class="label">Etapa</span>
          <div class="stage-picker" data-etapas>
            ${ETAPAS.map((e) => `<button type="button" data-color="${e.color}" data-etapa="${e.id}" class="${c.etapa === e.id ? 'on' : ''}">${esc(e.nombre)}</button>`).join('')}
          </div>
        </div>

        <div class="field">
          <label for="f-veh">Vehículo de interés</label>
          <input id="f-veh" class="input" name="vehiculoInteres" list="dl-modelos" value="${esc(c.vehiculoInteres)}" placeholder="Ej: Kicks">
        </div>

        <div class="field">
          <span class="label">Próximo seguimiento</span>
          <input id="f-seg" class="input" name="proximoSeguimiento" type="date" value="${esc(c.proximoSeguimiento)}">
          <div class="chips chips-wrap mt-8" data-rapidos>
            ${RAPIDOS.map((r) => `<button type="button" class="chip" data-dias="${r.dias}">${r.txt}</button>`).join('')}
            <button type="button" class="chip" data-dias="">Ninguno</button>
          </div>
          <span class="hint">Ese día te aparecerá en "Inicio" para escribirle.</span>
        </div>

        <div class="field">
          <span class="label">Cumpleaños</span>
          <div class="row">
            <select class="select" name="cumpleDia" aria-label="Día">
              <option value="">Día</option>
              ${Array.from({ length: 31 }, (_, k) => `<option ${cDia === k + 1 ? 'selected' : ''}>${k + 1}</option>`).join('')}
            </select>
            <select class="select" name="cumpleMes" aria-label="Mes">
              <option value="">Mes</option>
              ${Array.from({ length: 12 }, (_, k) => `<option value="${k + 1}" ${cMes === k + 1 ? 'selected' : ''}>${nombreMes(k + 1)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label for="f-origen">¿Cómo llegó?</label>
            <select id="f-origen" class="select" name="origen">
              <option value="">—</option>
              ${ORIGENES.map((o) => `<option ${c.origen === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="f-email">Correo</label>
            <input id="f-email" class="input" name="email" type="email" inputmode="email" value="${esc(c.email)}" placeholder="opcional">
          </div>
        </div>

        <div data-compra ${c.etapa === 'vendido' || c.fechaCompra ? '' : 'hidden'}>
          <div class="row">
            <div class="field">
              <label for="f-comprado">Vehículo comprado</label>
              <input id="f-comprado" class="input" name="vehiculoComprado" list="dl-modelos" value="${esc(c.vehiculoComprado)}">
            </div>
            <div class="field">
              <label for="f-fcompra">Fecha de compra</label>
              <input id="f-fcompra" class="input" name="fechaCompra" type="date" value="${esc(c.fechaCompra)}">
            </div>
          </div>
        </div>

        <div class="field">
          <label for="f-notas">Notas</label>
          <textarea id="f-notas" class="textarea" name="notas" rows="4" placeholder="Color preferido, forma de pago, retoma, familia…">${esc(c.notas)}</textarea>
        </div>
        <datalist id="dl-modelos">${modelos.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
      </form>`,
    pie: `
      <button class="btn btn-outline" type="button" data-cancelar>Cancelar</button>
      <button class="btn btn-primary" type="submit" form="f-cliente">${icon('check')} Guardar</button>`,
    montar: (el) => {
      const f = el.querySelector('#f-cliente');
      let etapa = c.etapa;
      const on = el.querySelector('[data-etapas] .on');
      if (on) on.parentElement.scrollLeft = on.offsetLeft - on.parentElement.offsetLeft - 16;

      el.querySelector('[data-cancelar]').addEventListener('click', () => cerrarHoja());

      el.querySelectorAll('[data-etapa]').forEach((b) => b.addEventListener('click', () => {
        etapa = b.dataset.etapa;
        el.querySelectorAll('[data-etapa]').forEach((x) => x.classList.toggle('on', x === b));
        if (etapa === 'vendido') {
          el.querySelector('[data-compra]').hidden = false;
          if (!f.fechaCompra.value) f.fechaCompra.value = hoy();
          if (!f.vehiculoComprado.value) f.vehiculoComprado.value = f.vehiculoInteres.value;
        }
      }));

      el.querySelectorAll('[data-rapidos] .chip').forEach((b) => b.addEventListener('click', () => {
        f.proximoSeguimiento.value = b.dataset.dias ? sumarDias(hoy(), Number(b.dataset.dias)) : '';
      }));

      // Avisar si el teléfono ya existe
      const tel = f.telefono;
      const avisoTel = el.querySelector('[data-tel-aviso]');
      tel.addEventListener('input', () => {
        const cp = store.ajustes().codigoPais;
        const n = telefonoInternacional(tel.value, cp);
        const dup = n.length > 6 && store.clientes().find((x) => x.id !== c.id && telefonoInternacional(x.telefono, cp) === n);
        avisoTel.innerHTML = dup ? `<span class="field-error">Ya tienes a <b>${esc(dup.nombre)}</b> con este número.</span>` : '';
      });

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = f.nombre.value.trim();
        const telefono = f.telefono.value.trim();
        f.nombre.classList.toggle('invalid', !nombre);
        f.telefono.classList.toggle('invalid', !telefono);
        if (!nombre || !telefono) {
          (nombre ? f.telefono : f.nombre).focus();
          aviso('Falta el nombre o el celular', { icono: 'x' });
          return;
        }
        const dia = Number(f.cumpleDia.value), mes = Number(f.cumpleMes.value);
        const cumple = dia && mes ? `${String(mes).padStart(2, '0')}-${String(Math.min(dia, diasDelMes(2024, mes))).padStart(2, '0')}` : '';

        const etapaAnterior = existente?.etapa;
        Object.assign(c, {
          nombre: nombre.replace(/\s+/g, ' '),
          telefono, etapa, cumple,
          email: f.email.value.trim(),
          origen: f.origen.value,
          vehiculoInteres: f.vehiculoInteres.value.trim(),
          vehiculoComprado: f.vehiculoComprado.value.trim(),
          fechaCompra: f.fechaCompra.value,
          proximoSeguimiento: f.proximoSeguimiento.value,
          notas: f.notas.value.trim(),
        });
        if (existente && etapaAnterior !== etapa) {
          c.historial.unshift({ id: 'h_' + Date.now().toString(36), fecha: new Date().toISOString(), tipo: 'etapa', texto: etapa });
        }
        store.guardarCliente(c);
        recordarModelo(c.vehiculoInteres);
        recordarModelo(c.vehiculoComprado);
        cerrarHoja();
        aviso(existente ? 'Cambios guardados' : `${c.nombre.split(' ')[0]} quedó registrado`);
        alGuardar?.(c);
      });
    },
  });
}

/** Si escribe un modelo nuevo, se agrega a la lista de sugerencias. */
function recordarModelo(m) {
  if (!m) return;
  const modelos = store.ajustes().modelos || [];
  if (!modelos.some((x) => norm(x) === norm(m))) store.actualizarAjustes({ modelos: [...modelos, m] });
}
