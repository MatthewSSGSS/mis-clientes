-- =============================================================================
-- Mis Clientes — base de datos en Supabase
-- Se pega completo en: Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar varias veces sin dañar nada.
--
-- Antes de ejecutarlo, reemplaza:
--   __URL_PROYECTO__  → la URL del proyecto (https://xxxx.supabase.co)
--   __CRON_SECRET__   → el mismo valor del secreto CRON_SECRET de la función "avisos"
-- (privado/esquema-listo.sql ya viene con los valores puestos; esa carpeta no se sube a GitHub)
-- =============================================================================

-- 1) Datos de cada usuario: todo en un solo documento (jsonb) + versión para sincronizar
create table if not exists public.datos_usuario (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  datos       jsonb not null default '{}'::jsonb,
  momentos    jsonb not null default '[]'::jsonb,   -- cuándo enviar avisos (los calcula la app)
  version     bigint not null default 1,
  actualizado timestamptz not null default now()
);
alter table public.datos_usuario enable row level security;

drop policy if exists "datos: ver los propios" on public.datos_usuario;
drop policy if exists "datos: crear los propios" on public.datos_usuario;
drop policy if exists "datos: cambiar los propios" on public.datos_usuario;
drop policy if exists "datos: borrar los propios" on public.datos_usuario;
create policy "datos: ver los propios"     on public.datos_usuario for select to authenticated using (user_id = (select auth.uid()));
create policy "datos: crear los propios"   on public.datos_usuario for insert to authenticated with check (user_id = (select auth.uid()));
create policy "datos: cambiar los propios" on public.datos_usuario for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "datos: borrar los propios"  on public.datos_usuario for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.datos_usuario to authenticated;

-- 2) Equipos registrados para notificaciones push
create table if not exists public.suscripciones_push (
  endpoint text primary key,
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh   text not null default '',
  auth     text not null default '',
  creado   timestamptz not null default now()
);
create index if not exists suscripciones_push_user_id on public.suscripciones_push(user_id);
alter table public.suscripciones_push enable row level security;
drop policy if exists "push: ver las propias" on public.suscripciones_push;
create policy "push: ver las propias" on public.suscripciones_push for select to authenticated using (user_id = (select auth.uid()));
grant select on public.suscripciones_push to authenticated;

-- Registrar / quitar el equipo actual (si el equipo era de otra cuenta, pasa a esta)
create or replace function public.registrar_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language sql security definer set search_path = public as $$
  insert into public.suscripciones_push (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, creado = now();
$$;
create or replace function public.quitar_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.suscripciones_push where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.registrar_push(text, text, text) from public, anon;
revoke all on function public.quitar_push(text) from public, anon;
grant execute on function public.registrar_push(text, text, text) to authenticated;
grant execute on function public.quitar_push(text) to authenticated;

-- 3) Avisos ya enviados (para no repetir). Solo la usa el servidor.
create table if not exists public.avisos_enviados (
  user_id uuid not null references auth.users(id) on delete cascade,
  clave   text not null,
  enviado timestamptz not null default now(),
  primary key (user_id, clave)
);
alter table public.avisos_enviados enable row level security;

-- Permisos del servidor (la función "avisos" usa el rol service_role).
-- Hace falta si al crear el proyecto se desmarcó "Automatically expose new tables".
grant select, insert, update, delete on public.datos_usuario, public.suscripciones_push, public.avisos_enviados to service_role;

-- 4) Tareas programadas: revisar avisos cada 10 minutos y limpiar los viejos
-- (__FUNCION__ es el nombre con que se creó la función en Supabase, p. ej. "avisos" o "Avisos")
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname in ('mis-clientes-avisos', 'mis-clientes-limpieza');

select cron.schedule('mis-clientes-avisos', '*/10 * * * *', $$
  select net.http_post(
    url     := '__URL_PROYECTO__/functions/v1/__FUNCION__',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "__CRON_SECRET__"}'::jsonb,
    body    := '{}'::jsonb
  );
$$);

select cron.schedule('mis-clientes-limpieza', '0 4 * * *', $$
  delete from public.avisos_enviados where enviado < now() - interval '30 days';
$$);
