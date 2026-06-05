# Stripe Auth Setup

This repo is now Vercel/Next.js-ready while preserving the current standalone dashboard look. The protected `/` route reads the existing `index.html` and only serves it to logged-in users with an active Stripe-backed subscription.

## Important Security Cutover

Do not keep serving this dashboard from public GitHub Pages after the paywall is live. The dashboard data is embedded in `index.html`; if GitHub Pages remains public, anyone can still access the paid data there.

Before launch:

1. Deploy this repo to Vercel.
2. Point `alpha.sealalphateam.com` to Vercel.
3. Disable GitHub Pages for this repo or remove the custom domain from GitHub Pages.
4. Make the repository private if the embedded dashboard data should not be visible in source control.

## Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. In Authentication > URL Configuration:
   - Site URL: `https://alpha.sealalphateam.com`
   - Redirect URLs:
     - `https://alpha.sealalphateam.com/auth/callback`
     - `http://localhost:3000/auth/callback`
4. Copy the project URL, anon key, and service role key into Vercel environment variables.

## Stripe

1. Create a Stripe subscription product and recurring price.
2. Copy the recurring Price ID into `STRIPE_PRICE_ID`.
3. Enable and configure the Stripe Customer Portal.
4. Add a webhook endpoint:
   - URL: `https://alpha.sealalphateam.com/api/stripe-webhook`
   - Events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
5. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

## Vercel Environment Variables

Use `.env.example` as the source list:

```text
NEXT_PUBLIC_APP_URL=https://alpha.sealalphateam.com
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_ID=...
```

## Local Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Import new CSV activity exactly as before:

```bash
npm run import:options -- C:\Users\Shoop\Downloads\option_export__06_05_2026.csv
```

The importer still updates `index.html`; the protected Next.js route serves that same file to active members.

## Member Flow

1. Visitor opens `https://alpha.sealalphateam.com`.
2. If not logged in, they are sent to `/login`.
3. They request a magic link with email.
4. If logged in but not subscribed, they click `Subscribe with Stripe`.
5. Stripe Checkout creates the subscription.
6. Stripe webhook writes subscription status to Supabase.
7. Active members are served the full dashboard.
8. Members can use the floating `Billing` control on the dashboard to open Stripe Customer Portal.
