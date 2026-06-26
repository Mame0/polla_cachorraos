-- =====================================================================
--  MIGRACIÓN: habilitar/cerrar pronósticos manualmente por partido
--  Ejecútalo en el SQL Editor de Supabase si ya tenías la base creada.
--
--  force_open:  true  -> pronósticos abiertos aunque el partido esté cerrado
--               null  -> automático (regla de 5 min antes del inicio)
--               false -> cerrado a la fuerza
-- =====================================================================

alter table public.matches
  add column if not exists force_open boolean;

-- --- Reemplazar políticas de predictions para que respeten force_open ---

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
