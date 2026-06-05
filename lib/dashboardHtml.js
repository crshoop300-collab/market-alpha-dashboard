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
  .member-watchlist {
    position: fixed;
    top: 0;
    right: 0;
    z-index: 10001;
    width: min(420px, calc(100vw - 24px));
    height: 100vh;
    background: rgba(16,21,23,0.97);
    border-left: 1px solid rgba(155,106,54,0.35);
    box-shadow: -24px 0 60px rgba(0,0,0,0.45);
    transform: translateX(105%);
    transition: transform 0.22s ease;
    display: flex;
    flex-direction: column;
  }
  .member-watchlist.open {
    transform: translateX(0);
  }
  .member-watchlist-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .member-watchlist-title {
    color: #dce4e8;
    font-family: 'Rajdhani', sans-serif;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }
  .member-watchlist-subtitle {
    color: #5e7078;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    margin-top: 2px;
  }
  .member-watchlist-close {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: #dce4e8;
    cursor: pointer;
    padding: 7px 10px;
  }
  .member-watchlist-drop {
    margin: 14px;
    padding: 14px;
    border: 1px dashed rgba(155,106,54,0.5);
    border-radius: 6px;
    color: #9B6A36;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    line-height: 1.6;
    text-align: center;
    text-transform: uppercase;
  }
  .member-watchlist-drop.dragover {
    background: rgba(155,106,54,0.12);
    border-color: rgba(155,106,54,0.85);
    color: #dce4e8;
  }
  .member-watchlist-list {
    flex: 1;
    overflow: auto;
    padding: 0 14px 14px;
  }
  .member-watchlist-empty {
    color: #5e7078;
    font-size: 12px;
    line-height: 1.7;
    padding: 22px 6px;
    text-align: center;
  }
  .member-watchlist-item {
    border: 1px solid rgba(255,255,255,0.08);
    border-left: 3px solid rgba(155,106,54,0.8);
    border-radius: 6px;
    background: rgba(255,255,255,0.035);
    margin-bottom: 10px;
    padding: 12px;
  }
  .member-watchlist-item-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .member-watchlist-ticker {
    color: #ffffff;
    font-family: 'Rajdhani', sans-serif;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 1px;
  }
  .member-watchlist-meta {
    color: #a8b8c0;
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    line-height: 1.6;
    margin-top: 4px;
  }
  .member-watchlist-remove {
    background: transparent;
    border: 1px solid rgba(207,46,46,0.3);
    border-radius: 4px;
    color: #CF2E2E;
    cursor: pointer;
    font-size: 11px;
    padding: 5px 7px;
  }
  .member-watchlist-notes {
    width: 100%;
    min-height: 58px;
    margin-top: 10px;
    background: rgba(0,0,0,0.2);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 4px;
    color: #dce4e8;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    line-height: 1.5;
    padding: 8px;
    resize: vertical;
  }
  .watchlist-row-action {
    border: 1px solid rgba(155,106,54,0.4);
    border-radius: 4px;
    background: rgba(155,106,54,0.12);
    color: #dce4e8;
    cursor: pointer;
    font-size: 10px;
    margin-left: 8px;
    padding: 3px 6px;
    text-transform: uppercase;
    white-space: nowrap;
  }
</style>
<div class="auth-member-bar" aria-label="Member controls">
  <button type="button" id="watchlistButton">Watchlist</button>
  <button type="button" id="manageBillingButton">Billing</button>
  <a href="/auth/logout">Logout</a>
</div>
<aside class="member-watchlist" id="memberWatchlist" aria-label="Saved trade watchlist">
  <div class="member-watchlist-header">
    <div>
      <div class="member-watchlist-title">Watchlist</div>
      <div class="member-watchlist-subtitle" id="watchlistCount">Loading saved trades...</div>
    </div>
    <button type="button" class="member-watchlist-close" id="watchlistClose">Close</button>
  </div>
  <div class="member-watchlist-drop" id="watchlistDrop">Drag an Alpha or Flow row here to save it</div>
  <div class="member-watchlist-list" id="watchlistItems"></div>
