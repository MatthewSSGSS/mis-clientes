// =============================================================================
// config.js — Todo lo "editable" de la app en un solo lugar.
// Si quieres cambiar textos por defecto, etapas, categorías o modelos,
// este es el archivo. Cada vez que publiques cambios, sube APP_VERSION.
// =============================================================================

export const APP_VERSION = '2.5.0';

// Nube (Supabase): cuentas, sincronización y notificaciones.
// La URL y la clave "publishable" son públicas: está bien que vayan aquí.
// La seguridad la dan las reglas (RLS) de la base de datos: cada usuario
// solo puede leer y escribir sus propios datos (ver supabase/esquema.sql).
// Si dejas `url` vacío, la app funciona solo en modo "sin cuenta".
export const NUBE = {
  url: 'https://ivajnzmbzuvaylozurah.supabase.co',
  clave: 'sb_publishable_xUd9eE8PuAnn1KGicKkPdA_5ZQ1yVNr',
  // Nombre con que se creó la función de notificaciones en Supabase (distingue mayúsculas)
  funcionAvisos: 'Avisos',
  // Función que lee las fotos del cuaderno con Claude (supabase/functions/leer-cuaderno)
  funcionLector: 'leer-cuaderno',
  // Clave pública de las notificaciones push (la privada va en los secretos de Supabase)
  vapidPublica: 'BEWMtL-a7Ww-4XwXV8YSwgyEGBGQO-jbhSocePd_gdfqe6St9CP6LizGqs64HZHLIb7oJmR2bejppWk4W9NE1lo',
};

// Etapas del proceso de venta. El orden importa (así se muestran).
// color: blue | violet | amber | green | red | pink | gray
export const ETAPAS = [
  { id: 'nuevo',      nombre: 'Nuevo',      color: 'blue' },
  { id: 'cotizado',   nombre: 'Cotizado',   color: 'violet' },
  { id: 'negociando', nombre: 'Negociando', color: 'amber' },
  { id: 'vendido',    nombre: 'Vendido',    color: 'green' },
  { id: 'perdido',    nombre: 'No compró',  color: 'gray' },
];
// Etapas que cuentan como "cliente en proceso" (para estadísticas)
export const ETAPAS_ACTIVAS = ['nuevo', 'cotizado', 'negociando'];

// Secciones de mensajes. icon = id de un <symbol> en index.html (sin "i-")
export const CATEGORIAS = [
  { id: 'cumpleanos',  nombre: 'Cumpleaños',        icon: 'gift',     color: 'pink' },
  { id: 'seguimiento', nombre: 'Seguimiento',       icon: 'clock',    color: 'blue' },
  { id: 'recordatorio',nombre: 'Recordatorios',     icon: 'bell',     color: 'amber' },
  { id: 'ofertas',     nombre: 'Ofertas',           icon: 'tag',      color: 'red' },
  { id: 'postventa',   nombre: 'Postventa',         icon: 'wrench',   color: 'green' },
  { id: 'especiales',  nombre: 'Fechas especiales', icon: 'sparkles', color: 'violet' },
];

// Tipos de cita. icon = id de un <symbol> en index.html
export const TIPOS_CITA = [
  { id: 'prueba',   nombre: 'Prueba de manejo', icon: 'car',      color: 'blue' },
  { id: 'visita',   nombre: 'Visita',           icon: 'home',     color: 'violet' },
  { id: 'entrega',  nombre: 'Entrega',          icon: 'star',     color: 'green' },
  { id: 'llamada',  nombre: 'Llamada',          icon: 'phone',    color: 'amber' },
  { id: 'otro',     nombre: 'Otra cita',        icon: 'calendar', color: 'gray' },
];

// Formas de pago de una negociación
export const FORMAS_PAGO = [
  { id: 'contado', nombre: 'Contado' },
  { id: 'credito', nombre: 'Crédito' },
  { id: 'leasing', nombre: 'Leasing' },
];

// Documentos que se piden para un crédito (se pueden agregar más en cada cliente)
export const DOCUMENTOS_CREDITO = [
  'Cédula',
  'Certificado laboral o de ingresos',
  'Extractos bancarios (3 meses)',
  'Declaración de renta (si aplica)',
  'Formulario de crédito firmado',
];

export const ORIGENES = ['Vitrina', 'Referido', 'Redes sociales', 'Llamada', 'WhatsApp', 'Evento', 'Otro'];

// Modelos sugeridos al escribir el vehículo (cada usuario puede cambiarlos en Ajustes)
export const MODELOS_POR_DEFECTO = [
  'Kicks', 'Kicks Play', 'Versa', 'Sentra', 'March', 'X-Trail', 'X-Trail e-POWER',
  'Qashqai', 'Pathfinder', 'Murano', 'Frontier', 'Navara', 'Leaf', 'Ariya', 'Patrol', 'Magnite',
];

