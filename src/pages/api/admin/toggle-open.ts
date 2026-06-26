import type { APIRoute } from 'astro';

export const prerender = false;

// value: 'open'  -> force_open = true   (habilitar aunque esté cerrado)
//        'close' -> force_open = false  (cerrar a la fuerza)
//        'auto'  -> force_open = null   (volver a la regla automática)
const MAP: Record<string, boolean | null> = {
  open: true,
  close: false,
  auto: null,
};

export const POST: APIRoute = async ({ request, locals }) => {
  const { profile, supabase } = locals;
  if (profile?.role !== 'admin') return redirect('/');

  const form = await request.formData();
  const match_id = String(form.get('match_id') ?? '');
  const value = String(form.get('value') ?? '');

  if (!match_id || !(value in MAP)) {
    return redirect('/admin?error=' + encodeURIComponent('Acción inválida.'));
  }

  const { error } = await supabase
    .from('matches')
    .update({ force_open: MAP[value] })
    .eq('id', match_id);

  if (error) {
    return redirect('/admin?error=' + encodeURIComponent(error.message));
  }

  const msg = value === 'open'
    ? 'Pronósticos habilitados para el partido.'
    : value === 'close'
      ? 'Pronósticos cerrados para el partido.'
      : 'El partido vuelve al cierre automático.';
  return redirect('/admin?saved=' + encodeURIComponent(msg));
};

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}
