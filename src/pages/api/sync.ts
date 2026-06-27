import type { APIRoute } from 'astro';
import { fetchFixture } from '../../lib/fixture';

export const prerender = false;

// Sincroniza resultados desde football-data.org. Disponible para cualquier
// usuario con sesión: escribe usando la sesión del propio usuario (las
// políticas RLS matches_sync_insert / matches_sync_update lo permiten),
// así que NO requiere la service_role key.
export const POST: APIRoute = async ({ request, locals }) => {
  const { user, supabase } = locals;
  const form = await request.formData();
  const pollId = String(form.get('poll_id') ?? '');
  const back = pollId ? `/polla/${pollId}` : '/';

  if (!user) return redirect('/login');

  const token = import.meta.env.FOOTBALL_DATA_TOKEN;
  const competition = import.meta.env.FOOTBALL_COMPETITION || 'WC';

  if (!token) {
    return redirect(back + '?error=' + encodeURIComponent('Falta FOOTBALL_DATA_TOKEN en el servidor.'));
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

  // Upsert idempotente por external_id. Al cambiar marcador/estado, el trigger
  // de la base de datos recalcula los puntos automáticamente.
  const { error } = await supabase.from('matches').upsert(rows, { onConflict: 'external_id' });

  if (error) {
    return redirect(back + '?error=' + encodeURIComponent('Error guardando: ' + error.message));
  }

  return redirect(back + '?saved=' + encodeURIComponent(`Resultados actualizados (${rows.length} partidos).`));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
