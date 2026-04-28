#!/usr/bin/env node
/*
 * scrape-mamdani-schedule.mjs
 *
 * Discovery: nyc.gov sitemap → all `mayors-office/news/2026/*` URLs
 * Per release: fetch the static page, parse title + date + body, extract
 *   a venue via Claude Haiku 4.5 (with regex fallback), geocode via Mapbox.
 * Output: ./mamdani/events.json (keyed by stable hash, with manual override merge)
 *
 * Note: Mamdani's office does NOT publish "Mayor's Public Schedule" daily releases
 * (that was Adams's practice). So this scrapes the *receipt* of where he's been.
 *
 * Run:
 *   MAPBOX_TOKEN=pk... ANTHROPIC_API_KEY=sk-ant-... node scripts/scrape-mamdani-schedule.mjs
 *
 * Auth:
 *   MAPBOX_TOKEN          required — Mapbox geocoding
 *   ANTHROPIC_API_KEY     optional — if set, uses Claude Haiku 4.5 for venue extraction
 *                         (higher accuracy). Falls back to regex if missing or API errors.
 *
 * Why raw fetch instead of @anthropic-ai/sdk: this script lives in a static HTML site
 * with no package.json. The rest of the script is raw fetch (nyc.gov, mapbox). Keeping
 * one consistent style avoids adding npm tooling for one function call.
 *
 * Optional flags via env:
 *   MM_LIMIT=40                # how many recent releases to process (default 30)
 *   MM_SINCE_DAYS=60           # only include releases newer than N days (default 60)
 */

import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUT      = resolve(REPO_ROOT, 'mamdani', 'events.json');
const MANUAL   = resolve(REPO_ROOT, 'mamdani', 'events-manual.json');

const SITEMAPS = [
  'https://www.nyc.gov/content/nycgov.sitemap.mayors-office-nycgov-sitemap.xml',
  'https://www.nyc.gov/content/nycgov.sitemap.mayors-office-nycgov-sitemap-2.xml',
];

const MAPBOX_TOKEN     = process.env.MAPBOX_TOKEN;
const ANTHROPIC_KEY    = process.env.ANTHROPIC_API_KEY;
const MAPBOX_GEOCODE   = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const ANTHROPIC_URL    = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL  = 'claude-haiku-4-5';
const NYC_BBOX         = '-74.2591,40.4774,-73.7004,40.9176';
const BOROUGHS         = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];

const LIMIT      = parseInt(process.env.MM_LIMIT || '30', 10);
const SINCE_DAYS = parseInt(process.env.MM_SINCE_DAYS || '60', 10);

const UA = 'mamdani-mapper/0.3 (+raghavahuja.com)';

// ────────────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────────────

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|li|tr|br|h\d)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    // entity decode — incl. &lt; / &gt; needed for AEM JSON-encoded body
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&ldquo;|&rdquo;|&#822[01];/g, '"')
    .replace(/&lsquo;|&rsquo;|&#821[67];/g, "'")
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&ndash;|&#8211;/g, '–')
    // 2nd HTML strip pass — kills <li>/<i>/<b> exposed by &lt;/&gt; decode
    .replace(/<[^>]+>/g, ' ')
    // literal escape sequences from JSON-embedded markup
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function nyOffsetFor(date) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset', year: 'numeric' });
  const off = fmt.formatToParts(date).find(p => p.type === 'timeZoneName')?.value || 'GMT-5';
  const m = off.match(/GMT([+-])(\d{1,2})/);
  if (!m) return '-05:00';
  return `${m[1]}${String(m[2]).padStart(2,'0')}:00`;
}

function isoNoon(date) {
  // emit yyyy-mm-ddT12:00:00-04:00 (default NYC noon when no time known)
  const off = nyOffsetFor(date);
  const yyyy = date.getFullYear();
  const mo = String(date.getMonth()+1).padStart(2,'0');
  const dd = String(date.getDate()).padStart(2,'0');
  return `${yyyy}-${mo}-${dd}T12:00:00${off}`;
}
function plusHour(iso) {
  const d = new Date(iso); d.setHours(d.getHours()+1); return d.toISOString();
}

