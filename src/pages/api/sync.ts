import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { fetchFixture } from '../../lib/fixture';

export const prerender = false;

// Lee variables tanto del build (import.meta.env) como del runtime (process.env).
function env(key: string): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key] ?? process.env[key];
}

// Sincroniza resultados desde football-data.org. Disponible para cualquier
// usuario con sesión (no solo admin): la tabla `matches` es global y el upsert
// es idempotente, así que cualquier miembro puede refrescar los marcadores.
export const POST: APIRoute = async ({ request, locals }) => {
  const { user } = locals;
  const form = await request.formData();
  const pollId = String(form.get('poll_id') ?? '');
  const back = pollId ? `/polla/${pollId}` : '/';

  if (!user) return redirect('/login');

  const token = env('FOOTBALL_DATA_TOKEN');
  const competition = env('FOOTBALL_COMPETITION') || 'WC';
  const url = env('PUBLIC_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');

  if (!token || !url || !key) {
    return redirect(back + '?error=' + encodeURIComponent('Falta configuración del servidor (token o keys).'));
  }

  let rows;
  try {
    rows = await fetchFixture(token, competition);
  } catch (e) {
    return redirect(back + '?error=' + encodeURIComponent('No se pudo leer la API: ' + (e as Error).message));
  }

  if (rows.length === 0) {
    return redirect(back + '?saved=' + encodeURIComponent('La API no devolvió partidos.'));
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.from('matches').upsert(rows, { onConflict: 'external_id' });

  if (error) {
    return redirect(back + '?error=' + encodeURIComponent('Error guardando: ' + error.message));
  }

  return redirect(back + '?saved=' + encodeURIComponent(`Resultados actualizados (${rows.length} partidos).`));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
