import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ locals }) => {
  await locals.supabase.auth.signOut();
  return new Response(null, { status: 303, headers: { Location: '/login' } });
};
