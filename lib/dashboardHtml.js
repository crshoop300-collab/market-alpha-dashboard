import fs from 'node:fs/promises';
import path from 'node:path';

const AUTH_BAR = `
<style>
  .auth-member-bar {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 10000;
    display: flex;
    gap: 8px;
    padding: 8px;
    background: rgba(16,21,23,0.92);
    border: 1px solid rgba(155,106,54,0.35);
    border-radius: 6px;
    box-shadow: 0 0 18px rgba(0,0,0,0.35);
    backdrop-filter: blur(12px);
  }
  .auth-member-bar button,
  .auth-member-bar a {
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    background: rgba(255,255,255,0.04);
    color: #dce4e8;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    padding: 7px 10px;
    text-decoration: none;
    text-transform: uppercase;
  }
  .auth-member-bar button:hover,
  .auth-member-bar a:hover {
    border-color: rgba(155,106,54,0.55);
    color: #ffffff;
  }
</style>
<div class="auth-member-bar" aria-label="Member controls">
  <button type="button" id="manageBillingButton">Billing</button>
  <a href="/auth/logout">Logout</a>
</div>
<script>
  document.getElementById('manageBillingButton')?.addEventListener('click', async function() {
    this.disabled = true;
    try {
      const response = await fetch('/api/create-portal-session', { method: 'POST' });
      const data = await response.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || 'Billing portal unavailable.');
    } catch (error) {
      alert('Billing portal unavailable.');
    } finally {
      this.disabled = false;
    }
  });
</script>
`;

export async function getProtectedDashboardHtml() {
  const file = path.join(process.cwd(), 'index.html');
  const html = await fs.readFile(file, 'utf8');

  return html.replace('</body>', `${AUTH_BAR}\n</body>`);
}
