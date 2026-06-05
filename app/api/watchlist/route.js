import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/access';

function cleanTrade(input) {
  const trade = input || {};
  const ticker = String(trade.ticker || '').trim().toUpperCase();
  const tradeKey = String(trade.trade_key || '').trim();

  if (!ticker || !tradeKey) {
    return null;
  }

  return {
    trade_key: tradeKey,
    trade_date: trade.trade_date || null,
    ticker,
    contract: String(trade.contract || '').slice(0, 120),
    side: String(trade.side || '').slice(0, 20),
    trade_type: String(trade.trade_type || '').slice(0, 40),
    sector: String(trade.sector || '').slice(0, 80),
    premium: String(trade.premium || '').slice(0, 40),
    premium_num: Number(trade.premium_num) || null,
    spot: String(trade.spot || '').slice(0, 40),
    strike: String(trade.strike || '').slice(0, 40),
    expiry: String(trade.expiry || '').slice(0, 40),
    source: 'dashboard',
    payload: trade
  };
}

export async function GET() {
  const { supabase, user } = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('watchlist_items')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Watchlist load failed:', error);
    return NextResponse.json({ error: 'Could not load watchlist.' }, { status: 500 });
  }

  return NextResponse.json({ items: data || [] });
}

export async function POST(request) {
  const { supabase, user } = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const trade = cleanTrade(body.trade);
  if (!trade) {
    return NextResponse.json({ error: 'Missing trade details.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('watchlist_items')
    .upsert({
      ...trade,
      user_id: user.id,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,trade_key'
    })
    .select('*')
    .single();

  if (error) {
    console.error('Watchlist save failed:', error);
    return NextResponse.json({ error: 'Could not save trade.' }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

export async function PATCH(request) {
  const { supabase, user } = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    patch.notes = String(body.notes || '').slice(0, 1200);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    patch.status = String(body.status || 'watching').slice(0, 40);
  }

  if (!id || !Object.keys(patch).length) {
    return NextResponse.json({ error: 'Missing update details.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('watchlist_items')
    .update({
      ...patch,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (error) {
    console.error('Watchlist update failed:', error);
    return NextResponse.json({ error: 'Could not update trade.' }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(request) {
  const { supabase, user } = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Login required.' }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing watchlist id.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('watchlist_items')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Watchlist delete failed:', error);
    return NextResponse.json({ error: 'Could not remove trade.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
