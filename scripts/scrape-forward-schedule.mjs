#!/usr/bin/env node
/*
 * scrape-forward-schedule.mjs
 *
 * Forward-looking schedule for the Mamdani Mapper.
 *
 * Mamdani's press office only publishes events AFTER they happen, so the
 * primary scraper (scrape-mamdani-schedule.mjs) gives us a 1-3 day lag.
 * This script fills in the forward signal.
 *
 * Approach: ONE call per day to Claude Haiku 4.5 with built-in web_search +
 * web_fetch tools. Claude searches credible NYC news outlets for "Mamdani
 * upcoming schedule" / "Mamdani town hall this week" and returns a strict
 * structured array via tool use.
 *
 * Output: events with `is_forward: true` flag merged into mamdani/events.json.
 * The page renders forward events with a faded/dashed marker so users can
 * tell at a glance: confirmed-past vs predicted-upcoming.
 *
 * Cost: ~$1/month (one daily run, ~2 web_searches + ~5 web_fetches + ~10K
 * Haiku tokens per run).
 *
 * Run:
 *   ANTHROPIC_API_KEY=sk-ant-... MAPBOX_TOKEN=pk.... node scripts/scrape-forward-schedule.mjs
 */

import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUT       = resolve(REPO_ROOT, 'mamdani', 'events.json');

const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY;
const MAPBOX_TOKEN     = process.env.MAPBOX_TOKEN;
const ANTHROPIC_URL    = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL  = 'claude-haiku-4-5';
const MAPBOX_GEOCODE   = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const NYC_BBOX         = '-74.2591,40.4774,-73.7004,40.9176';
const BOROUGHS         = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

if (!ANTHROPIC_KEY) { console.error('[forward] ANTHROPIC_API_KEY required'); process.exit(2); }
if (!MAPBOX_TOKEN)  { console.error('[forward] MAPBOX_TOKEN required');     process.exit(2); }

// ────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

function nyOffsetFor(date) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset', year: 'numeric' });
  const off = fmt.formatToParts(date).find(p => p.type === 'timeZoneName')?.value || 'GMT-5';
  const m = off.match(/GMT([+-])(\d{1,2})/);
  if (!m) return '-05:00';
  return `${m[1]}${String(m[2]).padStart(2, '0')}:00`;
}

function eventToIso(yyyymmdd, hhmm) {
  // yyyymmdd = "2026-04-30", hhmm = "14:00" or null
  const time = hhmm || '12:00';
  const parts = yyyymmdd.split('-').map(n => parseInt(n, 10));
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  const dummyDate = new Date(Date.UTC(y, m - 1, d, 12, 0));
  const off = nyOffsetFor(dummyDate);
  return `${yyyymmdd}T${time}:00${off}`;
}

function plusHours(iso, hours) {
  const d = new Date(iso); d.setHours(d.getHours() + hours); return d.toISOString();
}

function todayNY() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

async function geocode(query, hint = {}) {
  const parts = [query];
  if (hint.neighborhood) parts.push(hint.neighborhood);
  if (hint.borough)      parts.push(hint.borough);
  parts.push('New York City');
  const fullQuery = parts.join(', ');
  const url = `${MAPBOX_GEOCODE}/${encodeURIComponent(fullQuery)}.json` +
    `?access_token=${MAPBOX_TOKEN}&bbox=${NYC_BBOX}&limit=1&types=address,poi,neighborhood,place,locality`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const f = data.features?.[0];
  if (!f || (f.relevance || 0) < 0.6) return null;
  const [lng, lat] = f.center;
  let borough = null;
  for (const c of (f.context || [])) {
    if (BOROUGHS.includes(c.text)) { borough = c.text; break; }
  }
  return { lng, lat, borough, address: f.place_name };
}

// ────────────────────────────────────────────────────────────────────
// the call
// ────────────────────────────────────────────────────────────────────

const TODAY = todayNY();

const SYSTEM_PROMPT = `You are finding the FORWARD-LOOKING public schedule for NYC Mayor Zohran Mamdani for the next 7 days, starting from ${TODAY} (America/New_York).

Use the web_search tool to find credible reporting on his upcoming public events. Use web_fetch to read promising pages. Then call the record_forward_events tool ONCE with the full list of qualifying events. If you find none, call it with an empty events array.

Sources to favor (credible NYC press):
- gothamist.com
- nytimes.com (Metro section)
- ny1.com
- cityandstateny.com
- thecity.nyc
- amny.com
- nydailynews.com
- nypost.com
- streetsblog.org
- patch.com (NYC neighborhoods)

Sources to AVOID (paywalled, off-topic, or unreliable for forward schedule):
- politico.com (paywalled, blocked)
- twitter.com / x.com (rate-limited, unreliable)
- reddit.com (rumor-heavy)
- random blogs

ONLY emit an event if ALL of these are true:
- The source page explicitly states the Mayor will/is scheduled to attend (not "may attend", not "expected to", not "rumored")
- A specific named venue is given (NOT "City Hall" alone, NOT "TBD", NOT "a Brooklyn community center")
- A specific date is given (today or a future date within 7 days)
- The source URL is publicly accessible (no paywalls beyond standard registration)

Skip if:
- The event already happened (date < ${TODAY})
- The Mayor's role is unclear ("may speak" / "could attend")
- Generic announcements with no venue or date
- Past town halls being announced as transcripts

Confidence levels:
- "high" — explicit pre-announcement from a credible NYC outlet, named venue, named time
- "medium" — credible source mentions the event but venue or time is loose

Be conservative. We'd rather miss a real event than plot a fake one. Limit yourself to ~3 web_searches and ~5 web_fetches per run to stay under cost ceiling. Do NOT chain endless searches — focus on the highest-value queries first.`;

