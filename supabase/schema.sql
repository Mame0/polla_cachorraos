-- =====================================================================
--  POLLA MUNDIALISTA — Esquema de base de datos (Supabase / PostgreSQL)
--  Pega TODO este archivo en: Supabase Dashboard -> SQL Editor -> Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

-- Perfiles (extiende auth.users)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  avatar_url  text,
  role        text not null default 'player' check (role in ('player', 'admin', 'tesorero')),
  created_at  timestamptz not null default now()
);

-- Partidos
create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  home_team   text not null,
  away_team   text not null,
  match_date  timestamptz not null,
  stage       text not null default 'Fase de grupos',
  round       text,
  status      text not null default 'upcoming' check (status in ('upcoming', 'live', 'finished')),
  home_score  int,
  away_score  int,
  external_id text,                         -- id del partido en la API (football-data.org)
  force_open  boolean,                      -- true=abierto / false=cerrado / null=automático
  created_at  timestamptz not null default now()
);

-- Evita duplicados al re-sincronizar desde la API
create unique index if not exists matches_external_id_key on public.matches (external_id);

-- Pollas: selección de partidos + monto por persona, creada por un usuario.
create table if not exists public.polls (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  entry_amount numeric not null default 0 check (entry_amount >= 0),
  created_at   timestamptz not null default now()
);

-- Partidos que pertenecen a cada polla.
create table if not exists public.poll_matches (
  poll_id   uuid not null references public.polls(id)   on delete cascade,
  match_id  uuid not null references public.matches(id) on delete cascade,
  primary key (poll_id, match_id)
);

-- Jugadores inscritos en cada polla.
create table if not exists public.poll_members (
  poll_id   uuid not null references public.polls(id)    on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  paid      boolean not null default false,
  paid_at   timestamptz,
  primary key (poll_id, user_id)
);

-- Pronósticos (independientes por polla)
create table if not exists public.predictions (
  id            uuid primary key default gen_random_uuid(),
  poll_id       uuid not null references public.polls(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  match_id      uuid not null references public.matches(id) on delete cascade,
  home_score    int not null check (home_score >= 0),
  away_score    int not null check (away_score >= 0),
  points_earned int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (poll_id, user_id, match_id)
);

create index if not exists idx_poll_matches_poll on public.poll_matches(poll_id);
create index if not exists idx_poll_members_poll on public.poll_members(poll_id);
create index if not exists idx_poll_members_user on public.poll_members(user_id);
create index if not exists idx_predictions_poll  on public.predictions(poll_id);
create index if not exists idx_predictions_match on public.predictions(match_id);
create index if not exists idx_predictions_user  on public.predictions(user_id);
create index if not exists idx_matches_date       on public.matches(match_date);

-- ---------------------------------------------------------------------
-- 2. MOTOR DE PUNTOS
--    5 = marcador exacto | 3 = diferencia de goles correcta (mismo ganador)
--    2 = ganador/empate correcto | 0 = sin acierto
-- ---------------------------------------------------------------------
create or replace function public.calculate_points(
  p_home_pred int, p_away_pred int,
  p_home_real int, p_away_real int
) returns int
language plpgsql immutable as $$
begin
  if p_home_real is null or p_away_real is null then
    return 0;
  end if;

  -- Marcador exacto
  if p_home_pred = p_home_real and p_away_pred = p_away_real then
    return 5;
  end if;

  -- Diferencia de goles correcta (implica el mismo ganador)
  if (p_home_pred - p_away_pred) = (p_home_real - p_away_real) then
    return 3;
  end if;

  -- Ganador o empate correcto
  if sign(p_home_pred - p_away_pred) = sign(p_home_real - p_away_real) then
    return 2;
  end if;

  return 0;
end;
$$;

-- Recalcular puntos de todos los pronósticos cuando se registra el resultado
create or replace function public.recalc_match_points()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.home_score is not null and new.away_score is not null then
    update public.predictions p
       set points_earned = public.calculate_points(p.home_score, p.away_score,
                                                    new.home_score, new.away_score)
     where p.match_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_recalc_points on public.matches;
create trigger trg_recalc_points
  after update of home_score, away_score, status on public.matches
  for each row execute function public.recalc_match_points();

-- Mantener updated_at en predictions
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_predictions on public.predictions;
create trigger trg_touch_predictions
  before update on public.predictions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 3. CREACIÓN AUTOMÁTICA DE PERFIL AL REGISTRARSE
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    'player'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- (El ranking se calcula por polla en la aplicación; no hay vista global.)

-- ---------------------------------------------------------------------
-- 4. SEGURIDAD (Row Level Security)
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_tesorero()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'tesorero');
$$;

-- ¿El partido sigue abierto para pronosticar? (5 min antes del inicio salvo override)
create or replace function public.match_open(p_match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.matches m
    where m.id = p_match_id
      and (
        m.force_open is true
        or (
          m.force_open is not false
          and m.status = 'upcoming'
          and m.match_date > now() + interval '5 minutes'
        )
      )
  );
