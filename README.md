# Mis Clientes

App web para vendedores: registra clientes, recuerda cuándo escribirles (cumpleaños, seguimientos, mantenimientos, aniversarios de compra) y deja los mensajes de WhatsApp listos para enviar con un toque.

- **Funciona en cualquier dispositivo:** iPhone, Android y computador. Se instala como app desde el navegador.
- **Gratis y sin servidor:** es una página estática (HTML, CSS y JavaScript). Se publica gratis en GitHub Pages.
- **Datos privados:** cada persona que abre el link tiene sus propios datos, guardados solo en su dispositivo (`localStorage`). Nadie más los ve, ni siquiera tú como dueño del código.
- **WhatsApp sin riesgo:** no usa APIs ni automatiza la cuenta. Abre WhatsApp con el chat y el mensaje ya escritos, y la persona toca "Enviar". Así el número no corre riesgo de bloqueo.

## Probarla en tu computador

Los módulos de JavaScript necesitan un servidor; abrir el `index.html` con doble clic no funciona. Desde esta carpeta:

```bash
python -m http.server 8000
```

Luego abre <http://localhost:8000>.

> Truco: para empezar de cero, en las herramientas de desarrollador (F12) ve a **Application → Local Storage** y borra la clave `misclientes:datos`.

## Publicar y actualizar

La app se publica con **GitHub Pages** (Settings → Pages → Deploy from branch → `main` / root). Para actualizarla:

```bash
git add .
git commit -m "Describe el cambio"
git push
```

En uno o dos minutos el link ya tiene la versión nueva. La app pide primero la versión de internet, así que la gente ve los cambios al abrirla.

**Antes de publicar:**
1. Sube `APP_VERSION` en [js/config.js](js/config.js).
2. Si agregaste archivos nuevos, súmalos a `ARCHIVOS` en [sw.js](sw.js) y cambia su `VERSION` (así funcionan sin internet).
3. Si cambiaste la forma de los datos, agrega una **migración** (ver abajo).

## Estructura

```
index.html            Estructura base + íconos SVG (<symbol id="i-...">)
styles.css            Todos los estilos (colores en :root, modo oscuro incluido)
sw.js                 Service worker: modo sin internet
manifest.webmanifest  Datos para instalar la app
img/                  Fotos (Unsplash, licencia libre)
icons/                Íconos de la app
js/
  config.js           ⭐ Lo editable: etapas, secciones, plantillas, reglas, modelos, países
  store.js            Datos, guardado en localStorage y migraciones
  engine.js           Calcula qué mensajes tocan cada día
  whatsapp.js         Arma los enlaces de WhatsApp
  enviar.js           Ventanas de envío (individual y "enviar en serie")
  cliente-form.js     Formulario de cliente
  importar.js         Excel/CSV, contactos .vcf, copia de seguridad, exportar, ejemplos
  documentos.js       PDF, Word, fotos del cuaderno (OCR) y listas escritas → clientes
  recordatorios.js    Recordatorio diario (calendario) y número de pendientes en el ícono
  citas.js            Citas (pruebas de manejo, visitas, entregas): agendar, lista, hecha, calendario
  sesion.js           Cerrar sesión, pantalla de entrada y PIN opcional
cal/                  Eventos .ics del recordatorio diario (generados por tools/generar_calendarios.py)
  ui.js               Piezas visuales: hoja/ventana, avisos, confirmaciones, avatares
  util.js             Fechas, textos y teléfonos
  main.js             Arranque y navegación (rutas con #)
  views/              Una pantalla por archivo: hoy, clientes, ficha, mensajes, ajustes, bienvenida
```

## Cómo agregar cosas

| Quiero… | Dónde |
|---|---|
| Cambiar o agregar plantillas por defecto | `PLANTILLAS_POR_DEFECTO` en `js/config.js` (solo aplica a usuarios nuevos; los actuales necesitan una migración) |
| Agregar una etapa o una sección de mensajes | `ETAPAS` / `CATEGORIAS` en `js/config.js` |
| Un campo nuevo en el cliente | `js/cliente-form.js` (HTML + `submit`), valor inicial en `nuevoCliente()` de `js/store.js`, y mostrarlo en `js/views/ficha.js` |
| Una regla automática nueva (p. ej. "SOAT por vencer") | `REGLAS_POR_DEFECTO` en config, `DESCRIPCION_REGLAS` y `pendientesDeReglas()` en `js/engine.js` |
| Una pantalla nueva | `js/views/<nombre>.js` con `export function render(root, ctx)`, registrarla en `RUTAS` de `js/main.js` y agregar el link en `index.html` |
| Un ícono | Un `<symbol id="i-nombre">` en `index.html` (estilo [Lucide](https://lucide.dev)), y luego `icon('nombre')` |
| Colores | Variables en `:root` de `styles.css` (y su versión oscura) |

### Notificaciones

Una página web no puede programar notificaciones con la app cerrada, así que la app usa dos caminos sin servidor:

- **Recordatorio diario:** se agrega al calendario del celular un evento que se repite y trae una alerta. Los archivos están en `cal/`; si cambia la URL de la app, edita `URL_APP` en `tools/generar_calendarios.py` y vuelve a ejecutarlo.
- **Número en el ícono** (`navigator.setAppBadge`): se actualiza cada vez que se abre la app.

Para notificaciones push con texto personalizado ("Hoy cumple Laura") haría falta un servidor pequeño que las envíe a una hora fija. Por ejemplo, un Cloudflare Worker gratis con Cron Triggers y KV para guardar las suscripciones, más un evento `push` en `sw.js` que arme el texto con lo pendiente del día.

### Migraciones (para no perder datos)

Los datos de cada persona quedan guardados con un número de `schema`. Si un cambio necesita transformar datos existentes, sube `SCHEMA` en `js/store.js` y agrega el paso:

```js
const MIGRACIONES = {
  1: (d) => d,
  2: (d) => { d.clientes.forEach((c) => { c.placa ??= ''; }); return d; },
};
```

Al abrir la app, los datos viejos se actualizan solos. Las copias de seguridad viejas también pasan por la migración al restaurarse.

## Fotos

Todas las fotos son de [Unsplash](https://unsplash.com) (licencia libre, uso comercial permitido): Nissan Qashqai, Xterra, Navara, Frontier, GT-R y un volante Nissan.
