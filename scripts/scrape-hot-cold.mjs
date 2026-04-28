#!/usr/bin/env node
/*
 * scrape-hot-cold.mjs
 *
 * Pulls current temperature + last 24h hourly readings from Open-Meteo for a
 * curated list of canonical hot/cold extremes per continent. Picks the live
 * winner per region, derives the world hot/cold from the cross-region max/min,
 * and writes ./hot-cold/data.json — consumed by hot-cold.js on page load.
 *
 * Runs from the GitHub Action (.github/workflows/hot-cold-scrape.yml) every
 * 15 minutes. Open-Meteo is free, no auth, 10k req/day limit; we make 14
 * calls per run (7 continents × hot+cold), so ~1300/day. Comfortably under.
 *
 * Why canonical extremes (vs scanning the whole grid): the hottest and coldest
 * places on earth are very well-known — they don't move week to week. Fetching
 * a fixed set of candidates and picking the live winner gives a real answer
 * without writing a global temperature scanner.
 *
 * Run locally:
 *   node scripts/scrape-hot-cold.mjs
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUT_DIR   = resolve(REPO_ROOT, 'hot-cold');
const OUT_FILE  = resolve(OUT_DIR, 'data.json');

// ─────────────────────────────────────────────────────────────────────
// candidates — keyed by continent. Each entry has the canonical extreme
// location and the nearest watchable feed (hand-curated; feeds change far
// more slowly than temperatures).
// ─────────────────────────────────────────────────────────────────────
const CANDIDATES = {
  africa: {
    hot:  { name: 'Dallol Depression',  region: 'Afar, Ethiopia',         lat: 14.24, lon: 40.30 },
    cold: { name: 'Mt. Stanley summit', region: 'Rwenzori, Uganda/DRC',   lat: 0.39,  lon: 29.87 },
    record: { hot: { value: 55.0, place: 'Kebili, Tunisia',  year: 1931 },
              cold:{ value: -23.9,place: 'Ifrane, Morocco',  year: 1935 } },
    bbox: [-20, -38, 55, 38],
  },
  asia: {
    hot:  { name: 'Lut Desert',         region: 'Kerman, Iran',           lat: 30.78, lon: 59.32 },
    cold: { name: 'Oymyakon plateau',   region: 'Sakha Republic, Russia', lat: 63.46, lon: 142.79 },
    record: { hot: { value: 54.0, place: 'Tirat Zvi, Israel', year: 1942 },
              cold:{ value: -67.7,place: 'Verkhoyansk, Russia',year: 1892 } },
    bbox: [25, -10, 180, 78],
  },
  europe: {
    hot:  { name: 'Sicily interior',    region: 'Catania, Italy',         lat: 37.46, lon: 14.62 },
    cold: { name: 'Kebnekaise massif',  region: 'Lapland, Sweden',        lat: 67.90, lon: 18.55 },
    record: { hot: { value: 48.8, place: 'Floridia, Sicily', year: 2021 },
              cold:{ value: -52.6,place: 'Ust-Shchugor, Russia', year: 1978 } },
    bbox: [-25, 34, 45, 71],
  },
  na: {
    hot:  { name: 'Death Valley · Furnace Creek', region: 'California, USA', lat: 36.46, lon: -116.87 },
    cold: { name: 'Eureka, Ellesmere Is.',        region: 'Nunavut, Canada', lat: 79.98, lon: -85.93 },
    record: { hot: { value: 56.7, place: 'Furnace Creek, Death Valley', year: 1913 },
              cold:{ value: -63.0,place: 'Snag, Yukon',                 year: 1947 } },
    bbox: [-170, 8, -50, 75],
  },
  sa: {
    hot:  { name: 'Gran Chaco',          region: 'Salta, Argentina',     lat: -22.10, lon: -62.85 },
    cold: { name: 'Altiplano · Sajama',  region: 'Oruro, Bolivia',       lat: -18.10, lon: -68.88 },
    record: { hot: { value: 48.9, place: 'Rivadavia, Argentina', year: 1905 },
              cold:{ value: -33.0,place: 'Sarmiento, Argentina', year: 1907 } },
    bbox: [-82, -56, -34, 13],
  },
  oceania: {
    hot:  { name: 'Marble Bar',          region: 'Pilbara, Australia',   lat: -21.18, lon: 119.74 },
    cold: { name: 'Mt. Cook · Aoraki',   region: 'Southern Alps, NZ',    lat: -43.59, lon: 170.14 },
    record: { hot: { value: 50.7, place: 'Oodnadatta, S. Australia', year: 1960 },
              cold:{ value: -25.6,place: 'Ranfurly, NZ',             year: 1903 } },
    bbox: [110, -50, 180, 0],
  },
  antarctica: {
    hot:  { name: 'Esperanza Base vicinity', region: 'Antarctic Peninsula',     lat: -63.40, lon: -56.99 },
    cold: { name: 'Vostok Station vicinity', region: 'East Antarctic Plateau',  lat: -78.46, lon: 106.84 },
    record: { hot: { value: 18.3, place: 'Esperanza Base',            year: 2020 },
              cold:{ value: -89.2,place: 'Vostok Station, Antarctica',year: 1983 } },
    bbox: [-180, -90, 180, -60],
  },
};

const REGION_ORDER = ['africa', 'asia', 'europe', 'na', 'sa', 'oceania', 'antarctica'];

// ─────────────────────────────────────────────────────────────────────
// open-meteo fetcher — current temp + last 12 hourly readings
// ─────────────────────────────────────────────────────────────────────
async function fetchPoint(lat, lon) {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude',  lat);
  u.searchParams.set('longitude', lon);
  u.searchParams.set('current',   'temperature_2m');
  u.searchParams.set('hourly',    'temperature_2m');
  u.searchParams.set('past_hours', '24');
  u.searchParams.set('forecast_hours', '0');
  u.searchParams.set('timezone',  'auto');

  const res = await fetch(u, { headers: { 'user-agent': 'raghavahuja.com hot-cold/1.0' } });
  if (!res.ok) throw new Error(`open-meteo ${res.status} for ${lat},${lon}`);
  const j = await res.json();

  const tempC = j?.current?.temperature_2m;
  const hourly = (j?.hourly?.temperature_2m || []).slice(-12);
  if (typeof tempC !== 'number') throw new Error(`no temperature for ${lat},${lon}`);
  return { tempC, sparkline: hourly };
}

// ─────────────────────────────────────────────────────────────────────
// build one region's hot + cold sides — 2 API calls per region
// ─────────────────────────────────────────────────────────────────────
async function buildRegion(id) {
  const c = CANDIDATES[id];
  const [hotPt, coldPt] = await Promise.all([
    fetchPoint(c.hot.lat,  c.hot.lon),
    fetchPoint(c.cold.lat, c.cold.lon),
  ]);

  return {
    id,
    label: id === 'na' ? 'n. america' : id === 'sa' ? 's. america' : id,
    headline: id === 'na' ? 'north america' : id === 'sa' ? 'south america' : id,
    bbox: c.bbox,
    hot: {
      extreme: { ...c.hot, tempC: round1(hotPt.tempC) },
      sparkline: hotPt.sparkline.map(round1),
      record: c.record.hot,
    },
    cold: {
      extreme: { ...c.cold, tempC: round1(coldPt.tempC) },
      sparkline: coldPt.sparkline.map(round1),
      record: c.record.cold,
    },
  };
}

const round1 = (n) => Math.round(n * 10) / 10;

// ─────────────────────────────────────────────────────────────────────
// derive the "world" region — hottest of all hot candidates, coldest of all
// cold candidates. Records: extremes from the all-time list.
// ─────────────────────────────────────────────────────────────────────
function deriveWorld(continents) {
  let hotWinner = continents[0], coldWinner = continents[0];
  for (const r of continents) {
    if (r.hot.extreme.tempC  > hotWinner.hot.extreme.tempC)   hotWinner  = r;
    if (r.cold.extreme.tempC < coldWinner.cold.extreme.tempC) coldWinner = r;
  }
  return {
    id: 'world',
    label: 'world',
    headline: 'the world',
    bbox: [-180, -85, 180, 85],
    hot:  { ...hotWinner.hot },
    cold: { ...coldWinner.cold },
  };
}

// ─────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[hot-cold] fetching ${REGION_ORDER.length} regions × 2 points = ${REGION_ORDER.length * 2} open-meteo calls`);
  const t0 = Date.now();

  const continents = [];
  for (const id of REGION_ORDER) {
    try {
      continents.push(await buildRegion(id));
      console.log(`  ✓ ${id}`);
    } catch (e) {
      console.error(`  ✗ ${id}: ${e.message}`);
      // keep going — partial is better than nothing
    }
  }
  if (continents.length === 0) {
    console.error('[hot-cold] no regions resolved; aborting without writing');
    process.exit(1);
  }

  const world = deriveWorld(continents);
  const regions = [world, ...continents];

  const out = {
    updatedAt: new Date().toISOString(),
    source: 'open-meteo · ERA5',
    regions,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[hot-cold] wrote ${OUT_FILE} in ${dt}s`);
  console.log(`           world hot:  ${world.hot.extreme.name} · ${world.hot.extreme.tempC}°C`);
  console.log(`           world cold: ${world.cold.extreme.name} · ${world.cold.extreme.tempC}°C`);
}

main().catch((e) => {
  console.error('[hot-cold] fatal:', e);
  process.exit(1);
});
