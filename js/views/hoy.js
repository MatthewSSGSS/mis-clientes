// =============================================================================
// views/hoy.js — Pantalla de Inicio.
//   Columna principal: buscador, accesos rápidos, primeros pasos, mensajes
//   para hoy y clientes que se están enfriando.
//   Columna lateral (debajo en celular): meta del mes, próximos días,
//   embudo de clientes, actividad reciente y consejo del día.
// =============================================================================

import * as store from '../store.js';
import {
  ETAPAS, ETAPAS_ACTIVAS, FOTOS, DIAS_RECORDAR_RESPALDO, DIAS_ENFRIANDO, CATEGORIAS, CONSEJOS,
} from '../config.js';
import { pendientesHoy, proximos, dineroCorto, documentosPendientes } from '../engine.js';
import { citasDeHoy, proximasCitas, filaCita, conectarCitas, abrirFormularioCita } from '../citas.js';
import { abrirMensaje, modoSerie } from '../enviar.js';
import { abrirFormularioCliente } from '../cliente-form.js';
import { abrirFormularioProgramado } from './mensajes.js';
import { guardarRespaldo } from '../importar.js';
import { menuImportar } from '../documentos.js';
import { abrirRecordatorio } from '../recordatorios.js';
import * as nube from '../nube.js';
import {
  icon, avatar, etapa as infoEtapa, categoria, badgeCategoria, vacio, botonTema, abrirHoja, cerrarHoja, aviso,
} from '../ui.js';
import {
  esc, norm, hoy, saludo, fechaLarga, relativo, cuando, primerNombre, plural, nombreMes, sumarDias,
  esIOS, esMovil, esInstalada, diasEntre, fechaStr, telefonoBonito,
} from '../util.js';

let verTodosProximos = false;

