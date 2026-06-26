-- =====================================================================
--  MIGRACIÓN: identificador externo para sincronizar con la API
--  Ejecútalo en el SQL Editor de Supabase si ya creaste las tablas
--  con la versión anterior de schema.sql.
-- =====================================================================

alter table public.matches
  add column if not exists external_id text;

-- Permite re-sincronizar sin duplicar (varios NULL están permitidos en un UNIQUE)
create unique index if not exists matches_external_id_key
  on public.matches (external_id);
