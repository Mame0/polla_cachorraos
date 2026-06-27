import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { user, supabase } = locals;
  if (!user) return redirect('/login');

  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim();
  const entry_amount = Number(form.get('entry_amount') ?? 0);
  const match_ids = form.getAll('match_ids').map((v) => String(v)).filter(Boolean);

  if (!name) {
    return redirect('/crear-polla?error=' + encodeURIComponent('Ponle un nombre a la polla.'));
  }
  if (!Number.isFinite(entry_amount) || entry_amount < 0) {
    return redirect('/crear-polla?error=' + encodeURIComponent('Monto inválido.'));
  }
  if (match_ids.length === 0) {
    return redirect('/crear-polla?error=' + encodeURIComponent('Selecciona al menos un partido.'));
  }

  // 1. Crear la polla.
  const { data: poll, error: pollError } = await supabase
    .from('polls')
    .insert({ name, entry_amount, created_by: user.id })
    .select('id')
    .single();

  if (pollError || !poll) {
    return redirect('/crear-polla?error=' + encodeURIComponent('No se pudo crear la polla: ' + (pollError?.message ?? '')));
  }

  const poll_id = poll.id as string;

  // 2. Enlazar partidos + 3. inscribir al creador.
  const { error: matchesError } = await supabase
    .from('poll_matches')
    .insert(match_ids.map((match_id) => ({ poll_id, match_id })));
  const { error: memberError } = await supabase
    .from('poll_members')
    .insert({ poll_id, user_id: user.id });

  if (matchesError || memberError) {
    await supabase.from('polls').delete().eq('id', poll_id); // rollback best-effort
    return redirect('/crear-polla?error=' + encodeURIComponent('No se pudo configurar la polla. Intenta de nuevo.'));
  }

  return redirect(`/polla/${poll_id}?saved=` + encodeURIComponent('Polla creada. ¡Comparte el enlace!'));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
