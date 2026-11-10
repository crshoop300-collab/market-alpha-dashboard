import fs from 'node:fs';
import path from 'node:path';

const INDEX_PATH = path.resolve('index.html');
const IMPORTED_AT = new Date().toISOString().slice(0, 19).replace('T', ' ');

const args = process.argv.slice(2);
const selectedDates = new Set((args.find((arg) => arg.startsWith('--dates='))?.slice(8) || '').split(',').filter(Boolean));
const timestampZone = args.find((arg) => arg.startsWith('--timestamp-zone='))?.split('=')[1];
for (const arg of args.filter((arg) => arg.startsWith('--'))) {
  if (!arg.startsWith('--dates=') && !arg.startsWith('--timestamp-zone=')) throw new Error(`Unknown option: ${arg}`);
}
for (const date of selectedDates) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`Invalid date: ${date}`);
}
if (timestampZone && !['UTC', 'America/New_York'].includes(timestampZone)) throw new Error('Unsupported timestamp zone');
const csvFiles = args.filter((arg) => !arg.startsWith('--'));
if (!csvFiles.length) {
  console.error('Usage: node scripts/import_option_exports.mjs [--dates=YYYY-MM-DD,...] [--timestamp-zone=UTC|America/New_York] <export.csv> [...]');
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cur);
      cur = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cur);
      if (row.some((cell) => cell.length)) rows.push(row);
      row = [];
      cur = '';
      continue;
    }

    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    if (row.some((cell) => cell.length)) rows.push(row);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((vals) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (vals[idx] || '').trim();
    });
    return obj;
  });
}

function parseMoney(value) {
  const raw = String(value || '').replace(/[$,\s]/g, '').toUpperCase();
  if (!raw) return 0;
  const mult = raw.endsWith('B') ? 1e9 : raw.endsWith('M') ? 1e6 : raw.endsWith('K') ? 1e3 : 1;
  return (parseFloat(raw) || 0) * mult;
}

