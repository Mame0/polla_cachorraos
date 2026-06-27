-- =====================================================================
--  MIGRACIÓN: Rol "tesorero" y control de pagos por polla
--  Pega TODO este archivo en: Supabase Dashboard -> SQL Editor -> Run
--
--   * Nuevo rol 'tesorero' (lo designa el admin; uno a la vez por convención
--     que aplica la API).
--   * Cada inscripción (poll_members) lleva su estado de pago.
--   * El tesorero (o el admin) puede marcar pagos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ROL NUEVO: ampliar el check de profiles.role
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('player', 'admin', 'tesorero'));

-- ---------------------------------------------------------------------
-- 2. PAGO POR INSCRIPCIÓN
-- ---------------------------------------------------------------------
alter table public.poll_members
  add column if not exists paid    boolean not null default false,
  add column if not exists paid_at timestamptz;

-- ---------------------------------------------------------------------
-- 3. HELPER: ¿el usuario actual es tesorero?
-- ---------------------------------------------------------------------
create or replace function public.is_tesorero()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'tesorero');
$$;

-- ---------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------

-- PROFILES: el admin puede actualizar cualquier perfil (para asignar/quitar el rol).
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- POLL_MEMBERS: el tesorero (o admin) puede actualizar la fila (marcar pago).
drop policy if exists poll_members_pay on public.poll_members;
create policy poll_members_pay on public.poll_members
  for update using (public.is_tesorero() or public.is_admin())
  with check (public.is_tesorero() or public.is_admin());

-- =====================================================================
--  FIN DE LA MIGRACIÓN
-- =====================================================================