export function render(root, { navegar }) {
  const a = store.ajustes();
  const clientes = store.clientes();
  const items = clientes.length ? pendientesHoy() : [];
  const prox = clientes.length ? proximos() : [];
  const h = hoy();
  const mes = h.slice(0, 7);
  const foto = FOTOS.hoy[new Date().getDay() % FOTOS.hoy.length];

  const activos = clientes.filter((c) => ETAPAS_ACTIVAS.includes(c.etapa)).length;
  const ventasMes = clientes.filter((c) => c.etapa === 'vendido' && (c.fechaCompra || '').startsWith(mes)).length;
  const cumplesMes = clientes.filter((c) => (c.cumple || '').startsWith(mes.slice(5))).length;
  const nombre = primerNombre(a.nombre);
  const pasos = primerosPasos(a, clientes);
  const mostrarPasos = !a.ocultarPasos && pasos.some((p) => !p.hecho);
  const frios = enfriando(clientes);
  const citasHoy = citasDeHoy();
  const citasProx = proximasCitas(7);

  let resumen;
  const nCitas = citasHoy.filter((ct) => ct.fecha === h).length;
  if (!clientes.length) resumen = 'Empecemos: registra tu primer cliente y la app se encarga de recordarte cuándo escribirle.';
  else if (items.length || nCitas) {
    resumen = `Hoy tienes ${[nCitas && plural(nCitas, 'cita', 'citas'), items.length && plural(items.length, 'mensaje para enviar', 'mensajes para enviar')].filter(Boolean).join(' y ')}.`;
  } else resumen = 'Todo al día. No tienes mensajes pendientes. ✨';

  root.innerHTML = `
    <header class="hero hero-home">
      <img class="hero-img" src="img/${foto}" alt="" fetchpriority="high">
      <div class="hero-top"><span class="hero-date">${esc(fechaLarga(h))}</span>${botonTema()}</div>
      <div class="hero-inner hero-inner-wide">
        <h1>${esc(saludo())}${nombre ? `, ${esc(nombre)}` : ''}</h1>
        <p>${esc(resumen)}</p>
        <div class="hero-cta">
          ${items.length ? `<button class="btn btn-wa btn-lg" data-serie>${icon('send')} Empezar a enviar (${items.length})</button>` : ''}
          ${!clientes.length ? `
            <button class="btn btn-primary btn-lg" data-nuevo>${icon('plus')} Registrar cliente</button>
            <button class="btn btn-glass btn-lg" data-importar>${icon('upload')} Pasar mis clientes</button>` : ''}
        </div>
      </div>
      <span class="photo-credit">Foto: Unsplash</span>
    </header>

    <div class="page page-wide">
      ${clientes.length ? `
      <div class="stats">
        <a class="stat" href="#/clientes" data-color="blue"><span class="stat-label">${icon('users')} En proceso</span><span class="stat-value">${activos}</span></a>
        <a class="stat" href="#/clientes/vendido" data-color="green"><span class="stat-label">${icon('star')} Ventas del mes</span><span class="stat-value">${ventasMes}</span></a>
        <button class="stat" data-serie data-color="red" ${items.length ? '' : 'disabled'}><span class="stat-label">${icon('send')} Para hoy</span><span class="stat-value">${items.length}</span></button>
        <div class="stat" data-color="pink"><span class="stat-label">${icon('gift')} Cumples del mes</span><span class="stat-value">${cumplesMes}</span></div>
      </div>` : ''}

      <div class="home-tools ${clientes.length ? '' : 'sin-stats'}">
        ${clientes.length ? `
        <div class="home-search">
          <label class="search">
            ${icon('search')}<span class="sr-only">Buscar cliente</span>
            <input class="input" type="search" placeholder="Buscar un cliente por nombre, celular o carro…" data-buscar autocomplete="off" enterkeyhint="search">
          </label>
          <div class="search-results" data-resultados hidden></div>
        </div>` : ''}
        <div class="quick-grid">
          <button class="quick" data-nuevo><span class="icon-badge" data-color="red">${icon('plus')}</span>Nuevo cliente</button>
          <button class="quick" data-importar><span class="icon-badge" data-color="amber">${icon('upload')}</span>Pasar clientes</button>
          <button class="quick" data-programar><span class="icon-badge" data-color="violet">${icon('send')}</span>Programar mensaje</button>
          <button class="quick" data-agendar><span class="icon-badge" data-color="blue">${icon('calendar')}</span>Agendar cita</button>
        </div>
      </div>

      ${avisos(a, clientes, mostrarPasos)}

      <div class="home-grid">
        <div class="home-main">
          ${citasHoy.length ? `
          <section class="section">
            <div class="section-head">
              <h2 class="section-title">Citas de hoy</h2>
              <span class="section-sub">${plural(citasHoy.length, 'cita', 'citas')}</span>
            </div>
            <div class="list">${citasHoy.map((ct) => filaCita(ct)).join('')}</div>
          </section>` : ''}
          ${(() => {
            const paraHoy = clientes.length ? `
              <section class="section">
                <div class="section-head">
                  <h2 class="section-title">Para hoy</h2>
                  ${items.length > 1 ? `<button class="link-btn" data-serie>Enviar todos</button>` : ''}
                </div>
                ${items.length ? grupos(items) : `
                  <div class="card al-dia">
                    <img src="img/mini/navara-nieve.jpg" alt="" loading="lazy">
                    <div class="li-body"><b>${icon('check', 'i-sm')} Estás al día</b>
                      <span class="small muted">Cuando haya cumpleaños, seguimientos u ofertas programadas, aparecerán aquí.</span></div>
                  </div>`}
              </section>` : '';
            const tarjeta = mostrarPasos ? tarjetaPasos(pasos) : '';
            // Si hay mensajes pendientes, eso va primero
            return items.length ? paraHoy + tarjeta : tarjeta + paraHoy;
          })()}

          ${frios.length ? `
          <section class="section">
            <div class="section-head">
              <h2 class="section-title">Se están enfriando</h2>
              <span class="section-sub">En proceso y sin seguimiento</span>
            </div>
            <div class="list">${frios.slice(0, 5).map(filaFrio).join('')}</div>
            ${frios.length > 5 ? `<a class="btn btn-ghost btn-block mt-8" href="#/clientes">Ver ${frios.length - 5} más en Clientes</a>` : ''}
          </section>` : ''}

          ${!clientes.length ? comoFunciona() : ''}
        </div>

        <aside class="home-side">
          ${tarjetaMeta(a, ventasMes, h)}

          ${tarjetaNegociaciones(clientes, mes)}

          ${citasProx.length ? `
          <section class="section">
            <div class="section-head">
              <h2 class="section-title">Próximas citas</h2>
              <button class="link-btn" data-agendar>+ Agendar</button>
            </div>
            <div class="list">${citasProx.slice(0, 5).map((ct) => filaCita(ct, { mostrarFecha: true })).join('')}</div>
          </section>` : ''}

          ${prox.length ? `
          <section class="section">
            <div class="section-head">
              <h2 class="section-title">Próximos días</h2>
              <span class="section-sub">${plural(prox.length, 'mensaje', 'mensajes')}</span>
            </div>
            <div class="grouped">
              ${(verTodosProximos ? prox : prox.slice(0, 5)).map(filaProximo).join('')}
              ${prox.length > 5 ? `<button class="g-row" data-ver-prox style="justify-content:center;color:var(--accent);font-weight:700">${verTodosProximos ? 'Ver menos' : `Ver los ${prox.length}`}</button>` : ''}
            </div>
          </section>` : ''}

          ${clientes.length ? `
          <section class="section">
            <div class="section-head"><h2 class="section-title">Tus clientes</h2><a class="link-btn" href="#/clientes">Ver todos</a></div>
            <div class="card card-pad">${embudo(clientes)}</div>
          </section>` : ''}

          ${actividad(clientes)}

          <section class="section">
            <div class="card card-pad consejo">
              <div class="hstack">
                <img class="thumb thumb-sm" src="img/mini/volante-sq.jpg" alt="" loading="lazy">
                <div class="li-body"><b>Consejo del día</b><span class="small muted">${icon('sparkles', 'i-sm')} Para vender más</span></div>
              </div>
              <p class="mt-12">${esc(consejoDelDia())}</p>
            </div>
          </section>
        </aside>
      </div>
    </div>`;

  // --- Eventos ---
  root.querySelectorAll('[data-serie]').forEach((b) => b.addEventListener('click', () => modoSerie(pendientesHoy())));
  root.querySelectorAll('[data-nuevo]').forEach((b) => b.addEventListener('click', () => abrirFormularioCliente()));
  root.querySelectorAll('[data-importar]').forEach((b) => b.addEventListener('click', () => menuImportar()));
  root.querySelectorAll('[data-programar]').forEach((b) => b.addEventListener('click', () => abrirFormularioProgramado()));
  root.querySelectorAll('[data-agendar]').forEach((b) => b.addEventListener('click', () => abrirFormularioCita()));
  conectarCitas(root);
  root.querySelectorAll('[data-respaldo]').forEach((b) => b.addEventListener('click', () => guardarRespaldo()));
  root.querySelector('[data-ver-prox]')?.addEventListener('click', () => { verTodosProximos = !verTodosProximos; render(root, { navegar }); });
  root.querySelector('[data-ocultar-pasos]')?.addEventListener('click', () => {
    store.actualizarAjustes({ ocultarPasos: true });
    aviso('Listo. Puedes volver a verlos en Ajustes.');
  });
  root.querySelectorAll('[data-recordatorio]').forEach((b) => b.addEventListener('click', () => abrirRecordatorio()));
  root.querySelectorAll('[data-meta]').forEach((b) => b.addEventListener('click', () => editarMeta()));
  root.querySelectorAll('[data-enviar]').forEach((b) => b.addEventListener('click', () => {
    const it = items.find((x) => x.key === b.dataset.enviar);
    const c = it && store.cliente(it.clienteId);
    if (c) abrirMensaje(c, { item: it });
  }));
  root.querySelectorAll('[data-escribir]').forEach((b) => b.addEventListener('click', () => {
    const c = store.cliente(b.dataset.escribir);
    if (c) abrirMensaje(c, { plantillaId: 'tpl-seg-2' });
  }));
  root.querySelectorAll('[data-manana]').forEach((b) => b.addEventListener('click', () => {
    const c = store.cliente(b.dataset.manana);
    if (!c) return;
    c.proximoSeguimiento = sumarDias(hoy(), 1);
    store.guardarCliente(c);
    aviso(`${primerNombre(c.nombre)} te aparecerá mañana`);
  }));
  conectarBuscador(root, navegar);
}