</aside>
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

  (function() {
    var panel = document.getElementById('memberWatchlist');
    var button = document.getElementById('watchlistButton');
    var close = document.getElementById('watchlistClose');
    var drop = document.getElementById('watchlistDrop');
    var list = document.getElementById('watchlistItems');
    var count = document.getElementById('watchlistCount');
    var items = [];
    var decoratedRows = new WeakSet();

    function esc(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
      });
    }

    function premiumNumber(value) {
      var raw = String(value || '').replace(/[$,\\s]/g, '').toUpperCase();
      var mult = raw.endsWith('B') ? 1000000000 : raw.endsWith('M') ? 1000000 : raw.endsWith('K') ? 1000 : 1;
      return (parseFloat(raw) || 0) * mult;
    }

    function selectedDate() {
      return document.getElementById('datePicker')?.value || '';
    }

    function cpText(cell) {
      return (cell?.innerText || '').trim().toUpperCase().includes('PUT') ? 'PUTS' : 'CALLS';
    }

    function cleanMoney(value) {
      return String(value || '').replace(/\\s+/g, ' ').trim();
    }

    function tradeFromRow(row) {
      var cells = row.querySelectorAll('td');
      if (!cells.length) return null;
      var isFlow = row.closest('#flowTable');
      var isGolden = row.closest('#goldenTable');
      if (!isFlow && !isGolden) return null;

      var ticker = (cells[2]?.innerText || '').trim().toUpperCase();
      var expiry = (cells[3]?.innerText || '').trim();
      var strike = (cells[4]?.innerText || '').replace('$', '').trim();
      var side = cpText(cells[5]);
      var premium = cleanMoney((isFlow ? cells[10] : cells[8])?.childNodes?.[0]?.textContent || (isFlow ? cells[10] : cells[8])?.innerText);
      var type = isFlow ? (cells[9]?.innerText || '').trim() : 'ALPHA';
      var time = (cells[1]?.innerText || '').trim();
      var date = selectedDate();
      var contract = ticker + ' $' + strike + (side === 'PUTS' ? 'P' : 'C') + ' ' + expiry;

      return {
        trade_key: [date, ticker, expiry, strike, side, time, premium, type].join('|'),
        trade_date: date,
        ticker: ticker,
        contract: contract,
        side: side,
        trade_type: type,
        sector: (cells[0]?.innerText || '').trim(),
        premium: premium,
        premium_num: premiumNumber(premium),
        spot: (cells[6]?.innerText || '').trim(),
        strike: strike,
        expiry: expiry,
        time: time
      };
    }

    function render() {
      count.textContent = items.length + (items.length === 1 ? ' saved trade' : ' saved trades');
      if (!items.length) {
        list.innerHTML = '<div class="member-watchlist-empty">Saved trades will stay here for this member account. Drag rows into this panel or use the Watch button.</div>';
        return;
      }

      list.innerHTML = items.map(function(item) {
        return [
          '<div class="member-watchlist-item" data-id="' + esc(item.id) + '">',
          '  <div class="member-watchlist-item-top">',
          '    <div>',
          '      <div class="member-watchlist-ticker">' + esc(item.ticker) + '</div>',
          '      <div class="member-watchlist-meta">' + esc(item.contract || '') + '<br>' + esc(item.trade_date || '') + ' / ' + esc(item.trade_type || '') + ' / ' + esc(item.premium || '') + '</div>',
          '    </div>',
          '    <button type="button" class="member-watchlist-remove" data-remove="' + esc(item.id) + '">Remove</button>',
          '  </div>',
          '  <textarea class="member-watchlist-notes" data-notes="' + esc(item.id) + '" placeholder="Notes, plan, levels...">' + esc(item.notes || '') + '</textarea>',
          '</div>'
        ].join('');
      }).join('');
    }

    async function loadWatchlist() {
      try {
        var response = await fetch('/api/watchlist');
        if (!response.ok) throw new Error('load failed');
        var data = await response.json();
        items = data.items || [];
      } catch (error) {
        count.textContent = 'Could not load watchlist';
      }
      render();
    }

    async function saveTrade(trade) {
      if (!trade) return;
      try {
        var response = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ trade: trade })
        });
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'save failed');
        var existing = items.findIndex(function(item) { return item.id === data.item.id || item.trade_key === data.item.trade_key; });
        if (existing >= 0) items.splice(existing, 1);
        items.unshift(data.item);
        render();
        panel.classList.add('open');
      } catch (error) {
        alert(error.message || 'Could not save trade.');
      }
    }

    async function removeItem(id) {
      try {
        var response = await fetch('/api/watchlist?id=' + encodeURIComponent(id), { method: 'DELETE' });
        if (!response.ok) throw new Error('delete failed');
        items = items.filter(function(item) { return item.id !== id; });
        render();
      } catch {
        alert('Could not remove trade.');
      }
    }

    async function updateNotes(id, notes) {
      await fetch('/api/watchlist', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: id, notes: notes })
      });
    }

    function decorateRows() {
      document.querySelectorAll('#flowBody tr, #goldenBody tr').forEach(function(row) {
        if (decoratedRows.has(row) || !row.querySelector('td')) return;
        decoratedRows.add(row);
        row.draggable = true;
        row.title = 'Drag to Watchlist';
        row.addEventListener('dragstart', function(event) {
          var trade = tradeFromRow(row);
          if (!trade) return;
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData('application/json', JSON.stringify(trade));
        });

        var targetCell = row.querySelector('td:last-child');
        if (targetCell && !targetCell.querySelector('.watchlist-row-action')) {
          var action = document.createElement('button');
          action.type = 'button';
          action.className = 'watchlist-row-action';
          action.textContent = 'Watch';
          action.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            saveTrade(tradeFromRow(row));
          });
          targetCell.appendChild(action);
        }
      });
    }

    button?.addEventListener('click', function() {
      panel.classList.toggle('open');
    });
    close?.addEventListener('click', function() {
      panel.classList.remove('open');
    });
    drop?.addEventListener('dragover', function(event) {
      event.preventDefault();
      drop.classList.add('dragover');
    });
    drop?.addEventListener('dragleave', function() {
      drop.classList.remove('dragover');
    });
    drop?.addEventListener('drop', function(event) {
      event.preventDefault();
      drop.classList.remove('dragover');
      try {
        saveTrade(JSON.parse(event.dataTransfer.getData('application/json')));
      } catch {
        alert('Could not read dragged trade.');
      }
    });

    list?.addEventListener('click', function(event) {
      var id = event.target?.dataset?.remove;
      if (id) removeItem(id);
    });
    list?.addEventListener('change', function(event) {
      var id = event.target?.dataset?.notes;
      if (id) updateNotes(id, event.target.value);
    });

    var observer = new MutationObserver(decorateRows);
    observer.observe(document.body, { childList: true, subtree: true });
    decorateRows();
    loadWatchlist();
  })();
</script>
`;

export async function getProtectedDashboardHtml() {
  const file = path.join(process.cwd(), 'index.html');
  const html = await fs.readFile(file, 'utf8');

  return html.replace('</body>', `${AUTH_BAR}\n</body>`);
}
