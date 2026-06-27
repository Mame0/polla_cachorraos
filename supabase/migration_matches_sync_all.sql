-- =====================================================================
--  Permitir que cualquier usuario autenticado sincronice resultados
--  (insert/update en matches) sin necesidad de la service_role key.
--
--  El borrado sigue restringido a admin (matches_admin_all cubre delete).
--  Ejecutar en Supabase -> SQL Editor.
-- =====================================================================

-- Insertar partidos nuevos (necesario para el upsert del sync).
drop policy if exists matches_sync_insert on public.matches;
create policy matches_sync_insert on public.matches
  for insert to authenticated
  with check (true);

-- Actualizar marcador/estado de partidos existentes (el trigger recalcula puntos).
drop policy if exists matches_sync_update on public.matches;
create policy matches_sync_update on public.matches
  for update to authenticated
  using (true)
  with check (true);
