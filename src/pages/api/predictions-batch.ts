import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, supabase } = locals;
  if (!user) return redirect('/login');

  const form = await request.formData();
  const poll_id = String(form.get('poll_id') ?? '');
  const back = poll_id ? `/polla/${poll_id}` : '/';

  if (!poll_id) {
    return redirect('/?error=' + encodeURIComponent('Polla no válida.'));
  }

  // Los campos vienen como home_<matchId> / away_<matchId> para evitar
  // problemas de alineación cuando algún partido está cerrado.
  const rows: { poll_id: string; user_id: string; match_id: string; home_score: number; away_score: number }[] = [];

  for (const [key, value] of form.entries()) {
    if (!key.startsWith('home_')) continue;
    const match_id = key.slice('home_'.length);
    const hRaw = String(value).trim();
    const aRaw = String(form.get('away_' + match_id) ?? '').trim();

    // Saltar partidos sin marcador ingresado (ambos vacíos).
    if (hRaw === '' && aRaw === '') continue;
    if (hRaw === '' || aRaw === '') {
      return redirect(back + '?error=' + encodeURIComponent('Completa ambos marcadores de cada partido.'));
    }

    const home_score = Number(hRaw);
    const away_score = Number(aRaw);
    if (!match_id || !Number.isInteger(home_score) || !Number.isInteger(away_score) || home_score < 0 || away_score < 0) {
      return redirect(back + '?error=' + encodeURIComponent('Marcador inválido.'));
    }
    rows.push({ poll_id, user_id: user.id, match_id, home_score, away_score });
  }

  if (rows.length === 0) {
    return redirect(back + '?error=' + encodeURIComponent('Ingresa al menos un marcador.'));
  }

  // Las políticas RLS validan membresía, que cada partido sea de la polla y que siga abierto.
  const { error } = await supabase
    .from('predictions')
    .upsert(rows, { onConflict: 'poll_id,user_id,match_id' });

  if (error) {
    return redirect(back + '?error=' + encodeURIComponent('No se pudo guardar (algún pronóstico podría estar cerrado).'));
  }

  return redirect(back + '?saved=1');
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
