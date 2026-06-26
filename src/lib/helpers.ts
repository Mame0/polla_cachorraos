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
  force_open?: boolean | null;
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
  if (match.force_open === true) return true; // habilitado manualmente por el admin
  if (match.force_open === false) return false; // cerrado a la fuerza
  return match.status === 'upcoming' && new Date(match.match_date).getTime() - CLOSE_MS > Date.now();
}

/** Clave de día estable (YYYY-MM-DD en hora local) para agrupar/filtrar. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Etiqueta de día legible, p. ej. "sáb 28 jun". */
export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short' });
}

/** Lista ordenada de días distintos a partir de fechas ISO. */
export function distinctDays(isos: string[]): { key: string; label: string }[] {
  const map = new Map<string, string>();
  for (const iso of isos) {
    const k = dayKey(iso);
    if (!map.has(k)) map.set(k, dayLabel(iso));
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, label]) => ({ key, label }));
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