// --- Buscador con resultados al instante --------------------------------------
function conectarBuscador(root, navegar) {
  const input = root.querySelector('[data-buscar]');
  const caja = root.querySelector('[data-resultados]');
  if (!input) return;
  const pintar = () => {
    const q = norm(input.value);
    const qDig = input.value.replace(/\D/g, '');
    if (!q) { caja.hidden = true; return; }
    const res = store.clientes().filter((c) =>
      norm(c.nombre).includes(q) || norm(c.vehiculoInteres).includes(q) || norm(c.vehiculoComprado).includes(q) ||
      (qDig.length >= 3 && String(c.telefono).replace(/\D/g, '').includes(qDig))).slice(0, 6);
    caja.innerHTML = res.length
      ? res.map((c) => `
        <a class="g-row" href="#/cliente/${c.id}">
          ${avatar(c.nombre)}
          <div class="li-body"><div class="li-title">${esc(c.nombre)}</div>
            <div class="li-sub">${esc([c.vehiculoComprado || c.vehiculoInteres, telefonoBonito(c.telefono)].filter(Boolean).join(' · '))}</div></div>
          <span class="pill" data-color="${infoEtapa(c.etapa).color}">${esc(infoEtapa(c.etapa).nombre)}</span>
        </a>`).join('')
      : `<div class="g-row"><div class="li-body"><b>No encontré "${esc(input.value)}"</b><span class="small muted">¿Es un cliente nuevo?</span></div>
          <button class="btn btn-primary btn-sm" data-registrar>${icon('plus', 'i-sm')} Registrar</button></div>`;
    caja.hidden = false;
    caja.querySelector('[data-registrar]')?.addEventListener('click', () => {
      const nombre = input.value.trim();
      abrirFormularioCliente(null, { campos: { nombre: /\d/.test(nombre) ? '' : nombre, telefono: /\d{6,}/.test(nombre.replace(/\D/g, '')) ? nombre : '' } });
    });
  };
  input.addEventListener('input', pintar);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const primero = caja.querySelector('a.g-row'); if (primero) navegar(primero.getAttribute('href')); }
    if (e.key === 'Escape') { input.value = ''; pintar(); }
  });
}

