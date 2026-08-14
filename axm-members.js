(function() {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────────
  var DASHBOARD_URL = 'https://alpha.sealalphateam.com';
  var WP_API_BASE   = 'https://sealalphateam.com/wp-json/wp/v2';
  var ALERTS_CATS   = '1402,1404';

  var SHEETS_ID = '1xTebVvCgKAcavMSYzYfg6qCW1xEpwwt0PKhGWjh764U';
  var DESK_NOTE_CSV = 'https://docs.google.com/spreadsheets/d/' + SHEETS_ID + '/gviz/tq?tqx=out:csv&sheet=Sheet1';
  var PORTFOLIO_CSV = 'https://docs.google.com/spreadsheets/d/' + SHEETS_ID + '/gviz/tq?tqx=out:csv&sheet=Portfolio';
  var CLOSED_CSV = 'https://docs.google.com/spreadsheets/d/' + SHEETS_ID + '/gviz/tq?tqx=out:csv&sheet=Closed';

  var FALLBACK_DESK_NOTE = "Flow is updating from the AlphaX dashboard; keep the current book tight around documented support, resistance, and buy-up-to levels across LYV, AMZN, SMH, CDE, and VSAT.";
  var FALLBACK_PORTFOLIO = [
    { ticker: 'LYV', structure: 'Sep 18 2026 $170 Call (BTO)', entry: '$15.05 - $16.50', stop: '', target: '$30.00', status: 'Open 5/14/26' },
    { ticker: 'AMZN', structure: 'Sep 18 2026 $250 Call (BTO) - AMZN260918C00250000', entry: '$12.90 - $13.50', stop: 'Watch $235 stock support', target: '$25.00', status: 'Open 6/18/26' },
    { ticker: 'SMH', structure: 'Aug 21 2026 $625 Put (BTO) - SMH260821P00625000', entry: '$41.00 - $45.00', stop: 'Support around $600; resistance just above $660', target: '$90.00', status: 'Open 7/1/26' },
    { ticker: 'CDE', structure: 'Nov 20 2026 $15 Call (BTO) - CDE261120C00015000', entry: '$2.47 - $3.00', stop: 'Tight downtrend channel; watch for breakout confirmation after August earnings', target: '$6.00', status: 'Open 7/17/26' },
    { ticker: 'VSAT', structure: 'Dec 18 2026 $85 Call (BTO) - VSAT261218C00085000', entry: '$18.66 - $22.50', stop: 'Resistance at $90; rising support levels - breakout candidate', target: '$45.00', status: 'Open 8/7/26' }
  ];

  // ── HELPERS ─────────────────────────────────────────────────────
  function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
  function fmtNum(n) {
    n = Number(n); if (isNaN(n)) return '--';
    if (n >= 1e9) return '$'+(n/1e9).toFixed(1)+'B';
    if (n >= 1e6) return '$'+(n/1e6).toFixed(1)+'M';
    if (n >= 1e3) return '$'+(n/1e3).toFixed(0)+'K';
    return '$'+n.toLocaleString();
  }
  function fmtDate(d) {
    try { return new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'}); }
    catch(e){ return d; }
  }
  function fmtShortDate(d) {
    try { return new Date(d).toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'2-digit'}); }
    catch(e){ return d || ''; }
  }
  function setDeskNoteDate() {
    var label = document.querySelector('#axmDeskNote strong');
    if (label) label.textContent = 'Desk Note ' + new Date().toLocaleDateString('en-US',{month:'numeric',day:'numeric'}) + ':';
  }
  function tradeKey(t) {
    return String((t && (t.optionSymbol || t.ticker || t.structure)) || '').toUpperCase();
  }
  function optionSymbolFromTrade(t) {
    var ticker = String((t && t.ticker) || '').toUpperCase();
    var structure = String((t && t.structure) || '').toUpperCase();
    var explicit = structure.match(/\b[A-Z]{1,6}\d{6}[CP]\d{8}\b/);
    if (explicit) return explicit[0];

    var m = structure.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})\s+(\d{4})\s+\$?([0-9]+(?:\.[0-9]+)?)\s+(CALL|PUT)\b/);
    if (!ticker || !m) return '';
    var months = { JAN:'01', FEB:'02', MAR:'03', APR:'04', MAY:'05', JUN:'06', JUL:'07', AUG:'08', SEP:'09', OCT:'10', NOV:'11', DEC:'12' };
    var yy = m[3].slice(-2);
    var mm = months[m[1]];
    var dd = String(Number(m[2])).padStart(2, '0');
    var cp = m[5] === 'CALL' ? 'C' : 'P';
    var strike = String(Math.round(Number(m[4]) * 1000)).padStart(8, '0');
    return ticker + yy + mm + dd + cp + strike;
  }
  function yahooOptionUrl(t) {
    var symbol = optionSymbolFromTrade(t);
    return symbol ? 'https://finance.yahoo.com/quote/' + encodeURIComponent(symbol) : '';
  }
  function alphaTickerUrl(ticker) {
    return DASHBOARD_URL + '/?ticker=' + encodeURIComponent(String(ticker || '').toUpperCase());
  }
  function mergeOpenTrades(rows) {
    var seen = {};
    var merged = [];
    FALLBACK_PORTFOLIO.forEach(function(seed) {
      var key = tradeKey(seed);
      if (!key || seen[key]) return;
      seen[key] = true;
      merged.push(seed);
    });
    (rows || []).forEach(function(row) {
      var key = tradeKey(row);
      if (!key || seen[key]) return;
      seen[key] = true;
      merged.push(row);
    });
    return merged;
  }
  function parseCSV(text) {
    var lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    var headers = lines[0].split(',').map(function(h){ return h.replace(/^"|"$/g, '').trim(); });
    return lines.slice(1).map(function(line) {
      var vals = [];
      var cur = '', inQ = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      vals.push(cur.trim());
      var obj = {};
      headers.forEach(function(h, idx) { obj[h] = vals[idx] || ''; });
      return obj;
    });
  }

  // ── TRADINGVIEW POPUP ───────────────────────────────────────────
  var overlay = document.getElementById('axmTvOverlay');
  var TV_SYMBOLS = {
    SPY:'AMEX:SPY', IWM:'AMEX:IWM', DIA:'AMEX:DIA', GLD:'AMEX:GLD', SLV:'AMEX:SLV',
    QQQ:'NASDAQ:QQQ', TQQQ:'NASDAQ:TQQQ', SQQQ:'NASDAQ:SQQQ', SOXX:'NASDAQ:SOXX', SMH:'NASDAQ:SMH',
    AAPL:'NASDAQ:AAPL', MSFT:'NASDAQ:MSFT', NVDA:'NASDAQ:NVDA', AMZN:'NASDAQ:AMZN', TSLA:'NASDAQ:TSLA',
    META:'NASDAQ:META', GOOGL:'NASDAQ:GOOGL', GOOG:'NASDAQ:GOOG', NFLX:'NASDAQ:NFLX', AMD:'NASDAQ:AMD',
    AVGO:'NASDAQ:AVGO', INTC:'NASDAQ:INTC', CSCO:'NASDAQ:CSCO', ADBE:'NASDAQ:ADBE', QCOM:'NASDAQ:QCOM',
    MU:'NASDAQ:MU', WDC:'NASDAQ:WDC', ALAB:'NASDAQ:ALAB', PLTR:'NASDAQ:PLTR', TSM:'NYSE:TSM',
    DELL:'NYSE:DELL', IBM:'NYSE:IBM', DIS:'NYSE:DIS', CRM:'NYSE:CRM', U:'NYSE:U', BKNG:'NASDAQ:BKNG',
    VSAT:'NASDAQ:VSAT'
  };
  function tvSymbol(ticker) {
    var clean = String(ticker || '').toUpperCase().trim().replace(/[^A-Z0-9.:-]/g, '');
    if (!clean) return 'NASDAQ:NVDA';
    if (clean.indexOf(':') !== -1) return clean;
    return TV_SYMBOLS[clean] || clean;
  }
  function openTV(ticker) {
    document.getElementById('axmTvLabel').textContent = ticker;
    var head = document.querySelector('.axm-tv-head');
    var dashLink = document.getElementById('axmDashDeepDive');
    if (head && !dashLink) {
      dashLink = document.createElement('a');
      dashLink.id = 'axmDashDeepDive';
      dashLink.target = '_blank';
      dashLink.rel = 'noopener';
      dashLink.textContent = 'Open AlphaX Deep Dive';
      dashLink.style.cssText = 'margin-left:auto;margin-right:10px;color:var(--cyan);font-size:0.72rem;font-family:var(--font-display);font-weight:700;letter-spacing:1px;text-transform:uppercase;text-decoration:none;';
      head.insertBefore(dashLink, document.getElementById('axmTvClose'));
    }
    if (dashLink) dashLink.href = alphaTickerUrl(ticker);
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    var box = document.getElementById('axmTvChart');
    var symbol = tvSymbol(ticker);
    function fallback() {
      box.innerHTML = '<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--text);font-family:var(--font-body);text-align:center;padding:24px;">'
        + '<div>TradingView chart could not load here.</div>'
        + '<a href="https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(symbol) + '" target="_blank" rel="noopener" style="color:var(--cyan);font-family:var(--font-display);font-weight:700;text-transform:uppercase;letter-spacing:1px;text-decoration:none;">Open ' + esc(ticker) + ' Chart</a>'
        + '</div>';
    }
    box.innerHTML = '<div class="tradingview-widget-container" style="height:100%;width:100%;"><div class="tradingview-widget-container__widget" style="height:100%;width:100%;"></div></div>';
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.textContent = JSON.stringify({
      autosize:true,
      symbol:symbol,
      interval:'D',
      timezone:'America/New_York',
      theme:'dark',
      style:'1',
      locale:'en',
      backgroundColor:'#101517',
      gridColor:'rgba(255,255,255,0.04)',
      allow_symbol_change:true,
      calendar:false,
      hide_side_toolbar:false,
      support_host:'https://www.tradingview.com'
    });
    script.onerror = fallback;
    box.querySelector('.tradingview-widget-container').appendChild(script);
    window.setTimeout(function(){ if (!box.querySelector('iframe')) fallback(); }, 10000);
  }
  function closeTV() {
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('axmTvChart').innerHTML = '';
  }
  document.getElementById('axmTvClose').addEventListener('click', closeTV);
  overlay.addEventListener('click', function(e){ if(e.target===overlay) closeTV(); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && overlay.classList.contains('active')) closeTV(); });
  document.querySelector('.axm').addEventListener('click', function(e) {
    var t = e.target.closest('.axm-wl-ticker');
    if (t) { e.preventDefault(); openTV(t.dataset.ticker || t.textContent.trim()); }
  });

  // ── FETCH DASHBOARD DATA ────────────────────────────────────────
  function fetchDash() {
    return fetch(DASHBOARD_URL).then(function(resp){ return resp.text(); }).then(function(html) {
      var marker = 'const EMBEDDED_DATA = ';
      var si = html.indexOf(marker);
      if (si === -1) throw new Error('No EMBEDDED_DATA');
      var js = si + marker.length;
      var depth = 0, i = js, inStr = false, esc2 = false;
      for (; i < html.length; i++) {
        var ch = html[i];
        if (esc2) { esc2 = false; continue; }
        if (ch === '\\') { esc2 = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        if (ch === '}') { depth--; if (depth === 0) break; }
      }
      var embedded = JSON.parse(html.substring(js, i + 1));
      var date = embedded.dates[0];
      return { date: date, d: embedded.data[date] };
    }).catch(function(e) { console.error('AXM dash:', e); return null; });
  }

  // ── RENDER SNAPSHOT ─────────────────────────────────────────────
  function renderSnap(data) {
    var snap = data.d.dashboard.market_snapshot;
    var recap = data.d.dashboard.daily_recap;
    var golden = data.d.dashboard.golden_trades || [];
    var flow = data.d.dashboard.options_flow || [];
    var el = document.getElementById('axmSnapBody');
    if (!snap) { el.innerHTML = '<p class="axm-empty">Snapshot unavailable</p>'; return; }

    var pct = snap.sentiment_pct || 0;
    var pcr = snap.put_call_ratio || 0;
    var totalPrem = flow.reduce(function(s,f){return s+(f.premium_num||0);},0);
    var sentCls = pct >= 60 ? 'bullish' : pct >= 40 ? 'neutral' : 'bearish';
    var pcrCls = pcr < 0.7 ? 'bullish' : pcr > 1 ? 'bearish' : 'neutral';
    var sectors = (data.d.sector_heatmap || []).slice();
    sectors.sort(function(a,b){ return ((b.call_premium||0)+(b.put_premium||0)) - ((a.call_premium||0)+(a.put_premium||0)); });
    var topSectors = sectors.slice(0,2).map(function(s){return s.sector;}).join(', ') || '--';
    var trend = recap ? (recap.sentiment_trend || '') : '';
    var biasText = trend || (pct >= 55 ? 'Leaning bullish' : pct <= 45 ? 'Leaning bearish' : 'Neutral');

    var h = '';
    h += '<div class="axm-snap-row"><span class="axm-snap-label">Sentiment</span><span class="axm-snap-val '+sentCls+'">'+pct+'%</span></div>';
    h += '<div class="axm-snap-row"><span class="axm-snap-label">P/C Ratio</span><span class="axm-snap-val '+pcrCls+'">'+pcr.toFixed(3)+'</span></div>';
    h += '<div class="axm-snap-row"><span class="axm-snap-label">Alpha Trades</span><span class="axm-snap-val gold-text">'+golden.length+'</span></div>';
    h += '<div class="axm-snap-row"><span class="axm-snap-label">Total Premium</span><span class="axm-snap-val">'+fmtNum(totalPrem)+'</span></div>';
    h += '<div class="axm-snap-row"><span class="axm-snap-label">Focus Sectors</span><span class="axm-snap-val">'+esc(topSectors)+'</span></div>';
    h += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:0.8rem;color:var(--text);"><strong style="color:var(--text-bright);">Bias:</strong> '+esc(biasText)+'</div>';
    h += '<div style="font-size:0.65rem;color:var(--text-dim);margin-top:10px;">'+fmtDate(data.date)+'</div>';
    h += '<a href="https://alpha.sealalphateam.com" target="_blank" rel="noopener" class="axm-snap-btn">Open Full AlphaX Dashboard</a>';
    el.innerHTML = h;
  }

  // ── RENDER WATCHLIST ────────────────────────────────────────────
  function renderWatchlist(data) {
    var golden = data.d.dashboard.golden_trades || [];
    var el = document.getElementById('axmWatchlist');
    if (!golden.length) {
      el.innerHTML = '<li class="axm-empty" style="list-style:none;">No alpha trades detected today.</li>';
      return;
    }
    var seen = {}, unique = [];
    golden.forEach(function(t) { if (!seen[t.ticker]) { seen[t.ticker] = true; unique.push(t); } });
    el.innerHTML = unique.map(function(t) {
      var cp = (t.call_put||'').toUpperCase().trim();
      var cpLabel = (cp==='C'||cp==='CALL') ? '<span class="axm-tag axm-tag-call">C</span>' : '<span class="axm-tag axm-tag-put">P</span>';
      return '<li><a href="#" class="axm-wl-ticker" data-ticker="'+esc(t.ticker)+'">'+esc(t.ticker)+'</a> <span class="axm-wl-detail">'+cpLabel+' $'+t.strike+' '+esc(t.expiry)+' &mdash; '+esc(t.premium)+'</span></li>';
    }).join('');
  }

  // ── LOAD DESK NOTE FROM GOOGLE SHEET ────────────────────────────
  function loadDeskNote() {
    setDeskNoteDate();
    var el = document.getElementById('axmDeskNoteText');
    return fetch(DESK_NOTE_CSV).then(function(resp) {
      if (!resp.ok) throw new Error(resp.status);
      return resp.text();
    }).then(function(text) {
      var rows = parseCSV(text);
      if (rows.length && rows[0]) {
        var note = Object.values(rows[0])[0];
        if (note) { el.textContent = note; return; }
      }
      el.textContent = FALLBACK_DESK_NOTE;
    }).catch(function(e) {
      console.error('AXM desk note:', e);
      el.textContent = FALLBACK_DESK_NOTE;
    });
  }

  // ── LOAD PORTFOLIO FROM GOOGLE SHEET ────────────────────────────
  function renderDeskNoteFromDash(data) {
    setDeskNoteDate();
    var el = document.getElementById('axmDeskNoteText');
    if (!el || !data || !data.d || !data.d.dashboard) return;
    var snap = data.d.dashboard.market_snapshot || {};
    var recap = data.d.dashboard.daily_recap || {};
    var flow = data.d.dashboard.options_flow || [];
    var sectors = (data.d.sector_heatmap || []).slice();
    sectors.sort(function(a,b){ return ((b.call_premium||0)+(b.put_premium||0)) - ((a.call_premium||0)+(a.put_premium||0)); });
    var topSectors = sectors.slice(0,2).map(function(s){ return s.sector; }).join(' and ') || 'the highest-volume groups';
    var totalPrem = flow.reduce(function(s,f){ return s + (f.premium_num || 0); }, 0);
    var bias = recap.sentiment_trend || (snap.sentiment_pct >= 55 ? 'leaning bullish' : snap.sentiment_pct <= 45 ? 'defensive' : 'balanced');
    var pcrText = snap.put_call_ratio !== undefined && snap.put_call_ratio !== null ? Number(snap.put_call_ratio).toFixed(2) : '--';
    el.textContent = 'Flow is ' + bias + ' with ' + (snap.sentiment_pct || '--') + '% sentiment, a ' + pcrText + ' put/call ratio, and roughly ' + fmtNum(totalPrem) + ' in tracked premium; focus remains on ' + topSectors + '. Active AlphaX structures to monitor: LYV, AMZN, SMH, CDE, and VSAT.';
  }

  function loadPortfolio() {
    return fetch(PORTFOLIO_CSV).then(function(resp) {
      if (!resp.ok) throw new Error(resp.status);
      return resp.text();
    }).then(function(text) {
      var rows = parseCSV(text);
      if (rows.length) {
        var mapped = rows.map(function(r) {
          return {
            ticker: r['Ticker'] || r['ticker'] || '',
            structure: r['Structure'] || r['structure'] || '',
            entry: r['Entry Zone'] || r['entry_zone'] || r['entry'] || '',
            stop: r['Stop / Risk'] || r['stop_risk'] || r['stop'] || '',
            target: r['Target'] || r['target'] || '',
            status: r['Status'] || r['status'] || ''
          };
        }).filter(function(r){ return r.ticker; });
        if (mapped.length) { renderPortfolio(mergeOpenTrades(mapped)); return; }
      }
      renderPortfolio(FALLBACK_PORTFOLIO);
    }).catch(function(e) {
      console.error('AXM portfolio:', e);
      renderPortfolio(mergeOpenTrades([]));
    });
  }

  function renderPortfolio(rows) {
    var el = document.getElementById('axmPortfolioBody');
    if (!rows.length) {
      el.innerHTML = '<tr><td colspan="6" class="axm-empty">No positions currently tracked.</td></tr>';
      return;
    }
    el.innerHTML = rows.map(function(r) {
      var st = (r.status || '').toLowerCase();
      var stCls = st.indexOf('open') >= 0 ? 'axm-status-open' : st.indexOf('close') >= 0 ? 'axm-status-closed' : st.indexOf('watch') >= 0 ? 'axm-status-watching' : '';
      var optionUrl = yahooOptionUrl(r);
      var structure = optionUrl ? '<a href="'+esc(optionUrl)+'" target="_blank" rel="noopener" style="color:var(--text-bright);text-decoration:none;">'+esc(r.structure)+'</a>' : esc(r.structure);
      return '<tr><td><a href="#" class="axm-wl-ticker" data-ticker="'+esc(r.ticker)+'">'+esc(r.ticker)+'</a></td><td>'+structure+'</td><td>'+esc(r.entry)+'</td><td>'+esc(r.stop)+'</td><td>'+esc(r.target)+'</td><td class="'+stCls+'">'+esc(r.status)+'</td></tr>';
    }).join('');
  }

  // ── LOAD TRADE ALERTS (WordPress) ───────────────────────────────
  function loadClosedTrades() {
    return fetch(CLOSED_CSV).then(function(resp) {
      if (!resp.ok) throw new Error(resp.status);
      return resp.text();
    }).then(function(text) {
      var rows = parseCSV(text).map(function(r) {
        return {
          ticker: r['Ticker'] || r['ticker'] || '',
          structure: r['Structure'] || r['structure'] || '',
          entry: r['Entry'] || r['Entry Price'] || r['entry'] || '',
          exit: r['Exit'] || r['Exit Price'] || r['exit'] || '',
          closed: r['Closed'] || r['closed'] || '',
          ret: r['Return'] || r['Est. Gain'] || r['return'] || ''
        };
      }).filter(function(r){ return r.ticker; });
      renderClosedTrades(rows);
    }).catch(function(e) {
      console.error('AXM closed trades:', e);
    });
  }

  function renderClosedTrades(rows) {
    var el = document.getElementById('axmClosedBody');
    if (!el || !rows || !rows.length) return;
    el.innerHTML = rows.map(function(r) {
      var retCls = /^-/.test(r.ret) || /loss/i.test(r.ret) ? 'axm-return-loss' : 'axm-return-win';
      return '<tr><td><a href="#" class="axm-wl-ticker" data-ticker="'+esc(r.ticker)+'">'+esc(r.ticker)+'</a></td><td>'+esc(r.structure)+'</td><td>'+esc(r.entry || '--')+'</td><td>'+esc(r.exit || '--')+'</td><td>'+esc(r.closed || '--')+'</td><td class="'+retCls+'">'+esc(r.ret || '--')+'</td></tr>';
    }).join('');
  }

  function loadAlerts() {
    var el = document.getElementById('axmAlertsList');
    return fetch(WP_API_BASE + '/posts?categories=' + ALERTS_CATS + '&per_page=8&orderby=date&order=desc&_fields=id,title,excerpt,date,link').then(function(resp) {
      if (!resp.ok) throw new Error(resp.status);
      return resp.json();
    }).then(function(posts) {
      if (!posts.length) {
        el.innerHTML = '<p class="axm-empty">No trade alerts posted yet. Alerts will appear here as they are published.</p>';
        return;
      }
      el.innerHTML = posts.map(function(p) {
        var title = (p.title && p.title.rendered) || 'Untitled';
        var excerpt = (p.excerpt && p.excerpt.rendered) ? p.excerpt.rendered.replace(/<[^>]*>/g,'').trim().substring(0,180) : '';
        var dateStr = p.date ? new Date(p.date).toLocaleDateString('en-US',{month:'numeric',day:'numeric'}) : '';
        return '<div class="axm-alert-card"><div class="axm-alert-title"><a href="'+esc(p.link)+'" target="_blank" rel="noopener">'+(dateStr ? dateStr+' &ndash; ' : '')+title+'</a></div>'+(excerpt ? '<div class="axm-alert-excerpt">'+esc(excerpt)+(excerpt.length>=180?'...':'')+'</div>' : '')+'</div>';
      }).join('');
    }).catch(function(e) {
      console.error('AXM alerts:', e);
      el.innerHTML = '<p class="axm-empty">Unable to load trade alerts.</p>';
    });
  }

  // ── LOAD RESEARCH FEED ──────────────────────────────────────────
  function loadResearch() {
    var el = document.getElementById('axmResearchFeed');
    return fetch(WP_API_BASE + '/posts?per_page=3&orderby=date&order=desc&_fields=id,title,link').then(function(resp) {
      if (!resp.ok) throw new Error(resp.status);
      return resp.json();
    }).then(function(posts) {
      if (!posts.length) {
        el.innerHTML = '<li class="axm-empty" style="list-style:none;">No posts yet.</li>';
        return;
      }
      el.innerHTML = posts.map(function(p) {
        var title = (p.title && p.title.rendered) || 'Untitled';
        return '<li><a href="'+esc(p.link)+'" target="_blank" rel="noopener">'+title+'</a></li>';
      }).join('');
    }).catch(function(e) {
      console.error('AXM research:', e);
      el.innerHTML = '<li class="axm-empty" style="list-style:none;">Unable to load.</li>';
    });
  }

  // ── INIT ────────────────────────────────────────────────────────
  setDeskNoteDate();
  renderPortfolio(FALLBACK_PORTFOLIO);

  Promise.all([
    fetchDash(),
    loadAlerts(),
    loadDeskNote(),
    loadPortfolio(),
    loadClosedTrades(),
    loadResearch()
  ]).then(function(results) {
    var dashData = results[0];
    if (dashData) {
      renderDeskNoteFromDash(dashData);
      renderSnap(dashData);
      renderWatchlist(dashData);
    } else {
      document.getElementById('axmSnapBody').innerHTML = '<p class="axm-empty">Dashboard unavailable. <a href="https://alpha.sealalphateam.com" target="_blank" style="color:var(--cyan);">View directly &rarr;</a></p>';
      document.getElementById('axmWatchlist').innerHTML = '<li class="axm-empty" style="list-style:none;">Watchlist unavailable.</li>';
    }
  });
})();
