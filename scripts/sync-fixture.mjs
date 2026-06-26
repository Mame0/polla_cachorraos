// =====================================================================
//  Sincronización automática del fixture (para cron / tarea programada)
//  Uso:  node scripts/sync-fixture.mjs
//  Lee las variables del archivo .env (Node 20.6+ soporta --env-file).
//
//  Requiere en .env:
//    PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//    FOOTBALL_DATA_TOKEN, (opcional) FOOTBALL_COMPETITION
//
//  Ejecutar cargando el .env:
//    node --env-file=.env scripts/sync-fixture.mjs
// =====================================================================
import { createClient } from '@supabase/supabase-js';

const {
  PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  FOOTBALL_DATA_TOKEN,
  FOOTBALL_COMPETITION = 'WC',
} = process.env;

if (!PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FOOTBALL_DATA_TOKEN) {
  console.error('Faltan variables: PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o FOOTBALL_DATA_TOKEN.');
  process.exit(1);
}

const STAGE_ES = {
  PRELIMINARY_ROUND: 'Ronda preliminar',
  PLAYOFFS: 'Repechaje',
  GROUP_STAGE: 'Fase de grupos',
  LEAGUE_STAGE: 'Fase de liga',
  ROUND_OF_16: 'Octavos de final',
  LAST_16: 'Octavos de final',
  QUARTER_FINALS: 'Cuartos de final',
  SEMI_FINALS: 'Semifinales',
  THIRD_PLACE: 'Tercer puesto',
  FINAL: 'Final',
};

const mapStatus = (s) =>
  s === 'FINISHED' ? 'finished' : ['IN_PLAY', 'PAUSED', 'SUSPENDED'].includes(s) ? 'live' : 'upcoming';

async function main() {
  const res = await fetch(
    `https://api.football-data.org/v4/competitions/${FOOTBALL_COMPETITION}/matches`,
    { headers: { 'X-Auth-Token': FOOTBALL_DATA_TOKEN } }
  );
  if (!res.ok) {
    console.error(`football-data ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const { matches = [] } = await res.json();
  const rows = matches.map((m) => ({
    external_id: String(m.id),
    home_team: m.homeTeam?.name ?? m.homeTeam?.shortName ?? 'Por definir',
    away_team: m.awayTeam?.name ?? m.awayTeam?.shortName ?? 'Por definir',
    match_date: m.utcDate,
    stage: STAGE_ES[m.stage] ?? m.stage ?? 'Fase de grupos',
    round: m.matchday ? `Jornada ${m.matchday}` : m.group ?? null,
    status: mapStatus(m.status),
    home_score: m.score?.fullTime?.home ?? null,
    away_score: m.score?.fullTime?.away ?? null,
  }));

  if (rows.length === 0) {
    console.log('La API no devolvió partidos.');
    return;
  }

  const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from('matches').upsert(rows, { onConflict: 'external_id' });
  if (error) {
    console.error('Error guardando en Supabase:', error.message);
    process.exit(1);
  }

  console.log(`✅ Sincronizados ${rows.length} partidos (${FOOTBALL_COMPETITION}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