// --- Primeros pasos ------------------------------------------------------------
function primerosPasos(a, clientes) {
  const reales = clientes.filter((c) => !c.ejemplo);
  const enviados = store.envios().some((e) => e.estado === 'enviado');
  return [
    { hecho: !!a.nombre, titulo: 'Escribe tu nombre', sub: 'Para firmar tus mensajes', accion: '<a class="btn btn-sm btn-outline" href="#/ajustes">Ir</a>' },
    { hecho: reales.length > 0, titulo: 'Registra o pasa tus clientes', sub: 'Uno por uno, o desde tu cuaderno, Word, PDF o Excel', accion: '<button class="btn btn-sm btn-primary" data-importar>Pasar</button>' },
    { hecho: clientes.some((c) => c.proximoSeguimiento) || enviados, titulo: 'Ponle fecha de seguimiento a un cliente', sub: 'Así la app te recuerda escribirle', accion: '<a class="btn btn-sm btn-outline" href="#/clientes">Ver</a>' },
    { hecho: enviados, titulo: 'Envía tu primer mensaje', sub: 'Desde "Para hoy" o desde la ficha de un cliente' },
    { hecho: esInstalada() || !esMovil, titulo: 'Instala la app en tu celular', sub: 'Para abrirla con un toque y proteger tus datos', accion: '<a class="btn btn-sm btn-outline" href="#/ajustes">Cómo</a>' },
    nube.enCuenta()
      ? { hecho: !!a.pushActivo, titulo: 'Activa las notificaciones', sub: 'Un resumen cada mañana y un aviso antes de cada cita', accion: '<a class="btn btn-sm btn-outline" href="#/ajustes">Activar</a>' }
      : { hecho: !!a.recordatorioAgregado, titulo: 'Activa tu recordatorio diario', sub: 'Tu celular te avisa cada día a la hora que elijas', accion: '<button class="btn btn-sm btn-outline" data-recordatorio>Activar</button>' },
    nube.enCuenta()
      ? { hecho: true, titulo: 'Tus clientes se guardan en la nube', sub: 'Con tu cuenta no necesitas copias de seguridad' }
      : { hecho: !!a.ultimoRespaldo, titulo: 'Guarda tu primera copia de seguridad', sub: 'Por si cambias o pierdes el celular', accion: '<button class="btn btn-sm btn-outline" data-respaldo>Guardar</button>' },
  ];
}

