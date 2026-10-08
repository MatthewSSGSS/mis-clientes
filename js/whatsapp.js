// =============================================================================
// whatsapp.js — Arma los enlaces para abrir WhatsApp con el mensaje escrito.
//
// No se usa ninguna API ni se toca la cuenta de WhatsApp: la app solo abre
// WhatsApp con el chat y el texto listos, y la persona toca "enviar".
// Así es 100% gratis y sin riesgo de bloqueo del número.
// =============================================================================

import * as store from './store.js';
import { telefonoInternacional, esMovil } from './util.js';

/** Modo efectivo: 'app' (whatsapp://) o 'web' (wa.me). */
function modo() {
  const pref = store.ajustes().abrirWhatsApp;
  if (pref === 'app' || pref === 'web') return pref;
  return esMovil ? 'app' : 'web';
}

export function numeroDe(cliente) {
  return telefonoInternacional(cliente?.telefono, store.ajustes().codigoPais);
}

/** Enlace para abrir el chat con el mensaje. Devuelve '' si no hay teléfono. */
export function enlace(cliente, texto = '') {
  const n = numeroDe(cliente);
  if (!n) return '';
  const t = encodeURIComponent(texto);
  return modo() === 'app'
    ? `whatsapp://send?phone=${n}${texto ? `&text=${t}` : ''}`
    : `https://wa.me/${n}${texto ? `?text=${t}` : ''}`;
}

/** Atributos extra para el <a>: los enlaces web se abren en otra pestaña. */
export function atributos() {
  return modo() === 'web' ? 'target="_blank" rel="noopener"' : '';
}

/** Abre WhatsApp desde código (cuando no hay un <a> a mano). */
export function abrir(cliente, texto) {
  const url = enlace(cliente, texto);
  if (!url) return false;
  if (modo() === 'web') window.open(url, '_blank', 'noopener');
  else window.location.href = url;
  return true;
}

export const enlaceLlamada = (cliente) => {
  const n = numeroDe(cliente);
  return n ? `tel:+${n}` : '';
};