const RECORD_TOOL = {
  name: 'record_forward_events',
  description: 'Record the full list of forward-looking Mayoral events found in this run. Call exactly once at the end, even if events is empty.',
  input_schema: {
    type: 'object',
    properties: {
      events: {
        type: 'array',
        description: 'Forward-looking mayoral events found via web search.',
        items: {
          type: 'object',
          properties: {
            event_name: { type: 'string', description: 'Short title of the event.' },
            venue: { type: 'string', description: 'Specific named venue.' },
            neighborhood: { type: ['string', 'null'], description: 'NYC neighborhood, e.g. East Harlem.' },
            borough: { type: ['string', 'null'], enum: ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', null] },
            kind: { type: ['string', 'null'], description: 'Event type: town hall, press conference, ribbon cutting, remarks, visit, bill signing, appearance, etc.' },
            start_date_iso: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD in America/New_York.' },
            start_time_local: { type: ['string', 'null'], pattern: '^\\d{2}:\\d{2}$', description: 'HH:MM 24-hour in America/New_York. Null if only date known.' },
            source_url: { type: 'string', description: 'Public URL of the article that announced this event.' },
            source_publisher: { type: ['string', 'null'], description: 'e.g. Gothamist, NY1, NY Times.' },
            confidence: { type: 'string', enum: ['high', 'medium'] },
            quote: { type: ['string', 'null'], description: 'Brief quote (<200 chars) from source confirming the schedule, for verification.' },
          },
          required: ['event_name', 'venue', 'start_date_iso', 'source_url', 'confidence'],
          additionalProperties: false,
        },
      },
      search_summary: { type: 'string', description: 'One-line summary of what was searched and how many events were found.' },
    },
    required: ['events', 'search_summary'],
    additionalProperties: false,
  },
};

async function callClaude() {
  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    tools: [
      { type: 'web_search_20260209', name: 'web_search', allowed_callers: ['direct'] },
      { type: 'web_fetch_20260209', name: 'web_fetch',  allowed_callers: ['direct'] },
      RECORD_TOOL,
    ],
    tool_choice: { type: 'auto' },
    messages: [
      {
        role: 'user',
        content: `Find Mayor Mamdani's upcoming public schedule for the next 7 days starting today (${TODAY}). Return the structured list via record_forward_events.`,
      },
    ],
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${err.slice(0, 400)}`);
  }
  return res.json();
}

// ────────────────────────────────────────────────────────────────────
// merge + write
// ────────────────────────────────────────────────────────────────────

async function loadExisting() {
  try {
    const txt = await readFile(OUT, 'utf8');
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

async function main() {
  console.log(`[forward] ${new Date().toISOString()} starting · today=${TODAY}`);

  const data = await callClaude();
  const usage = data.usage || {};
  const recordCall = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'record_forward_events');
  if (!recordCall?.input) {
    console.error('[forward] no record_forward_events tool call in response — bailing');
    process.exit(2);
  }

  const found = recordCall.input.events || [];
  const summary = recordCall.input.search_summary || '';
  console.log(`[forward] ${found.length} candidate event(s) · ${summary}`);

  // server-side tool usage stats
  const serverTools = (data.content || []).filter(b =>
    b.type === 'server_tool_use' || b.type === 'web_search_tool_result' || b.type === 'web_fetch_tool_result'
  );
  console.log(`[forward] server-tool blocks: ${serverTools.length}  tokens: in=${usage.input_tokens}  out=${usage.output_tokens}`);

  // geocode each
  const todayDate = TODAY;
  const sevenAhead = (() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();

  const events = [];
  for (const c of found) {
    if (c.start_date_iso < todayDate || c.start_date_iso > sevenAhead) {
      console.log(`[forward] outside window, skipping: ${c.event_name} (${c.start_date_iso})`);
      continue;
    }
    const start = eventToIso(c.start_date_iso, c.start_time_local || null);
    if (!start) { console.warn(`[forward] bad date, skipping: ${c.start_date_iso}`); continue; }

    const geo = await geocode(c.venue, { neighborhood: c.neighborhood, borough: c.borough });
    if (!geo) { console.warn(`[forward] geo-fail: ${c.venue}`); continue; }

    const id = sha(`forward|${start}|${c.venue}`);
    events.push({
      id,
      event_name: c.event_name,
      venue: c.venue,
      address: geo.address,
      lat: geo.lat,
      lng: geo.lng,
      borough: c.borough || geo.borough || null,
      kind: c.kind || 'upcoming',
      start,
      end: plusHours(start, 1),
      source_url: c.source_url,
      source: c.source_publisher ? `web · ${c.source_publisher}` : 'web · web search',
      confidence: c.confidence,
      quote: c.quote || null,
      is_forward: true,
    });
  }

  // merge into events.json: keep all existing past events, replace only forward events
  const existing = await loadExisting();
  if (!existing) { console.error('[forward] events.json missing — run press scraper first'); process.exit(2); }

  const past = (existing.events || []).filter(e => !e.is_forward);
  const merged = [...past, ...events].sort((a, b) => a.start.localeCompare(b.start));

  const out = {
    ...existing,
    updated_at: new Date().toISOString(),
    events: merged,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`[forward] wrote ${events.length} forward event(s) (${past.length} past preserved)`);
}

main().catch(e => { console.error('[forward] FAILED:', e); process.exit(1); });
