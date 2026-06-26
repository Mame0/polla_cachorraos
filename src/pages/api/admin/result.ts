import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { profile, supabase } = locals;
  if (profile?.role !== 'admin') return redirect('/');

  const form = await request.formData();
  const match_id = String(form.get('match_id') ?? '');
  const home_score = Number(form.get('home_score'));
  const away_score = Number(form.get('away_score'));

  if (!match_id || !Number.isInteger(home_score) || !Number.isInteger(away_score) || home_score < 0 || away_score < 0) {
    return redirect('/admin?error=' + encodeURIComponent('Marcador inválido.'));
  }

  // Al fijar el marcador y status='finished', el trigger recalcula los puntos.
  const { error } = await supabase
    .from('matches')
    .update({ home_score, away_score, status: 'finished' })
    .eq('id', match_id);

  if (error) {
    return redirect('/admin?error=' + encodeURIComponent(error.message));
  }

  return redirect('/admin?saved=' + encodeURIComponent('Resultado registrado y puntos calculados.'));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
