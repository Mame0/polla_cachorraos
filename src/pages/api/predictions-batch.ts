import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, supabase } = locals;
  const accept = request.headers.get('accept') || '';
  const isJson = accept.includes('application/json');

  if (!user) {
    if (isJson) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    return redirect('/login');
  }

  const form = await request.formData();
  const poll_id = String(form.get('poll_id') ?? '');
  const back = poll_id ? `/polla/${poll_id}` : '/';

  const respond = (status: number, message: string, data?: any) => {
    if (isJson) {
      return new Response(JSON.stringify(status >= 400 ? { error: message, ...data } : { success: true, ...data }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const redirectUrl = status >= 400 ? `${back}?error=${encodeURIComponent(message)}` : `${back}?saved=1`;
    return redirect(redirectUrl);
  };

  if (!poll_id) {
    return respond(400, 'Polla no válida.');
  }

  const rows: { poll_id: string; user_id: string; match_id: string; home_score: number; away_score: number }[] = [];

  for (const [key, value] of form.entries()) {
    if (!key.startsWith('home_')) continue;
    const match_id = key.slice('home_'.length);
    const hRaw = String(value).trim();
    const aRaw = String(form.get('away_' + match_id) ?? '').trim();

    if (hRaw === '' && aRaw === '') continue;
    if (hRaw === '' || aRaw === '') {
      return respond(400, 'Completa ambos marcadores de cada partido.');
    }

    const home_score = Number(hRaw);
    const away_score = Number(aRaw);
    if (!match_id || !Number.isInteger(home_score) || !Number.isInteger(away_score) || home_score < 0 || away_score < 0) {
      return respond(400, 'Marcador inválido.');
    }
    rows.push({ poll_id, user_id: user.id, match_id, home_score, away_score });
  }

  if (rows.length === 0) {
    return respond(400, 'Ingresa al menos un marcador.');
  }

  const { error } = await supabase
    .from('predictions')
    .upsert(rows, { onConflict: 'poll_id,user_id,match_id' });

  if (error) {
    return respond(500, 'No se pudo guardar (algún pronóstico podría estar cerrado).');
  }

  return respond(200, 'Guardado correctamente.');
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
