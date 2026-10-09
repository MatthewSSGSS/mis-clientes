// @ts-nocheck — Este archivo corre en Supabase (Deno). VS Code no conoce Deno y lo marcaría en rojo.
// =============================================================================
// Función "leer-cuaderno" (Supabase Edge Function) — lee con Claude la foto de
// una hoja del cuaderno y devuelve sus columnas (las que tenga ese cuaderno) y
// las filas. La app manda el formato de la persona como pista.
//
// • Solo para usuarios con sesión iniciada (se verifica el token).
// • Límite de lecturas por usuario al día (LIMITE_DIARIO) para cuidar el saldo.
// • La clave de Anthropic va en el secreto ANTHROPIC_API_KEY (nunca en la app).
// Importante: desactivar "Verify JWT" en esta función (la verificación la hace
// el propio código, igual que en "Avisos").
// =============================================================================

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MODELO = 'claude-opus-5-5';
const LIMITE_DIARIO = 40;              // hojas por usuario al día
const MAX_IMAGEN = 6 * 1024 * 1024;    // tamaño máximo de la imagen (base64)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const INSTRUCCIONES = `Eres un asistente que pasa a digital el cuaderno de clientes de una persona que vende vehículos en Colombia.
Recibes la foto de UNA hoja con una tabla escrita a mano. Cada fila es un cliente (normalmente, una venta).

1. Identifica las columnas de la tabla, de izquierda a derecha. En "titulo" escribe el título como está en la hoja, con mayúscula inicial (ej. "Pedido", "$ Venta", "Fecha de entrega"). Si no tiene título, ponle uno corto según su contenido.
   En "campo" indica qué dato es:
   pedido (número de pedido u orden) · vehiculo (modelo que compró) · nombre (nombre del cliente) · poliza (marca de si tomó la póliza o seguro) · cedula (cédula o NIT) · celular · valor_venta (valor del vehículo en pesos) · fecha_entrega (fecha de entrega o de compra) · comision (comisión en pesos) · fecha_pago_comision · cumpleanos · correo · notas (observaciones) · mes (solo el nombre del mes de la sección) · otro (cualquier otra columna: placa, color, financiera…).
2. Devuelve TODAS las filas con datos, en el orden del cuaderno. No inventes filas. En "celdas" va un valor por cada columna, en el mismo orden; si la casilla está vacía, "".