// ────────────────────────────────────────────────────────────────────
// sitemap discovery
// ────────────────────────────────────────────────────────────────────

async function discoverUrls() {
  const all = new Set();
  for (const sm of SITEMAPS) {
    let xml;
    try { xml = await fetchText(sm); }
    catch (e) { console.warn(`[scrape] sitemap miss: ${sm} (${e.message})`); continue; }
    // <loc>https://www.nyc.gov/mayors-office/news/YYYY/MM/slug</loc>
    const re = /<loc>(https:\/\/www\.nyc\.gov\/mayors-office\/news\/\d{4}\/\d{2}\/[^<]+)<\/loc>/g;
    let m;
    while ((m = re.exec(xml))) all.add(m[1]);
  }
  return Array.from(all);
}

function dateFromUrl(url) {
  // extract /YYYY/MM/ from the URL — the day comes from the body
  const m = url.match(/\/news\/(\d{4})\/(\d{2})\//);
  return m ? { yyyy: parseInt(m[1], 10), mm: parseInt(m[2], 10) } : null;
}

// ────────────────────────────────────────────────────────────────────
// release parsing
// ────────────────────────────────────────────────────────────────────

function extractTitle(html) {
  // <h1>Title</h1> or <title>... - NYC Mayor's Office</title>
  let m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m) return stripHtml(m[1]).replace(/\s+/g, ' ').trim();
  m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m) return stripHtml(m[1]).replace(/\s*-\s*NYC Mayor's Office\s*$/, '').trim();
  return null;
}

const MONTH = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11 };

function extractDate(text, fallback) {
  // "April 9, 2026" near the top
  const m = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})\b/);
  if (m) {
    const d = new Date(0);
    d.setFullYear(parseInt(m[3],10), MONTH[m[1].toLowerCase()], parseInt(m[2],10));
    d.setHours(12, 0, 0, 0);
    return d;
  }
  if (fallback) {
    const d = new Date(0);
    d.setFullYear(fallback.yyyy, fallback.mm - 1, 1);
    d.setHours(12, 0, 0, 0);
    return d;
  }
  return null;
}

function classifyKind(title, body) {
  const s = (title + ' ' + body.slice(0, 500)).toLowerCase();
  if (s.includes('transcript:'))                       return 'transcript';
  if (/town\s*hall/.test(s))                           return 'town hall';
  if (/press\s*(conference|briefing)/.test(s))         return 'press conference';
  if (/ribbon[\s-]*cutting/.test(s))                   return 'ribbon cutting';
  if (/groundbreaking/.test(s))                        return 'groundbreaking';
  if (/sign(ing)?\s*(into\s+law|ceremony)/.test(s))    return 'bill signing';
  if (/parade/.test(s))                                return 'parade';
  if (/visit/.test(s))                                 return 'visit';
  if (/joined?\s+(?:by\s+)?[A-Z]/.test(s))             return 'appearance';
  if (/(deliver|give|made).{0,12}remark/.test(s))      return 'remarks';
  if (/announce/.test(s))                              return 'announcement';
  return 'event';
}

// ────────────────────────────────────────────────────────────────────
// venue extraction — Claude Haiku 4.5 (primary) with regex fallback
// ────────────────────────────────────────────────────────────────────

