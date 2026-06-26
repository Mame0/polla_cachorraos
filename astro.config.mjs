import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  server: { port: 3000 },
  vite: {
    plugins: [tailwindcss()],
  },
});
