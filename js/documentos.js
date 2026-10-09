// =============================================================================
// documentos.js — Pasar clientes desde PDF, Word, fotos del cuaderno o una
// lista escrita/pegada.
//
// Cómo funciona:
//   1. Se saca el texto del archivo:
//      • Word (.docx)  → mammoth.js
//      • PDF con texto → pdf.js
//      • PDF escaneado o foto → OCR con tesseract.js (lee letras de imágenes)
//   2. Si el texto es una tabla con encabezados (Nombre, Celular…), se usa la
//      misma importación que el Excel.
//   3. Si no, cada línea se analiza buscando un celular, un nombre, un modelo
//      de carro, correo y fechas (`lineasAClientes`).
//   4. Siempre se muestra una pantalla para revisar y corregir antes de guardar.
// Las librerías se descargan solo cuando se usan (necesitan internet).
// =============================================================================

import * as store from './store.js';
import { abrirHoja, cerrarHoja, aviso, icon } from './ui.js';
import {
  esc, plural, uid, telefonoInternacional, elegirArchivo, leerArchivo, cargarScript, esIOS,
} from './util.js';
import {
  importarExcel, importarContactos, filasAClientes, vistaPreviaImportacion, ETIQUETAS, aCumple, descargarPlantillaVentas,
} from './importar.js';
import { pareceCuaderno, lineasAVentas, revisarVentas } from './cuaderno.js';

const LIBS = {
  mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
};
const MAX_PAGINAS_OCR = 15;

// --- Menú "Importar clientes" --------------------------------------------------
export function menuImportar() {
  const opciones = [
    { id: 'pegar', icono: 'note', color: 'green', titulo: 'Pegar el texto de la foto del cuaderno', sub: 'La forma más confiable: copias el texto de la foto con el iPhone y lo pegas aquí' },
    { id: 'doc', icono: 'scan', color: 'red', titulo: 'Foto o PDF del cuaderno', sub: 'La app intenta leer la letra; revisa los números' },
    { id: 'excel', icono: 'sheet', color: 'violet', titulo: 'Excel o CSV', sub: 'Con las columnas del cuaderno, o al menos Nombre y Celular' },
    { id: 'plantilla', icono: 'download', color: 'amber', titulo: 'Descargar plantilla de Excel', sub: 'Con las mismas columnas del cuaderno, para llenarla y luego importarla' },
    { id: 'vcf', icono: 'contact', color: 'blue', titulo: 'Contactos (.vcf)', sub: 'Exportados de iCloud, Google o tu celular' },
  ];
  abrirHoja({
    titulo: 'Importar clientes',
    cuerpo: `
      <div class="grouped">
        ${opciones.map((o) => `
          <button class="g-row" data-op="${o.id}">
            <span class="icon-badge" data-color="${o.color}">${icon(o.icono)}</span>
            <div class="li-body"><b>${esc(o.titulo)}</b><span class="small muted">${esc(o.sub)}</span></div>
            ${icon('chev-r', 'chev')}
          </button>`).join('')}
      </div>`,
    montar: (el) => el.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', () => {
      const op = b.dataset.op;
      cerrarHoja();
      // El selector de archivos debe abrirse dentro del mismo toque
      if (op === 'doc') importarDocumento();
      else if (op === 'excel') importarExcel();
      else if (op === 'vcf') importarContactos();
      else if (op === 'plantilla') descargarPlantillaVentas();
      else setTimeout(escribirLista, 60);
    })),
  });
}

