import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const username = String(form.get('username') ?? '').trim();
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');

  if (username.length < 3 || !email || password.length < 8) {
    return redirect('/register?error=' + encodeURIComponent('Revisa los datos: usuario (3+) y contraseña (8+).'));
  }

  const { data, error } = await locals.supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });

  if (error) {
    return redirect('/register?error=' + encodeURIComponent(error.message));
  }

  // Si la confirmación por email está desactivada, ya hay sesión -> al inicio.
  if (data.session) {
    return redirect('/');
  }
  // Si requiere confirmar email.
  return redirect('/login?msg=' + encodeURIComponent('Cuenta creada. Revisa tu email para confirmar y luego inicia sesión.'));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
