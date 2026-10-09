// =============================================================================
// sincro.js — Une dos copias de los datos (la de este equipo y la de la nube).
//
// Reglas:
//   • Clientes, citas, plantillas, programados y listas leídas: por id, gana la versión con
//     `actualizado` más reciente. El historial de un cliente se une (no se
//     pierden notas ni mensajes hechos en otro equipo).
//   • Lo borrado (registro `borrados`) no vuelve, salvo que se haya editado
//     después de borrarse.
//   • Envíos: se unen todos; los que se deshicieron no vuelven.
//   • Ajustes y reglas: gana la copia cambiada más recientemente. Los ajustes
//     de este equipo (PIN, sesión) se conservan.
// Es una función pura: no toca el store, solo devuelve la unión.
// =============================================================================

import { migrar, AJUSTES_LOCALES } from './store.js';

const fechaDe = (x) => x?.actualizado || x?.creado || '';

function unirBorrados(a, b) {
  const out = { ...a };
  for (const [id, f] of Object.entries(b)) if (!out[id] || f > out[id]) out[id] = f;
  return out;
}

/** Une dos listas por id quedándose con la versión más reciente de cada elemento. */
function unirPorId(listaA, listaB, borrados, alUnir) {
  const mapa = new Map();
  for (const x of [...listaA, ...listaB]) {
    if (!x?.id) continue;
    const previo = mapa.get(x.id);
    if (!previo) { mapa.set(x.id, x); continue; }
    const [nuevo, viejo] = fechaDe(x) > fechaDe(previo) ? [x, previo] : [previo, x];
    mapa.set(x.id, alUnir ? alUnir(nuevo, viejo) : nuevo);
  }
  return [...mapa.values()].filter((x) => {
    const b = borrados[x.id];
    return !b || fechaDe(x) > b;
  });
}

/**
 * Une la copia local con la remota.
 * @param {object} local  datos de este equipo
 * @param {object} remoto datos de la nube
 * @returns {object} datos unidos (schema actual)
 */
export function fusionar(local, remoto) {
  const L = migrar(structuredClone(local));
  const R = migrar(structuredClone(remoto));
  const borrados = unirBorrados(L.borrados, R.borrados);
  const envioBorrado = (key, fecha) => {
    const b = borrados[`envio:${key}`];
    return b && (fecha || '') <= b;
  };

  // Clientes: gana el más reciente, pero el historial se une
  const clientes = unirPorId(L.clientes, R.clientes, borrados, (nuevo, viejo) => {
    const hist = new Map();
    for (const h of [...(viejo.historial || []), ...(nuevo.historial || [])]) if (h?.id) hist.set(h.id, h);
    const historial = [...hist.values()]
      .filter((h) => !(h.key && envioBorrado(h.key, h.fecha)))
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    return { ...nuevo, historial };
  }).sort((a, b) => (b.creado || '').localeCompare(a.creado || ''));

  // Envíos: unión por clave + fecha
  const envMap = new Map();
  for (const e of [...L.envios, ...R.envios]) {
    if (!e?.key || envioBorrado(e.key, e.fecha)) continue;
    envMap.set(`${e.key}|${e.fecha}`, e);
  }
  const envios = [...envMap.values()].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 5000);

  // Ajustes: los cambiados más recientemente, sin tocar los de este equipo
  const ajustesBase = (L.ajustes.actualizado || '') >= (R.ajustes.actualizado || '') ? L.ajustes : R.ajustes;
  const ajustes = { ...ajustesBase };
  for (const k of AJUSTES_LOCALES) ajustes[k] = L.ajustes[k];

  const reglasL = (L.reglasActualizado || '') >= (R.reglasActualizado || '');

  return {
    schema: L.schema,
    ajustes,
    clientes,
    citas: unirPorId(L.citas, R.citas, borrados),
    plantillas: unirPorId(L.plantillas, R.plantillas, borrados),
    programados: unirPorId(L.programados, R.programados, borrados),
    lecturas: unirPorId(L.lecturas, R.lecturas, borrados),
    reglas: reglasL ? L.reglas : R.reglas,
    reglasActualizado: reglasL ? L.reglasActualizado : R.reglasActualizado,
    envios,
    borrados,
  };
}