// --- Escribir o pegar una lista -----------------------------------------------
export function escribirLista() {
  abrirHoja({
    titulo: 'Pegar o escribir ventas',
    alta: true,
    cuerpo: `
      <details class="form-extra" ${esIOS ? 'open' : ''}>
        <summary>${icon('scan', 'i-sm')} Cómo copiar el texto de la foto en el iPhone</summary>
        <ol class="install-steps" style="margin-bottom:14px">
          <li><span>Toma la foto de la hoja del cuaderno (bien derecha y con buena luz).</span></li>
          <li><span>Ábrela en <b>Fotos</b> y toca el botón de <b>texto</b> (un cuadrito con líneas, abajo a la derecha).</span></li>
          <li><span>Toca <b>"Seleccionar todo"</b> y luego <b>"Copiar"</b>.</span></li>
          <li><span>Vuelve aquí, mantén el dedo en el cuadro de abajo y toca <b>"Pegar"</b>.</span></li>
        </ol>
      </details>
      <p class="small muted">También puedes escribir una venta por línea, en el orden del cuaderno. No importan los separadores.</p>
      <div class="field mt-12">
        <textarea id="lista-txt" class="textarea" rows="12" autofocus placeholder="55480 Kicks Play Premium Dairo Luis Luna Melendez X 1052037922 3015929877 $100.960.100 08 ENE $743.289 20 FEB"></textarea>
      </div>`,
    pie: `<button class="btn btn-outline" data-cancel>Cancelar</button><button class="btn btn-primary" data-ok>Continuar ${icon('chev-r')}</button>`,
    montar: (el) => {
      el.querySelector('[data-cancel]').addEventListener('click', () => cerrarHoja());
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const lineas = el.querySelector('#lista-txt').value.split(/\r?\n/);
        procesarLineas(lineas, { origen: 'Importado de una lista' });
      });
    },
  });
}

// --- Importar PDF / Word / foto ------------------------------------------------
export async function importarDocumento() {
  const file = await elegirArchivo('.pdf,.docx,.doc,.txt,image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  if (!file) return;
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith('.doc')) {
    aviso('Ese es un Word antiguo (.doc). Ábrelo y guárdalo como .docx o PDF.', { icono: 'x', ms: 7000 });
    return;
  }

  const prog = ventanaProgreso(`Leyendo ${file.name}`);
  try {
    let lineas, ocr = false;
    const origen = `Importado de ${file.name}`;
    if (nombre.endsWith('.docx')) {
      const r = await leerWord(file, prog, origen);
      if (r.listo) return prog.terminar();
      lineas = r.lineas;
    } else if (nombre.endsWith('.pdf') || file.type === 'application/pdf') {
      ({ lineas, ocr } = await leerPDF(file, prog));
    } else if (nombre.endsWith('.txt') || file.type.startsWith('text/')) {
      lineas = (await leerArchivo(file)).split(/\r?\n/);
    } else if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/.test(nombre)) {
      lineas = await ocr_([await imagenACanvas(file)], prog);
      ocr = true;
    } else {
      throw new Error('formato');
    }
    if (prog.cancelado()) return;
    prog.terminar();
    procesarLineas(lineas, { ocr, origen, archivo: file.name });
  } catch (e) {
    console.error(e);
    prog.terminar(true);
    const msg = e.message === 'Sin conexión' ? 'Necesitas internet para leer este tipo de archivo.'
      : e.message === 'formato' ? 'Ese tipo de archivo no lo puedo leer. Usa PDF, Word (.docx) o una foto.'
      : e.message === 'imagen' ? 'No pude abrir la foto. Prueba tomarla de nuevo o guardarla como JPG.'
      : 'No pude leer el archivo. Si es una foto, intenta con más luz y la hoja derecha.';
    aviso(msg, { icono: 'x', ms: 7000 });
  }
}