function tarjetaPasos(pasos) {
  const listos = pasos.filter((p) => p.hecho).length;
  return `
    <section class="section">
      <div class="card card-pad pasos">
        <div class="card-cover">
          <img src="img/mini/frontier-negra.jpg" alt="" loading="lazy">
          <div class="card-cover-text"><h2>Primeros pasos</h2><span>${listos} de ${pasos.length} listos</span></div>
          <button class="btn btn-sm card-cover-btn" data-ocultar-pasos>Ocultar</button>
        </div>
        <div class="meta-bar"><span style="width:${(listos / pasos.length) * 100}%"></span></div>
        <ol class="pasos-list">
          ${pasos.map((p, i) => `
            <li class="paso ${p.hecho ? 'hecho' : ''}">
              <span class="paso-num">${p.hecho ? icon('check', 'i-sm') : i + 1}</span>
              <div class="li-body"><b>${esc(p.titulo)}</b><span class="small muted">${esc(p.sub)}</span></div>
              ${!p.hecho && p.accion ? p.accion : ''}
            </li>`).join('')}
        </ol>
      </div>
    </section>`;
}

// --- Se están enfriando ---------------------------------------------------------
function ultimoContacto(c) {
  const msg = c.historial.find((x) => x.tipo === 'mensaje');
  return (msg?.fecha || c.creado || new Date().toISOString());
}
function enfriando(clientes) {
  const h = hoy();
  return clientes
    .filter((c) => ETAPAS_ACTIVAS.includes(c.etapa) && !c.proximoSeguimiento && c.telefono)
    .map((c) => ({ c, dias: diasEntre(fechaStr(new Date(ultimoContacto(c))), h) }))
    .filter((x) => x.dias >= DIAS_ENFRIANDO)
    .sort((x, y) => y.dias - x.dias);
}
function filaFrio({ c, dias }) {
  const veh = c.vehiculoInteres;
  return `
    <div class="task">
      ${avatar(c.nombre)}
      <div class="li-body">
        <div class="li-title"><a href="#/cliente/${c.id}">${esc(c.nombre)}</a></div>
        <div class="li-sub"><span class="li-meta late">Hace ${dias} días</span>${veh ? ` · ${esc(veh)}` : ''}</div>
      </div>
      <div class="task-actions">
        <button class="btn btn-outline btn-sm" data-manana="${c.id}" title="Recordármelo mañana">Mañana</button>
        <button class="btn btn-wa btn-sm" data-escribir="${c.id}" aria-label="Escribir a ${esc(c.nombre)}">${icon('chat', 'i-sm')}</button>
      </div>
    </div>`;
}

// --- Meta del mes -----------------------------------------------------------------
function tarjetaMeta(a, ventas, h) {
  const mesNombre = nombreMes(Number(h.slice(5, 7)));
  const meta = Number(a.metaVentas) || 0;
  if (!meta) {
    return `
      <section class="section section-first">
        <button class="card card-pad meta-card meta-vacia" data-meta>
          <img class="thumb" src="img/mini/qashqai-atardecer-sq.jpg" alt="" loading="lazy">
          <div class="li-body"><b>Ponte una meta para ${esc(mesNombre)}</b><span class="small muted">¿Cuántos carros quieres vender este mes?</span></div>
          ${icon('chev-r', 'chev')}
        </button>
      </section>`;
  }
  const pct = Math.min(100, (ventas / meta) * 100);
  const faltan = Math.max(0, meta - ventas);
  return `
    <section class="section section-first">
      <div class="card card-pad meta-card">
        <div class="hstack">
          <img class="thumb" src="img/mini/qashqai-atardecer-sq.jpg" alt="" loading="lazy">
          <div class="li-body"><b>Meta de ${esc(mesNombre)}</b><span class="small muted">${ventas} de ${meta} ${meta === 1 ? 'venta' : 'ventas'}</span></div>
          <button class="btn btn-ghost btn-sm" data-meta>Cambiar</button>
        </div>
        <div class="meta-bar mt-12 ${pct >= 100 ? 'ok' : ''}"><span style="width:${Math.max(pct, 3)}%"></span></div>
        <p class="small mt-8" style="font-weight:600">${faltan ? `Te ${faltan === 1 ? 'falta 1 venta' : `faltan ${faltan} ventas`}. ¡Tú puedes! 💪` : '¡Meta cumplida! 🎉'}</p>
      </div>
    </section>`;
}

