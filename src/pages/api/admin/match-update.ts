import type { APIRoute } from 'astro';
import { localInputToISO } from '../../../lib/helpers';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { profile, supabase } = locals;
  if (profile?.role !== 'admin') return redirect('/');

  const form = await request.formData();
  const match_id = String(form.get('match_id') ?? '');
  const home_team = String(form.get('home_team') ?? '').trim();
  const away_team = String(form.get('away_team') ?? '').trim();
  const match_date = String(form.get('match_date') ?? '');
  const stage = String(form.get('stage') ?? '').trim() || 'Fase de grupos';
  const round = String(form.get('round') ?? '').trim() || null;
  const status = String(form.get('status') ?? 'upcoming');

  const homeRaw = String(form.get('home_score') ?? '').trim();
  const awayRaw = String(form.get('away_score') ?? '').trim();
  const home_score = homeRaw === '' ? null : Number(homeRaw);
  const away_score = awayRaw === '' ? null : Number(awayRaw);

  const back = `/admin/editar/${match_id}`;

  if (!match_id || !home_team || !away_team || !match_date) {
    return redirect(back + '?error=' + encodeURIComponent('Completa equipos y fecha.'));
  }
  if (!['upcoming', 'live', 'finished'].includes(status)) {
    return redirect(back + '?error=' + encodeURIComponent('Estado inválido.'));
  }
  for (const s of [home_score, away_score]) {
    if (s !== null && (!Number.isInteger(s) || s < 0)) {
      return redirect(back + '?error=' + encodeURIComponent('Marcador inválido.'));
    }
  }

  const { error } = await supabase
    .from('matches')
    .update({
      home_team,
      away_team,
      match_date: localInputToISO(match_date),
      stage,
      round,
      status,
      home_score,
      away_score,
    })
    .eq('id', match_id);

  if (error) {
    return redirect(back + '?error=' + encodeURIComponent(error.message));
  }

  return redirect('/admin?saved=' + encodeURIComponent('Partido actualizado.'));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
