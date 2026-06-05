import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/access';
import { getAppUrl, getRequiredEnv } from '@/lib/env';
import { stripe } from '@/lib/stripe';

export async function POST() {
  const { user } = await getCurrentUser();

  if (!user?.email) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer_email: user.email,
    client_reference_id: user.id,
    line_items: [
      {
        price: getRequiredEnv('STRIPE_PRICE_ID'),
        quantity: 1
      }
    ],
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        email: user.email
      }
    },
    success_url: `${getAppUrl()}/?checkout=success`,
    cancel_url: `${getAppUrl()}/login?checkout=cancelled`,
    allow_promotion_codes: true
  });

  return NextResponse.json({ url: session.url });
}
