// =============================================================================
// cliente-form.js — Formulario para crear o editar un cliente.
//
// Los datos de la venta salen del "formato" de la persona (formato.js): se piden
// las columnas de su cuaderno, en su orden y con sus nombres. Lo demás (etapa,
// seguimiento, negociación, cumpleaños, notas…) es igual para todos.
// Para agregar un campo que la app entienda: ponlo en CAMPOS (config.js) y con su
// valor inicial en store.nuevoCliente(). Aparecerá para agregarlo al formato.
// =============================================================================

import * as store from './store.js';
import { ETAPAS, ORIGENES, FORMAS_PAGO, DOCUMENTOS_CREDITO } from './config.js';
import { formato, valorDe, ponerValor, atributosEntrada, ejemplo } from './formato.js';
import { abrirHoja, cerrarHoja, aviso, icon } from './ui.js';
import { esc, hoy, sumarDias, nombreMes, diasDelMes, norm, telefonoInternacional } from './util.js';

const RAPIDOS = [
  { dias: 1, txt: 'Mañana' },
  { dias: 2, txt: 'En 2 días' },
  { dias: 7, txt: '1 semana' },
  { dias: 14, txt: '2 semanas' },
  { dias: 30, txt: '1 mes' },
];

const pesos = (n) => (Number(n) ? Number(n).toLocaleString('es-CO') : '');
// Tipos que caben de a dos por fila
const ANGOSTOS = ['numero', 'dinero', 'fecha'];

/** Selects de día y mes para un cumpleaños ('MM-DD'). */
function selectsCumple(clave, valor) {
  const [m, d] = (valor || '').split('-').map((x) => Number(x) || '');
  return `
    <div class="row">
      <select class="select" data-cumple-dia="${clave}" aria-label="Día">
        <option value="">Día</option>
        ${Array.from({ length: 31 }, (_, k) => `<option ${d === k + 1 ? 'selected' : ''}>${k + 1}</option>`).join('')}
      </select>
      <select class="select" data-cumple-mes="${clave}" aria-label="Mes">
        <option value="">Mes</option>
        ${Array.from({ length: 12 }, (_, k) => `<option value="${k + 1}" ${m === k + 1 ? 'selected' : ''}>${nombreMes(k + 1)}</option>`).join('')}
      </select>
    </div>`;
}

/** Un campo del formato. */
function campoFormato(col, c, vendido) {
  const v = valorDe(c, col);
  const id = `f-${col.id}`;
  const ancho = ANGOSTOS.includes(col.tipo) ? '' : 'ancho';
  const oculto = col.venta && !vendido ? 'hidden' : '';
  let entrada;
  if (col.tipo === 'sino') {
    const [si, no] = col.id === 'poliza' ? ['Sí la tomó', 'No la tomó'] : ['Sí', 'No'];
    entrada = `<div class="chips chips-wrap" data-sino="${col.id}">
      <button type="button" class="chip" data-v="si" aria-pressed="${v === 'si'}">${icon('check', 'i-sm')} ${si}</button>
      <button type="button" class="chip" data-v="no" aria-pressed="${v === 'no'}">${icon('x', 'i-sm')} ${no}</button>
    </div>`;
  } else if (col.tipo === 'cumple') {
    entrada = selectsCumple(col.id, v);
  } else if (col.tipo === 'largo') {
    entrada = `<textarea id="${id}" class="textarea" rows="3" data-campo="${col.id}">${esc(v)}</textarea>`;
  } else {
    const valor = col.tipo === 'dinero' ? pesos(v) : v;
    entrada = `<input id="${id}" class="input" data-campo="${col.id}" value="${esc(valor)}" ${atributosEntrada(col)} placeholder="${esc(ejemplo(col))}">`;
  }
  const etiqueta = ['sino', 'cumple'].includes(col.tipo) ? `<span class="label">${esc(col.titulo)}</span>` : `<label for="${id}">${esc(col.titulo)}</label>`;
  return `<div class="field ${ancho}" data-col="${col.id}" ${col.venta ? 'data-solo-venta' : ''} ${oculto}>${etiqueta}${entrada}</div>`;
}

/**
 * @param {string} [id] si viene, edita ese cliente; si no, crea uno nuevo
 * @param {{alGuardar?:(c:object)=>void, campos?:object, negociacion?:boolean, venta?:boolean}} [o]
 *        negociacion: abrir directo en la sección de negociación
 *        venta: "Registrar venta" (cliente que ya compró, con los datos de su cuaderno)
 */
