# Options exports

FlowAlgo imports retain the existing command:

```powershell
npm run import:options -- "path/to/option_export.csv"
```

Xynth CSVs require an explicit list of trading dates and timestamp timezone:

```powershell
npm run import:options -- --dates=2026-11-02,2026-11-03 --timestamp-zone=UTC "path/to/xynth-flow.csv"
```

Use `UTC` when exported timestamps are UTC, or `America/New_York` when they
already represent Eastern time. UTC inputs are converted using the New York
timezone, including daylight saving transitions. Trading dates come from those
converted timestamps, never the download filename. The initial November 2–3
import interprets the supplied export as UTC, consistent with its market-open
timestamps; the CSV itself has no timezone marker.

Only the requested dates are imported. Missing requested dates, malformed selected
records, mixed sources for a date, or an attempt to replace an existing date with
Xynth data abort before writing. This protects historical FlowAlgo data and also
prevents accidental repeat imports. Multiple supplied files for the same date are
combined; supply nonoverlapping exports, because a timestamp and contract alone
are not unique execution identifiers. No aggregation of separate fills is inferred.

Xynth call/put maps to the existing CALLS/PUTS field. Its explicit `is_sweep` flag
controls SWEEP classification. Other rows remain FLOOR or TRADE, never inferred
BLOCKs. ETF tags supply ETF/N sectors when the source sector is blank. Missing
underlying prices remain null and cannot qualify as out of the money.

Alpha premium and expiration thresholds, call/put-based sentiment, scoring,
heatmaps, and recaps retain the existing methodology. DTE is calculated from the
trade date and expiration, not the exported DTE. Recaps identify Xynth exports
as filtered coverage; sweep-only exports are not full-market daily totals.

Run importer regression checks with:

```powershell
node --test scripts/import_option_exports.test.mjs
```

## Tradytics

Tradytics exports have a time but no trade date. Supply exactly one trading date
and the timezone of `time_local`:

```powershell
npm run import:options -- --dates=2026-11-06 --timestamp-zone=America/New_York "path/to/tradytics-flow-2026-11-06 (1).csv"
```

The initial November 6 import uses the revised `(1)` export only. The date is
taken from the filename and explicitly supplied; local times are interpreted as
Eastern. These are import assumptions, not timezone/date metadata in the CSV.
Existing dates cannot be overwritten. Alpha thresholds and call/put sentiment
remain unchanged. SINGLE, BLOCK, SPLIT and SWEEP remain distinct labels.

All source rows are retained, including exact repeats: without execution IDs we
cannot determine whether identical rows are duplicated exports or distinct fills.
The recap discloses repeat counts and that export totals include them. Per-row
`source_identical_row_count` and dashboard source metadata record this policy.
Never combine overlapping downloads unless intentional; totals count every row.

Daily volume and the unusual flag are unavailable (`null`), not zero or false.
Sector labels reuse the latest known historical ticker mapping with its source
date recorded; unmatched tickers remain OTHER. The original historical snapshots
are never regenerated. Side, trade condition and events are preserved as metadata;
they do not silently change the existing Alpha criteria or sentiment calculation.
