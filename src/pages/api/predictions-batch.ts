import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, supabase } = locals;
  if (!user) return redirect('/login');

  const form = await request.formData();

  // Los campos vienen como home_<matchId> / away_<matchId> para evitar
  // problemas de alineación cuando algún partido está cerrado.
  const rows: { user_id: string; match_id: string; home_score: number; away_score: number }[] = [];

  for (const [key, value] of form.entries()) {
    if (!key.startsWith('home_')) continue;
    const match_id = key.slice('home_'.length);
    const hRaw = String(value).trim();
    const aRaw = String(form.get('away_' + match_id) ?? '').trim();

    // Saltar partidos sin marcador ingresado (ambos vacíos).
    if (hRaw === '' && aRaw === '') continue;
    if (hRaw === '' || aRaw === '') {
      return redirect('/?error=' + encodeURIComponent('Completa ambos marcadores de cada partido.'));
    }

    const home_score = Number(hRaw);
    const away_score = Number(aRaw);
    if (!match_id || !Number.isInteger(home_score) || !Number.isInteger(away_score) || home_score < 0 || away_score < 0) {
      return redirect('/?error=' + encodeURIComponent('Marcador inválido.'));
    }
    rows.push({ user_id: user.id, match_id, home_score, away_score });
  }

  if (rows.length === 0) {
    return redirect('/?error=' + encodeURIComponent('Ingresa al menos un marcador.'));
  }

  // Las políticas RLS validan que cada partido siga abierto (5 min antes del inicio).
  const { error } = await supabase
    .from('predictions')
    .upsert(rows, { onConflict: 'user_id,match_id' });

  if (error) {
    return redirect('/?error=' + encodeURIComponent('No se pudo guardar (algún pronóstico podría estar cerrado).'));
  }

  return redirect('/?saved=1');
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
