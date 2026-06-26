import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { fetchFixture } from '../../../lib/fixture';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  const auth = request.headers.get('authorization') ?? '';

  if (!secret || auth !== `Bearer ${secret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const token = import.meta.env.FOOTBALL_DATA_TOKEN;
  const competition = import.meta.env.FOOTBALL_COMPETITION || 'WC';

  if (!token) {
    return json({ error: 'Falta FOOTBALL_DATA_TOKEN' }, 500);
  }

  let rows;
  try {
    rows = await fetchFixture(token, competition);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  if (rows.length === 0) {
    return json({ message: 'Sin partidos en la API' });
  }

  const supabase = createClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  const { error } = await supabase
    .from('matches')
    .upsert(rows, { onConflict: 'external_id' });

  if (error) {
    return json({ error: error.message }, 500);
  }

  return json({ ok: true, synced: rows.length, competition });
};

function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
