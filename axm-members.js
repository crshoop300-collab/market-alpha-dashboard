(function() {
  'use strict';

  // ── CONFIG ──────────────────────────────────────────────────────
  var DASHBOARD_URL = 'https://alpha.sealalphateam.com';
  var WP_API_BASE   = 'https://sealalphateam.com/wp-json/wp/v2';
  var ALERTS_CATS   = '1402,1404';

  var SHEETS_ID = '1xTebVvCgKAcavMSYzYfg6qCW1xEpwwt0PKhGWjh764U';
  var DESK_NOTE_CSV = 'https://docs.google.com/spreadsheets/d/' + SHEETS_ID + '/gviz/tq?tqx=out:csv&sheet=Sheet1';
  var PORTFOLIO_CSV = 'https://docs.google.com/spreadsheets/d/' + SHEETS_ID + '/gviz/tq?tqx=out:csv&sheet=Portfolio';

  var FALLBACK_DESK_NOTE = "This week we're watching where size is pressing into tech and financials; keep an eye on skew and term structure before sizing up.";
  var FALLBACK_PORTFOLIO = [
    { ticker: 'AAPL', structure: 'Call spread', entry: 'x\u2013y', stop: 'below z', target: 't1 / t2', status: 'Open' }
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
  var tvLoaded = false;
  var overlay = document.getElementById('axmTvOverlay');
  function openTV(ticker) {
    document.getElementById('axmTvLabel').textContent = ticker;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    var box = document.getElementById('axmTvChart');
    box.innerHTML = '';
    var w = document.createElement('div');
    w.id = 'axm_tv_' + Date.now(); w.style.height = '100%';
    box.appendChild(w);
    function go() {
      if (typeof TradingView !== 'undefined') {
        new TradingView.widget({ autosize:true, symbol:ticker, interval:'D', timezone:'America/New_York',
          theme:'dark', style:'1', locale:'en', toolbar_bg:'#101517',
          enable_publishing:false, hide_top_toolbar:false, hide_legend:false, save_image:false,
          container_id:w.id, backgroundColor:'#101517', gridColor:'rgba(255,255,255,0.04)',
          studies:['RSI@tv-basicstudies','MACD@tv-basicstudies'], width:'100%', height:'100%' });
      }
    }
    if (tvLoaded) { go(); } else {
      var s = document.createElement('script');
      s.src = 'https://s3.tradingview.com/tv.js';
      s.onload = function(){ tvLoaded = true; go(); };
      document.head.appendChild(s);
    }
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
        if (mapped.length) { renderPortfolio(mapped); return; }
      }
      renderPortfolio(FALLBACK_PORTFOLIO);
    }).catch(function(e) {
      console.error('AXM portfolio:', e);
      renderPortfolio(FALLBACK_PORTFOLIO);
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
      return '<tr><td><strong style="color:var(--text-bright);">'+esc(r.ticker)+'</strong></td><td>'+esc(r.structure)+'</td><td>'+esc(r.entry)+'</td><td>'+esc(r.stop)+'</td><td>'+esc(r.target)+'</td><td class="'+stCls+'">'+esc(r.status)+'</td></tr>';
    }).join('');
  }

  // ── LOAD TRADE ALERTS (WordPress) ───────────────────────────────
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
  Promise.all([
    fetchDash(),
    loadAlerts(),
    loadDeskNote(),
    loadPortfolio(),
    loadResearch()
  ]).then(function(results) {
    var dashData = results[0];
    if (dashData) {
      renderSnap(dashData);
      renderWatchlist(dashData);
    } else {
      document.getElementById('axmSnapBody').innerHTML = '<p class="axm-empty">Dashboard unavailable. <a href="https://alpha.sealalphateam.com" target="_blank" style="color:var(--cyan);">View directly &rarr;</a></p>';
      document.getElementById('axmWatchlist').innerHTML = '<li class="axm-empty" style="list-style:none;">Watchlist unavailable.</li>';
    }
  });
})();