$$;

alter table public.profiles     enable row level security;
alter table public.matches      enable row level security;
alter table public.predictions  enable row level security;
alter table public.polls        enable row level security;
alter table public.poll_matches enable row level security;
alter table public.poll_members enable row level security;

-- Permisos a nivel de tabla para los roles de Supabase (las filas las restringe RLS).
-- En Supabase hosted suelen venir por "default privileges"; se declaran aquí para que
-- el esquema sea portable (p. ej. en un Supabase local).
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on
  public.profiles, public.matches, public.predictions,
  public.polls, public.poll_matches, public.poll_members
  to anon, authenticated, service_role;

-- PROFILES: todos pueden leer; cada quien edita el suyo
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- El admin puede actualizar cualquier perfil (asignar/quitar el rol de tesorero).
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- MATCHES: todos pueden leer; solo admin gestiona
drop policy if exists matches_select_all on public.matches;
create policy matches_select_all on public.matches
  for select using (true);

drop policy if exists matches_admin_all on public.matches;
create policy matches_admin_all on public.matches
  for all using (public.is_admin()) with check (public.is_admin());

-- POLLS: todo autenticado lee; cualquiera crea la suya; solo creador/admin modifica
drop policy if exists polls_select_all on public.polls;
create policy polls_select_all on public.polls
  for select using (auth.uid() is not null);

drop policy if exists polls_insert_own on public.polls;
create policy polls_insert_own on public.polls
  for insert with check (created_by = auth.uid());

drop policy if exists polls_update_owner on public.polls;
create policy polls_update_owner on public.polls
  for update using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

drop policy if exists polls_delete_owner on public.polls;
create policy polls_delete_owner on public.polls
  for delete using (created_by = auth.uid() or public.is_admin());

-- POLL_MATCHES: todo autenticado lee; solo el creador de la polla (o admin) gestiona
drop policy if exists poll_matches_select_all on public.poll_matches;
create policy poll_matches_select_all on public.poll_matches
  for select using (auth.uid() is not null);

drop policy if exists poll_matches_manage_owner on public.poll_matches;
create policy poll_matches_manage_owner on public.poll_matches
  for all using (
    public.is_admin()
    or exists (select 1 from public.polls p where p.id = poll_id and p.created_by = auth.uid())
  ) with check (
    public.is_admin()
    or exists (select 1 from public.polls p where p.id = poll_id and p.created_by = auth.uid())
  );

-- POLL_MEMBERS: todo autenticado lee; cada quien se une por sí mismo; sale uno mismo/creador/admin
drop policy if exists poll_members_select_all on public.poll_members;
create policy poll_members_select_all on public.poll_members
  for select using (auth.uid() is not null);

drop policy if exists poll_members_join_self on public.poll_members;
create policy poll_members_join_self on public.poll_members
  for insert with check (user_id = auth.uid());

drop policy if exists poll_members_leave on public.poll_members;
create policy poll_members_leave on public.poll_members
  for delete using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.polls p where p.id = poll_id and p.created_by = auth.uid())
  );

-- El tesorero (o admin) puede actualizar la inscripción para marcar el pago.
drop policy if exists poll_members_pay on public.poll_members;
create policy poll_members_pay on public.poll_members
  for update using (public.is_tesorero() or public.is_admin())
  with check (public.is_tesorero() or public.is_admin());

-- PREDICTIONS (por polla):
--  * Lectura: propios siempre; ajenos solo tras el cierre del partido; admin todo
--  * Inserción / edición: dueño + miembro de la polla + partido de la polla + abierto
drop policy if exists predictions_select_visible on public.predictions;
create policy predictions_select_visible on public.predictions
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.force_open is not true
        and (m.status <> 'upcoming' or m.match_date <= now() + interval '5 minutes')
    )
  );

drop policy if exists predictions_insert_own on public.predictions;
create policy predictions_insert_own on public.predictions
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.poll_members pm where pm.poll_id = poll_id and pm.user_id = auth.uid())
    and exists (select 1 from public.poll_matches qm where qm.poll_id = poll_id and qm.match_id = match_id)
    and public.match_open(match_id)
  );

drop policy if exists predictions_update_own on public.predictions;
create policy predictions_update_own on public.predictions
  for update using (
    user_id = auth.uid()
    and public.match_open(match_id)
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.poll_members pm where pm.poll_id = poll_id and pm.user_id = auth.uid())
    and exists (select 1 from public.poll_matches qm where qm.poll_id = poll_id and qm.match_id = match_id)
  );

-- =====================================================================
--  FIN DEL ESQUEMA
--  Tras registrarte, conviértete en admin ejecutando:
--    update public.profiles set role = 'admin' where username = 'TU_USUARIO';
-- =====================================================================
