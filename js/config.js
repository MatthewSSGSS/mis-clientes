// =============================================================================
// config.js — Todo lo "editable" de la app en un solo lugar.
// Si quieres cambiar textos por defecto, etapas, categorías o modelos,
// este es el archivo. Cada vez que publiques cambios, sube APP_VERSION.
// =============================================================================

export const APP_VERSION = '2.0.0';

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

// Variables que se pueden usar dentro de un mensaje
export const VARIABLES = [
  { clave: '{nombre}',          desc: 'Primer nombre del cliente' },
  { clave: '{nombre_completo}', desc: 'Nombre completo' },
  { clave: '{vehiculo}',        desc: 'Vehículo comprado o de interés' },
  { clave: '{mi_nombre}',       desc: 'Tu nombre' },
  { clave: '{precio}',          desc: 'Precio cotizado' },
  { clave: '{documentos_pendientes}', desc: 'Lista de documentos que faltan' },
  { clave: '{cita}',            desc: 'Tipo de cita (solo en citas)' },
  { clave: '{cita_fecha}',      desc: 'Día de la cita (solo en citas)' },
  { clave: '{cita_hora}',       desc: 'Hora de la cita (solo en citas)' },
];

// Plantillas que vienen con la app. Los ids deben ser únicos y no cambiar
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
  cumpleanos:    { activa: true, plantillaId: 'tpl-cumple-1' },
  seguimiento:   { activa: true, plantillaId: 'tpl-seg-1' },
  aniversario:   { activa: true, plantillaId: 'tpl-post-aniv' },
  mantenimiento: { activa: true, plantillaId: 'tpl-post-mant', meses: 6 },
  citas:         { activa: true, plantillaId: 'tpl-cita-confirmar' },
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