function editarMeta() {
  const actual = Number(store.ajustes().metaVentas) || 0;
  abrirHoja({
    titulo: 'Meta de ventas del mes',
    cuerpo: `
      <p class="muted small">¿Cuántos carros quieres vender este mes? Las ventas se cuentan cuando marcas un cliente como "Vendido".</p>
      <div class="meta-stepper mt-16">
        <button class="btn btn-outline btn-icon btn-lg" type="button" data-menos aria-label="Menos">−</button>
        <input class="input" type="number" min="0" max="999" inputmode="numeric" value="${actual || 5}" data-valor aria-label="Meta">
        <button class="btn btn-outline btn-icon btn-lg" type="button" data-mas aria-label="Más">+</button>
      </div>
      <div class="chips chips-wrap mt-16" style="justify-content:center">
        ${[3, 5, 8, 10, 15].map((n) => `<button class="chip" type="button" data-n="${n}">${n}</button>`).join('')}
      </div>`,
    pie: `${actual ? '<button class="btn btn-outline" data-quitar>Quitar meta</button>' : '<button class="btn btn-outline" data-cancel>Cancelar</button>'}
      <button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`,
    montar: (el) => {
      const v = el.querySelector('[data-valor]');
      const set = (n) => { v.value = Math.max(0, Math.min(999, n)); };
      el.querySelector('[data-menos]').addEventListener('click', () => set(Number(v.value) - 1));
      el.querySelector('[data-mas]').addEventListener('click', () => set(Number(v.value) + 1));
      el.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => set(Number(b.dataset.n))));
      el.querySelector('[data-cancel]')?.addEventListener('click', () => cerrarHoja());
      el.querySelector('[data-quitar]')?.addEventListener('click', () => { store.actualizarAjustes({ metaVentas: 0 }); cerrarHoja(); });
      el.querySelector('[data-ok]').addEventListener('click', () => {
        store.actualizarAjustes({ metaVentas: Math.max(0, Number(v.value) || 0) });
        cerrarHoja();
        aviso('Meta guardada');
      });
    },
  });
}

// --- Dinero en negociación ----------------------------------------------------------
function tarjetaNegociaciones(clientes, mes) {
  const abiertas = clientes.filter((c) => ETAPAS_ACTIVAS.includes(c.etapa) && Number(c.precio) > 0);
  const vendidas = clientes.filter((c) => c.etapa === 'vendido' && (c.fechaCompra || '').startsWith(mes) && Number(c.precio) > 0);
  if (!abiertas.length && !vendidas.length) return '';
  const suma = (l) => l.reduce((t, c) => t + Number(c.precio), 0);
  const credito = abiertas.filter((c) => c.formaPago === 'credito');
  const conDocsPendientes = credito.filter((c) => documentosPendientes(c).length).length;
  return `
    <section class="section">
      <div class="card card-pad neg-resumen">
        <div class="hstack">
          <img class="thumb" src="img/mini/frontier-negra-sq.jpg" alt="" loading="lazy">
          <div class="li-body"><span class="small muted">En negociación</span><b class="neg-total">${esc(dineroCorto(suma(abiertas)))}</b>
            <span class="small muted">${plural(abiertas.length, 'cliente', 'clientes')}${credito.length ? ` · ${credito.length} con crédito` : ''}</span></div>
        </div>
        ${vendidas.length || conDocsPendientes ? `<div class="neg-mini mt-12">
          ${vendidas.length ? `<span>${icon('star', 'i-sm')} Vendido este mes: <b>${esc(dineroCorto(suma(vendidas)))}</b></span>` : ''}
          ${conDocsPendientes ? `<a href="#/clientes/negociando">${icon('note', 'i-sm')} ${plural(conDocsPendientes, 'cliente con documentos pendientes', 'clientes con documentos pendientes')}</a>` : ''}
        </div>` : ''}
      </div>
    </section>`;
}

