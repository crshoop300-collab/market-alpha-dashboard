import Stripe from 'stripe';
import { getRequiredEnv } from './env';

let stripeClient;

export function stripe() {
  if (!stripeClient) {
    stripeClient = new Stripe(getRequiredEnv('STRIPE_SECRET_KEY'), {
      apiVersion: '2024-06-20'
    });
  }
  return stripeClient;
}
