import type { APIRoute } from 'astro';
import { fetchFixture } from '../../../lib/fixture';

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  const { profile, supabase } = locals;
  if (profile?.role !== 'admin') return redirect('/');

  const token = import.meta.env.FOOTBALL_DATA_TOKEN;
  const competition = import.meta.env.FOOTBALL_COMPETITION || 'WC';

  if (!token) {
    return redirect('/admin?error=' + encodeURIComponent('Falta FOOTBALL_DATA_TOKEN en el archivo .env'));
  }

  let rows;
  try {
    rows = await fetchFixture(token, competition);
  } catch (e) {
    return redirect('/admin?error=' + encodeURIComponent('No se pudo leer la API: ' + (e as Error).message));
  }

  if (rows.length === 0) {
    return redirect('/admin?saved=' + encodeURIComponent('La API no devolvió partidos (¿competición sin fixture aún?).'));
  }

  // Upsert idempotente por external_id. Al actualizar marcador/estado,
  // el trigger de la base de datos recalcula los puntos automáticamente.
  const { error } = await supabase
    .from('matches')
    .upsert(rows, { onConflict: 'external_id' });

  if (error) {
    return redirect('/admin?error=' + encodeURIComponent('Error guardando: ' + error.message));
  }

  return redirect('/admin?saved=' + encodeURIComponent(`Fixture sincronizado: ${rows.length} partidos (${competition}).`));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
