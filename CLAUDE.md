# CLAUDE.md

App web estática ("Mis Clientes") para seguimiento de clientes de una vendedora de vehículos Nissan, con mensajes de WhatsApp programados. El dueño (Matthew) la mantiene y le agrega funciones; la usuaria principal es su mamá (iPhone), pero cualquiera puede usar el link.

## Restricciones clave
- **Sin build ni npm.** Vanilla JS con módulos ES, servida tal cual por GitHub Pages. supabase-js está copiado en `js/vendor/`. No introducir bundlers ni frameworks sin que se pida.
- **Backend: Supabase** (proyecto "Agenda"), opcional para el usuario. Modo sin cuenta: `localStorage` clave `misclientes:datos`. Modo cuenta: copia local en `misclientes:cuenta:<uid>`, sincronizada con la tabla `datos_usuario` (jsonb + `version`). Ver `js/nube.js`, `js/sincro.js` y `supabase/`.
- Cualquier cambio en la forma de los datos requiere subir `SCHEMA` y agregar un paso en `MIGRACIONES` (`js/store.js`). Nunca romper datos existentes. Todo lo que se guarde debe llevar `actualizado`, y lo que se borre debe pasar por `marcarBorrado` (si no, la sincronización lo resucita).
- `privado/` tiene secretos y está en `.gitignore`: nunca subirlo ni mostrar su contenido.
- **WhatsApp solo por enlaces** (`whatsapp://send` en móvil, `wa.me` en escritorio). No usar APIs no oficiales que automaticen la cuenta (riesgo de bloqueo del número).
- **Gratis.** Nada que requiera pago.
- Textos de la interfaz y comentarios del código **en español** (es-CO, tuteo). Nombres de funciones y variables en español, como el resto del código.
- Debe verse bien en iPhone: inputs de 16px (evita el zoom), `env(safe-area-inset-*)`, sin desborde horizontal a 390px.

## Arquitectura
- `js/config.js`: constantes editables (etapas, categorías, plantillas y reglas por defecto, fotos, `APP_VERSION`).
- `js/store.js`: única fuente de verdad. Las mutaciones llaman a `cambio()`, que guarda y notifica. `main.js` vuelve a dibujar la vista actual en cada cambio, salvo que haya un input enfocado (entonces espera al blur).
- `js/engine.js`: genera los "pendientes" (`{key, clienteId, fecha, categoria, tipo, plantillaId|texto, titulo}`) a partir de reglas y programados. Un pendiente desaparece cuando su `key` está en `store.envios`.
- Vistas en `js/views/*.js`: `render(root, ctx)` arma el HTML con template strings (siempre escapar con `esc()`) y conecta eventos sobre `root`.
- `js/ui.js`: `abrirHoja` (ventana inferior, maneja el botón atrás), `aviso` (toast con acción), `confirmar`.

## Al cambiar algo
- Subir `APP_VERSION` (config.js). Si hay archivos nuevos, agregarlos a `ARCHIVOS` en `sw.js` y subir su `VERSION`.
- Probar localmente: `python -m http.server 8000`. Si está Playwright (miniconda), conviene un recorrido headless con `channel="msedge"` a 390×844 para revisar errores de consola y desborde horizontal.