// --- Formato de cada persona (las columnas de su cuaderno) ---------------------------
// Campos que la app entiende. Cada cuenta elige cuáles usa, en qué orden y con qué
// nombre: ese es su "formato" (ver js/formato.js). Las columnas que no están aquí se
// guardan como campos propios del cliente (cliente.extras).
//   tipo: texto | numero | tel | vehiculo | dinero | fecha | cumple | sino | email | largo
//   venta: true = solo aplica a clientes que ya compraron
//   fijo: true = obligatorio, no se puede quitar del formato
export const CAMPOS = {
  nombre:            { titulo: 'Nombre', tipo: 'texto', fijo: true },
  telefono:          { titulo: 'Celular', tipo: 'tel', fijo: true },
  pedido:            { titulo: 'Pedido', tipo: 'numero', venta: true },
  vehiculoComprado:  { titulo: 'Vehículo', tipo: 'vehiculo', venta: true },
  poliza:            { titulo: 'Póliza', tipo: 'sino', venta: true },
  cedula:            { titulo: 'Cédula', tipo: 'numero' },
  precio:            { titulo: 'Valor venta', tipo: 'dinero', venta: true },
  fechaCompra:       { titulo: 'Fecha de entrega', tipo: 'fecha', venta: true },
  comision:          { titulo: 'Comisión', tipo: 'dinero', venta: true },
  fechaPagoComision: { titulo: 'Pago comisión', tipo: 'fecha', venta: true },
  cumple:            { titulo: 'Cumpleaños', tipo: 'cumple' },
  email:             { titulo: 'Correo', tipo: 'email' },
  notas:             { titulo: 'Notas', tipo: 'largo' },
};

// Tipos para las columnas propias (las que la app no conoce, como "Placa")
export const TIPOS_COLUMNA = [
  { id: 'texto', nombre: 'Texto' },
  { id: 'numero', nombre: 'Número' },
  { id: 'dinero', nombre: 'Plata ($)' },
  { id: 'fecha', nombre: 'Fecha' },
  { id: 'sino', nombre: 'Sí / No' },
];

// El cuaderno de ventas (un cliente = una compra)
export const FORMATO_CUADERNO = [
  { id: 'pedido', titulo: 'Pedido' },
  { id: 'vehiculoComprado', titulo: 'Vehículo' },
  { id: 'nombre', titulo: 'Nombre del cliente' },
  { id: 'poliza', titulo: 'Póliza' },
  { id: 'cedula', titulo: 'Cédula' },
  { id: 'telefono', titulo: 'Celular' },
  { id: 'precio', titulo: '$ Venta' },
  { id: 'fechaCompra', titulo: 'Fecha de entrega' },
  { id: 'comision', titulo: '$ Comisión' },
  { id: 'fechaPagoComision', titulo: 'Pago comisión' },
];

// Para quien todavía no ha elegido formato ni leído su cuaderno
export const FORMATO_BASICO = [
  { id: 'nombre', titulo: 'Nombre' },
  { id: 'telefono', titulo: 'Celular' },
  { id: 'vehiculoComprado', titulo: 'Vehículo' },
  { id: 'fechaCompra', titulo: 'Fecha de compra' },
  { id: 'precio', titulo: 'Valor' },
  { id: 'cedula', titulo: 'Cédula' },
  { id: 'cumple', titulo: 'Cumpleaños' },
];

// Códigos de país para armar el número de WhatsApp
export const PAISES = [
  { codigo: '57',  nombre: 'Colombia' },
  { codigo: '52',  nombre: 'México' },
  { codigo: '51',  nombre: 'Perú' },
  { codigo: '56',  nombre: 'Chile' },
  { codigo: '593', nombre: 'Ecuador' },
  { codigo: '58',  nombre: 'Venezuela' },
  { codigo: '54',  nombre: 'Argentina' },
  { codigo: '507', nombre: 'Panamá' },
  { codigo: '506', nombre: 'Costa Rica' },
  { codigo: '502', nombre: 'Guatemala' },
  { codigo: '503', nombre: 'El Salvador' },
  { codigo: '504', nombre: 'Honduras' },
  { codigo: '591', nombre: 'Bolivia' },
  { codigo: '595', nombre: 'Paraguay' },
  { codigo: '598', nombre: 'Uruguay' },
  { codigo: '1',   nombre: 'Estados Unidos / R. Dominicana / Puerto Rico' },
  { codigo: '34',  nombre: 'España' },
];