/** Ventana con barra de progreso mientras se lee el archivo. */
function ventanaProgreso(titulo) {
  let cancelado = false, terminado = false;
  const el = abrirHoja({
    titulo: 'Leyendo documento',
    cuerpo: `
      <p class="small muted" style="word-break:break-word">${esc(titulo)}</p>
      <div class="camp-progress mt-16" style="height:8px"><span data-barra style="width:4%;transition:width .3s"></span></div>
      <p class="mt-12" data-estado style="font-weight:600">Preparando…</p>
      <p class="small muted mt-8">Las fotos pueden tardar un poco. No cierres la app.</p>`,
    cerrar: () => { if (!terminado) cancelado = true; },
  });
  return {
    texto: (t) => { const x = el.querySelector('[data-estado]'); if (x) x.textContent = t; },
    avance: (p) => { const x = el.querySelector('[data-barra]'); if (x) x.style.width = `${Math.max(4, Math.min(100, p * 100))}%`; },
    cancelado: () => cancelado,
    terminar: (cerrar = false) => { terminado = true; if (cerrar) cerrarHoja(); },
  };
}

// --- Lectores -----------------------------------------------------------------
async function leerWord(file, prog, origen) {
  prog.texto('Abriendo el documento de Word…');
  const mammoth = await cargarScript(LIBS.mammoth, 'mammoth');
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await leerArchivo(file, 'buffer') });
  prog.avance(0.7);
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // ¿Hay una tabla con encabezados? Se importa como un Excel.
  for (const tabla of doc.querySelectorAll('table')) {
    const filas = [...tabla.rows].map((tr) => [...tr.cells].map((td) => td.textContent.trim()));
    if (mostrarSiEsTabla(filas, origen, prog)) return { listo: true };
  }
  // Si no, línea por línea (párrafos, listas y filas de tablas sin encabezado)
  const lineas = [];
  doc.body.querySelectorAll('p, li, tr, h1, h2, h3, h4, h5, h6').forEach((el) => {
    if (el.tagName === 'TR') lineas.push([...el.cells].map((c) => c.textContent.trim()).join(' | '));
    else if (!el.closest('tr')) lineas.push(...el.textContent.split('\n'));
  });
  return { lineas };
}

async function leerPDF(file, prog) {
  prog.texto('Abriendo el PDF…');
  const pdfjsLib = await cargarScript(LIBS.pdfjs, 'pdfjsLib');
  pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await leerArchivo(file, 'buffer')) }).promise;
  const lineas = [];
  let letras = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    prog.texto(`Leyendo página ${i} de ${pdf.numPages}…`);
    prog.avance(i / (pdf.numPages + 1));
    const page = await pdf.getPage(i);
    const { items } = await page.getTextContent();
    const ls = agruparEnLineas(items);
    letras += ls.join('').replace(/\s/g, '').length;
    lineas.push(...ls);
  }
  // PDF escaneado (casi sin texto): leer las páginas como imágenes
  if (letras < 25 * pdf.numPages) {
    const n = Math.min(pdf.numPages, MAX_PAGINAS_OCR);
    const lienzos = [];
    for (let i = 1; i <= n; i++) {
      prog.texto(`Preparando página ${i} de ${n}…`);
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 2 });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      lienzos.push(c);
    }
    if (pdf.numPages > n) aviso(`Solo leo las primeras ${n} páginas escaneadas.`, { icono: 'x' });
    return { lineas: await ocr_(lienzos, prog), ocr: true };
  }
  return { lineas, ocr: false };
}

/** Agrupa los pedazos de texto de una página de PDF en líneas (por altura). */
function agruparEnLineas(items) {
  const piezas = items
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({ x: it.transform[4], y: it.transform[5], w: it.width || 0, t: it.str }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lineas = [];
  let actual = null;
  for (const p of piezas) {
    if (!actual || Math.abs(actual.y - p.y) > 3) {
      actual = { y: p.y, piezas: [] };
      lineas.push(actual);
    }
    actual.piezas.push(p);
  }
  return lineas.map((l) => {
    l.piezas.sort((a, b) => a.x - b.x);
    let txt = '', fin = null;
    for (const p of l.piezas) {
      // Un espacio grande entre pedazos suele ser otra columna de una tabla
      if (fin !== null) txt += p.x - fin > 18 ? ' | ' : (p.x - fin > 1 ? ' ' : '');
      txt += p.t;
      fin = p.x + p.w;
    }
    return txt.trim();
  });
}

/** Foto → lienzo, respetando la orientación del celular y con tamaño manejable. */
async function imagenACanvas(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch {
    // Algunos navegadores no tienen createImageBitmap para todos los formatos
    bmp = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('imagen'));
      img.src = URL.createObjectURL(file);
    });
  }
  const max = 2400;
  const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
  const ctx = c.getContext('2d');
  ctx.filter = 'grayscale(1) contrast(1.35)';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/** Lee el texto de imágenes (OCR) en español. */
