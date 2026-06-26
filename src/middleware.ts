import { defineMiddleware } from 'astro:middleware';
import { createSupabase } from './lib/supabase';
import type { Profile } from './env';

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createSupabase(context.request, context.cookies);
  context.locals.supabase = supabase;

  // getUser() valida el token contra Supabase (más seguro que getSession()).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  context.locals.user = user;
  context.locals.profile = null;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, role')
      .eq('id', user.id)
      .single();
    context.locals.profile = (profile as Profile) ?? null;
  }

  return next();
});
