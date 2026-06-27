import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { profile, supabase } = locals;
  if (profile?.role !== 'admin') return redirect('/');

  const form = await request.formData();
  const user_id = String(form.get('user_id') ?? '');
  const action = String(form.get('action') ?? ''); // 'grant' | 'revoke'

  if (!user_id || (action !== 'grant' && action !== 'revoke')) {
    return redirect('/admin?error=' + encodeURIComponent('Datos inválidos.'));
  }

  if (action === 'grant') {
    // Solo un tesorero a la vez: degradar a cualquier tesorero actual.
    const { error: demoteErr } = await supabase
      .from('profiles')
      .update({ role: 'player' })
      .eq('role', 'tesorero');
    if (demoteErr) {
      return redirect('/admin?error=' + encodeURIComponent('No se pudo reasignar el tesorero: ' + demoteErr.message));
    }
    const { error } = await supabase.from('profiles').update({ role: 'tesorero' }).eq('id', user_id);
    if (error) {
      return redirect('/admin?error=' + encodeURIComponent('No se pudo asignar el rol: ' + error.message));
    }
    return redirect('/admin?saved=' + encodeURIComponent('Tesorero asignado.'));
  }

  // revoke
  const { error } = await supabase
    .from('profiles')
    .update({ role: 'player' })
    .eq('id', user_id)
    .eq('role', 'tesorero');
  if (error) {
    return redirect('/admin?error=' + encodeURIComponent('No se pudo quitar el rol: ' + error.message));
  }
  return redirect('/admin?saved=' + encodeURIComponent('Rol de tesorero retirado.'));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
