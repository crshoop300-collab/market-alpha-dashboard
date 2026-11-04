import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const importer = fileURLToPath(new URL('./import_option_exports.mjs', import.meta.url));
const old = { dashboard: { options_flow: [{ id: 20, ticker: 'OLD' }] }, untouched: ['history', 123] };
const initial = `const EMBEDDED_DATA = ${JSON.stringify({ dates: ['2026-10-30'], data: { '2026-10-30': old } }, null, 2)};\n<select class="date-picker" id="datePicker">\n      </select>\nlet currentDate = '2026-10-30';`;
const header = 'timestamp,ticker,type,strike,expiry,underlying_price,size,price,premium,volume,open_interest,is_sweep,is_floor,unusual,sector,tags';
const record = (overrides = {}) => ({ timestamp: '2026-11-03 16:00:00', ticker: 'QQQ', type: 'call', strike: '700', expiry: '2026-12-18', underlying_price: '688', size: '1000', price: '25', premium: '2500000', volume: '2000', open_interest: '1000', is_sweep: 'true', is_floor: 'false', unusual: 'true', sector: '', tags: 'ask_side|bullish|etf', ...overrides });
function fixture(t, records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xynth-import-test-'));
  t.after(() => {
    // Only delete this mkdtemp-created directory inside the OS temporary folder.
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert(path.basename(dir).startsWith('xynth-import-test-'));
    fs.rmSync(dir, { recursive: true });
  });
  fs.writeFileSync(path.join(dir, 'index.html'), initial);
  fs.writeFileSync(path.join(dir, 'input.csv'), header + '\n' + records.map(r => header.split(',').map(k => r[k]).join(',')).join('\n'));
  return {
    run: (...args) => spawnSync(process.execPath, [importer, ...args, 'input.csv'], { cwd: dir, encoding: 'utf8' }),
    html: () => fs.readFileSync(path.join(dir, 'index.html'), 'utf8'),
    data: () => JSON.parse(fs.readFileSync(path.join(dir, 'index.html'), 'utf8').split('const EMBEDDED_DATA = ')[1].split(';\n<select')[0]),
    dir,
  };
}

test('imports selected dates, converts Eastern time, preserves history, rejects repeat import', t => {
  const f = fixture(t, [record(), record({ timestamp: '2026-11-02 16:00:00' }), record({ timestamp: '2026-10-30 16:00:00' })]);
  const args = ['--dates=2026-11-02,2026-11-03', '--timestamp-zone=UTC'];
  const result = f.run(...args); assert.equal(result.status, 0, result.stderr);
  const data = f.data(); assert.deepEqual(data.data['2026-10-30'], old);
  assert.deepEqual(data.dates, ['2026-11-03', '2026-11-02', '2026-10-30']);
  const trade = data.data['2026-11-03'].dashboard.options_flow[0];
  assert.equal(trade.capture_time, '2026-11-03 11:00:00');
  assert.equal(trade.sector, 'ETF/N'); assert.equal(trade.call_put, 'CALLS');
  assert.equal(trade.is_golden, 1); assert.equal(trade.algo_score, 5);
  const saved = f.html(); assert.notEqual(f.run(...args).status, 0); assert.equal(f.html(), saved);
});

test('missing spot cannot qualify; floor and unusual flags do not imply sweeps', t => {
  const f = fixture(t, [record({ underlying_price: '' }), record({ is_sweep: 'false', is_floor: 'true' }), record({ premium: '2000000' }), record({ expiry: '2026-11-20', premium: '1000001' })]);
  assert.equal(f.run('--dates=2026-11-03', '--timestamp-zone=UTC').status, 0);
  const d = f.data().data['2026-11-03'].dashboard;
  assert.equal(d.options_flow[0].spot, null); assert.equal(d.options_flow[0].is_golden, 0);
  assert.equal(d.options_flow[1].type, 'FLOOR'); assert.equal(d.options_flow[1].is_golden, 0);
  assert.equal(d.golden_trades.length, 1); assert.equal(d.golden_trades[0].premium_num, 1000001);
});

test('requires date/zone and fails atomically on missing dates or invalid selected records', t => {
  const f = fixture(t, [record()]);
  for (const args of [[], ['--dates=2026-11-03'], ['--dates=2026-11-02,2026-11-03', '--timestamp-zone=UTC'], ['--dates=2026-02-30', '--timestamp-zone=UTC']]) {
    assert.notEqual(f.run(...args).status, 0); assert.equal(f.html(), initial);
  }
  fs.appendFileSync(path.join(f.dir, 'input.csv'), '\n' + header.split(',').map(k => record({ premium: 'bad' })[k]).join(','));
  assert.notEqual(f.run('--dates=2026-11-03', '--timestamp-zone=UTC').status, 0); assert.equal(f.html(), initial);
});

test('UTC date selection uses Eastern date, handles DST, and supports already Eastern timestamps', t => {
  const f = fixture(t, [record({ timestamp: '2026-10-29 15:00:00' }), record({ timestamp: '2026-11-04 01:00:00' })]);
  assert.equal(f.run('--dates=2026-10-29,2026-11-03', '--timestamp-zone=UTC').status, 0);
  assert.equal(f.data().data['2026-10-29'].dashboard.options_flow[0].capture_time, '2026-10-29 11:00:00');
  assert.equal(f.data().data['2026-11-03'].dashboard.options_flow[0].capture_time, '2026-11-03 20:00:00');
  fs.writeFileSync(path.join(f.dir, 'index.html'), initial);
  assert.equal(f.run('--dates=2026-10-29', '--timestamp-zone=America/New_York').status, 0);
  assert.equal(f.data().data['2026-10-29'].dashboard.options_flow[0].capture_time, '2026-10-29 15:00:00');
});

test('existing FlowAlgo format retains ordinary imports', t => {
  const f = fixture(t, []);
  fs.writeFileSync(path.join(f.dir, 'input.csv'), 'Date,Time,Ticker,Expiry,Strike,C/P,Spot,Qty,Price,Type,Volume,OI,Premium,Sector,Unusual\n11/03/26,11:30:00,QQQ,2026-11-20,700,CALLS,688,1000,11,SWEEP,2000,1000,1100000,ETF/ETN,TRUE');
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.data().data['2026-10-30'], old);
  const d = f.data().data['2026-11-03'].dashboard;
  assert.equal(d.golden_trades.length, 1); assert.equal(d.options_flow[0].capture_time, '2026-11-03 11:30:00');
  assert.equal(d.source, undefined); assert.equal(d.options_flow[0].source, undefined);
});