// --- Actividad reciente -----------------------------------------------------------
function actividad(clientes) {
  const eventos = clientes
    .flatMap((c) => c.historial.slice(0, 8).map((hh) => ({ ...hh, c })))
    .sort((x, y) => (y.fecha || '').localeCompare(x.fecha || ''))
    .slice(0, 6);
  if (!eventos.length) return '';
  const fila = (e) => {
    const n = esc(primerNombre(e.c.nombre));
    let ic = 'note', color = 'gray', txt = '';
    if (e.tipo === 'mensaje') { ic = 'send'; color = 'green'; txt = `Le escribiste a <b>${n}</b>${e.titulo ? ` · ${esc(e.titulo)}` : ''}`; }
    else if (e.tipo === 'creado') { ic = 'users'; color = 'blue'; txt = `Registraste a <b>${n}</b>`; }
    else if (e.tipo === 'etapa') { const et = infoEtapa(e.texto); ic = et.id === 'vendido' ? 'star' : 'flag'; color = et.color; txt = `<b>${n}</b> pasó a ${esc(et.nombre)}`; }
    else if (e.tipo === 'nota') { ic = 'note'; color = 'amber'; txt = `Nota sobre <b>${n}</b>`; }
    else if (e.tipo === 'cita') { ic = 'calendar'; color = /realizada/.test(e.titulo || '') ? 'green' : 'blue'; txt = `${esc(e.titulo || 'Cita')} · <b>${n}</b>`; }
    else txt = `<b>${n}</b>`;
    return `
      <a class="g-row" href="#/cliente/${e.c.id}">
        <span class="icon-badge" data-color="${color}">${icon(ic)}</span>
        <div class="li-body"><span style="font-size:14px">${txt}</span><span class="small muted">${esc(cuando(e.fecha))}</span></div>
      </a>`;
  };
  return `
    <section class="section">
      <div class="section-head"><h2 class="section-title">Actividad reciente</h2></div>
      <div class="grouped">${eventos.map(fila).join('')}</div>
    </section>`;
}

function consejoDelDia() {
  const inicio = new Date(new Date().getFullYear(), 0, 0);
  const dia = Math.floor((new Date() - inicio) / 86400000);
  return CONSEJOS[dia % CONSEJOS.length];
}

// --- Piezas existentes ------------------------------------------------------------
function grupos(items) {
  return CATEGORIAS.map((cat) => {
    const del = items.filter((it) => it.categoria === cat.id);
    if (!del.length) return '';
    return `
      <div class="group-label" data-color="${cat.color}">${icon(cat.icon)} ${esc(cat.nombre)} <span class="count">${del.length}</span></div>
      <div class="list">${del.map(tarea).join('')}</div>`;
  }).join('') + (() => {
    const otros = items.filter((it) => !CATEGORIAS.some((c) => c.id === it.categoria));
    return otros.length ? `<div class="group-label">${icon('message')} Otros</div><div class="list">${otros.map(tarea).join('')}</div>` : '';
  })();
}

function tarea(it) {
  const c = store.cliente(it.clienteId);
  if (!c) return '';
  const tarde = it.fecha < hoy();
  return `
    <div class="task">
      ${avatar(c.nombre)}
      <div class="li-body">
        <div class="li-title"><a href="#/cliente/${c.id}">${esc(c.nombre)}</a></div>
        <div class="li-sub">${esc(it.titulo)} · <span class="li-meta ${tarde ? 'late' : 'today'}">${esc(relativo(it.fecha))}</span></div>
      </div>
      <div class="task-actions">
        <button class="btn btn-wa btn-sm" data-enviar="${esc(it.key)}" aria-label="Enviar a ${esc(c.nombre)}">${icon('chat', 'i-sm')} Enviar</button>
      </div>
    </div>`;
}

function filaProximo(it) {
  const c = store.cliente(it.clienteId);
  if (!c) return '';
  return `
    <a class="g-row" href="#/cliente/${c.id}">
      ${badgeCategoria(it.categoria)}
      <div class="li-body">
        <div class="li-title">${esc(c.nombre)}</div>
        <div class="li-sub">${esc(it.titulo)}</div>
      </div>
      <span class="li-meta">${esc(relativo(it.fecha))}</span>
    </a>`;
}

