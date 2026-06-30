// Sincronización del fixture desde football-data.org (v4).
// Documentación: https://www.football-data.org/documentation/quickstart

export interface FixtureRow {
  external_id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  stage: string;
  round: string | null;
  status: 'upcoming' | 'live' | 'finished';
  home_score: number | null;
  away_score: number | null;
}

const STAGE_ES: Record<string, string> = {
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

function mapStatus(s: string): FixtureRow['status'] {
  if (s === 'FINISHED') return 'finished';
  if (s === 'IN_PLAY' || s === 'PAUSED' || s === 'SUSPENDED') return 'live';
  return 'upcoming';
}

/** Trae los partidos de una competición y los deja listos para upsert en Supabase. */
export async function fetchFixture(token: string, competition = 'WC'): Promise<FixtureRow[]> {
  const res = await fetch(`https://api.football-data.org/v4/competitions/${competition}/matches`, {
    headers: { 'X-Auth-Token': token },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`football-data ${res.status}: ${text.slice(0, 180) || res.statusText}`);
  }

  const data = (await res.json()) as { matches?: any[] };
  return (data.matches ?? []).map((m): FixtureRow => ({
    external_id: String(m.id),
    home_team: m.homeTeam?.name ?? m.homeTeam?.shortName ?? 'Por definir',
    away_team: m.awayTeam?.name ?? m.awayTeam?.shortName ?? 'Por definir',
    match_date: m.utcDate,
    stage: STAGE_ES[m.stage] ?? m.stage ?? 'Fase de grupos',
    round: m.matchday ? `Jornada ${m.matchday}` : m.group ?? null,
    status: mapStatus(m.status),
    home_score: m.score?.regularTime?.home ?? m.score?.fullTime?.home ?? null,
    away_score: m.score?.regularTime?.away ?? m.score?.fullTime?.away ?? null,
  }));
}
