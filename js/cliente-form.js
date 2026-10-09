// =============================================================================
// cliente-form.js — Formulario para crear o editar un cliente.
// Para agregar un campo nuevo: ponlo en el HTML de abajo, léelo en `leer()`,
// y agrégalo con su valor inicial en store.nuevoCliente().
// =============================================================================

import * as store from './store.js';
import { ETAPAS, ORIGENES, FORMAS_PAGO, DOCUMENTOS_CREDITO } from './config.js';
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
 * @param {{alGuardar?:(c:object)=>void, campos?:object, negociacion?:boolean, venta?:boolean}} [o]
 *        negociacion: abrir directo en la sección de negociación
 *        venta: "Registrar venta" (cliente que ya compró, con los datos del cuaderno)
 */
export function abrirFormularioCliente(id, { alGuardar, campos, negociacion = false, venta = false } = {}) {
  const existente = id ? store.cliente(id) : null;
  const c = existente ? structuredClone(existente)
    : store.nuevoCliente(venta ? { etapa: 'vendido', fechaCompra: hoy(), ...campos } : { proximoSeguimiento: sumarDias(hoy(), 2), ...campos });
  const vendido = c.etapa === 'vendido';
  const pesos = (n) => (Number(n) ? Number(n).toLocaleString('es-CO') : '');
  const [cMes, cDia] = (c.cumple || '').split('-').map((x) => Number(x) || '');
  const modelos = store.ajustes().modelos || [];

  abrirHoja({
    titulo: existente ? 'Editar cliente' : venta ? 'Registrar venta' : 'Nuevo cliente',
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
          <label for="f-cedula">Cédula o NIT</label>
          <input id="f-cedula" class="input" name="cedula" inputmode="numeric" value="${esc(c.cedula)}" placeholder="opcional">
        </div>

        <div class="venta-box" data-compra ${vendido ? '' : 'hidden'}>
          <div class="venta-tit">${icon('star', 'i-sm')} Datos de la venta</div>
          <div class="row">
            <div class="field">
              <label for="f-pedido">Pedido</label>
              <input id="f-pedido" class="input" name="pedido" inputmode="numeric" value="${esc(c.pedido)}" placeholder="Ej: 55480">
            </div>
            <div class="field">
              <label for="f-fcompra">Fecha de entrega</label>
              <input id="f-fcompra" class="input" name="fechaCompra" type="date" value="${esc(c.fechaCompra)}">
            </div>
          </div>
          <div class="field">
            <label for="f-comprado">Vehículo</label>
            <input id="f-comprado" class="input" name="vehiculoComprado" list="dl-modelos" value="${esc(c.vehiculoComprado)}" placeholder="Ej: Kicks Play Advance">
          </div>
          <div class="field">
            <label for="f-valor">Valor de la venta</label>
            <input id="f-valor" class="input" name="valorVenta" inputmode="numeric" value="${esc(pesos(c.precio))}" placeholder="Ej: 100.960.100" data-dinero>
          </div>
          <div class="field">
            <span class="label">Póliza</span>
            <div class="chips chips-wrap" data-polizas>
              <button type="button" class="chip" data-poliza="si" aria-pressed="${c.poliza === 'si'}">${icon('check', 'i-sm')} La tomó en Nissan</button>
              <button type="button" class="chip" data-poliza="no" aria-pressed="${c.poliza === 'no'}">${icon('x', 'i-sm')} No la tomó en Nissan</button>
            </div>
          </div>
          <div class="row">
            <div class="field">
              <label for="f-comi">Comisión</label>
              <input id="f-comi" class="input" name="comision" inputmode="numeric" value="${esc(pesos(c.comision))}" placeholder="Ej: 743.289" data-dinero>
            </div>
            <div class="field">
              <label for="f-fcomi">Pago de la comisión</label>
              <input id="f-fcomi" class="input" name="fechaPagoComision" type="date" value="${esc(c.fechaPagoComision)}">
            </div>
          </div>
        </div>

        <div class="field">
          <span class="label">Etapa</span>
          <div class="stage-picker" data-etapas>
            ${ETAPAS.map((e) => `<button type="button" data-color="${e.color}" data-etapa="${e.id}" class="${c.etapa === e.id ? 'on' : ''}">${esc(e.nombre)}</button>`).join('')}
          </div>
        </div>

        <div class="field" data-interes ${vendido ? 'hidden' : ''}>
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
            <label for="f-precio">Precio cotizado</label>
            <input id="f-precio" class="input" name="precio" inputmode="numeric" value="${c.precio ? esc(Number(c.precio).toLocaleString('es-CO')) : ''}" placeholder="Ej: 109.990.000" data-precio>
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
        const v = etapa === 'vendido';
        el.querySelector('[data-compra]').hidden = !v;
        el.querySelector('[data-interes]').hidden = v;
        el.querySelector('[data-negociacion]').hidden = v;
        if (v) {
          if (!f.fechaCompra.value) f.fechaCompra.value = hoy();
          if (!f.vehiculoComprado.value) f.vehiculoComprado.value = f.vehiculoInteres.value;
          if (!f.valorVenta.value && f.precio.value) f.valorVenta.value = f.precio.value;
        }
      }));

      // Venta: póliza (tocar de nuevo la quita) y valores con puntos de miles
      let poliza = c.poliza;
      el.querySelectorAll('[data-poliza]').forEach((b) => b.addEventListener('click', () => {
        poliza = poliza === b.dataset.poliza ? '' : b.dataset.poliza;
        el.querySelectorAll('[data-poliza]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.poliza === poliza)));
      }));
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
        el.querySelector('[data-hint-credito]').hidden = formaPago !== 'credito';
      }));
      const precio = el.querySelector('[data-precio]');
      precio.addEventListener('input', () => {
        const n = Number(precio.value.replace(/\D/g, ''));
        precio.value = n ? n.toLocaleString('es-CO') : '';
      });
      const tieneRetoma = el.querySelector('[data-tiene-retoma]');
      tieneRetoma.addEventListener('change', () => {
        el.querySelector('[data-retoma]').hidden = !tieneRetoma.checked;
        if (tieneRetoma.checked) el.querySelector('[data-retoma]').focus();
      });
      if (negociacion) setTimeout(() => el.querySelector('[data-negociacion]').scrollIntoView({ block: 'start', behavior: 'smooth' }), 150);

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
          version: f.version.value.trim(),
          color: f.color.value.trim(),
          precio: (etapa === 'vendido' ? Number(f.valorVenta.value.replace(/\D/g, '')) : Number(f.precio.value.replace(/\D/g, ''))) || '',
          cedula: f.cedula.value.trim(),
          pedido: f.pedido.value.trim(),
          poliza,
          comision: Number(f.comision.value.replace(/\D/g, '')) || '',
          fechaPagoComision: f.fechaPagoComision.value,
          formaPago,
          retoma: tieneRetoma.checked ? (f.retoma.value.trim() || 'Sí') : '',
        });
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
