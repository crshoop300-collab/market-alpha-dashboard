import { NextResponse } from 'next/server';
import { getRequiredEnv } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabaseServer';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

function periodEndToIso(subscription) {
  if (!subscription.current_period_end) return null;
  return new Date(subscription.current_period_end * 1000).toISOString();
}

async function upsertSubscription(subscription, fallbackUserId = null) {
  const userId = subscription.metadata?.supabase_user_id || fallbackUserId;
  if (!userId) {
    console.warn('Stripe subscription missing Supabase user id:', subscription.id);
    return;
  }

  const supabase = createSupabaseAdminClient();
  await supabase.from('subscriptions').upsert({
    user_id: userId,
    stripe_customer_id: String(subscription.customer),
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    current_period_end: periodEndToIso(subscription),
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'user_id'
  });
}

export async function POST(request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  let event;
  try {
    event = stripe().webhooks.constructEvent(
      body,
      signature,
      getRequiredEnv('STRIPE_WEBHOOK_SECRET')
    );
  } catch (error) {
    console.error('Stripe webhook signature failed:', error.message);
    return new Response('Invalid signature', { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode === 'subscription' && session.subscription) {
        const subscription = await stripe().subscriptions.retrieve(session.subscription);
        await upsertSubscription(subscription, session.client_reference_id);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await upsertSubscription(event.data.object);
      break;
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      if (invoice.subscription) {
        const subscription = await stripe().subscriptions.retrieve(invoice.subscription);
        await upsertSubscription(subscription);
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
