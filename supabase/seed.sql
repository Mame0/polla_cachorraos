-- =====================================================================
--  POLLA MUNDIALISTA — Fixture de ejemplo (opcional)
--  Ejecútalo en el SQL Editor de Supabase DESPUÉS de schema.sql.
--  Las fechas se generan relativas a "ahora" para que puedas probar.
-- =====================================================================

insert into public.matches (home_team, away_team, match_date, stage, round, status, home_score, away_score) values
  ('Brasil',     'Argentina', now() + interval '2 days',  'Fase de grupos', 'Jornada 1', 'upcoming', null, null),
  ('España',     'Alemania',  now() + interval '3 days',  'Fase de grupos', 'Jornada 1', 'upcoming', null, null),
  ('Francia',    'Inglaterra',now() + interval '4 days',  'Fase de grupos', 'Jornada 1', 'upcoming', null, null),
  ('Portugal',   'Países Bajos', now() + interval '5 days','Fase de grupos','Jornada 1', 'upcoming', null, null),
  ('Uruguay',    'Colombia',  now() - interval '1 day',   'Fase de grupos', 'Jornada 1', 'finished', 2, 0),
  ('México',     'Croacia',   now() - interval '2 days',  'Fase de grupos', 'Jornada 1', 'finished', 1, 1);