function money(n) {
  if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString('en-US') + 'K';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function isoDate(dateValue) {
  const m = String(dateValue).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return dateValue;
  const year = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

function displayTime(value) {
  const m = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return value || '';
  let hour = Number(m[1]);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${String(hour).padStart(2, '0')}:${m[2]} ${suffix}`;
}

function daysBetween(start, end) {
  const a = new Date(start + 'T12:00:00Z');
  const b = new Date(end + 'T12:00:00Z');
  return Math.round((b - a) / 86400000);
}

function isCall(cp) {
  return String(cp || '').toUpperCase().startsWith('C');
}

function isPut(cp) {
  return String(cp || '').toUpperCase().startsWith('P');
}

function isOtm(trade) {
  if (!Number.isFinite(trade.spot) || trade.spot <= 0) return false;
  if (isCall(trade.call_put)) return trade.strike > trade.spot;
  if (isPut(trade.call_put)) return trade.strike < trade.spot;
  return false;
}

function isAlpha(trade) {
  if (trade.premium_num <= 1000000) return false;
  if (!String(trade.type || '').toUpperCase().includes('SWEEP')) return false;
  if (!isOtm(trade)) return false;
  const dte = daysBetween(trade.capture_date, trade.expiry);
  if (dte < 0) return false;
  if (dte <= 31) return true;
  return trade.premium_num > 2000000 && dte <= 75;
}

function algoScore(trade) {
  if (trade.is_golden) return 5;
  let score = 1;
  if (trade.premium_num >= 500000) score++;
  if (trade.premium_num >= 1000000) score++;
  if (String(trade.type || '').toUpperCase().includes('SWEEP')) score++;
  if (isOtm(trade)) score++;
  return Math.min(score, 5);
}

function normalizeSector(sector) {
  const s = String(sector || '').trim();
  const map = {
    'ETF/ETN': 'ETF/N',
    Technology: 'TECH',
    Discretionary: 'DISCR',
    Staples: 'STAP',
    Industrials: 'INDU',
    Healthcare: 'HLTH',
    Energy: 'ENER',
    Financials: 'FINS',
    Materials: 'MATR',
  };
  return map[s] || s || 'OTHER';
}

// Xynth exports can span many sessions. Require explicit dates and an explicit
// timestamp interpretation, and never overwrite an existing dashboard date.
function normalizeXynth(row) {
  if (!selectedDates.size || !timestampZone) throw new Error('Xynth requires --dates and --timestamp-zone');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.timestamp)) throw new Error(`Invalid Xynth timestamp: ${row.timestamp}`);
  const instant = new Date(row.timestamp.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 19).replace('T', ' ') !== row.timestamp) throw new Error('Invalid Xynth timestamp');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timestampZone === 'UTC' ? 'America/New_York' : 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant).map(({ type, value }) => [type, value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (!selectedDates.has(date)) return null;
  if (!['call', 'put'].includes(row.type) || !row.ticker || !['true', 'false'].includes(row.is_sweep) || !['true', 'false'].includes(row.unusual)) throw new Error('Invalid Xynth contract or flags');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.expiry) || !Number.isFinite(Date.parse(row.expiry)) || new Date(row.expiry).toISOString().slice(0, 10) !== row.expiry) throw new Error('Invalid Xynth expiry');
  for (const key of ['strike', 'size', 'price', 'premium', 'volume', 'open_interest']) {
    if (row[key] === '' || !Number.isFinite(Number(row[key])) || Number(row[key]) < 0) throw new Error(`Invalid Xynth ${key}`);
  }
  if (row.underlying_price !== '' && (!Number.isFinite(Number(row.underlying_price)) || Number(row.underlying_price) <= 0)) throw new Error('Invalid Xynth underlying price');
  const tags = row.tags.split('|');
  const sectors = { 'Consumer Cyclical': 'Discretionary', 'Consumer Defensive': 'Staples', 'Basic Materials': 'Materials', 'Financial Services': 'Financials', 'Communication Services': 'COMM', Utilities: 'UTIL', 'Real Estate': 'REAL' };
  return {
    Date: date, Time: `${parts.hour}:${parts.minute}:${parts.second}`, Ticker: row.ticker,
    Expiry: row.expiry, Strike: row.strike, 'C/P': row.type === 'call' ? 'CALLS' : 'PUTS',
    Spot: row.underlying_price, Qty: row.size, Price: row.price,
    Type: row.is_sweep === 'true' ? 'SWEEP' : row.is_floor === 'true' ? 'FLOOR' : 'TRADE',
    Volume: row.volume, OI: row.open_interest, Premium: row.premium,
    Sector: tags.includes('etf') ? 'ETF/ETN' : tags.includes('index') ? 'INDEX' : sectors[row.sector] || row.sector,
    Unusual: row.unusual, Source: 'Xynth', SourceTimestamp: row.timestamp,
  };
}

function normalizeTradytics(row, sectors) {
  if (selectedDates.size !== 1 || !timestampZone) throw new Error('Tradytics requires exactly one --dates value and --timestamp-zone');
  if (!['single', 'sweep', 'split', 'block'].includes(row.order)) throw new Error(`Invalid Tradytics order: ${row.order}`);
  if (!row.spot) throw new Error('Tradytics underlying price is required');
  const date = [...selectedDates][0];
  // Reuse date, time, numeric and contract validation, without treating an
  // absent volume or unusual flag as reported zero/false data.
  const mapped = normalizeXynth({
    timestamp: `${date} ${row.time_local}`, ticker: row.symbol,
    type: String(row.type).toLowerCase(), strike: row.strike, expiry: row.expiry,
    underlying_price: row.spot, size: row.size, price: row.price, premium: row.premium,
    volume: '0', open_interest: row.open_interest,
    is_sweep: String(row.order === 'sweep'), is_floor: 'false', unusual: 'false',
    tags: '', sector: sectors.get(row.symbol)?.sector || 'OTHER',
  });
  if (!mapped) throw new Error('Tradytics timestamp falls outside the selected trading date');
  return { ...mapped, Type: row.order.toUpperCase(), Volume: '', Unusual: '', Source: 'Tradytics',
    Side: row.side, Condition: row.condition, Events: row.events,
    SectorSourceDate: sectors.get(row.symbol)?.date || null,
    RawSignature: JSON.stringify(row),
  };
}

function groupByTicker(flow, sideFilter) {
  const map = new Map();
  flow.filter(sideFilter).forEach((trade) => {
    const item = map.get(trade.ticker) || { ticker: trade.ticker, orders: 0, premium_num: 0 };
    item.orders++;
    item.premium_num += trade.premium_num || 0;
    map.set(trade.ticker, item);
  });
  return [...map.values()]
    .sort((a, b) => b.premium_num - a.premium_num)
    .map((item) => ({ ticker: item.ticker, orders: item.orders, premium: money(item.premium_num) }));
}

function topTickerStrings(flow, sideFilter) {
  return groupByTicker(flow, sideFilter)
    .slice(0, 5)
    .map((item) => `${item.ticker} - ${item.premium}`);
}

function sectorHeatmap(flow) {
  const map = new Map();
  flow.forEach((trade) => {
    const item = map.get(trade.sector) || {
      sector: trade.sector,
      call_premium: 0,
      put_premium: 0,
      total_orders: 0,
      call_count: 0,
      put_count: 0,
    };
    item.total_orders++;
    if (isCall(trade.call_put)) {
      item.call_premium += trade.premium_num || 0;
      item.call_count++;
    } else if (isPut(trade.call_put)) {
      item.put_premium += trade.premium_num || 0;
      item.put_count++;
    }
    map.set(trade.sector, item);
  });
  return [...map.values()].sort((a, b) => (b.call_premium + b.put_premium) - (a.call_premium + a.put_premium));
}

function trendScores(flow) {
  const map = new Map();
  flow.forEach((trade) => {
    const item = map.get(trade.ticker) || {
      ticker: trade.ticker,
      flow_count: 0,
      total_premium: 0,
      bullish_premium: 0,
      bearish_premium: 0,
      algo_sum: 0,
      golden_count: 0,
    };
    item.flow_count++;
    item.total_premium += trade.premium_num || 0;
    item.algo_sum += trade.algo_score || 0;
    if (trade.is_golden) item.golden_count++;
    if (isCall(trade.call_put)) item.bullish_premium += trade.premium_num || 0;
    if (isPut(trade.call_put)) item.bearish_premium += trade.premium_num || 0;
    map.set(trade.ticker, item);
  });

  return [...map.values()]
    .map((item) => {
      const total = item.total_premium || 1;
      const bullish_pct = (item.bullish_premium / total) * 100;
      const bearish_pct = (item.bearish_premium / total) * 100;
      return {
        ticker: item.ticker,
        flow_count: item.flow_count,
        total_premium: Math.round(item.total_premium),
        bullish_premium: Math.round(item.bullish_premium),
        bearish_premium: Math.round(item.bearish_premium),
        avg_algo_score: Number((item.algo_sum / item.flow_count).toFixed(2)),
        golden_count: item.golden_count,
        bullish_pct: Number(bullish_pct.toFixed(1)),
        bearish_pct: Number(bearish_pct.toFixed(1)),
        trend_score: Number((bullish_pct - bearish_pct).toFixed(1)),
      };
    })
    .sort((a, b) => b.total_premium - a.total_premium)
    .slice(0, 30);
}

function buildAlerts(flow, alphaTrades, date) {
  const alerts = [];
  let id = 1;

  const byAlphaTicker = new Map();
  alphaTrades.forEach((trade) => {
    const item = byAlphaTicker.get(trade.ticker) || { count: 0, premium: 0 };
    item.count++;
    item.premium += trade.premium_num || 0;
    byAlphaTicker.set(trade.ticker, item);
  });

  [...byAlphaTicker.entries()]
    .filter(([, item]) => item.count >= 2)
    .sort((a, b) => b[1].premium - a[1].premium)
    .slice(0, 2)
    .forEach(([ticker, item]) => {
      alerts.push({
        id: id++,
        capture_date: date,
        capture_time: IMPORTED_AT,
        alert_type: 'consecutive_golden',
        severity: 'high',
        title: `Repeated Alpha: ${ticker} has ${item.count} alpha trades (${money(item.premium)})`,
        description: `${ticker} printed ${item.count} qualifying sweep/OTM alpha trades totaling ${money(item.premium)}. Watch for continuation or dealer hedging around the highlighted strikes.`,
        tickers: ticker,
        created_at: IMPORTED_AT,
      });
    });

  alphaTrades.slice(0, 4).forEach((trade) => {
    alerts.push({
      id: id++,
      capture_date: date,
      capture_time: IMPORTED_AT,
      alert_type: 'golden_sweep',
      severity: trade.premium_num >= 2000000 ? 'high' : 'medium',
      title: `${trade.ticker} Alpha Sweep ${trade.premium}`,
      description: `${trade.ticker} ${trade.strike}${isCall(trade.call_put) ? 'C' : 'P'} exp ${trade.expiry} qualified as an alpha trade: sweep, out-of-the-money, ${money(trade.premium_num)} premium.`,
      tickers: trade.ticker,
      created_at: IMPORTED_AT,
    });
  });

  const sectors = sectorHeatmap(flow);
  const topSector = sectors[0];
  if (topSector) {
    const net = topSector.call_premium - topSector.put_premium;
    alerts.push({
      id: id++,
      capture_date: date,
      capture_time: IMPORTED_AT,
      alert_type: 'sector_trend',
      severity: Math.abs(net) >= 10000000 ? 'high' : 'medium',
      title: `${topSector.sector} Flow Leads the Tape`,
      description: `${topSector.sector} led premium flow with ${money(topSector.call_premium + topSector.put_premium)} across ${topSector.total_orders} trades, skewing ${net >= 0 ? 'bullish' : 'bearish'}.`,
      tickers: '',
      created_at: IMPORTED_AT,
    });
  }

  const unusual = flow
    .filter((trade) => trade.unusual && trade.premium_num >= 1000000)
    .sort((a, b) => b.premium_num - a.premium_num)[0];
  if (unusual) {
    alerts.push({
      id: id++,
      capture_date: date,
      capture_time: IMPORTED_AT,
      alert_type: 'unusual_activity',
      severity: unusual.premium_num >= 2000000 ? 'high' : 'medium',
      title: `${unusual.ticker} Unusual Premium Spike`,
      description: `${unusual.ticker} was flagged unusual with ${unusual.premium} in ${isCall(unusual.call_put) ? 'call' : 'put'} premium on a ${unusual.type.toLowerCase()} print.`,
      tickers: unusual.ticker,
      created_at: IMPORTED_AT,
    });
  }

  return alerts.slice(0, 8);
}

function buildRecap(flow, alphaTrades, snapshot) {
  const totalPremium = flow.reduce((sum, trade) => sum + (trade.premium_num || 0), 0);
  const largest = flow.slice().sort((a, b) => b.premium_num - a.premium_num)[0];
  const sectors = sectorHeatmap(flow);
  const topSector = sectors[0];
  const bigTickets = flow
    .filter((trade) => trade.premium_num >= 1000000)
    .sort((a, b) => b.premium_num - a.premium_num)
    .slice(0, 4)
    .map((trade) => trade.ticker);
  const sentimentWord = snapshot.sentiment_pct >= 60 ? 'Bullish' : snapshot.sentiment_pct <= 40 ? 'Bearish' : 'Neutral';
  const sectorContext = topSector ? `${topSector.sector}-led` : 'mixed-sector';
  const largestLabel = largest
    ? `${largest.ticker} $${largest.strike}${isCall(largest.call_put) ? 'C' : 'P'} ${largest.expiry} ${largest.type} for ${largest.premium}`
    : 'N/A';

  return {
    id: 1,
    recap_date: snapshot.capture_date,
    summary: `${sentimentWord} ${sectorContext} session with ${flow.length} trades, ${money(totalPremium)} total premium, and a ${snapshot.put_call_ratio.toFixed(3)} P/C ratio. Largest trade: ${largestLabel}. Big ticket flow concentrated in ${[...new Set(bigTickets)].join(', ') || 'no $1M+ prints'}.`,
    top_bullish: JSON.stringify(topTickerStrings(flow, (trade) => isCall(trade.call_put))),
    top_bearish: JSON.stringify(topTickerStrings(flow, (trade) => isPut(trade.call_put))),
    golden_trades: JSON.stringify(alphaTrades.slice(0, 5).map((trade) => `${trade.ticker} $${trade.strike}${isCall(trade.call_put) ? 'C' : 'P'} ${trade.expiry} - ${trade.premium} ${trade.type}`)),
    sector_flows: JSON.stringify(Object.fromEntries(sectors.map((s) => [s.sector, { bullish: Math.round(s.call_premium), bearish: Math.round(s.put_premium) }]))),
    sentiment_trend: `${sentimentWord} / ${sectorContext}`,
    created_at: IMPORTED_AT,
  };
}

function buildDashboard(date, rows, startId) {
  const flow = rows
    .map((row, idx) => {
      const tradeDate = isoDate(row.Date);
      const premiumNum = parseMoney(row.Premium);
      const trade = {
        id: startId + idx,
        capture_time: `${tradeDate} ${String(row.Time || '').slice(0, 8)}`,
        capture_date: tradeDate,
        capture_hour: Number(String(row.Time || '0').slice(0, 2)) || 0,
        time: displayTime(row.Time),
        ticker: String(row.Ticker || '').trim().toUpperCase(),
        expiry: isoDate(row.Expiry),
        strike: Number(row.Strike),
        call_put: row['C/P'],
        spot: row.Source === 'Xynth' && row.Spot === '' ? null : Number(row.Spot),
        quantity: Number(row.Qty) || 0,
        price: Number(row.Price) || 0,
        type: String(row.Type || '').trim().toUpperCase(),
        volume: row.Source === 'Tradytics' ? null : Number(row.Volume) || 0,
        open_interest: Number(row.OI) || 0,
        premium: money(premiumNum),
        premium_num: Math.round(premiumNum),
        algo_score: 0,
        sector: normalizeSector(row.Sector),
        is_golden: 0,
        unusual: row.Source === 'Tradytics' ? null : String(row.Unusual || '').toUpperCase() === 'TRUE',
        created_at: IMPORTED_AT,
        ...(row.Source === 'Xynth' ? { source: 'Xynth', source_timestamp: row.SourceTimestamp, source_timestamp_zone: timestampZone } : {}),
        ...(row.Source === 'Tradytics' ? {
          source: 'Tradytics', source_timestamp: row.SourceTimestamp, source_timestamp_zone: timestampZone,
          side: row.Side, condition: row.Condition, events: row.Events,
          sector_source_date: row.SectorSourceDate, source_identical_row_count: row.IdenticalCount,
        } : {}),
      };
      trade.is_golden = isAlpha(trade) ? 1 : 0;
      trade.algo_score = algoScore(trade);
      return trade;
    })
    .filter((trade) => trade.capture_date === date && trade.ticker);

  flow.sort((a, b) => (b.capture_time || '').localeCompare(a.capture_time || ''));

  const alphaTrades = flow
    .filter((trade) => trade.is_golden)
    .sort((a, b) => b.premium_num - a.premium_num);

  const callTrades = flow.filter((trade) => isCall(trade.call_put));
  const putTrades = flow.filter((trade) => isPut(trade.call_put));
  const snapshot = {
    id: startId,
    capture_date: date,
    capture_time: IMPORTED_AT,
    sentiment_pct: Number(((callTrades.length / Math.max(flow.length, 1)) * 100).toFixed(1)),
    put_call_ratio: Number((putTrades.length / Math.max(callTrades.length, 1)).toFixed(3)),
    put_flow: putTrades.length,
    call_flow: callTrades.length,
    bullish_leaders: JSON.stringify(groupByTicker(flow, (trade) => isCall(trade.call_put)).slice(0, 15)),
    bearish_leaders: JSON.stringify(groupByTicker(flow, (trade) => isPut(trade.call_put)).slice(0, 15)),
    created_at: IMPORTED_AT,
  };

  const dashboard = {
    date,
    options_flow: flow,
    golden_trades: alphaTrades,
    market_snapshot: snapshot,
    unusual_volume: [],
    top_oi_change: [],
    dark_pool: [],
    alerts: buildAlerts(flow, alphaTrades, date),
    daily_recap: null,
  };
  dashboard.daily_recap = buildRecap(flow, alphaTrades, snapshot);

  return {
    dashboard,
    sector_heatmap: sectorHeatmap(flow),
    trend_scores: trendScores(flow),
  };
}

function extractEmbedded(html) {
  const marker = 'const EMBEDDED_DATA = ';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('Could not find EMBEDDED_DATA');
  const jsonStart = start + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return { data: JSON.parse(html.slice(jsonStart, i + 1)), start: jsonStart, end: i + 1 };
    }
  }
  throw new Error('Could not parse EMBEDDED_DATA');
}

function maxTradeId(data) {
  let max = 0;
  Object.values(data.data || {}).forEach((dateData) => {
    (dateData.dashboard?.options_flow || []).forEach((trade) => {
      max = Math.max(max, Number(trade.id) || 0);
    });
  });
  return max;
}

function optionLabel(dateStr) {
  const date = new Date(dateStr + 'T12:00:00Z');
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).replace(',', '');
}

function renderOptions(dates) {
  return dates.map((date) => `        <option value="${date}">${optionLabel(date)}</option>`).join('\n');
}

function replaceDatePicker(html, dates) {
  const selectStart = html.indexOf('<select class="date-picker" id="datePicker">');
  if (selectStart === -1) throw new Error('Could not find date picker');
  const optionsStart = html.indexOf('\n', selectStart) + 1;
  const selectEnd = html.indexOf('      </select>', optionsStart);
  if (selectEnd === -1) throw new Error('Could not find date picker end');
  return html.slice(0, optionsStart) + renderOptions(dates) + '\n' + html.slice(selectEnd);
}

let html = fs.readFileSync(INDEX_PATH, 'utf8');
const embedded = extractEmbedded(html);
const embeddedData = embedded.data;
let nextId = maxTradeId(embeddedData) + 1;
const importedDates = [];
const pending = new Map();
const historicalSectors = new Map();
for (const date of [...embeddedData.dates].sort().reverse()) {
  for (const trade of embeddedData.data[date].dashboard.options_flow) {
    if (!historicalSectors.has(trade.ticker) && trade.sector && trade.sector !== 'OTHER') historicalSectors.set(trade.ticker, { sector: trade.sector, date });
  }
}

for (const file of csvFiles) {
  const abs = path.resolve(file);
  let rows = parseCsv(fs.readFileSync(abs, 'utf8'));
  if (!rows.length) {
    console.warn(`Skipped empty CSV: ${file}`);
    continue;
  }
  const xynth = Object.hasOwn(rows[0], 'timestamp') && Object.hasOwn(rows[0], 'is_sweep');
  const tradytics = Object.hasOwn(rows[0], 'time_local') && Object.hasOwn(rows[0], 'order') && Object.hasOwn(rows[0], 'symbol');
  const provider = xynth ? 'Xynth' : tradytics ? 'Tradytics' : 'FlowAlgo';
  if (xynth) rows = rows.map(normalizeXynth).filter(Boolean);
  else if (tradytics) rows = rows.map((row) => normalizeTradytics(row, historicalSectors));
  else if (!Object.hasOwn(rows[0], 'Date') || !Object.hasOwn(rows[0], 'C/P')) throw new Error(`Unrecognized CSV format: ${file}`);
  for (const row of rows) {
    const date = isoDate(row.Date);
    if (selectedDates.size && !selectedDates.has(date)) continue;
    if ((xynth || tradytics) && embeddedData.data[date]) throw new Error(`${provider} import refused to overwrite existing date ${date}`);
    const item = pending.get(date) || { rows: [], provider };
    if (item.provider !== provider) throw new Error(`Cannot mix sources for ${date}`);
    item.rows.push(row);
    pending.set(date, item);
  }
}

for (const date of selectedDates) {
  if (!pending.has(date)) throw new Error(`No records for requested date ${date}; no changes written`);
}
if (!pending.size) throw new Error('No records selected; no changes written');
for (const [date, { rows, provider }] of pending) {
  const signatures = new Map();
  if (provider === 'Tradytics') {
    rows.forEach((row) => signatures.set(row.RawSignature, (signatures.get(row.RawSignature) || 0) + 1));
    rows.forEach((row) => { row.IdenticalCount = signatures.get(row.RawSignature); });
  }
  const result = buildDashboard(date, rows, nextId);
  if (provider === 'Xynth') {
    const scope = rows.every((row) => row.Type === 'SWEEP') ? 'sweep export' : 'filtered flow export';
    result.dashboard.source = { provider: 'Xynth', scope, timestamp_zone: timestampZone, display_timezone: 'America/New_York' };
    result.dashboard.daily_recap.summary = `Xynth ${scope} only. ` + result.dashboard.daily_recap.summary;
  }
  if (provider === 'Tradytics') {
    const repeats = rows.length - signatures.size;
    result.dashboard.source = { provider, scope: 'filtered export records', timestamp_zone: timestampZone,
      display_timezone: 'America/New_York', date_basis: 'explicit import date; CSV has no trade-date column',
      extra_identical_rows: repeats, duplicate_policy: 'preserve; no execution IDs to establish whether repeats are distinct trades',
      sector_basis: 'latest available historical ticker mapping; unmatched tickers OTHER',
      missing_fields: ['daily volume', 'unusual flag'],
    };
    result.dashboard.daily_recap.summary = `Tradytics filtered export: totals count all ${rows.length} records, including ${repeats} extra identical rows whose execution status is unverified. ` + result.dashboard.daily_recap.summary;
  }
  embeddedData.data[date] = result;
  nextId += rows.length;
  importedDates.push(date);
}

embeddedData.dates = [...new Set([...(embeddedData.dates || []), ...importedDates])]
  .sort((a, b) => b.localeCompare(a));

const json = JSON.stringify(embeddedData, null, 2);
html = html.slice(0, embedded.start) + json + html.slice(embedded.end);
html = replaceDatePicker(html, embeddedData.dates);
html = html.replace(/let currentDate = '[^']+';/, `let currentDate = '${embeddedData.dates[0]}';`);
html = html.replace('$1M+ Premium', '$1M+ Sweep OTM');

fs.writeFileSync(INDEX_PATH, html);

console.log(`Imported ${importedDates.join(', ')} into index.html`);
