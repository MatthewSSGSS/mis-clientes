// @ts-nocheck — Este archivo corre en Supabase (Deno). VS Code no conoce Deno y lo marcaría en rojo.
// =============================================================================
// Función "avisos" (Supabase Edge Function) — envía las notificaciones push.
//
// • Cada 10 minutos la llama la tarea programada (esquema.sql) con el header
//   x-cron-secret. Revisa los "momentos" de cada usuario (los calcula la app)
//   y, a quien le toque, le envía un push a todos sus equipos.
// • Desde la app, un usuario con sesión puede pedir { prueba: true } para
//   recibir una notificación de prueba al instante.
//
// El push va sin contenido: el service worker del celular arma el texto con el
// resumen guardado en el equipo. Así no hace falta cifrar el mensaje.
//
// Secretos necesarios (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:tu@correo), CRON_SECRET
// Importante: desactivar "Verify JWT" (Enforce JWT verification) en esta función.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const VAPID_PUBLICA = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVADA = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUJETO = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:avisos@example.com';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

// --- base64url --------------------------------------------------------------------
function aB64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deB64u(texto: string): Uint8Array {
  const s = texto.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// --- Firma VAPID (JWT ES256) --------------------------------------------------------
let claveFirma: CryptoKey | null = null;
async function obtenerClave(): Promise<CryptoKey> {
  if (claveFirma) return claveFirma;
  const pub = deB64u(VAPID_PUBLICA); // 0x04 | x (32) | y (32)
  claveFirma = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: VAPID_PRIVADA, x: aB64u(pub.slice(1, 33)), y: aB64u(pub.slice(33, 65)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  return claveFirma;
}

async function jwtVapid(audiencia: string): Promise<string> {
  const enc = new TextEncoder();
  const cabecera = aB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const datos = aB64u(enc.encode(JSON.stringify({
    aud: audiencia, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUJETO,
  })));
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await obtenerClave(), enc.encode(`${cabecera}.${datos}`));
  return `${cabecera}.${datos}.${aB64u(new Uint8Array(firma))}`;
}

/** Envía un push vacío. Devuelve el código HTTP del servicio de push. */
async function enviarPush(endpoint: string): Promise<number> {
  const jwt = await jwtVapid(new URL(endpoint).origin);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { TTL: '86400', Urgency: 'high', Authorization: `vapid t=${jwt}, k=${VAPID_PUBLICA}` },
  });
  await res.body?.cancel();
  return res.status;
}

// deno-lint-ignore no-explicit-any
async function enviarAUsuario(admin: any, userId: string) {
  const { data: subs } = await admin.from('suscripciones_push').select('endpoint').eq('user_id', userId);
  let enviados = 0, fallidos = 0;
  for (const s of subs ?? []) {
    try {
      const status = await enviarPush(s.endpoint);
      if (status === 404 || status === 410) {
        await admin.from('suscripciones_push').delete().eq('endpoint', s.endpoint); // equipo dado de baja
      } else if (status >= 200 && status < 300) enviados++;
      else { fallidos++; console.error('push', status, s.endpoint.slice(0, 60)); }
    } catch (e) {
      fallidos++; console.error('push error', e);
    }
  }
  return { enviados, fallidos, total: subs?.length ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!VAPID_PUBLICA || !VAPID_PRIVADA) return responder({ error: 'Faltan los secretos VAPID' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const cuerpo = await req.json().catch(() => ({}));

  // Notificación de prueba pedida por un usuario desde la app
  if (cuerpo?.prueba) {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data } = await admin.auth.getUser(token);
    if (!data?.user) return responder({ error: 'no autorizado' }, 401);
    return responder(await enviarAUsuario(admin, data.user.id));
  }

  // Revisión programada
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return responder({ error: 'no autorizado' }, 401);
  const ahora = Date.now();
  const desde = ahora - 30 * 60 * 1000; // avisos de los últimos 30 minutos (por si una revisión falló)
  const { data: filas, error } = await admin.from('datos_usuario').select('user_id, momentos');
  if (error) return responder({ error: error.message }, 500);

  let usuarios = 0, enviados = 0;
  for (const fila of filas ?? []) {
    const toca = (fila.momentos ?? []).filter((m: { t: string }) => {
      const t = Date.parse(m.t);
      return t > desde && t <= ahora;
    });
    for (const m of toca) {
      const clave = `${m.tipo}:${m.id ?? ''}:${m.t}`;
      const { error: repetido } = await admin.from('avisos_enviados').insert({ user_id: fila.user_id, clave });
      if (repetido) continue; // ya se envió
      const r = await enviarAUsuario(admin, fila.user_id);
      usuarios++; enviados += r.enviados;
    }
  }
  return responder({ ok: true, usuarios, enviados });
});
