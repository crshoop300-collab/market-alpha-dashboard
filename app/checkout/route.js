import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/access';
import { getAppUrl, getRequiredEnv } from '@/lib/env';
import { stripe } from '@/lib/stripe';

export async function GET(request) {
  const { user } = await getCurrentUser();
  const origin = new URL(request.url).origin;

  if (!user?.email) {
    return NextResponse.redirect(new URL('/login?subscription=required', origin));
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

  return NextResponse.redirect(session.url);
}

export const POST = GET;