function embudo(clientes) {
  const total = clientes.length || 1;
  const conteo = ETAPAS.map((e) => ({ ...e, n: clientes.filter((c) => c.etapa === e.id).length }));
  return `
    <div class="hstack" style="justify-content:space-between;margin-bottom:12px">
      <span class="small muted" style="font-weight:700">${plural(clientes.length, 'cliente', 'clientes')} en total</span>
    </div>
    <div class="funnel" role="img" aria-label="${conteo.map((e) => `${e.nombre}: ${e.n}`).join(', ')}">
      ${conteo.filter((e) => e.n).map((e) => `<span data-color="${e.color}" style="flex:${e.n / total}" title="${esc(e.nombre)}: ${e.n}"></span>`).join('')}
    </div>
    <div class="funnel-legend">
      ${conteo.map((e) => `<a href="#/clientes/${e.id}" data-color="${e.color}">${esc(e.nombre)} <b>${e.n}</b></a>`).join('')}
    </div>`;
}

function avisos(a, clientes, mostrarPasos) {
  const out = [];
  if (!store.almacenamientoOK) {
    out.push(`<div class="banner warn">${icon('shield', 'i-lg')}<div><strong>No se están guardando los datos</strong>
      Tu navegador está bloqueando el almacenamiento (¿modo incógnito?). Abre la app en una ventana normal.</div></div>`);
  }
  // Si está la tarjeta de primeros pasos, ella ya recuerda instalar la app
  if (esMovil && !esInstalada() && !mostrarPasos) {
    out.push(`<div class="banner info">${icon('download', 'i-lg')}<div><strong>Instala la app en tu celular</strong>
      ${esIOS
        ? 'En Safari toca <b>Compartir</b> (el cuadrado con flecha) y luego <b>"Agregar a inicio"</b>. Así tus datos quedan protegidos y la abres como una app.'
        : 'Toca el menú <b>⋮</b> del navegador y luego <b>"Instalar app"</b> o <b>"Agregar a pantalla principal"</b>.'}
      <div class="banner-actions"><a class="btn btn-sm btn-outline" href="#/ajustes">Ver cómo</a></div></div></div>`);
  }
  if (clientes.length >= 3 && !nube.enCuenta()) { // con cuenta, todo está en la nube
    const ult = a.ultimoRespaldo ? diasEntre(fechaStr(new Date(a.ultimoRespaldo)), hoy()) : Infinity;
    if (ult >= DIAS_RECORDAR_RESPALDO) {
      out.push(`<div class="banner warn">${icon('shield', 'i-lg')}<div><strong>Haz una copia de seguridad</strong>
        ${a.ultimoRespaldo ? `Tu última copia fue hace ${ult} días.` : 'Aún no has guardado ninguna copia.'} Si cambias o pierdes el celular, con la copia recuperas todo.
        <div class="banner-actions"><button class="btn btn-sm btn-primary" data-respaldo>${icon('download', 'i-sm')} Guardar copia ahora</button></div></div></div>`);
    }
  }
  return out.length ? `<div class="stack mt-16">${out.join('')}</div>` : '';
}

function comoFunciona() {
  return `
    <section class="section">
      <div class="section-head"><h2 class="section-title">Así funciona</h2></div>
      <div class="grouped">
        <div class="g-row"><img class="thumb" src="img/mini/xterra-montana-sq.jpg" alt="" loading="lazy"><div class="li-body"><b>1. Registra a tus clientes</b><span class="small muted">Nombre, celular, el carro que le interesa y su cumpleaños.</span></div></div>
        <div class="g-row"><img class="thumb" src="img/mini/gtr-negro-sq.jpg" alt="" loading="lazy"><div class="li-body"><b>2. La app te avisa cuándo escribir</b><span class="small muted">Cumpleaños, seguimientos, mantenimientos y aniversarios de compra.</span></div></div>
        <div class="g-row"><img class="thumb" src="img/mini/navara-nieve-sq.jpg" alt="" loading="lazy"><div class="li-body"><b>3. Tú solo tocas "Enviar"</b><span class="small muted">El mensaje llega escrito a WhatsApp, con el nombre de cada cliente.</span></div></div>
      </div>
    </section>`;
}
