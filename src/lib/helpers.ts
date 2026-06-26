export interface Match {
  id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  stage: string;
  round: string | null;
  status: 'upcoming' | 'live' | 'finished';
  home_score: number | null;
  away_score: number | null;
}

export interface Prediction {
  id: string;
  user_id: string;
  match_id: string;
  home_score: number;
  away_score: number;
  points_earned: number;
}

const CLOSE_MS = 5 * 60 * 1000; // 5 minutos antes del inicio

/** ¿Sigue abierto el pronóstico para este partido? */
export function isOpen(match: Match): boolean {
  return match.status === 'upcoming' && new Date(match.match_date).getTime() - CLOSE_MS > Date.now();
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Etiqueta + color según los puntos obtenidos. */
export function pointsBadge(points: number): { label: string; classes: string } {
  switch (points) {
    case 5:
      return { label: '5 pts · Exacto', classes: 'bg-polla-green text-white' };
    case 3:
      return { label: '3 pts · Diferencia', classes: 'bg-polla-blue text-white' };
    case 2:
      return { label: '2 pts · Ganador', classes: 'bg-polla-gold text-polla-blue' };
    default:
      return { label: '0 pts', classes: 'bg-gray-200 text-gray-600' };
  }
}

export const statusLabel: Record<Match['status'], string> = {
  upcoming: 'Próximo',
  live: 'En curso',
  finished: 'Finalizado',
};
