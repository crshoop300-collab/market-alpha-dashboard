import { NextResponse } from 'next/server';
import { getCurrentUser, getMembership, hasActiveMembership } from '@/lib/access';
import { getAppUrl } from '@/lib/env';
import { stripe } from '@/lib/stripe';

export async function POST() {
  const { user } = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const membership = await getMembership(user.id);
  if (!hasActiveMembership(membership) || !membership.stripe_customer_id) {
    return NextResponse.json({ error: 'No active billing account found.' }, { status: 403 });
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: membership.stripe_customer_id,
    return_url: getAppUrl()
  });

  return NextResponse.json({ url: session.url });
}
