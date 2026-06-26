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
  role        text not null default 'player' check (role in ('player', 'admin')),
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

-- Pronósticos
create table if not exists public.predictions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  match_id      uuid not null references public.matches(id) on delete cascade,
  home_score    int not null check (home_score >= 0),
  away_score    int not null check (away_score >= 0),
  points_earned int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, match_id)
);

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

-- ---------------------------------------------------------------------
-- 4. VISTA LEADERBOARD (tabla de posiciones)
-- ---------------------------------------------------------------------
create or replace view public.leaderboard as
select
  pr.id                                                      as user_id,
  pr.username,
  pr.avatar_url,
  coalesce(sum(p.points_earned), 0)                          as total_points,
  count(p.id) filter (where p.points_earned = 5)             as correct_exact,
  count(p.id) filter (where p.points_earned = 3)             as correct_diff,
  count(p.id) filter (where p.points_earned = 2)             as correct_winner,
  count(p.id)                                                as total_predictions
from public.profiles pr
left join public.predictions p on p.user_id = pr.id
group by pr.id, pr.username, pr.avatar_url
order by total_points desc, correct_exact desc, total_predictions desc;

grant select on public.leaderboard to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. SEGURIDAD (Row Level Security)
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles    enable row level security;
alter table public.matches     enable row level security;
alter table public.predictions enable row level security;

-- PROFILES: todos pueden leer; cada quien edita el suyo
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- MATCHES: todos pueden leer; solo admin gestiona
drop policy if exists matches_select_all on public.matches;
create policy matches_select_all on public.matches
  for select using (true);

drop policy if exists matches_admin_all on public.matches;
create policy matches_admin_all on public.matches
  for all using (public.is_admin()) with check (public.is_admin());

-- PREDICTIONS:
--  * Lectura: propios siempre; ajenos solo tras el cierre del partido; admin todo
--  * Inserción / edición: solo el dueño y solo mientras el partido siga abierto
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
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and (
          m.force_open is true
          or (
            m.force_open is not false
            and m.status = 'upcoming'
            and m.match_date > now() + interval '5 minutes'
          )
        )
    )
  );

drop policy if exists predictions_update_own on public.predictions;
create policy predictions_update_own on public.predictions
  for update using (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and (
          m.force_open is true
          or (
            m.force_open is not false
            and m.status = 'upcoming'
            and m.match_date > now() + interval '5 minutes'
          )
        )
    )
  ) with check (user_id = auth.uid());

-- =====================================================================
--  FIN DEL ESQUEMA
--  Tras registrarte, conviértete en admin ejecutando:
--    update public.profiles set role = 'admin' where username = 'TU_USUARIO';
-- =====================================================================