export function abrirFormularioCliente(id, { alGuardar, campos, negociacion = false, venta = false } = {}) {
  const existente = id ? store.cliente(id) : null;
  const c = existente ? structuredClone(existente)
    : store.nuevoCliente(venta ? { etapa: 'vendido', fechaCompra: hoy(), ...campos } : { proximoSeguimiento: sumarDias(hoy(), 2), ...campos });
  const vendido = c.etapa === 'vendido';
  const modelos = store.ajustes().modelos || [];

  const cols = formato();
  const colNombre = cols.find((x) => x.id === 'nombre');
  const colTel = cols.find((x) => x.id === 'telefono');
  const otras = cols.filter((x) => !x.fijo);
  const enFormato = new Set(cols.map((x) => x.id));
  const hayDeProceso = otras.some((x) => !x.venta);
  const masAbierto = !vendido || !!(c.origen || (!enFormato.has('cumple') && c.cumple) || (!enFormato.has('email') && c.email) || (!enFormato.has('notas') && c.notas));

  abrirHoja({
    titulo: existente ? 'Editar cliente' : venta ? 'Registrar venta' : 'Nuevo cliente',
    alta: true,
    cuerpo: `
      <form id="f-cliente" novalidate autocomplete="off">
        <div class="field">
          <label for="f-nombre">${esc(colNombre.titulo)} *</label>
          <input id="f-nombre" class="input" name="nombre" value="${esc(c.nombre)}" placeholder="${esc(ejemplo(colNombre))}" autocapitalize="words" ${existente ? '' : 'autofocus'} required>
        </div>
        <div class="field">
          <label for="f-tel">${esc(colTel.titulo)} / WhatsApp *</label>
          <input id="f-tel" class="input" name="telefono" type="tel" inputmode="tel" value="${esc(c.telefono)}" placeholder="${esc(ejemplo(colTel))}" required>
          <span class="hint" data-tel-aviso></span>
        </div>

        <div class="field">
          <span class="label">Etapa</span>
          <div class="stage-picker" data-etapas>
            ${ETAPAS.map((e) => `<button type="button" data-color="${e.color}" data-etapa="${e.id}" class="${c.etapa === e.id ? 'on' : ''}">${esc(e.nombre)}</button>`).join('')}
          </div>
        </div>

        ${otras.length ? `
        <div class="venta-box" data-caja ${!vendido && !hayDeProceso ? 'hidden' : ''}>
          <div class="venta-tit">${icon('star', 'i-sm')} <span data-caja-tit>${vendido ? 'Datos de la venta' : 'Datos del cliente'}</span></div>
          <div class="form-grid">${otras.map((col) => campoFormato(col, c, vendido)).join('')}</div>
        </div>` : ''}

        <div class="field" data-solo-proceso ${vendido ? 'hidden' : ''}>
          <label for="f-veh">Vehículo de interés</label>
          <input id="f-veh" class="input" name="vehiculoInteres" list="dl-modelos" value="${esc(c.vehiculoInteres)}" placeholder="Ej: Kicks">
        </div>

        <div class="field" data-solo-proceso ${vendido ? 'hidden' : ''}>
          <span class="label">Próximo seguimiento</span>
          <input id="f-seg" class="input" name="proximoSeguimiento" type="date" value="${esc(c.proximoSeguimiento)}">
          <div class="chips chips-wrap mt-8" data-rapidos>
            ${RAPIDOS.map((r) => `<button type="button" class="chip" data-dias="${r.dias}">${r.txt}</button>`).join('')}
            <button type="button" class="chip" data-dias="">Ninguno</button>
          </div>
          <span class="hint">Ese día te aparecerá en "Inicio" para escribirle.</span>
        </div>

        <details class="form-extra" data-negociacion ${vendido ? 'hidden' : ''} ${negociacion || (!vendido && (c.precio || c.formaPago || c.version)) ? 'open' : ''}>
          <summary>${icon('tag', 'i-sm')} Negociación <span class="muted small">versión, precio, forma de pago, retoma</span></summary>
          <div class="row">
            <div class="field">
              <label for="f-version">Versión</label>
              <input id="f-version" class="input" name="version" value="${esc(c.version)}" placeholder="Ej: Exclusive CVT">
            </div>
            <div class="field">
              <label for="f-color">Color</label>
              <input id="f-color" class="input" name="color" value="${esc(c.color)}" placeholder="Ej: Gris">
            </div>
          </div>
          <div class="field">
            <label for="f-precio-cot">Precio cotizado</label>
            <input id="f-precio-cot" class="input" name="precioCotizado" inputmode="numeric" value="${esc(pesos(c.precio))}" placeholder="Ej: 109.990.000" data-dinero>
          </div>
          <div class="field">
            <span class="label">Forma de pago</span>
            <div class="chips chips-wrap" data-pagos>
              ${FORMAS_PAGO.map((p) => `<button type="button" class="chip" data-pago="${p.id}" aria-pressed="${c.formaPago === p.id}">${esc(p.nombre)}</button>`).join('')}
            </div>
            <span class="hint" data-hint-credito ${c.formaPago === 'credito' ? '' : 'hidden'}>En la ficha tendrás la lista de documentos del crédito.</span>
          </div>
          <div class="field">
            <label class="hstack" style="cursor:pointer">
              <span class="switch"><input type="checkbox" data-tiene-retoma ${c.retoma ? 'checked' : ''}><span></span></span>
              <span class="label">Tiene carro para retoma</span>
            </label>
            <input class="input" name="retoma" value="${esc(c.retoma === 'Sí' ? '' : c.retoma)}" placeholder="¿Cuál? Ej: Chevrolet Spark 2018" data-retoma ${c.retoma ? '' : 'hidden'}>
          </div>
        </details>

        <details class="form-extra" ${masAbierto ? 'open' : ''}>
          <summary>${icon('note', 'i-sm')} Más datos <span class="muted small">opcional</span></summary>
          ${enFormato.has('cumple') ? '' : `<div class="field"><span class="label">Cumpleaños</span>${selectsCumple('cumple', c.cumple)}<span class="hint">Para saludarlo en su día.</span></div>`}
          <div class="row">
            <div class="field">
              <label for="f-origen">¿Cómo llegó?</label>
              <select id="f-origen" class="select" name="origen">
                <option value="">—</option>
                ${ORIGENES.map((o) => `<option ${c.origen === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
              </select>
            </div>
            ${enFormato.has('email') ? '' : `<div class="field">
              <label for="f-email">Correo</label>
              <input id="f-email" class="input" data-campo-extra="email" type="email" inputmode="email" value="${esc(c.email)}" placeholder="opcional">
            </div>`}
          </div>
          ${enFormato.has('notas') ? '' : `<div class="field">
            <label for="f-notas">Notas</label>
            <textarea id="f-notas" class="textarea" data-campo-extra="notas" rows="3" placeholder="Color preferido, familia, lo que quieras recordar…">${esc(c.notas)}</textarea>
          </div>`}
        </details>
        <datalist id="dl-modelos">${modelos.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
      </form>`,
    pie: `
      <button class="btn btn-outline" type="button" data-cancelar>Cancelar</button>
      <button class="btn btn-primary" type="submit" form="f-cliente">${icon('check')} Guardar</button>`,
    montar: (el) => {
      const f = el.querySelector('#f-cliente');
      const $ = (sel) => el.querySelector(sel);
      let etapa = c.etapa;
      const on = $('[data-etapas] .on');
      if (on) on.parentElement.scrollLeft = on.offsetLeft - on.parentElement.offsetLeft - 16;

      $('[data-cancelar]').addEventListener('click', () => cerrarHoja());

      el.querySelectorAll('[data-etapa]').forEach((b) => b.addEventListener('click', () => {
        etapa = b.dataset.etapa;
        el.querySelectorAll('[data-etapa]').forEach((x) => x.classList.toggle('on', x === b));
        const v = etapa === 'vendido';
        el.querySelectorAll('[data-solo-venta]').forEach((x) => { x.hidden = !v; });
        el.querySelectorAll('[data-solo-proceso]').forEach((x) => { x.hidden = v; });
        $('[data-negociacion]').hidden = v;
        const caja = $('[data-caja]');
        if (caja) { caja.hidden = !v && !hayDeProceso; $('[data-caja-tit]').textContent = v ? 'Datos de la venta' : 'Datos del cliente'; }
        if (v) {
          const fc = $('[data-campo="fechaCompra"]'), vc = $('[data-campo="vehiculoComprado"]'), pv = $('[data-campo="precio"]');
          if (fc && !fc.value) fc.value = hoy();
          if (vc && !vc.value) vc.value = f.vehiculoInteres.value;
          if (pv && !pv.value && f.precioCotizado.value) pv.value = f.precioCotizado.value;
        }
      }));

      // Sí / No (tocar de nuevo lo quita)
      const sinos = Object.fromEntries(otras.filter((x) => x.tipo === 'sino').map((x) => [x.id, valorDe(c, x)]));
      el.querySelectorAll('[data-sino]').forEach((g) => g.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => {
        const k = g.dataset.sino;
        sinos[k] = sinos[k] === b.dataset.v ? '' : b.dataset.v;
        g.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === sinos[k])));
      })));
      // Plata con puntos de miles
      el.querySelectorAll('[data-dinero]').forEach((i) => i.addEventListener('input', () => {
        const n = Number(i.value.replace(/\D/g, ''));
        i.value = n ? n.toLocaleString('es-CO') : '';
      }));

      el.querySelectorAll('[data-rapidos] .chip').forEach((b) => b.addEventListener('click', () => {
        f.proximoSeguimiento.value = b.dataset.dias ? sumarDias(hoy(), Number(b.dataset.dias)) : '';
      }));

      // Negociación
      let formaPago = c.formaPago;
      el.querySelectorAll('[data-pago]').forEach((b) => b.addEventListener('click', () => {
        formaPago = formaPago === b.dataset.pago ? '' : b.dataset.pago; // tocar de nuevo la quita
        el.querySelectorAll('[data-pago]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.pago === formaPago)));
        $('[data-hint-credito]').hidden = formaPago !== 'credito';
      }));
      const tieneRetoma = $('[data-tiene-retoma]');
      tieneRetoma.addEventListener('change', () => {
        $('[data-retoma]').hidden = !tieneRetoma.checked;
        if (tieneRetoma.checked) $('[data-retoma]').focus();
      });
      if (negociacion) setTimeout(() => $('[data-negociacion]').scrollIntoView({ block: 'start', behavior: 'smooth' }), 150);

      // Avisar si el teléfono ya existe
      const tel = f.telefono;
      const avisoTel = $('[data-tel-aviso]');
      tel.addEventListener('input', () => {
        const cp = store.ajustes().codigoPais;
        const n = telefonoInternacional(tel.value, cp);
        const dup = n.length > 6 && store.clientes().find((x) => x.id !== c.id && telefonoInternacional(x.telefono, cp) === n);
        avisoTel.innerHTML = dup ? `<span class="field-error">Ya tienes a <b>${esc(dup.nombre)}</b> con este número.</span>` : '';
      });

      const leerCumple = (clave) => {
        const dia = Number($(`[data-cumple-dia="${clave}"]`)?.value), mes = Number($(`[data-cumple-mes="${clave}"]`)?.value);
        return dia && mes ? `${String(mes).padStart(2, '0')}-${String(Math.min(dia, diasDelMes(2024, mes))).padStart(2, '0')}` : '';
      };

      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const nombre = f.nombre.value.trim();
        const telefono = f.telefono.value.trim();
        f.nombre.classList.toggle('invalid', !nombre);
        f.telefono.classList.toggle('invalid', !telefono);
        if (!nombre || !telefono) {
          (nombre ? f.telefono : f.nombre).focus();
          aviso(`Falta ${!nombre ? 'el nombre' : 'el celular'}`, { icono: 'x' });
          return;
        }

        const etapaAnterior = existente?.etapa;
        // Columnas del formato
        for (const col of otras) {
          let v;
          if (col.tipo === 'sino') v = sinos[col.id] || '';
          else if (col.tipo === 'cumple') v = leerCumple(col.id);
          else {
            const i = $(`[data-campo="${col.id}"]`);
            if (!i) continue;
            v = col.tipo === 'dinero' ? Number(i.value.replace(/\D/g, '')) || '' : i.value.trim();
          }
          ponerValor(c, col, v);
        }
        Object.assign(c, {
          nombre: nombre.replace(/\s+/g, ' '),
          telefono, etapa,
          origen: f.origen.value,
          vehiculoInteres: f.vehiculoInteres.value.trim(),
          proximoSeguimiento: f.proximoSeguimiento.value,
          version: f.version.value.trim(),
          color: f.color.value.trim(),
          formaPago,
          retoma: tieneRetoma.checked ? (f.retoma.value.trim() || 'Sí') : '',
        });
        if (!enFormato.has('cumple')) c.cumple = leerCumple('cumple');
        el.querySelectorAll('[data-campo-extra]').forEach((i) => { c[i.dataset.campoExtra] = i.value.trim(); });
        // En negociación el precio es el cotizado; ya vendido, el valor de la venta
        if (etapa !== 'vendido') c.precio = Number(f.precioCotizado.value.replace(/\D/g, '')) || '';
        else if (!enFormato.has('precio') && !c.precio) c.precio = Number(f.precioCotizado.value.replace(/\D/g, '')) || '';
        if (etapa === 'vendido' && !c.fechaCompra && !enFormato.has('fechaCompra')) c.fechaCompra = hoy();
        if (etapa === 'vendido' && !c.vehiculoComprado && !enFormato.has('vehiculoComprado')) c.vehiculoComprado = c.vehiculoInteres;

        // Al elegir crédito, se arma la lista de documentos
        if (formaPago === 'credito' && !c.documentos?.length) {
          c.documentos = DOCUMENTOS_CREDITO.map((nombre, i) => ({ id: `doc_${Date.now().toString(36)}_${i}`, nombre, listo: false }));
        }
        if (existente && etapaAnterior !== etapa) {
          c.historial.unshift({ id: 'h_' + Date.now().toString(36), fecha: new Date().toISOString(), tipo: 'etapa', texto: etapa });
        }
        store.guardarCliente(c);
        recordarModelo(c.vehiculoInteres);
        recordarModelo(c.vehiculoComprado);
        cerrarHoja();
        aviso(existente ? 'Cambios guardados' : venta ? `Venta de ${c.nombre.split(' ')[0]} registrada` : `${c.nombre.split(' ')[0]} quedó registrado`);
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
