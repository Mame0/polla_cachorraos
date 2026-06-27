import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { profile, supabase } = locals;
  if (profile?.role !== 'tesorero' && profile?.role !== 'admin') return redirect('/');

  const form = await request.formData();
  const poll_id = String(form.get('poll_id') ?? '');
  const user_id = String(form.get('user_id') ?? '');
  const paid = String(form.get('paid') ?? '') === 'true';

  if (!poll_id || !user_id) {
    return redirect('/tesorero?error=' + encodeURIComponent('Datos inválidos.'));
  }

  // La RLS valida que quien actualiza sea tesorero o admin.
  const { error } = await supabase
    .from('poll_members')
    .update({ paid, paid_at: paid ? new Date().toISOString() : null })
    .eq('poll_id', poll_id)
    .eq('user_id', user_id);

  if (error) {
    return redirect('/tesorero?error=' + encodeURIComponent('No se pudo actualizar el pago.'));
  }

  return redirect('/tesorero?saved=' + encodeURIComponent('Pago actualizado.'));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