// Variables para un mensaje programado a varios clientes: se cambian por los
// datos de cada uno al enviar ("Hola {nombre}" → "Hola Laura")
export const VARIABLES = [
  { clave: '{nombre}',          desc: 'Primer nombre del cliente', boton: 'Nombre' },
  { clave: '{nombre_completo}', desc: 'Nombre completo',           boton: 'Nombre completo' },
  { clave: '{vehiculo}',        desc: 'Su vehículo',               boton: 'Vehículo' },
  { clave: '{mi_nombre}',       desc: 'Tu nombre',                 boton: 'Mi nombre' },
];

// Plantillas de versiones anteriores. Ya NO se usan (cada mensaje lo escribe
// la persona); se conservan solo para que los datos viejos sigan funcionando.
// Plantillas que venían con la app. Los ids deben ser únicos y no cambiar
// (las reglas automáticas los usan).
export const PLANTILLAS_POR_DEFECTO = [
  // Cumpleaños
  { id: 'tpl-cumple-1', categoria: 'cumpleanos', titulo: 'Feliz cumpleaños',
    texto: '¡Feliz cumpleaños, {nombre}! 🎉 Que este nuevo año te traiga muchas bendiciones y kilómetros de alegría. Un abrazo grande, {mi_nombre}.' },
  { id: 'tpl-cumple-2', categoria: 'cumpleanos', titulo: 'Cumpleaños cercano',
    texto: '¡Hola {nombre}! 🎂 Hoy es tu día y no quería dejar pasar la oportunidad de saludarte. ¡Que lo disfrutes al máximo! Aquí estoy para lo que necesites. {mi_nombre}' },
  // Seguimiento
  { id: 'tpl-seg-1', categoria: 'seguimiento', titulo: 'Después de cotizar',
    texto: 'Hola {nombre}, ¿cómo estás? Te saluda {mi_nombre}. Quería saber si pudiste revisar la cotización del {vehiculo}. Si tienes alguna duda o quieres agendar una prueba de manejo, con gusto te ayudo 🚗' },
  { id: 'tpl-seg-2', categoria: 'seguimiento', titulo: 'Retomar contacto',
    texto: 'Hola {nombre}, espero que estés muy bien. ¿Sigues pensando en el {vehiculo}? Tengo novedades que te pueden interesar. ¿Te parece si hablamos un momento?' },
  // Recordatorios
  { id: 'tpl-rec-1', categoria: 'recordatorio', titulo: 'Prueba de manejo',
    texto: 'Hola {nombre}, te recuerdo nuestra cita para la prueba de manejo del {vehiculo}. ¡Te espero! Si necesitas cambiar la hora, me avisas. {mi_nombre}' },
  { id: 'tpl-rec-2', categoria: 'recordatorio', titulo: 'Documentos pendientes',
    texto: 'Hola {nombre}, para avanzar con tu {vehiculo} solo nos faltan algunos documentos. ¿Cuándo te queda fácil enviármelos? 📄' },
  { id: 'tpl-cita-confirmar', categoria: 'recordatorio', titulo: 'Confirmar cita',
    texto: 'Hola {nombre}, te confirmo nuestra cita: {cita} el {cita_fecha} a las {cita_hora}. ¡Te espero! Si necesitas cambiar la hora, me avisas. {mi_nombre}' },
  { id: 'tpl-cita-hoy', categoria: 'recordatorio', titulo: 'Cita de hoy',
    texto: '¡Hola {nombre}! Te recuerdo que hoy a las {cita_hora} tenemos tu {cita}. ¡Nos vemos! 🚗 {mi_nombre}' },
  { id: 'tpl-docs', categoria: 'recordatorio', titulo: 'Pedir documentos que faltan',
    texto: 'Hola {nombre}, para avanzar con el crédito de tu {vehiculo} me hacen falta estos documentos:\n{documentos_pendientes}\n¿Me los puedes enviar por aquí? 📄 Gracias, {mi_nombre}' },
  // Ofertas
  { id: 'tpl-ofe-1', categoria: 'ofertas', titulo: 'Oferta del mes',
    texto: '¡Hola {nombre}! 🔥 Este mes tenemos condiciones especiales: bonos, tasas preferenciales y opciones de retoma. ¿Quieres que te cuente los detalles?' },
  { id: 'tpl-ofe-2', categoria: 'ofertas', titulo: 'Lanzamiento',
    texto: 'Hola {nombre}, ¡llegó una novedad que te va a encantar! Te invito a conocerla en persona. ¿Te agendo una visita esta semana?' },
  // Postventa
  { id: 'tpl-post-gracias', categoria: 'postventa', titulo: 'Gracias por tu compra',
    texto: '¡{nombre}, muchas gracias por tu confianza! Disfruta mucho tu {vehiculo} 🚗✨ Cualquier cosa que necesites, aquí estoy. {mi_nombre}' },
  { id: 'tpl-post-aniv', categoria: 'postventa', titulo: 'Aniversario de compra',
    texto: '¡Hola {nombre}! 🎉 Hoy se cumple un año más desde que estrenaste tu {vehiculo}. Gracias por seguir confiando en mí. ¿Cómo te ha ido con él?' },
  { id: 'tpl-post-mant', categoria: 'postventa', titulo: 'Mantenimiento',
    texto: 'Hola {nombre}, te escribo para recordarte que tu {vehiculo} ya está para su mantenimiento preventivo 🔧 ¿Te ayudo a agendar la cita en el taller?' },
  // Fechas especiales
  { id: 'tpl-esp-navidad', categoria: 'especiales', titulo: 'Navidad',
    texto: '¡Feliz Navidad, {nombre}! 🎄 Te deseo unos días llenos de paz y amor junto a los tuyos. Un abrazo, {mi_nombre}.' },
  { id: 'tpl-esp-anio', categoria: 'especiales', titulo: 'Año nuevo',
    texto: '¡Feliz año nuevo, {nombre}! 🥂 Que este año venga cargado de éxitos… y por qué no, de carro nuevo 😉. {mi_nombre}' },
  { id: 'tpl-esp-madre', categoria: 'especiales', titulo: 'Día de la madre',
    texto: '¡Feliz día, {nombre}! 💐 Hoy celebramos a las mamás maravillosas como tú. Que tengas un día muy especial. {mi_nombre}' },
];

