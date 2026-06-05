import { createSupabaseServerClient } from './supabaseServer';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    return { supabase, user: null };
  }

  return { supabase, user: data.user };
}

export async function getMembership(userId) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status,current_period_end,stripe_customer_id,stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Membership lookup failed:', error);
    return null;
  }

  return data || null;
}

export function hasActiveMembership(subscription) {
  if (!subscription || !ACTIVE_STATUSES.has(subscription.status)) return false;
  if (!subscription.current_period_end) return true;
  return new Date(subscription.current_period_end).getTime() > Date.now();
}
