import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, supabase } = locals;
  if (!user) return redirect('/login');

  const form = await request.formData();
  const poll_id = String(form.get('poll_id') ?? '');
  if (!poll_id) return redirect('/?error=' + encodeURIComponent('Polla no válida.'));

  // upsert: si ya es miembro, no falla.
  const { error } = await supabase
    .from('poll_members')
    .upsert({ poll_id, user_id: user.id }, { onConflict: 'poll_id,user_id' });

  if (error) {
    return redirect('/?error=' + encodeURIComponent('No se pudo unir a la polla.'));
  }

  return redirect(`/polla/${poll_id}?saved=` + encodeURIComponent('Te uniste a la polla. ¡A pronosticar!'));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