// Reglas automáticas: generan mensajes "para hoy" sin que tengas que programarlos.
export const REGLAS_POR_DEFECTO = {
  cumpleanos:    { activa: true },
  seguimiento:   { activa: true },
  aniversario:   { activa: true },
  mantenimiento: { activa: true, meses: 6 },
  citas:         { activa: true },
};

// Cuántos días hacia atrás se siguen mostrando mensajes que no enviaste
export const DIAS_ATRASO = {
  cumpleanos: 1,
  aniversario: 3,
  mantenimiento: 7,
  cita: 1,
  programado: 14,
};
// Cuántos días hacia adelante muestra "Próximos días"
export const DIAS_PROXIMOS = 14;

// Cada cuántos días recordar hacer copia de seguridad
export const DIAS_RECORDAR_RESPALDO = 14;

// Un cliente "en proceso" sin seguimiento programado se considera que se está
// enfriando si pasan estos días sin escribirle
export const DIAS_ENFRIANDO = 10;

// Consejo del día (sale uno distinto cada día en Inicio)
export const CONSEJOS = [
  'Responde rápido a los clientes nuevos: el primer día es cuando más interesados están.',
  'Después de una prueba de manejo, escríbele ese mismo día para preguntar cómo se sintió con el carro.',
  'Anota detalles personales en las notas (familia, trabajo, color favorito). Mencionarlos después genera confianza.',
  'Un cliente "Cotizado" sin seguimiento se enfría. Ponle siempre una fecha para volver a escribirle.',
  'Los clientes que ya compraron son tu mejor fuente de referidos. Pregúntales si conocen a alguien buscando carro.',
  'Saluda en los cumpleaños sin vender nada: el cliente recuerda a quien se acordó de él.',
  'Antes de escribir o llamar, revisa el historial del cliente para retomar donde quedaron.',
  'Si un cliente dice "lo voy a pensar", programa el seguimiento en 3 días y anota qué lo está frenando.',
  'Usa mensajes cortos y personales. Ajusta un poco la plantilla para que suene a ti.',
  'Al cerrar una venta, márcala como "Vendido": la app te recordará el mantenimiento y el aniversario.',
  'Revisa de vez en cuando los "No compró": las condiciones cambian y algunos vuelven.',
  'Escribe en horarios prudentes: mejor durante el día que de noche o muy temprano.',
  'Haz tu copia de seguridad cada semana. Toma un minuto y protege todo tu trabajo.',
  'Cuando llegue una promoción, prográmala para los clientes en "Cotizado" y "Negociando".',
];

// Fotos usadas en la app (carpeta img/). Créditos: Unsplash (licencia libre).
export const FOTOS = {
  hoy: ['qashqai-atardecer.jpg', 'gtr-naranja.jpg', 'frontier-negra.jpg', 'navara-nieve.jpg', 'xterra-montana.jpg', 'gtr-negro.jpg', 'volante.jpg'],
  clientes: 'frontier-negra.jpg',
  ficha: 'qashqai-atardecer.jpg',
  mensajes: 'gtr-naranja.jpg',
  ajustes: 'volante.jpg',
  bienvenida: 'gtr-negro.jpg',
};
