import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, supabase } = locals;
  if (!user) return redirect('/login');

  const form = await request.formData();
  const poll_id = String(form.get('poll_id') ?? '');
  if (!poll_id) return redirect('/?error=' + encodeURIComponent('Polla no válida.'));

  // RLS permite borrar solo al creador o admin. El cascade elimina
  // poll_matches, poll_members y predictions de la polla.
  const { error } = await supabase.from('polls').delete().eq('id', poll_id);

  if (error) {
    return redirect(`/polla/${poll_id}?error=` + encodeURIComponent('No se pudo eliminar la polla.'));
  }

  return redirect('/?saved=' + encodeURIComponent('Polla eliminada.'));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