async function ocr_(imagenes, prog) {
  prog.texto('Preparando el lector de letras…');
  const Tesseract = await cargarScript(LIBS.tesseract, 'Tesseract');
  let i = 0;
  const estados = {
    'loading tesseract core': 'Preparando el lector de letras…',
    'initializing tesseract': 'Preparando el lector de letras…',
    'loading language traineddata': 'Descargando el idioma español (solo la primera vez)…',
    'initializing api': 'Casi listo…',
  };
  const worker = await Tesseract.createWorker('spa', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        prog.texto(imagenes.length > 1 ? `Leyendo página ${i + 1} de ${imagenes.length}…` : 'Leyendo el texto…');
        prog.avance((i + (m.progress || 0)) / imagenes.length);
      } else if (estados[m.status]) prog.texto(estados[m.status]);
    },
  });
  const lineas = [];
  try {
    for (i = 0; i < imagenes.length; i++) {
      if (prog.cancelado()) break;
      const { data } = await worker.recognize(imagenes[i]);
      lineas.push(...data.text.split('\n'));
    }
  } finally {
    await worker.terminate();
  }
  return lineas;
}

// --- Del texto a clientes -------------------------------------------------------
/** Si las líneas son una tabla con encabezados conocidos, muestra la vista previa de Excel. */
function mostrarSiEsTabla(filas, origen, prog) {
  for (let k = 0; k < Math.min(filas.length, 10); k++) {
    const r = filasAClientes(filas.slice(k), origen);
    if (r.mapa.nombre !== undefined && r.mapa.telefono !== undefined && r.clientes.length) {
      prog?.terminar();
      vistaPreviaImportacion(r.clientes, Object.keys(r.mapa).map((c) => `${ETIQUETAS[c]} ← "${r.encabezados[r.mapa[c]]}"`));
      return true;
    }
  }
  return false;
}

