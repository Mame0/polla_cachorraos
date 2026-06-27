-- =====================================================================
--  MIGRACIÓN: Múltiples pollas creadas por usuarios
--  Pega TODO este archivo en: Supabase Dashboard -> SQL Editor -> Run
--
--  Convierte la app de "una polla implícita" a "varias pollas":
--   * Cualquier usuario crea una polla eligiendo partidos + monto.
--   * Otros usuarios se unen y pronostican.
--   * Los pronósticos son INDEPENDIENTES por polla.
--   * Cada polla tiene su propia tabla (se calcula en la app).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLAS NUEVAS
-- ---------------------------------------------------------------------

-- Una polla: selección de partidos + monto por persona, creada por un usuario.
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
  poll_id   uuid not null references public.polls(id)     on delete cascade,
  user_id   uuid not null references public.profiles(id)  on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create index if not exists idx_poll_matches_poll  on public.poll_matches(poll_id);
create index if not exists idx_poll_members_poll   on public.poll_members(poll_id);
create index if not exists idx_poll_members_user   on public.poll_members(user_id);

-- ---------------------------------------------------------------------
-- 2. PREDICTIONS: pronóstico por polla
-- ---------------------------------------------------------------------

alter table public.predictions
  add column if not exists poll_id uuid references public.polls(id) on delete cascade;

-- --- Migración de datos existentes (preservar el Mundial actual) ------
-- Crea una polla "General" con TODOS los partidos y TODOS los jugadores,
-- y asigna los pronósticos existentes a ella.
-- ⚠ Si prefieres empezar limpio, comenta este bloque DO $$ ... $$ y ejecuta
--   en su lugar:  truncate public.predictions;
do $$
declare
  v_poll_id uuid;
  v_admin   uuid;
begin
  -- ¿Hay pronósticos sin polla que migrar?
  if exists (select 1 from public.predictions where poll_id is null) then
    select id into v_admin from public.profiles where role = 'admin' order by created_at limit 1;
    if v_admin is null then
      select id into v_admin from public.profiles order by created_at limit 1;
    end if;

    insert into public.polls (name, created_by, entry_amount)
    values ('General', v_admin, 0)
    returning id into v_poll_id;

    insert into public.poll_matches (poll_id, match_id)
    select v_poll_id, id from public.matches
    on conflict do nothing;

    insert into public.poll_members (poll_id, user_id)
    select v_poll_id, id from public.profiles
    on conflict do nothing;

    update public.predictions set poll_id = v_poll_id where poll_id is null;
  end if;
end $$;

-- Reemplazar la unicidad global por una unicidad por polla.
alter table public.predictions drop constraint if exists predictions_user_id_match_id_key;
do $$
begin
  if not exists (select 1 from public.predictions where poll_id is null) then
    alter table public.predictions alter column poll_id set not null;
  end if;
end $$;

create unique index if not exists predictions_poll_user_match_key
  on public.predictions (poll_id, user_id, match_id);

create index if not exists idx_predictions_poll on public.predictions(poll_id);

-- El trigger trg_recalc_points sigue válido: recalcula por match_id sobre
-- todas las filas (de todas las pollas). No requiere cambios.

-- ---------------------------------------------------------------------
-- 3. ELIMINAR LA VISTA GLOBAL leaderboard (el ranking es por polla)
-- ---------------------------------------------------------------------
drop view if exists public.leaderboard;

-- ---------------------------------------------------------------------
-- 4. SEGURIDAD (Row Level Security)
-- ---------------------------------------------------------------------
alter table public.polls         enable row level security;
alter table public.poll_matches  enable row level security;
alter table public.poll_members  enable row level security;

-- Permisos a nivel de tabla (las filas las restringe RLS). Idempotente.
grant select, insert, update, delete on
  public.polls, public.poll_matches, public.poll_members to anon, authenticated, service_role;

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

-- POLL_MEMBERS: todo autenticado lee; cada quien se une/sale por sí mismo (o el creador/admin)
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

-- ---------------------------------------------------------------------
-- 5. PREDICTIONS: políticas por polla
--    Insertar/editar solo si: eres el dueño, eres miembro de la polla,
--    el partido pertenece a la polla y sigue abierto (5 min antes).
-- ---------------------------------------------------------------------

-- Helper: ¿el partido sigue abierto para pronosticar?
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
--  FIN DE LA MIGRACIÓN
-- =====================================================================
