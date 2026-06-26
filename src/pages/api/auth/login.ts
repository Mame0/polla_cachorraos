import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');

  const { error } = await locals.supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return new Response(null, {
      status: 303,
      headers: { Location: '/login?error=' + encodeURIComponent('Email o contraseña incorrectos.') },
    });
  }

  return new Response(null, { status: 303, headers: { Location: '/' } });
};