function procesarLineas(lineas, { ocr = false, origen, archivo } = {}) {
  const limpias = lineas.map((l) => String(l ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  // ¿Es el cuaderno de ventas? (pedido, celular, valor, fechas…)
  if (pareceCuaderno(limpias)) { revisarVentas(lineasAVentas(limpias), { ocr, origen }); return; }
  if (mostrarSiEsTabla(limpias.map((l) => l.split(/\s*\|\s*|\t/)), origen)) return;
  const candidatos = lineasAClientes(limpias);
  if (!candidatos.length) {
    abrirHoja({
      titulo: 'No encontré clientes',
      cuerpo: `<p>No encontré números de celular en ${archivo ? `<b>${esc(archivo)}</b>` : 'el texto'}.</p>
        ${ocr ? '<p class="muted small mt-12">Si es una foto, intenta con buena luz, la hoja derecha y la letra lo más clara posible.</p>' : ''}
        <p class="muted small mt-12">Cada cliente necesita al menos un nombre y un celular en la misma línea (o el nombre en una línea y el celular en la siguiente).</p>`,
      pie: '<button class="btn btn-primary" data-ok>Entendido</button>',
      montar: (el) => el.querySelector('[data-ok]').addEventListener('click', () => cerrarHoja()),
    });
    return;
  }
  revisar(candidatos, { ocr, origen });
}

const RE_EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
// (Sin "lookbehind" para que funcione también en iPhones con iOS antiguo)
const RE_FECHA = /(^|[^\d])((\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*\d{2,4})?)(?!\d)/;
const RE_TEL = /\+?\d[\d\s().-]{5,18}\d/g;
const RE_ETIQUETAS = /(^|[^\p{L}])(?:nombres?|clientes?|sr|sra|srta|don|doña|tel[eé]fonos?|tel|cel(?:ular)?|m[oó]vil|whatsapp|wsp|wpp|n[uú]mero|cumple(?:años|anos)?|fecha(?: de)? nacimiento|nacimiento|nac|carro|veh[ií]culo|modelo|interesad[oa](?: en)?|correo|e-?mail)(?![\p{L}])\.?\s*[:=-]?/giu;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function capitalizar(nombre) {
  return nombre.split(' ').map((p) => {
    if (p !== p.toUpperCase() && p !== p.toLowerCase()) return p; // ya viene con mayúsculas mezcladas
    const min = p.toLowerCase();
    return ['de', 'del', 'la', 'las', 'los', 'y'].includes(min) ? min : min.charAt(0).toUpperCase() + min.slice(1);
  }).join(' ');
}

/** Analiza una línea y saca lo que se pueda. */
export function analizarLinea(linea, modelos) {
  let resto = ` ${linea} `;
  const r = { linea, nombre: '', telefono: '', vehiculo: '', email: '', cumple: '', notas: [] };

  const em = resto.match(RE_EMAIL);
  if (em) { r.email = em[0]; resto = resto.replace(em[0], ' '); }

  const fecha = resto.match(RE_FECHA);
  if (fecha && Number(fecha[3]) <= 31 && Number(fecha[4]) <= 12) {
    const texto = fecha[2].replace(/\s/g, '');
    if (/cumple|nac/i.test(resto)) r.cumple = aCumple(texto);
    else r.notas.push(`Fecha: ${texto}`);
    resto = resto.replace(fecha[0], `${fecha[1]} `);
  }

  for (const m of resto.match(RE_TEL) || []) {
    const dig = m.replace(/\D/g, '');
    if (dig.length >= 7 && dig.length <= 13) {
      // El celular separa: lo de antes suele ser el nombre y lo de después, notas
      if (!r.telefono) { r.telefono = m.trim(); resto = resto.replace(m, ' | '); }
      else { r.notas.push(`Otro número: ${m.trim()}`); resto = resto.replace(m, ' '); }
    }
  }

  for (const m of [...modelos].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`(^|[^\\p{L}\\d])${escRe(m)}(?![\\p{L}\\d])`, 'iu');
    const hit = resto.match(re);
    if (hit) { r.vehiculo = m; resto = resto.replace(hit[0], `${hit[1]} `); break; }
  }

  resto = resto.replace(RE_ETIQUETAS, '$1 ');
  // Separar por signos: el primer pedazo con letras es el nombre, el resto son notas
  const pedazos = resto.split(/[|,;:/\\()[\]{}"“”*•·_–—]+|\s-\s|\s-|-\s/).map((p) => p.replace(/\d+/g, ' ').replace(/[^\p{L}'.\s]/gu, ' ').replace(/\s+/g, ' ').trim()).filter((p) => /\p{L}{2,}/u.test(p));
  if (pedazos.length) {
    const palabras = pedazos.shift().split(' ').filter((w) => /\p{L}/u.test(w));
    r.textoLibre = palabras.join(' ');
    r.nombre = capitalizar(palabras.slice(0, 5).join(' ').replace(/\.$/, ''));
    if (palabras.length > 5) r.notas.push(palabras.slice(5).join(' '));
    r.notas.push(...pedazos);
  }
  r.notas = r.notas.join(' · ');
  return r;
}

/**
 * Convierte líneas de texto en posibles clientes.
 * Entiende "nombre + celular" en la misma línea, o el nombre en una línea y el
 * celular en la siguiente. Datos sueltos (carro, cumpleaños) en la línea de
 * abajo se le agregan al cliente anterior.
 */
export function lineasAClientes(lineas) {
  const modelos = store.ajustes().modelos || [];
  const out = [];
  let pendiente = null;   // nombre sin celular esperando la línea siguiente
  let ultimo = null;      // último cliente creado (para agregarle datos sueltos)

  for (const linea of lineas) {
    if (linea.length < 3) continue;
    const p = analizarLinea(linea, modelos);
    if (p.telefono) {
      if (!p.nombre && pendiente?.nombre) {
        p.nombre = pendiente.nombre;
        p.vehiculo ||= pendiente.vehiculo;
        p.cumple ||= pendiente.cumple;
        p.email ||= pendiente.email;
        p.notas = [pendiente.notas, p.notas].filter(Boolean).join(' · ');
        p.linea = `${pendiente.linea} / ${p.linea}`;
      }
      out.push(p);
      ultimo = p; pendiente = null;
      continue;
    }
    // Sin celular: ¿es un dato más del cliente anterior?
    const soloDatos = !p.nombre || (p.vehiculo && p.nombre.split(' ').length <= 3 && /quiere|credito|crédito|color|retoma|contado|financ/i.test(p.nombre));
    if (ultimo && (p.vehiculo || p.cumple || p.email) && (soloDatos || !p.nombre)) {
      ultimo.vehiculo ||= p.vehiculo;
      ultimo.cumple ||= p.cumple;
      ultimo.email ||= p.email;
      ultimo.notas = [ultimo.notas, p.textoLibre, p.notas].filter(Boolean).join(' · ');
      ultimo.linea += ` / ${p.linea}`;
      continue;
    }
    if (p.nombre) {
      // Un nombre anterior que nunca recibió celular se guarda igual (sin marcar)
      if (pendiente && pendiente.nombre.split(' ').length >= 2) out.push(pendiente);
      pendiente = p;
      ultimo = null;
    }
  }
  if (pendiente && pendiente.nombre.split(' ').length >= 2) out.push(pendiente);
  return out;
}

// --- Revisar antes de guardar ----------------------------------------------------
function revisar(candidatos, { ocr, origen }) {
  const cp = store.ajustes().codigoPais;
  const existentes = new Set(store.clientes().map((c) => telefonoInternacional(c.telefono, cp)));
  const vistos = new Set();
  const filas = candidatos.map((c) => {
    const n = telefonoInternacional(c.telefono, cp);
    const repetido = n && (existentes.has(n) || vistos.has(n));
    if (n) vistos.add(n);
    return { ...c, repetido, elegido: !!(c.nombre && n.length >= 7 && !repetido) };
  });
  const modelos = store.ajustes().modelos || [];

  abrirHoja({
    titulo: 'Revisa antes de guardar',
    alta: true,
    cuerpo: `
      ${ocr ? `<div class="banner warn">${icon('scan', 'i-lg')}<div><strong>Leí la letra de la imagen</strong>
        Revisa nombres y números: la letra a mano no siempre se entiende bien. Abajo de cada uno ves lo que decía el texto original.</div></div>` : ''}
      <div class="hstack mt-12">
        <span class="small muted spacer">Encontré <b>${plural(filas.length, 'cliente', 'clientes')}</b>. Corrige lo que haga falta.</span>
        <button class="btn btn-outline btn-sm" type="button" data-todos>Marcar todos</button>
      </div>
      <div class="stack mt-12" data-lista>
        ${filas.map((f, i) => `
          <div class="rev-card ${f.elegido ? '' : 'off'}" data-i="${i}">
            <div class="rev-top">
              <label class="rev-check"><input type="checkbox" ${f.elegido ? 'checked' : ''}> Guardar</label>
              <span class="spacer"></span>
              ${f.repetido ? '<span class="pill" data-color="amber">Ya existe</span>' : ''}
              ${!f.telefono ? '<span class="pill" data-color="gray">Sin celular</span>' : ''}
            </div>
            <input class="input" data-f="nombre" value="${esc(f.nombre)}" placeholder="Nombre" autocapitalize="words" aria-label="Nombre">
            <div class="row">
              <input class="input" data-f="telefono" type="tel" inputmode="tel" value="${esc(f.telefono)}" placeholder="Celular" aria-label="Celular">
              <input class="input" data-f="vehiculo" list="dl-rev-modelos" value="${esc(f.vehiculo)}" placeholder="Vehículo" aria-label="Vehículo">
            </div>
            ${f.notas ? `<input class="input" data-f="notas" value="${esc(f.notas)}" placeholder="Notas" aria-label="Notas">` : ''}
            <p class="rev-orig">Decía: “${esc(f.linea)}”</p>
          </div>`).join('')}
      </div>
      <datalist id="dl-rev-modelos">${modelos.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>`,
    pie: `<button class="btn btn-outline" data-cancel>Cancelar</button><button class="btn btn-primary" data-ok>Guardar</button>`,
    montar: (el) => {
      const ok = el.querySelector('[data-ok]');
      const contar = () => {
        const n = el.querySelectorAll('.rev-card input[type=checkbox]:checked').length;
        ok.innerHTML = `${icon('check')} Guardar ${n}`;
        ok.disabled = !n;
      };
      contar();
      el.querySelectorAll('.rev-card input[type=checkbox]').forEach((cb) => cb.addEventListener('change', () => {
        cb.closest('.rev-card').classList.toggle('off', !cb.checked); contar();
      }));
      el.querySelector('[data-todos]').addEventListener('click', () => {
        const cbs = [...el.querySelectorAll('.rev-card input[type=checkbox]')];
        const marcar = cbs.some((cb) => !cb.checked);
        cbs.forEach((cb) => { cb.checked = marcar; cb.closest('.rev-card').classList.toggle('off', !marcar); });
        contar();
      });
      el.querySelector('[data-cancel]').addEventListener('click', () => cerrarHoja());

      ok.addEventListener('click', () => {
        const nuevos = [];
        const yaEstan = new Set(store.clientes().map((c) => telefonoInternacional(c.telefono, cp)));
        let malos = 0, repetidos = 0;
        el.querySelectorAll('.rev-card').forEach((card) => {
          card.querySelectorAll('.input').forEach((x) => x.classList.remove('invalid'));
          if (!card.querySelector('input[type=checkbox]').checked) return;
          const v = (f) => card.querySelector(`[data-f="${f}"]`)?.value.trim() || '';
          const nombre = v('nombre'), telefono = v('telefono');
          const n = telefonoInternacional(telefono, cp);
          if (!nombre || n.length < 7) {
            malos++;
            if (!nombre) card.querySelector('[data-f="nombre"]').classList.add('invalid');
            if (n.length < 7) card.querySelector('[data-f="telefono"]').classList.add('invalid');
            return;
          }
          if (yaEstan.has(n)) { repetidos++; return; }
          yaEstan.add(n);
          const f = filas[Number(card.dataset.i)];
          nuevos.push(store.nuevoCliente({
            nombre, telefono, vehiculoInteres: v('vehiculo'), notas: v('notas'),
            email: f.email || '', cumple: f.cumple || '',
            historial: [{ id: uid('h_'), fecha: new Date().toISOString(), tipo: 'creado', texto: origen || 'Importado' }],
          }));
        });
        if (malos) {
          aviso(`${plural(malos, 'cliente marcado no tiene', 'clientes marcados no tienen')} nombre o celular válido. Corrígelos o desmárcalos.`, { icono: 'x', ms: 6000 });
          el.querySelector('.input.invalid')?.focus();
          return;
        }
        if (!nuevos.length) { aviso('Esos clientes ya estaban guardados', { icono: 'x' }); return; }
        store.agregarClientes(nuevos);
        cerrarHoja();
        aviso(`${plural(nuevos.length, 'cliente guardado', 'clientes guardados')}${repetidos ? ` · ${repetidos} ya existían` : ''}`, { ms: 5000 });
      });
    },
  });
}
