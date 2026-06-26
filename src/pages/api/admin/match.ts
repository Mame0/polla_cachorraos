import type { APIRoute } from 'astro';
import { localInputToISO } from '../../../lib/helpers';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { profile, supabase } = locals;
  if (profile?.role !== 'admin') return redirect('/');

  const form = await request.formData();
  const home_team = String(form.get('home_team') ?? '').trim();
  const away_team = String(form.get('away_team') ?? '').trim();
  const match_date = String(form.get('match_date') ?? '');
  const stage = String(form.get('stage') ?? 'Fase de grupos').trim() || 'Fase de grupos';
  const round = String(form.get('round') ?? '').trim() || null;

  if (!home_team || !away_team || !match_date) {
    return redirect('/admin?error=' + encodeURIComponent('Completa equipos y fecha.'));
  }

  const { error } = await supabase.from('matches').insert({
    home_team,
    away_team,
    match_date: localInputToISO(match_date),
    stage,
    round,
    status: 'upcoming',
  });

  if (error) {
    return redirect('/admin?error=' + encodeURIComponent(error.message));
  }

  return redirect('/admin?saved=' + encodeURIComponent('Partido creado.'));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
