import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Mensaje claro en consola si faltan las variables de entorno.
  console.warn(
    '[polla] Faltan PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copia .env.example a .env y rellena tus credenciales de Supabase.'
  );
}

/**
 * Crea un cliente de Supabase ligado a las cookies de la petición actual.
 * Sirve tanto en el middleware como en las API routes (lectura/escritura de sesión).
 */
export function createSupabase(request: Request, cookies: AstroCookies) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        const header = request.headers.get('cookie') ?? '';
        return header
          .split(';')
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => {
            const idx = c.indexOf('=');
            const name = idx === -1 ? c : c.slice(0, idx);
            const value = idx === -1 ? '' : decodeURIComponent(c.slice(idx + 1));
            return { name, value };
          });
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, { ...options, path: '/' });
        });
      },
    },
  });
}
