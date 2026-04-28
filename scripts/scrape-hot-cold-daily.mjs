#!/usr/bin/env node
/*
 * scrape-hot-cold-daily.mjs
 *
 * Daily roll-up: for each calendar day, find the world's hottest and coldest
 * place (out of the same 14 canonical candidates the live scraper uses) and
 * append a single entry to ./hot-cold/history.json.
 *
 * Modes:
 *   default                 → roll up YESTERDAY (UTC) only and append
 *   --date YYYY-MM-DD       → roll up that exact date
 *   --backfill YYYY-MM-DD   → roll up every date from there through today (UTC)
 *
 * Uses the free Open-Meteo Archive API (no auth, no key). One call per
 * candidate covers an arbitrary date range — so a full year's backfill is
 * 14 calls, not 14 × N.
 *
 * Run:
 *   node scripts/scrape-hot-cold-daily.mjs                     # yesterday
 *   node scripts/scrape-hot-cold-daily.mjs --date 2026-04-28   # one day
 *   node scripts/scrape-hot-cold-daily.mjs --backfill 2026-01-01
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUT_DIR   = resolve(REPO_ROOT, 'hot-cold');
const OUT_FILE  = resolve(OUT_DIR, 'history.json');

// Same registry the live scraper uses. Kept in sync by hand for now —
// if we ever extract this, both scripts should import from one source.
const CANDIDATES = [
  // hot side
  { side: 'hot',  name: 'Dallol Depression',           region: 'Afar, Ethiopia',         lat: 14.24, lon: 40.30 },
  { side: 'hot',  name: 'Lut Desert',                  region: 'Kerman, Iran',           lat: 30.78, lon: 59.32 },
  { side: 'hot',  name: 'Sicily interior',             region: 'Catania, Italy',         lat: 37.46, lon: 14.62 },
  { side: 'hot',  name: 'Death Valley · Furnace Creek',region: 'California, USA',        lat: 36.46, lon: -116.87 },
  { side: 'hot',  name: 'Gran Chaco',                  region: 'Salta, Argentina',       lat: -22.10, lon: -62.85 },
  { side: 'hot',  name: 'Marble Bar',                  region: 'Pilbara, Australia',     lat: -21.18, lon: 119.74 },
  { side: 'hot',  name: 'Esperanza Base vicinity',     region: 'Antarctic Peninsula',    lat: -63.40, lon: -56.99 },
  // cold side
  { side: 'cold', name: 'Mt. Stanley summit',          region: 'Rwenzori, Uganda/DRC',   lat: 0.39,  lon: 29.87 },
  { side: 'cold', name: 'Oymyakon plateau',            region: 'Sakha Republic, Russia', lat: 63.46, lon: 142.79 },
  { side: 'cold', name: 'Kebnekaise massif',           region: 'Lapland, Sweden',        lat: 67.90, lon: 18.55 },
  { side: 'cold', name: 'Eureka, Ellesmere Is.',       region: 'Nunavut, Canada',        lat: 79.98, lon: -85.93 },
  { side: 'cold', name: 'Altiplano · Sajama',          region: 'Oruro, Bolivia',         lat: -18.10, lon: -68.88 },
  { side: 'cold', name: 'Mt. Cook · Aoraki',           region: 'Southern Alps, NZ',      lat: -43.59, lon: 170.14 },
  { side: 'cold', name: 'Vostok Station vicinity',     region: 'East Antarctic Plateau', lat: -78.46, lon: 106.84 },
];

// ─────────────────────────────────────────────────────────────────────
// args
// ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--date' && argv[i+1]) { out.date = argv[++i]; }
    else if (argv[i] === '--backfill' && argv[i+1]) { out.backfill = argv[++i]; }
  }
  return out;
}

const todayUTC = () => new Date().toISOString().slice(0, 10);
const yesterdayUTC = () => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};
function* dateRange(start, end) {
  const d = new Date(start + 'T00:00:00Z');
  const e = new Date(end   + 'T00:00:00Z');
  while (d <= e) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

// ─────────────────────────────────────────────────────────────────────
// open-meteo archive — free, no auth. One call per candidate covers any
// date range; we ask for hourly temperature_2m, then bucket by UTC date.
// ─────────────────────────────────────────────────────────────────────
async function fetchArchive(lat, lon, startDate, endDate) {
  const u = new URL('https://archive-api.open-meteo.com/v1/archive');
  u.searchParams.set('latitude',   lat);
  u.searchParams.set('longitude',  lon);
  u.searchParams.set('start_date', startDate);
  u.searchParams.set('end_date',   endDate);
  u.searchParams.set('hourly',     'temperature_2m');
  u.searchParams.set('timezone',   'UTC');

  const res = await fetch(u, { headers: { 'user-agent': 'raghavahuja.com hot-cold/1.0' } });
  if (!res.ok) throw new Error(`open-meteo archive ${res.status} for ${lat},${lon}`);
  const j = await res.json();
  const times = j?.hourly?.time || [];
  const temps = j?.hourly?.temperature_2m || [];
  const byDate = new Map(); // date → array of temps
  for (let i = 0; i < times.length; i++) {
    const date = times[i].slice(0, 10);
    if (typeof temps[i] !== 'number') continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(temps[i]);
  }
  return byDate;
}

const round1 = (n) => Math.round(n * 10) / 10;

// ─────────────────────────────────────────────────────────────────────
// roll-up — pull each candidate's daily extreme over the date range,
// then per date pick the global hot winner (max of hot candidates) and
// global cold winner (min of cold candidates).
// ─────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchArchiveRetry(lat, lon, startDate, endDate, attempt = 0) {
  try {
    return await fetchArchive(lat, lon, startDate, endDate);
  } catch (e) {
    if (attempt < 4 && /\b429\b|\b503\b/.test(e.message)) {
      const wait = 1500 * Math.pow(2, attempt);
      console.warn(`  retrying ${lat},${lon} in ${wait}ms (${e.message})`);
      await sleep(wait);
      return fetchArchiveRetry(lat, lon, startDate, endDate, attempt + 1);
    }
    throw e;
  }
}

async function rollUp(startDate, endDate) {
  // sequentialize to stay under the archive API's burst limit (free tier is
  // tighter than forecast). 14 calls × ~250ms = ~4s, no big deal.
  console.log(`[hot-cold/daily] fetching ${CANDIDATES.length} candidates over ${startDate} → ${endDate}`);
  const series = [];
  for (const c of CANDIDATES) {
    const byDate = await fetchArchiveRetry(c.lat, c.lon, startDate, endDate);
    series.push({ c, byDate });
    await sleep(250);
  }

  const entries = []; // one per date
  for (const date of dateRange(startDate, endDate)) {
    let hotWin = null, coldWin = null;
    for (const { c, byDate } of series) {
      const temps = byDate.get(date);
      if (!temps || temps.length === 0) continue;
      if (c.side === 'hot') {
        const max = Math.max(...temps);
        if (!hotWin || max > hotWin.tempC) hotWin = { name: c.name, region: c.region, lat: c.lat, lon: c.lon, tempC: round1(max) };
      } else {
        const min = Math.min(...temps);
        if (!coldWin || min < coldWin.tempC) coldWin = { name: c.name, region: c.region, lat: c.lat, lon: c.lon, tempC: round1(min) };
      }
    }
    if (hotWin && coldWin) {
      entries.push({ date, hot: hotWin, cold: coldWin });
    } else {
      console.warn(`  ! ${date}: missing data (hot=${!!hotWin}, cold=${!!coldWin})`);
    }
  }
  return entries;
}

// ─────────────────────────────────────────────────────────────────────
// load + merge + write
// ─────────────────────────────────────────────────────────────────────
async function loadHistory() {
  try {
    const raw = await readFile(OUT_FILE, 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j?.entries) ? j.entries : [];
  } catch {
    return [];
  }
}

function mergeEntries(existing, fresh) {
  const byDate = new Map(existing.map(e => [e.date, e]));
  for (const f of fresh) byDate.set(f.date, f); // fresh overwrites
  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)); // newest first
}

// ─────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2));
  let startDate, endDate;
  if (args.backfill) {
    startDate = args.backfill;
    endDate   = yesterdayUTC();      // never include today (incomplete)
  } else if (args.date) {
    startDate = endDate = args.date;
  } else {
    startDate = endDate = yesterdayUTC();
  }
  if (startDate > endDate) {
    console.log('[hot-cold/daily] nothing to roll up (start > end)');
    return;
  }

  const t0 = Date.now();
  const fresh = await rollUp(startDate, endDate);
  const existing = await loadHistory();
  const merged = mergeEntries(existing, fresh);

  await mkdir(OUT_DIR, { recursive: true });
  const out = {
    updatedAt: new Date().toISOString(),
    source: 'open-meteo · archive (era5)',
    entryCount: merged.length,
    entries: merged,
  };
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[hot-cold/daily] wrote ${merged.length} entries (${fresh.length} fresh) in ${dt}s`);
  if (fresh.length) {
    console.log(`           latest: ${fresh[fresh.length-1].date}`);
    console.log(`           hot:    ${fresh[fresh.length-1].hot.name} · ${fresh[fresh.length-1].hot.tempC}°C`);
    console.log(`           cold:   ${fresh[fresh.length-1].cold.name} · ${fresh[fresh.length-1].cold.tempC}°C`);
  }
}

main().catch((e) => {
  console.error('[hot-cold/daily] fatal:', e);
  process.exit(1);
});
