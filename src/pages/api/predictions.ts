import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, supabase } = locals;
  if (!user) return redirect('/login');

  const form = await request.formData();
  const match_id = String(form.get('match_id') ?? '');
  const home_score = Number(form.get('home_score'));
  const away_score = Number(form.get('away_score'));

  if (!match_id || !Number.isInteger(home_score) || !Number.isInteger(away_score) || home_score < 0 || away_score < 0) {
    return redirect('/partidos?error=' + encodeURIComponent('Marcador inválido.'));
  }

  // Las políticas RLS validan que el partido siga abierto (5 min antes del inicio).
  const { error } = await supabase.from('predictions').upsert(
    { user_id: user.id, match_id, home_score, away_score },
    { onConflict: 'user_id,match_id' }
  );

  if (error) {
    return redirect('/partidos?error=' + encodeURIComponent('No se pudo guardar (el pronóstico podría estar cerrado).'));
  }

  return redirect('/partidos?saved=1');
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