Cómo escribir cada valor:
- Lee cada dígito con mucho cuidado: los números son lo más importante.
- Plata (valor_venta, comision u otras cantidades en pesos): solo dígitos, sin puntos ni signos (ej. "$100'960.100" → "100960100").
- Fechas: AAAA-MM-DD usando el año de la hoja (si no aparece, el indicado). Si falta el día, deja "". La fecha de pago de la comisión suele ser 1 o 2 meses después de la entrega; si cae en enero y la entrega en diciembre, súmale un año.
- Marcas de sí/no (como la póliza): "si" para chulo ✓ y "no" para X. Ignora letras pequeñas como "o" o "d" junto a la marca.
- celular y cedula: solo los dígitos (un NIT puede llevar guion).
- nombre: como en el cuaderno, con mayúscula inicial en cada palabra (ej. "Dairo Luis Luna Melendez").
- cumpleanos: MM-DD.
- Otras columnas: el texto tal como está.
- Si una casilla no se entiende bien, escribe tu mejor lectura y agrega el número de esa columna (la primera es 0) en "dudas" de la fila.`;

const CAMPOS = ['pedido', 'vehiculo', 'nombre', 'poliza', 'cedula', 'celular', 'valor_venta', 'fecha_entrega', 'comision',
  'fecha_pago_comision', 'cumpleanos', 'correo', 'notas', 'mes', 'otro'];

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['anio', 'columnas', 'filas'],
  properties: {
    anio: { type: 'integer', description: 'Año escrito en la hoja, o el indicado si no aparece' },
    columnas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'campo'],
        properties: {
          titulo: { type: 'string' },
          campo: { type: 'string', enum: CAMPOS },
        },
      },
    },
    filas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['celdas', 'dudas'],
        properties: {
          celdas: { type: 'array', items: { type: 'string' } },
          dudas: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
  },
};

/** Las columnas que la persona suele usar (su formato), como pista para Claude. */
function textoPista(columnas: unknown): string {
  if (!Array.isArray(columnas)) return '';
  const lista = columnas.slice(0, 30)
    .map((c) => ({ titulo: String(c?.titulo ?? '').replace(/[\n\r"`]/g, ' ').trim().slice(0, 40), campo: CAMPOS.includes(c?.campo) ? c.campo : 'otro' }))
    .filter((c) => c.titulo);
  if (!lista.length) return '';
  return `\nEsta persona suele anotar estas columnas (úsalas como guía, pero devuelve las que de verdad veas en la hoja): ${lista.map((c) => `"${c.titulo}" (${c.campo})`).join(', ')}.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return responder({ error: 'falta-clave' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // 1) ¿Quién pide? Solo usuarios con sesión.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: quien } = await admin.auth.getUser(token);
  const usuario = quien?.user;
  if (!usuario) return responder({ error: 'no-autorizado' }, 401);

  // 2) Datos de la foto
  const cuerpo = await req.json().catch(() => null);
  const imagen = String(cuerpo?.imagen ?? '');
  const tipo = ['image/jpeg', 'image/png', 'image/webp'].includes(cuerpo?.tipo) ? cuerpo.tipo : 'image/jpeg';
  const anio = Number(cuerpo?.anio) || new Date().getFullYear();
  const pista = textoPista(cuerpo?.columnas);
  if (!imagen) return responder({ error: 'sin-imagen' }, 400);
  if (imagen.length > MAX_IMAGEN) return responder({ error: 'imagen-grande' }, 413);

  // 3) Límite diario (cuida el saldo si alguien abusa)
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from('lecturas_cuaderno').select('*', { count: 'exact', head: true })
    .eq('user_id', usuario.id).gte('creado', desde);
  if ((count ?? 0) >= LIMITE_DIARIO) return responder({ error: 'limite', limite: LIMITE_DIARIO }, 429);

  // 4) Leer con Claude
  const claude = new Anthropic(); // usa el secreto ANTHROPIC_API_KEY
  let respuesta;
  try {
    respuesta = await claude.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
      // Si el filtro de seguridad rechazara la hoja por error, se reintenta en otro modelo
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: INSTRUCCIONES,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: tipo, data: imagen } },
          { type: 'text', text: `Pasa a digital esta hoja del cuaderno. Si no ves el año escrito, usa ${anio}.${pista}` },
        ],
      }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return responder({ error: 'clave-invalida' }, 500);
    if (e instanceof Anthropic.PermissionDeniedError) return responder({ error: 'sin-saldo' }, 402);
    if (e instanceof Anthropic.RateLimitError) return responder({ error: 'ocupado' }, 429);
    if (e instanceof Anthropic.BadRequestError) {
      // Sin saldo suele llegar como 400 con un mensaje sobre el crédito
      const sinSaldo = /credit|balance/i.test(String(e.message));
      return responder({ error: sinSaldo ? 'sin-saldo' : 'solicitud', detalle: String(e.message).slice(0, 200) }, sinSaldo ? 402 : 400);
    }
    if (e instanceof Anthropic.APIError) return responder({ error: 'claude', estado: e.status }, 502);
    return responder({ error: 'conexion' }, 502);
  }

  // Se registra la lectura (cuenta para el límite diario)
  await admin.from('lecturas_cuaderno').insert({ user_id: usuario.id });

  if (respuesta.stop_reason === 'refusal') return responder({ error: 'rechazo' }, 422);
  if (respuesta.stop_reason === 'max_tokens') return responder({ error: 'muy-larga' }, 422);
  const texto = respuesta.content.find((b) => b.type === 'text')?.text ?? '';
  let datos;
  try { datos = JSON.parse(texto); } catch { return responder({ error: 'formato' }, 502); }

  return responder({
    anio: datos.anio,
    columnas: datos.columnas ?? [],
    filas: datos.filas ?? [],
    uso: { entrada: respuesta.usage?.input_tokens, salida: respuesta.usage?.output_tokens },
  });
});
