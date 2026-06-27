import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { fetchFixture } from '../../../lib/fixture';

export const prerender = false;

// Lee una variable tanto del entorno inlineado en build (import.meta.env)
// como del entorno de runtime de Vercel (process.env), para que los secretos
// añadidos después del build también funcionen.
function env(key: string): string | undefined {
  return (import.meta.env as Record<string, string | undefined>)[key] ?? process.env[key];
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const secret = env('CRON_SECRET');
    const auth = request.headers.get('authorization') ?? '';

    if (!secret || auth !== `Bearer ${secret}`) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const token = env('FOOTBALL_DATA_TOKEN');
    const competition = env('FOOTBALL_COMPETITION') || 'WC';
    const supabaseUrl = env('PUBLIC_SUPABASE_URL');
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');

    if (!token) return json({ error: 'Falta FOOTBALL_DATA_TOKEN en Vercel' }, 500);
    if (!supabaseUrl) return json({ error: 'Falta PUBLIC_SUPABASE_URL en Vercel' }, 500);
    if (!serviceKey) return json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en Vercel' }, 500);

    const rows = await fetchFixture(token, competition);
    if (rows.length === 0) {
      return json({ message: 'Sin partidos en la API' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { error } = await supabase
      .from('matches')
      .upsert(rows, { onConflict: 'external_id' });

    if (error) return json({ error: 'Supabase: ' + error.message }, 500);

    return json({ ok: true, synced: rows.length, competition });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
};

function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
