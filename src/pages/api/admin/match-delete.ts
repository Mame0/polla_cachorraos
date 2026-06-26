import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { profile, supabase } = locals;
  if (profile?.role !== 'admin') return redirect('/');

  const form = await request.formData();
  const match_id = String(form.get('match_id') ?? '');
  if (!match_id) return redirect('/admin?error=' + encodeURIComponent('Partido no especificado.'));

  // Los pronósticos asociados se borran en cascada (ON DELETE CASCADE).
  const { error } = await supabase.from('matches').delete().eq('id', match_id);

  if (error) {
    return redirect('/admin?error=' + encodeURIComponent(error.message));
  }

  return redirect('/admin?saved=' + encodeURIComponent('Partido eliminado.'));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
