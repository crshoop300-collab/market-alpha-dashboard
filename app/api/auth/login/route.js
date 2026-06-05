import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { getAppUrl, getRequiredEnv } from '@/lib/env';

export async function POST(request) {
  const form = await request.formData();
  const email = String(form.get('email') || '').trim().toLowerCase();

  if (!email) {
    redirect('/login?error=email');
  }

  const supabase = createClient(
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  );

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getAppUrl()}/auth/callback?next=/`
    }
  });

  if (error) {
    console.error('Magic link failed:', error);
    redirect('/login?error=login');
  }

  redirect(`/login?sent=1&email=${encodeURIComponent(email)}`);
}
