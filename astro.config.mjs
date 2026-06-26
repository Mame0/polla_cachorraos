import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  server: { port: 3000 },
  // Astro valida el header Origin en los POST (CSRF). Tras el proxy de Vercel,
  // el host reconstruido no coincide con el Origin y bloquea los formularios.
  // Lo desactivamos; las mutaciones siguen protegidas por la sesión de Supabase
  // (cookies SameSite=Lax) y por las políticas RLS.
  security: { checkOrigin: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
