import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, supabase } = locals;
  if (!user) return redirect('/login');

  const form = await request.formData();
  const poll_id = String(form.get('poll_id') ?? '');
  const match_id = String(form.get('match_id') ?? '');
  const home_score = Number(form.get('home_score'));
  const away_score = Number(form.get('away_score'));

  const back = poll_id ? `/polla/${poll_id}` : '/';

  if (!poll_id || !match_id || !Number.isInteger(home_score) || !Number.isInteger(away_score) || home_score < 0 || away_score < 0) {
    return redirect(back + '?error=' + encodeURIComponent('Marcador inválido.'));
  }

  // Las políticas RLS validan membresía, que el partido sea de la polla y que siga abierto.
  const { error } = await supabase.from('predictions').upsert(
    { poll_id, user_id: user.id, match_id, home_score, away_score },
    { onConflict: 'poll_id,user_id,match_id' }
  );

  if (error) {
    return redirect(back + '?error=' + encodeURIComponent('No se pudo guardar (el pronóstico podría estar cerrado).'));
  }

  return redirect(back + '?saved=1');
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