const CLAUDE_SYSTEM_PROMPT = `You extract venue and event metadata from NYC Mayor's Office press releases for a project that plots Mayor Zohran Mamdani's public appearances on a map.

You will be given a press release title and the lead paragraphs of the body. Decide whether the release describes a specific physical event the Mayor attended at a specific named venue, or whether it is a thematic announcement, executive order, transcript header, or policy release without a clear venue. ALWAYS call the record_venue tool with structured output.

Field guidance:

was_physically_present: TRUE only if the release clearly indicates the Mayor was physically present at a specific named venue. Examples: "delivered remarks at PS 152 in Astoria", "joined NYCHA officials at the Pink Houses in East New York", "toured a construction site in Soundview", "held a press conference at Gracie Mansion", "visited the Brooklyn Public Library Central Branch". FALSE for: announcements with no venue mentioned in the body, executive orders, proclamations, "Mayor Mamdani Announces X" releases that do not name a physical location, releases that summarize first-100-day actions or policy bundles without naming a single event.

venue: The most specific named venue you can extract. Prefer the actual building/site name (e.g. "La Marqueta", "PS 152", "Ridgewood YMCA", "Bronx Bethany Church of the Nazarene", "Gracie Mansion"). Do NOT use generic descriptors ("an early childhood education center", "a local school"). Do NOT include the borough or "in New York City" in the venue string. Do NOT use "City Hall" unless the release explicitly says City Hall is the venue. NULL if no specific named venue.

neighborhood: NYC neighborhood name when mentioned (e.g. "East Harlem", "Astoria", "Bedford-Stuyvesant", "Fordham", "Tottenville", "Soundview"). NULL if not mentioned.

borough: Exactly one of "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island". NULL if unclear from title or body.

kind: Pick one of: "town hall", "press conference", "ribbon cutting", "groundbreaking", "remarks", "visit", "tour", "bill signing", "appearance", "parade", "transcript", "announcement", "media", "other".

Examples:

INPUT 1:
Title: Mayor Mamdani Announces La Marqueta as First Site Identified for City's Public Grocery Stores
Body lead: NEW YORK – Today, Mayor Zohran Kwame Mamdani, Deputy Mayor Julie Su and the New York City Economic Development Corporation (NYCEDC) announced La Marqueta as the first site identified for the City's municipal grocery store program. The 9,000-square-foot store in East Harlem will be constructed from the ground up...

OUTPUT 1:
{ "was_physically_present": true, "venue": "La Marqueta", "neighborhood": "East Harlem", "borough": "Manhattan", "kind": "announcement" }

INPUT 2:
Title: Mayor Mamdani Announces 2-K Will Be Full-Day and Full-Year
Body lead: NEW YORK — Today, Mayor Zohran Kwame Mamdani announced that, beginning this fall, most 2-K seats will operate on a full-day and full-year schedule — a major step toward delivering truly universal child care...

OUTPUT 2:
{ "was_physically_present": false, "venue": null, "neighborhood": null, "borough": null, "kind": "announcement" }

INPUT 3:
Title: Transcript: Mayor Mamdani Delivers Remarks at Easter Sunday Services at Bronx Bethany Church of the Nazarene
Body lead: ...the Mayor today delivered remarks at Easter Sunday services at Bronx Bethany Church of the Nazarene in the Bronx...

OUTPUT 3:
{ "was_physically_present": true, "venue": "Bronx Bethany Church of the Nazarene", "neighborhood": null, "borough": "Bronx", "kind": "remarks" }

INPUT 4:
Title: Executive Order No. 13
Body lead: EXECUTIVE ORDER NO. 13 ...

OUTPUT 4:
{ "was_physically_present": false, "venue": null, "neighborhood": null, "borough": null, "kind": "other" }

INPUT 5:
Title: Mayor Mamdani Takes on the Housing Crisis, Cracks Down on Bad Landlords in First 100 Days
Body lead: NEW YORK — Today, Mayor Mamdani highlighted the administration's housing-crisis actions across the city's first 100 days, including new enforcement against landlord violations and emergency repair funding...

OUTPUT 5:
{ "was_physically_present": false, "venue": null, "neighborhood": null, "borough": null, "kind": "announcement" }

Be conservative. When in doubt about whether the Mayor was physically present at a specific venue, set was_physically_present to FALSE and leave venue null. We would rather under-plot than plot the wrong location.`;

