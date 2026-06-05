import { redirect } from 'next/navigation';
import { getCurrentUser, getMembership, hasActiveMembership } from '@/lib/access';
import { getProtectedDashboardHtml } from '@/lib/dashboardHtml';

export async function GET() {
  const { user } = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const membership = await getMembership(user.id);
  if (!hasActiveMembership(membership)) {
    redirect('/login?subscription=required');
  }

  const html = await getProtectedDashboardHtml();

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store'
    }
  });
}
