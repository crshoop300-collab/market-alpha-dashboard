import { getCurrentUser, getMembership, hasActiveMembership } from '@/lib/access';

function messageFor(params, isLoggedIn) {
  if (params.sent) return `Magic link sent to ${params.email || 'your email'}.`;
  if (params.logged_out) return 'You have been logged out.';
  if (params.checkout === 'cancelled') return 'Checkout was cancelled. Your dashboard access has not changed.';
  if (params.subscription === 'required' && isLoggedIn) return 'Your account is logged in. Subscribe to unlock the dashboard.';
  if (params.subscription === 'required') return 'Log in or subscribe to unlock the Alpha dashboard.';
  if (params.error === 'email') return 'Enter a valid email address.';
  if (params.error === 'login') return 'Could not send the magic link. Try again.';
  return '';
}

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const { user } = await getCurrentUser();
  const membership = user ? await getMembership(user.id) : null;
  const isActive = hasActiveMembership(membership);
  const message = messageFor(params || {}, Boolean(user));

  return (
    <>
      <style>{`
          :root {
            --navy: #101517;
            --navy-light: #1a2228;
            --deep-red: #CF2E2E;
            --gold: #9B6A36;
            --green: #00D084;
            --text: #a8b8c0;
            --text-dim: #5e7078;
            --text-bright: #dce4e8;
            --border: rgba(255,255,255,0.08);
            --font-display: 'Rajdhani', sans-serif;
            --font-mono: 'JetBrains Mono', monospace;
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            min-height: 100vh;
            background:
              linear-gradient(170deg, rgba(10,15,17,0.98) 0%, rgba(16,21,23,0.96) 44%, rgba(10,14,16,0.98) 100%),
              radial-gradient(circle at 20% 20%, rgba(155,106,54,0.16), transparent 28%);
            color: var(--text);
            font-family: var(--font-mono);
            display: grid;
            place-items: center;
            padding: 24px;
          }
          body::before {
            content: '';
            position: fixed;
            inset: 0;
            background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px);
            pointer-events: none;
          }
          .shell {
            width: min(980px, 100%);
            border: 1px solid var(--border);
            background: rgba(16,21,23,0.88);
            box-shadow: 0 24px 80px rgba(0,0,0,0.38);
            display: grid;
            grid-template-columns: minmax(0, 1fr) 360px;
          }
          .hero {
            padding: 38px;
            min-height: 520px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            border-right: 1px solid var(--border);
          }
          .brand {
            display: flex;
            gap: 16px;
            align-items: center;
          }
          .brand img {
            width: 68px;
            height: 68px;
            object-fit: contain;
            border-radius: 6px;
            border: 1px solid rgba(155,106,54,0.3);
          }
          h1 {
            font-family: var(--font-display);
            color: #fff;
            font-size: clamp(2.4rem, 7vw, 5.4rem);
            line-height: 0.9;
            letter-spacing: 0;
            text-transform: uppercase;
            margin-top: 40px;
            max-width: 620px;
          }
          .eyebrow,
          .label {
            color: var(--gold);
            font-family: var(--font-display);
            font-weight: 700;
            letter-spacing: 2px;
            text-transform: uppercase;
          }
          .copy {
            margin-top: 18px;
            font-size: 0.92rem;
            line-height: 1.8;
            max-width: 560px;
          }
          .metrics {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-top: 34px;
          }
          .metric {
            border: 1px solid var(--border);
            padding: 12px;
            background: rgba(255,255,255,0.03);
          }
          .metric strong {
            display: block;
            color: var(--text-bright);
            font-family: var(--font-display);
            font-size: 1.25rem;
          }
          .panel {
            padding: 28px;
            background: rgba(10,15,17,0.54);
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .panel h2 {
            color: var(--text-bright);
            font-family: var(--font-display);
            font-size: 1.6rem;
            text-transform: uppercase;
            margin-bottom: 10px;
          }
          .status {
            min-height: 20px;
            color: var(--green);
            font-size: 0.8rem;
            line-height: 1.5;
            margin-bottom: 16px;
          }
          .field {
            width: 100%;
            background: rgba(0,0,0,0.22);
            border: 1px solid var(--border);
            color: var(--text-bright);
            font-family: var(--font-mono);
            font-size: 0.9rem;
            padding: 13px 12px;
            margin: 12px 0;
          }
          .field:focus {
            outline: 1px solid rgba(155,106,54,0.5);
          }
          .button {
            width: 100%;
            border: 1px solid rgba(155,106,54,0.5);
            background: linear-gradient(135deg, var(--gold), #7a5528);
            color: #101517;
            cursor: pointer;
            display: inline-flex;
            justify-content: center;
            align-items: center;
            font-family: var(--font-display);
            font-size: 0.95rem;
            font-weight: 700;
            letter-spacing: 1.5px;
            padding: 13px 16px;
            text-decoration: none;
            text-transform: uppercase;
          }
          .button.secondary {
            background: rgba(255,255,255,0.04);
            color: var(--text-bright);
            border-color: var(--border);
            margin-top: 10px;
          }
          .fine {
            color: var(--text-dim);
            font-size: 0.72rem;
            line-height: 1.7;
            margin-top: 16px;
          }
          @media (max-width: 820px) {
            .shell { grid-template-columns: 1fr; }
            .hero { min-height: auto; border-right: 0; border-bottom: 1px solid var(--border); padding: 28px; }
            .metrics { grid-template-columns: 1fr; }
          }
      `}</style>
      <main className="shell">
        <section className="hero">
          <div>
            <div className="brand">
              <img src="/assets/logo.jpg" alt="S.E.A.L. Alpha Team" />
              <div>
                <div className="eyebrow">S.E.A.L. Alpha Team</div>
                <div>Market Alpha Dashboard</div>
              </div>
            </div>
            <h1>Alpha access, locked in.</h1>
            <p className="copy">
              Live institutional flow, Alpha Trades, trend strength, predictive alerts, and daily recap data stay in the standalone dashboard experience.
            </p>
            <div className="metrics">
              <div className="metric"><strong>Alpha</strong><span>Sweep + OTM rules</span></div>
              <div className="metric"><strong>Stripe</strong><span>Subscription access</span></div>
              <div className="metric"><strong>Private</strong><span>Protected dashboard</span></div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="label">Member Gate</div>
          <h2>{isActive ? 'Access Active' : user ? 'Subscribe' : 'Login'}</h2>
          <div className="status">{message}</div>

          {isActive ? (
            <a className="button" href="/">Open Dashboard</a>
          ) : user ? (
            <>
              <a className="button" href="/checkout">Subscribe with Stripe</a>
              <a className="button secondary" href="/auth/logout">Use another email</a>
            </>
          ) : (
            <form action="/api/auth/login" method="post">
              <input className="field" type="email" name="email" placeholder="member@email.com" autoComplete="email" required />
              <button className="button" type="submit">Send Magic Link</button>
            </form>
          )}

          <p className="fine">
            Login uses a secure email magic link. Billing, card updates, invoices, and cancellation are handled through Stripe.
          </p>
        </section>
      </main>
    </>
  );
}