const VENUE_TOOL = {
  name: 'record_venue',
  description: 'Record extracted venue and event metadata from a press release.',
  input_schema: {
    type: 'object',
    properties: {
      was_physically_present: {
        type: 'boolean',
        description: 'True iff the Mayor was physically present at a specific named venue per the press release.',
      },
      venue: {
        type: ['string', 'null'],
        description: 'Most specific named venue (building/site). Null if none.',
      },
      neighborhood: {
        type: ['string', 'null'],
        description: 'NYC neighborhood name. Null if not mentioned.',
      },
      borough: {
        type: ['string', 'null'],
        enum: ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', null],
        description: 'NYC borough. Null if unclear.',
      },
      kind: {
        type: ['string', 'null'],
        description: 'Event type: town hall, press conference, ribbon cutting, groundbreaking, remarks, visit, tour, bill signing, appearance, parade, transcript, announcement, media, other.',
      },
    },
    required: ['was_physically_present', 'venue', 'neighborhood', 'borough', 'kind'],
    additionalProperties: false,
  },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function extractVenueWithClaude(title, bodyText, attempt = 0) {
  if (!ANTHROPIC_KEY) return null;

  // Trim body to lead paragraphs (post-"NEW YORK" header) — most venue
  // signals are in the first ~3000 chars. Keeps input tokens under control.
  const newYorkIdx = bodyText.indexOf('NEW YORK');
  const lead = newYorkIdx >= 0
    ? bodyText.slice(newYorkIdx, newYorkIdx + 3500)
    : bodyText.slice(0, 3500);

  const requestBody = {
    model: ANTHROPIC_MODEL,
    max_tokens: 512,
    system: [
      { type: 'text', text: CLAUDE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    tools: [VENUE_TOOL],
    tool_choice: { type: 'tool', name: 'record_venue' },
    messages: [
      {
        role: 'user',
        content: `Title: ${title}\n\nBody (lead paragraphs):\n${lead}`,
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
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    // Honor 429 rate-limit retry-after with one bounded backoff, then give up
    // and let the caller fall back to regex.
    if (res.status === 429 && attempt < 2) {
      const retryAfter = parseFloat(res.headers.get('retry-after') || '0') || 30;
      console.log(`[claude] 429 — sleeping ${retryAfter}s then retrying (attempt ${attempt + 1}/2)`);
      await sleep(retryAfter * 1000);
      return extractVenueWithClaude(title, bodyText, attempt + 1);
    }
    const err = await res.text().catch(() => '');
    throw new Error(`anthropic ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const toolUse = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'record_venue');
  if (!toolUse?.input) return null;

  const usage = data.usage || {};
  return {
    ...toolUse.input,
    _usage: {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cache_read: usage.cache_read_input_tokens,
      cache_create: usage.cache_creation_input_tokens,
    },
  };
}

// ────────────────────────────────────────────────────────────────────
// venue extraction — fuzzy regex over the lead paragraphs (FALLBACK)
// ────────────────────────────────────────────────────────────────────

// Patterns ranked by specificity. Each entry: [regex, venueGroupIdx, boroughGroupIdx | null]
// Trailing terminator allows end-of-string ($).
const TERM = '(?:[.,;]|\\s+(?:in|on|to|where|today|joined|alongside|after|before|during|with|amid)|\\s*$)';
const BOROUGH_RE = '(Manhattan|Brooklyn|Queens|the\\s+Bronx|Bronx|Staten\\s+Island)';

const VENUE_PATTERNS = [
  // "Remarks at <Venue>" / "Delivers Remarks at <Venue>" — clean title pattern
  [new RegExp(`\\b(?:[Rr]emarks?|[Dd]elivers?\\s+[Rr]emarks?|[Aa]ddress(?:es)?)\\s+at\\s+(?:the\\s+)?([A-Z][^,.\\n]{4,90}?)${TERM}`), 1, null],
  // "Visits/Visited <Venue>" — title pattern e.g. "Visit Early Childhood Education Center in the South Bronx"
  [new RegExp(`\\b[Vv]isits?\\s+(?:the\\s+)?([A-Z][^,.\\n]{4,90}?)\\s+in\\s+(?:the\\s+)?(South\\s+Bronx|East\\s+Bronx|North\\s+Bronx|Lower\\s+Manhattan|Upper\\s+Manhattan|${BOROUGH_RE.slice(1, -1)})${TERM}`), 1, 2],
  // "<Verb> at <Place>, in <Borough>" — best signal
  [new RegExp(`\\bat\\s+(?:the\\s+)?([A-Z][^,.\\n]{4,90}?),\\s+(?:in\\s+)?${BOROUGH_RE}\\b`), 1, 2],
  // "<Verb> at <Place> in <Borough>"
  [new RegExp(`\\bat\\s+(?:the\\s+)?([A-Z][^,.\\n]{4,90}?)\\s+in\\s+${BOROUGH_RE}\\b`), 1, 2],
  // "delivered/gave/made remarks at <Place>"
  [new RegExp(`(?:delivered|gave|made)\\s+remarks\\s+(?:today\\s+)?at\\s+(?:the\\s+)?([A-Z][^,.\\n]{4,90}?)${TERM}`), 1, null],
  // "joined ... at <Place>"
  [new RegExp(`\\bjoined\\s+[^.\\n]{4,80}?\\s+at\\s+(?:the\\s+)?([A-Z][^,.\\n]{4,90}?)${TERM}`), 1, null],
  // "today, at <Place>"
  [new RegExp(`\\btoday[,]?\\s+at\\s+(?:the\\s+)?([A-Z][^,.\\n]{4,90}?)${TERM}`), 1, null],
  // visited/toured/hosted ... at <Place>
  [new RegExp(`\\b(?:[Vv]isited|[Tt]oured|[Hh]osted\\s+[^.\\n]{0,50}?\\s+at|[Hh]eld\\s+(?:a\\s+)?(?:town\\s*hall|press\\s+conference|news\\s+conference|ribbon[\\s-]?cutting|groundbreaking)\\s+at)\\s+(?:the\\s+)?([A-Z][^,.\\n]{4,90}?)${TERM}`), 1, null],
  // "(visit|tour) ... in <South|East|...> Bronx" or borough
  [new RegExp(`\\bin\\s+(?:the\\s+)?(South\\s+Bronx|East\\s+Bronx|North\\s+Bronx|Lower\\s+Manhattan|Upper\\s+Manhattan|Mid-Manhattan|Lower\\s+East\\s+Side|Upper\\s+East\\s+Side|Upper\\s+West\\s+Side)\\b`), 1, null],
  // "in <Place>, <Borough>" — neighborhood + borough
  [new RegExp(`\\bin\\s+([A-Z][a-zA-Z]+(?:[\\s-][A-Z][a-zA-Z]+){0,2}),\\s+${BOROUGH_RE}\\b`), 1, 2],
  // "in <Neighborhood>" — known NYC neighborhoods
  [/\bin\s+(East\s+Harlem|Harlem|Astoria|Bushwick|Williamsburg|Bedford[\s-]Stuyvesant|Bed[\s-]Stuy|Crown\s+Heights|Flatbush|Park\s+Slope|Sunset\s+Park|Bay\s+Ridge|Borough\s+Park|Kensington|Sheepshead\s+Bay|Coney\s+Island|Brownsville|East\s+New\s+York|Flushing|Jackson\s+Heights|Elmhurst|Corona|Forest\s+Hills|Long\s+Island\s+City|Jamaica|Rockaway|Far\s+Rockaway|Ozone\s+Park|Richmond\s+Hill|Soundview|Mott\s+Haven|Hunts\s+Point|Morrisania|Fordham|Riverdale|Washington\s+Heights|Inwood|Midtown|Times\s+Square|Chelsea|Flatiron|Greenwich\s+Village|East\s+Village|Lower\s+East\s+Side|SoHo|Tribeca|Chinatown|Financial\s+District|Battery\s+Park\s+City|City\s+Hall)\b/i, 1, null],
];

const VENUE_BLOCKLIST = [
  /^new york\b/i,
  /^the city\b/i,
  /^the mayor\b/i,
  /^the city of new york$/i,
  /^new york city$/i,
  // generic descriptor venues like "an early childhood education center"
  /^(an?|the)\s+[a-z]/,
  // bare common nouns starting lowercase
  /^[a-z]/,
  // wrapping titles up to "Honors" / "Today" / verbs
  /^honors\b/i,
  /^today,?\s/i,
];

function extractVenue(text, title) {
  // Title FIRST — most reliable. Then NEW YORK lead. Then full text.
  const newYorkIdx = text.indexOf('NEW YORK');
  const lead = newYorkIdx >= 0 ? text.slice(newYorkIdx, newYorkIdx + 3500) : text.slice(0, 3500);
  const haystacks = [title || '', lead, text.slice(0, 5000)];
  for (const hay of haystacks) {
    if (!hay) continue;
    for (const [p, vIdx, bIdx] of VENUE_PATTERNS) {
      const m = hay.match(p);
      if (!m) continue;
      let venue = (m[vIdx] || '').trim().replace(/\s+/g, ' ');
      venue = venue.replace(/\s+(today|on\s+\w+day|where|to\s+(deliver|announce|sign))$/i, '');
      venue = venue.replace(/[,;:]\s*$/, '');
      // strip trailing administrative/affiliation tail like "of the Nazarene" — keep church/center suffixes
      // (no-op — leave it; geocoder handles these well)
      if (VENUE_BLOCKLIST.some(b => b.test(venue))) continue;
      if (venue.length < 4 || venue.length > 100) continue;
      // require at least 2 capitalized words OR a proper-noun NYC neighborhood
      const titleWords = venue.split(/\s+/).filter(w => /^[A-Z]/.test(w));
      if (titleWords.length < 2 && !/(Harlem|Astoria|Bushwick|Williamsburg|Flatbush|Brownsville|Soundview|Flushing|Jamaica|Rockaway|Inwood|Tribeca|SoHo|Chinatown|Bronx|Brooklyn|Queens|Manhattan|Staten Island)/i.test(venue)) continue;
      const borough = bIdx ? canonBorough(m[bIdx]) : null;
      return { venue, borough };
    }
  }
  return null;
}

function canonBorough(s) {
  const k = s.replace(/^the\s+/i, '').toLowerCase().trim();
  const map = { manhattan:'Manhattan', brooklyn:'Brooklyn', queens:'Queens', bronx:'Bronx', 'staten island':'Staten Island' };
  return map[k] || null;
}

// ────────────────────────────────────────────────────────────────────
// geocode
// ────────────────────────────────────────────────────────────────────

async function geocode(query, hint = {}) {
  if (!MAPBOX_TOKEN) throw new Error('MAPBOX_TOKEN env var required');
  // Augment query with borough/neighborhood when known — this dramatically
  // improves disambiguation for short or ambiguous venue names (e.g. "WNYC",
  // "La Marqueta", "Gracie Mansion") that otherwise match random street names.
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
  if (!f) return null;
  if ((f.relevance || 0) < 0.6) return null;   // require a confident match
  const [lng, lat] = f.center;
  const ctx = f.context || [];
  let borough = null;
  for (const c of ctx) {
    const text = c.text || '';
    if (BOROUGHS.includes(text)) { borough = text; break; }
  }
  // require either a borough in context OR a POI / address (not just a generic place)
  const isSpecific = !!borough || ['address', 'poi'].some(t => (f.place_type || []).includes(t));
  if (!isSpecific && !['neighborhood'].some(t => (f.place_type || []).includes(t))) return null;
  return { lng, lat, borough, address: f.place_name, relevance: f.relevance, place_type: f.place_type };
}

// ────────────────────────────────────────────────────────────────────
// main
// ────────────────────────────────────────────────────────────────────

async function loadManualOverrides() {
  try {
    const txt = await readFile(MANUAL, 'utf8');
    const data = JSON.parse(txt);
    return Array.isArray(data.events) ? data.events : [];
  } catch { return []; }
}

async function loadExistingEvents() {
  try {
    const txt = await readFile(OUT, 'utf8');
    const data = JSON.parse(txt);
    return Array.isArray(data.events) ? data.events : [];
  } catch { return []; }
}

// Pre-filter: titles that almost never describe a physical event the Mayor was at.
// Skipping these saves a Claude call apiece. Conservative — we'd rather call
// Claude on a borderline case than skip a real event.
function isLikelyNotAVenueEvent(title) {
  const t = title.toLowerCase();
  // hard skips — by definition no venue
  if (/executive\s+order|proclamation/.test(t)) return true;
  // "Mayor Mamdani Releases ..." / "... Unveils ..." with policy/plan/report words
  if (/^mayor\s+\w+\s+(releases?|unveils?|publishes?|issues?)\s+(preliminary|new|updated|annual|first|the)?\s*(plan|report|measure|guidance|memo|directive|framework|strategy|budget|forecast)/.test(t)) return true;
  // "Statement from Mayor ..." / "Statement on ..."
  if (/^statement\s+(from|by|on|of)/.test(t)) return true;
  // "Mamdani Administration Announces X" without place words
  if (/^mamdani\s+administration\s+(announces?|releases?|publishes?)/.test(t) && !/(at|in|opens?|launches?|breaks\s+ground)/.test(t)) return true;
  return false;
}

async function main() {
  console.log(`[scrape] ${new Date().toISOString()} starting…`);
  console.log(`[scrape] limit=${LIMIT} since-days=${SINCE_DAYS} extractor=${ANTHROPIC_KEY ? 'claude-haiku-4-5+regex-fallback' : 'regex-only'}`);

  const urls = await discoverUrls();
  console.log(`[scrape] sitemap → ${urls.length} candidate URLs`);

  // sort by date in URL desc, take the most recent N within window
  const sinceMs = Date.now() - SINCE_DAYS * 86400_000;
  const cutoffYM = (() => { const d = new Date(sinceMs); return d.getFullYear()*100 + (d.getMonth()+1); })();
  const recent = urls
    .map(u => ({ url: u, key: dateFromUrl(u) }))
    .filter(x => x.key)
    .filter(x => (x.key.yyyy*100 + x.key.mm) >= cutoffYM)
    .sort((a, b) => (b.key.yyyy - a.key.yyyy) || (b.key.mm - a.key.mm) || (b.url.localeCompare(a.url)))
    .slice(0, LIMIT);

  // Incremental: load existing events.json + remember which URLs we've already
  // resolved to an event AND which we've judged "not present" (skipped). Both
  // sets exit fast and avoid Claude calls. Persisted skip list lives in
  // mamdani/skip-cache.json so we don't re-call Claude on the same dud URLs.
  const existing = await loadExistingEvents();
  const knownUrls = new Set(existing.map(e => e.source_url).filter(Boolean));
  let skipCache = new Set();
  try {
    const skipTxt = await readFile(resolve(REPO_ROOT, 'mamdani', 'skip-cache.json'), 'utf8');
    const parsed = JSON.parse(skipTxt);
    if (Array.isArray(parsed.urls)) skipCache = new Set(parsed.urls);
  } catch {}
  const newRecent = recent.filter(x => !knownUrls.has(x.url) && !skipCache.has(x.url));
  console.log(`[scrape] ${recent.length} candidates → ${existing.length} already extracted, ${skipCache.size} previously skipped → ${newRecent.length} to process`);

  const events = [];
  let skipped = 0, parseFails = 0, geoFails = 0, claudeFails = 0, notPresent = 0, prefiltered = 0;
  let cacheReads = 0, cacheCreates = 0, llmIn = 0, llmOut = 0;
  const newSkips = [];

  for (const { url, key } of newRecent) {
    let html;
    try { html = await fetchText(url); }
    catch (e) { console.warn(`[scrape] fetch fail: ${url} (${e.message})`); skipped++; continue; }

    const text  = stripHtml(html);
    const title = extractTitle(html);
    const date  = extractDate(text, key);
    if (!title || !date) { console.warn(`[scrape] no title/date: ${url}`); skipped++; continue; }

    // pre-filter — skip titles that almost never have a venue.
    // Saves a Claude call apiece.
    if (isLikelyNotAVenueEvent(title)) { prefiltered++; newSkips.push(url); continue; }

    // Primary: Claude Haiku 4.5. Fallback: regex.
    let venueHit = null;
    let kind = null;
    let neighborhood = null;
    if (ANTHROPIC_KEY) {
      try {
        const c = await extractVenueWithClaude(title, text);
        if (c?._usage) {
          llmIn += c._usage.input || 0;
          llmOut += c._usage.output || 0;
          cacheReads += c._usage.cache_read || 0;
          cacheCreates += c._usage.cache_create || 0;
        }
        if (!c) {
          // empty response — fall through to regex
        } else if (c.was_physically_present === false) {
          notPresent++;
          newSkips.push(url);   // remember so we don't re-call Claude on it next run
          // pace ourselves — Claude succeeded but said skip
          await sleep(2500);
          continue;
        } else if (c.venue || c.neighborhood) {
          venueHit = {
            venue: c.venue || c.neighborhood,
            borough: c.borough || null,
          };
          neighborhood = c.neighborhood || null;
          kind = c.kind || null;
        }
      } catch (e) {
        console.warn(`[claude] error on ${url}: ${e.message} — falling back to regex`);
        claudeFails++;
      }
      // pace ourselves under the 50K input-tokens-per-minute org cap
      await sleep(2500);
    }
    if (!venueHit) {
      const r = extractVenue(text, title);
      if (!r) { parseFails++; continue; }
      venueHit = r;
    }

    const geo = await geocode(venueHit.venue, { neighborhood, borough: venueHit.borough });
    if (!geo) { geoFails++; continue; }

    const start = isoNoon(date);
    const id = sha(`${start}|${venueHit.venue}`);
    const eventName = title.replace(/^Transcript:\s*/i, '').replace(/\s+/g, ' ').trim();
    events.push({
      id,
      event_name: eventName,
      venue: venueHit.venue,
      address: geo.address,
      lat: geo.lat,
      lng: geo.lng,
      borough: venueHit.borough || geo.borough || null,
      kind: kind || classifyKind(title, text),
      start,
      end: plusHour(start),
      source_url: url,
      source: "NYC Mayor's Office press release",
    });
  }

  console.log(`[scrape] parsed=${events.length}  pre-filtered=${prefiltered}  not-present=${notPresent}  parse-fails=${parseFails}  geo-fails=${geoFails}  claude-fails=${claudeFails}  skipped=${skipped}`);
  if (ANTHROPIC_KEY) {
    const costIn = (llmIn / 1_000_000) * 1.0;     // Haiku 4.5: $1/M input
    const costOut = (llmOut / 1_000_000) * 5.0;   // $5/M output
    console.log(`[claude] tokens: in=${llmIn}  out=${llmOut}  cache-read=${cacheReads}  cache-create=${cacheCreates}  ≈ $${(costIn + costOut).toFixed(4)} this run`);
  }

  // Persist skip cache so future runs don't re-evaluate URLs we've decided
  // are not venue events. New URLs append; old ones stay.
  if (newSkips.length) {
    const merged = Array.from(new Set([...skipCache, ...newSkips]));
    await writeFile(
      resolve(REPO_ROOT, 'mamdani', 'skip-cache.json'),
      JSON.stringify({ updated_at: new Date().toISOString(), urls: merged.sort() }, null, 2) + '\n',
      'utf8',
    );
    console.log(`[scrape] skip-cache: +${newSkips.length} → ${merged.length} total`);
  }

  // Merge new events with existing (existing wins on collision — we only
  // re-scrape URLs that weren't already in events.json, but be safe).
  const allEventsByUrl = new Map();
  for (const e of existing) allEventsByUrl.set(e.source_url || e.id, e);
  for (const e of events)   allEventsByUrl.set(e.source_url || e.id, e);
  const allEvents = Array.from(allEventsByUrl.values());

  // merge in manual overrides (manual wins)
  const manual = await loadManualOverrides();
  const byId = new Map(allEvents.map(e => [e.id, e]));
  for (const m of manual) {
    const id = m.id || sha(`${m.start}|${m.venue}`);
    byId.set(id, { ...m, id });
  }
  const merged = Array.from(byId.values()).sort((a, b) => a.start.localeCompare(b.start));

  if (!merged.length) {
    console.error('[scrape] no events parsed AND no manual overrides — refusing to overwrite events.json');
    process.exit(2);
  }

  const out = {
    $schema_note: 'Each event: id, event_name, venue, address, lat, lng, borough, kind, start (ISO 8601 with NY offset), end (ISO), source_url, source. Time zone is America/New_York. Default time = noon when only the date is known.',
    updated_at: new Date().toISOString(),
    source_url: 'https://www.nyc.gov/mayors-office/news',
    scraper_status: 'ok',
    events: merged,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`[scrape] wrote ${merged.length} event(s) to ${OUT}`);
}

main().catch(e => { console.error('[scrape] FAILED:', e); process.exit(1); });
