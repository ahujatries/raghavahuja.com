/* ─────────────────────────────────────────────────────────────────────
   hot · cold — moodpiece for raghavahuja.com/lab
   Standalone vanilla JS. Mapbox GL for the world locator.
   Data is the v1 fixture (cron + cached JSON ships next).
   ───────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';

  const MAPBOX_TOKEN =
    'pk.eyJ1Ijoid29qb2RhZGR5IiwiYSI6ImNtYW9zeWZkbjA4YXcyaW9mbG56c3hxY2cifQ.aFUlT5rtR2z09x0-7qDoIg';

  // ───────────────────────────────────────────────────────────────────
  // data — same fixture as the design canvas. Per region: hot + cold,
  // each with extreme location + nearest watchable feed + sparkline +
  // all-time record.
  // ───────────────────────────────────────────────────────────────────
  const REGIONS = [
    {
      id: 'world', label: 'world', headline: 'the world',
      bbox: [-180, -85, 180, 85],
      hot: {
        extreme: { name: 'Lut Desert', region: 'Kerman, Iran', lat: 30.78, lon: 59.32, tempC: 54.1 },
        sparkline: [49.8, 50.4, 51.1, 52.0, 52.7, 53.2, 53.6, 53.9, 54.0, 54.1, 54.0, 53.8],
        record: { value: 56.7, place: 'Furnace Creek, Death Valley, CA', year: 1913 },
      },
      cold: {
        extreme: { name: 'Vostok Station vicinity', region: 'East Antarctic Plateau', lat: -78.46, lon: 106.84, tempC: -71.4 },
        sparkline: [-69.2, -69.8, -70.1, -70.4, -70.6, -70.9, -71.0, -71.1, -71.2, -71.3, -71.4, -71.4],
        record: { value: -89.2, place: 'Vostok Station, Antarctica', year: 1983 },
      },
    },
    {
      id: 'africa', label: 'africa', headline: 'africa',
      bbox: [-20, -38, 55, 38],
      hot: {
        extreme: { name: 'Dallol Depression', region: 'Afar, Ethiopia', lat: 14.24, lon: 40.30, tempC: 47.8 },
        feed:    { kind: 'youtube', title: 'Djibouti Port — Gulf of Tadjoura', provider: 'YouTube Live · @portdejibouti', lat: 11.59, lon: 43.14, bearing: 'E', distanceKm: 360, localTime: '16:42', conditionsC: 36 },
        sparkline: [42.1, 43.4, 44.2, 45.1, 46.0, 46.7, 47.2, 47.5, 47.7, 47.8, 47.7, 47.4],
        record: { value: 55.0, place: 'Kebili, Tunisia', year: 1931 },
      },
      cold: {
        extreme: { name: 'Mt. Stanley summit', region: 'Rwenzori, Uganda/DRC', lat: 0.39, lon: 29.87, tempC: -6.4 },
        feed:    { kind: 'windy', title: 'Kasese — Rwenzori foothills', provider: 'Windy Webcams · UG/Kasese', lat: 0.18, lon: 30.08, bearing: 'SE', distanceKm: 32, localTime: '17:00', conditionsC: 19 },
        sparkline: [-3.1, -3.8, -4.2, -4.7, -5.1, -5.4, -5.7, -5.9, -6.1, -6.3, -6.4, -6.4],
        record: { value: -23.9, place: 'Ifrane, Morocco', year: 1935 },
      },
    },
    {
      id: 'asia', label: 'asia', headline: 'asia',
      bbox: [25, -10, 180, 78],
      hot: {
        extreme: { name: 'Lut Desert', region: 'Kerman, Iran', lat: 30.78, lon: 59.32, tempC: 54.1 },
        feed:    { kind: 'youtube', title: 'Bandar Abbas — Persian Gulf coast', provider: 'YouTube Live · @persiangulflive', lat: 27.18, lon: 56.27, bearing: 'SW', distanceKm: 480, localTime: '17:12', conditionsC: 38 },
        sparkline: [49.8, 50.4, 51.1, 52.0, 52.7, 53.2, 53.6, 53.9, 54.0, 54.1, 54.0, 53.8],
        record: { value: 54.0, place: 'Tirat Zvi, Israel', year: 1942 },
      },
      cold: {
        extreme: { name: 'Oymyakon plateau', region: 'Sakha Republic, Russia', lat: 63.46, lon: 142.79, tempC: -52.7 },
        feed:    { kind: 'windy', title: 'Yakutsk — Lena river embankment', provider: 'Windy Webcams · RU/Yakutsk', lat: 62.03, lon: 129.73, bearing: 'W', distanceKm: 720, localTime: '02:42', conditionsC: -41 },
        sparkline: [-48.4, -49.2, -49.8, -50.4, -50.9, -51.4, -51.8, -52.1, -52.3, -52.5, -52.7, -52.7],
        record: { value: -67.7, place: 'Verkhoyansk, Russia', year: 1892 },
      },
    },
    {
      id: 'europe', label: 'europe', headline: 'europe',
      bbox: [-25, 34, 45, 71],
      hot: {
        extreme: { name: 'Sicily interior', region: 'Catania, Italy', lat: 37.46, lon: 14.62, tempC: 41.2 },
        feed:    { kind: 'youtube', title: 'Catania — Piazza del Duomo', provider: 'YouTube Live · @cataniacam', lat: 37.50, lon: 15.09, bearing: 'E', distanceKm: 42, localTime: '16:42', conditionsC: 39 },
        sparkline: [37.1, 37.8, 38.4, 39.0, 39.5, 40.0, 40.4, 40.7, 40.9, 41.1, 41.2, 41.1],
        record: { value: 48.8, place: 'Floridia, Sicily', year: 2021 },
      },
      cold: {
        extreme: { name: 'Kebnekaise massif', region: 'Lapland, Sweden', lat: 67.90, lon: 18.55, tempC: -28.4 },
        feed:    { kind: 'windy', title: 'Kiruna — town square', provider: 'Windy Webcams · SE/Kiruna', lat: 67.86, lon: 20.22, bearing: 'E', distanceKm: 72, localTime: '15:42', conditionsC: -22 },
        sparkline: [-24.3, -24.9, -25.5, -26.0, -26.6, -27.0, -27.4, -27.7, -27.9, -28.2, -28.4, -28.4],
        record: { value: -52.6, place: 'Ust-Shchugor, Russia', year: 1978 },
      },
    },
    {
      id: 'na', label: 'n. america', headline: 'north america',
      bbox: [-170, 8, -50, 75],
      hot: {
        extreme: { name: 'Death Valley · Furnace Creek', region: 'California, USA', lat: 36.46, lon: -116.87, tempC: 49.6 },
        feed:    { kind: 'youtube', title: 'Las Vegas — Fremont Street', provider: 'YouTube Live · @fremontcam', lat: 36.17, lon: -115.14, bearing: 'E', distanceKm: 162, localTime: '13:42', conditionsC: 41 },
        sparkline: [45.1, 45.9, 46.6, 47.3, 47.9, 48.4, 48.8, 49.1, 49.3, 49.5, 49.6, 49.5],
        record: { value: 56.7, place: 'Furnace Creek, Death Valley', year: 1913 },
      },
      cold: {
        extreme: { name: 'Eureka, Ellesmere Is.', region: 'Nunavut, Canada', lat: 79.98, lon: -85.93, tempC: -41.2 },
        feed:    { kind: 'windy', title: 'Resolute Bay — airfield', provider: 'Windy Webcams · CA/Resolute', lat: 74.71, lon: -94.97, bearing: 'S', distanceKm: 640, localTime: '08:42', conditionsC: -34 },
        sparkline: [-37.2, -37.9, -38.5, -39.0, -39.5, -39.9, -40.3, -40.6, -40.8, -41.0, -41.2, -41.2],
        record: { value: -63.0, place: 'Snag, Yukon', year: 1947 },
      },
    },
    {
      id: 'sa', label: 's. america', headline: 'south america',
      bbox: [-82, -56, -34, 13],
      hot: {
        extreme: { name: 'Gran Chaco', region: 'Salta, Argentina', lat: -22.10, lon: -62.85, tempC: 43.7 },
        feed:    { kind: 'youtube', title: 'Asunción — Costanera', provider: 'YouTube Live · @asuncioncam', lat: -25.27, lon: -57.61, bearing: 'SE', distanceKm: 590, localTime: '11:42', conditionsC: 35 },
        sparkline: [39.4, 40.1, 40.7, 41.3, 41.9, 42.4, 42.8, 43.1, 43.3, 43.5, 43.7, 43.6],
        record: { value: 48.9, place: 'Rivadavia, Argentina', year: 1905 },
      },
      cold: {
        extreme: { name: 'Altiplano · Sajama', region: 'Oruro, Bolivia', lat: -18.10, lon: -68.88, tempC: -19.4 },
        feed:    { kind: 'windy', title: 'La Paz — El Alto overlook', provider: 'Windy Webcams · BO/La Paz', lat: -16.50, lon: -68.15, bearing: 'NE', distanceKm: 195, localTime: '11:42', conditionsC: -8 },
        sparkline: [-15.7, -16.3, -16.9, -17.4, -17.8, -18.2, -18.5, -18.8, -19.0, -19.2, -19.4, -19.4],
        record: { value: -33.0, place: 'Sarmiento, Argentina', year: 1907 },
      },
    },
    {
      id: 'oceania', label: 'oceania', headline: 'oceania',
      bbox: [110, -50, 180, 0],
      hot: {
        extreme: { name: 'Marble Bar', region: 'Pilbara, Australia', lat: -21.18, lon: 119.74, tempC: 45.3 },
        feed:    { kind: 'youtube', title: 'Port Hedland — harbour', provider: 'YouTube Live · @porthedlandcam', lat: -20.31, lon: 118.60, bearing: 'NW', distanceKm: 150, localTime: '21:42', conditionsC: 38 },
        sparkline: [40.8, 41.6, 42.3, 43.0, 43.6, 44.1, 44.6, 44.9, 45.1, 45.2, 45.3, 45.2],
        record: { value: 50.7, place: 'Oodnadatta, S. Australia', year: 1960 },
      },
      cold: {
        extreme: { name: 'Mt. Cook · Aoraki', region: 'Southern Alps, NZ', lat: -43.59, lon: 170.14, tempC: -16.2 },
        feed:    { kind: 'windy', title: 'Aoraki Village — Hermitage view', provider: 'Windy Webcams · NZ/Aoraki', lat: -43.73, lon: 170.10, bearing: 'S', distanceKm: 16, localTime: '01:42', conditionsC: -3 },
        sparkline: [-12.6, -13.1, -13.6, -14.1, -14.5, -14.9, -15.3, -15.6, -15.8, -16.0, -16.2, -16.2],
        record: { value: -25.6, place: 'Ranfurly, NZ', year: 1903 },
      },
    },
    {
      id: 'antarctica', label: 'antarctica', headline: 'antarctica',
      bbox: [-180, -90, 180, -60],
      hot: {
        extreme: { name: 'Esperanza Base vicinity', region: 'Antarctic Peninsula', lat: -63.40, lon: -56.99, tempC: 6.2 },
        feed:    { kind: 'youtube', title: 'Ushuaia — Beagle Channel', provider: 'YouTube Live · @ushuaiacam', lat: -54.81, lon: -68.30, bearing: 'NW', distanceKm: 1180, localTime: '10:42', conditionsC: 7 },
        sparkline: [3.4, 3.9, 4.3, 4.7, 5.0, 5.3, 5.6, 5.8, 6.0, 6.1, 6.2, 6.1],
        record: { value: 18.3, place: 'Esperanza Base', year: 2020 },
      },
      cold: {
        extreme: { name: 'Vostok Station vicinity', region: 'East Antarctic Plateau', lat: -78.46, lon: 106.84, tempC: -71.4 },
        feed:    { kind: 'windy', title: 'Concordia — Dome C webcam', provider: 'Windy Webcams · IT/FR Concordia base', lat: -75.10, lon: 123.33, bearing: 'NE', distanceKm: 560, localTime: '21:42', conditionsC: -64 },
        sparkline: [-69.2, -69.8, -70.1, -70.4, -70.6, -70.9, -71.0, -71.1, -71.2, -71.3, -71.4, -71.4],
        record: { value: -89.2, place: 'Vostok Station, Antarctica', year: 1983 },
      },
    },
  ];

  // ───────────────────────────────────────────────────────────────────
  // state
  // ───────────────────────────────────────────────────────────────────
  const state = {
    units: 'C',
    regionIdx: 0,
    autoCycle: false,
    cycleTimer: null,
    map: null,
    markers: [],
    routeLayerIds: [],
    // live data — populated by fetchLiveData(). Falls back to embedded fixture
    // (REGIONS) on any failure so the page never breaks.
    regions: REGIONS,
    refreshedAt: '2026-04-28T13:42:00Z',
    // ledger entries — populated by fetchHistoryAndRenderLedger
    history: null,
  };

  // ───────────────────────────────────────────────────────────────────
  // helpers
  // ───────────────────────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const cToF = (c) => c * 9 / 5 + 32;
  function fmtTemp(c, units) {
    const v = units === 'F' ? cToF(c) : c;
    const sign = v > 0 ? '' : v < 0 ? '−' : '';
    const mag = Math.abs(v).toFixed(1);
    return { sign, mag, unit: units === 'F' ? '°F' : '°C', display: `${sign}${mag}${units === 'F' ? '°F' : '°C'}` };
  }
  function fmtDist(km, units) {
    return units === 'F' ? `${Math.round(km * 0.621371)} mi` : `${km} km`;
  }
  function updatedAgo(iso) {
    const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 60) return `${mins} min ago`;
    const h = Math.floor(mins / 60);
    return `${h}h ${mins % 60}m ago`;
  }
  const region = () => state.regions[state.regionIdx];

  // ───────────────────────────────────────────────────────────────────
  // ledger — fetch /hot-cold/history.json (written by the daily roll-up)
  // and render as a tabular receipt below the moodpiece. One row per day,
  // newest first. Fails silently if the file isn't there yet.
  // ───────────────────────────────────────────────────────────────────
  async function fetchHistoryAndRenderLedger() {
    try {
      const res = await fetch('/hot-cold/history.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const j = await res.json();
      if (!Array.isArray(j?.entries) || j.entries.length === 0) throw new Error('empty');
      state.history = j.entries;
      renderLedger(j.entries);
    } catch (e) {
      const empty = document.getElementById('hc-ledger-empty');
      if (empty) empty.textContent = 'no entries yet — first roll-up runs tonight at 02:00 UTC';
    }
  }

  function fmtLedgerDate(iso) {
    // iso = "2026-04-28" → "apr 28"
    const m = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const d = new Date(iso + 'T00:00:00Z');
    return `${m[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2,'0')}`;
  }

  function renderLedger(entries) {
    // YTD records — for the star marker + stat panel
    let ytdHot = entries[0].hot, ytdCold = entries[0].cold;
    let ytdHotDate = entries[0].date, ytdColdDate = entries[0].date;
    for (const e of entries) {
      if (e.hot.tempC  > ytdHot.tempC)  { ytdHot  = e.hot;  ytdHotDate  = e.date; }
      if (e.cold.tempC < ytdCold.tempC) { ytdCold = e.cold; ytdColdDate = e.date; }
    }

    // stat panel
    const stats = document.querySelectorAll('.hc-ledger-stat');
    if (stats.length === 3) {
      stats[0].querySelector('.n').textContent = entries.length;
      const ytdHotFmt = fmtTemp(ytdHot.tempC, state.units);
      stats[1].querySelector('.n').textContent = `${ytdHotFmt.sign}${ytdHotFmt.mag}${ytdHotFmt.unit}`;
      stats[1].querySelector('[data-stat="ytd-hot-meta"]').textContent = `${ytdHot.name.toLowerCase()} · ${fmtLedgerDate(ytdHotDate)}`;
      const ytdColdFmt = fmtTemp(ytdCold.tempC, state.units);
      stats[2].querySelector('.n').textContent = `${ytdColdFmt.sign}${ytdColdFmt.mag}${ytdColdFmt.unit}`;
      stats[2].querySelector('[data-stat="ytd-cold-meta"]').textContent = `${ytdCold.name.toLowerCase()} · ${fmtLedgerDate(ytdColdDate)}`;
    }

    // table rows
    const today = new Date().toISOString().slice(0,10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    const rows = entries.map(e => {
      const hot = fmtTemp(e.hot.tempC, state.units);
      const cold = fmtTemp(e.cold.tempC, state.units);
      const isYtdHot  = e.date === ytdHotDate;
      const isYtdCold = e.date === ytdColdDate;
      const isToday = e.date === yesterday; // newest entry is yesterday's roll-up
      return `
        <div class="hc-ledger-row" role="row">
          <div class="hc-ledger-date${isToday ? ' is-today' : ''}">${fmtLedgerDate(e.date)}</div>
          <div class="hc-ledger-place">${e.hot.name}</div>
          <div class="hc-ledger-temp-col hc-ledger-hot-temp">${hot.sign}${hot.mag}°${isYtdHot ? '<span class="hc-ledger-star" title="YTD record">★</span>' : ''}</div>
          <div class="hc-ledger-place">${e.cold.name}</div>
          <div class="hc-ledger-temp-col hc-ledger-cold-temp">${cold.sign}${cold.mag}°${isYtdCold ? '<span class="hc-ledger-star" title="YTD record">★</span>' : ''}</div>
        </div>
      `;
    }).join('');

    const table = document.getElementById('hc-ledger-table');
    // wipe any previous data rows but keep the header row
    [...table.querySelectorAll('.hc-ledger-row:not(.hc-ledger-head-row)')].forEach(r => r.remove());
    const empty = document.getElementById('hc-ledger-empty');
    if (empty) empty.remove();
    table.insertAdjacentHTML('beforeend', rows);
    table.setAttribute('aria-rowcount', entries.length + 1);
  }

  // ───────────────────────────────────────────────────────────────────
  // live data — fetch /hot-cold/data.json (written by the cron). On any
  // failure we keep the embedded fixture; UI never breaks.
  // ───────────────────────────────────────────────────────────────────
  async function fetchLiveData() {
    try {
      const res = await fetch('/hot-cold/data.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const j = await res.json();
      if (!Array.isArray(j?.regions) || j.regions.length === 0) throw new Error('bad shape');
      state.regions = j.regions;
      state.refreshedAt = j.updatedAt || state.refreshedAt;
      // keep current region index in bounds (live data has same 8 regions)
      state.regionIdx = Math.min(state.regionIdx, state.regions.length - 1);
      render();
    } catch (e) {
      console.warn('[hot-cold] live data unavailable, using embedded fixture:', e.message);
    }
  }

  // ───────────────────────────────────────────────────────────────────
  // sparkline · inline svg
  // ───────────────────────────────────────────────────────────────────
  function renderSpark(side, data) {
    const W = 200, H = 32;
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return [x, y];
    });
    const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    const stroke = side === 'hot' ? 'var(--hot)' : 'var(--cold)';
    const fill = side === 'hot' ? 'var(--hot-soft)' : 'var(--cold-soft)';
    const hi = fmtTemp(max, state.units);
    const lo = fmtTemp(min, state.units);
    return `
      <svg width="${W}" height="${H}" style="overflow:visible">
        <path d="${path} L${W},${H} L0,${H} Z" fill="${fill}" />
        <path d="${path}" fill="none" stroke="${stroke}" stroke-width="1.25" />
        <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${stroke}" />
      </svg>
      <div class="hc-spark-meta">
        last 24h<br>
        <span style="color:${stroke}">hi ${hi.sign}${hi.mag}°</span> · lo ${lo.sign}${lo.mag}°
      </div>
    `;
  }

  // ───────────────────────────────────────────────────────────────────
  // shimmer / snow svg fills · static, no DOM churn
  // ───────────────────────────────────────────────────────────────────
  function paintShimmer() {
    const svg = $('.hc-shimmer');
    let html = '';
    for (let i = 0; i < 18; i++) {
      const x = (i * 6) % 100;
      const y = 62 + (i % 6);
      const dur = 3 + (i % 4);
      const dur2 = 4 + (i % 5);
      html += `<rect x="${x}" y="${y}" width="11" height="0.6" fill="#ffd9a8">
        <animate attributeName="x" values="${x}; ${x - 4}; ${x}" dur="${dur}s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.2;0.7;0.2" dur="${dur2}s" repeatCount="indefinite" />
      </rect>`;
    }
    svg.innerHTML = html;
  }
  function paintSnow() {
    const svg = $('.hc-snow');
    let html = '';
    for (let i = 0; i < 60; i++) {
      const x = (i * 17) % 100;
      const r = 0.25 + ((i * 7) % 10) / 22;
      const dur = 6 + ((i * 11) % 10);
      const delay = -((i * 3) % 14);
      html += `<circle cx="${x}" r="${r.toFixed(2)}" fill="#f4f8ff">
        <animate attributeName="cy" values="-5;110" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" />
        <animate attributeName="cx" values="${x};${x + 2};${x - 1};${x}" dur="${dur}s" begin="${delay}s" repeatCount="indefinite" />
      </circle>`;
    }
    svg.innerHTML = html;
  }

  // ───────────────────────────────────────────────────────────────────
  // mapbox — real map, lives inside the locator card.
  // Hot pair: hollow circle (extreme) + filled (feed), connected by dashed line.
  // ───────────────────────────────────────────────────────────────────
  function initMap() {
    if (!window.mapboxgl) {
      console.error('mapbox-gl not loaded');
      return;
    }
    mapboxgl.accessToken = MAPBOX_TOKEN;
    state.map = new mapboxgl.Map({
      container: 'hc-map',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [0, 20],
      zoom: 0.4,
      attributionControl: { compact: true },
      projection: 'mercator',
      cooperativeGestures: false,
    });
    state.map.scrollZoom.disable();
    state.map.dragRotate.disable();
    state.map.touchZoomRotate.disableRotation();

    state.map.on('load', () => paintMap());
  }

  function clearMap() {
    state.markers.forEach(m => m.remove());
    state.markers = [];
    state.routeLayerIds.forEach(id => {
      if (state.map.getLayer(id)) state.map.removeLayer(id);
      if (state.map.getSource(id)) state.map.removeSource(id);
    });
    state.routeLayerIds = [];
  }

  function addExtreme(side, ext) {
    // hollow ring marker · the extreme itself
    const extEl = document.createElement('div');
    extEl.className = `hc-mk hc-mk-extreme hc-mk-${side}`;
    extEl.title = `${ext.name} · ${fmtTemp(ext.tempC, state.units).display}`;
    state.markers.push(
      new mapboxgl.Marker({ element: extEl, anchor: 'center' })
        .setLngLat([ext.lon, ext.lat])
        .addTo(state.map)
    );
  }

  function paintMap() {
    if (!state.map || !state.map.isStyleLoaded()) {
      state.map?.once('load', paintMap);
      return;
    }
    clearMap();
    const r = region();
    addExtreme('hot',  r.hot.extreme);
    addExtreme('cold', r.cold.extreme);

    // fit bounds: include both extremes + region bbox so we always have geographic context
    const [w, s, e, n] = r.bbox;
    const bounds = new mapboxgl.LngLatBounds([w, s], [e, n]);
    [r.hot.extreme, r.cold.extreme].forEach(p => bounds.extend([p.lon, p.lat]));
    state.map.fitBounds(bounds, {
      padding: { top: 24, bottom: 24, left: 24, right: 24 },
      duration: 700,
      maxZoom: r.id === 'world' ? 1.6 : 4,
    });
  }

  // ───────────────────────────────────────────────────────────────────
  // render — temps, places, meta, ribbon. Soft fade on swap.
  // ───────────────────────────────────────────────────────────────────
  function fadeSwap(els, mutate) {
    els.forEach(el => el.classList.add('is-swap'));
    setTimeout(() => {
      mutate();
      els.forEach(el => el.classList.remove('is-swap'));
    }, 180);
  }

  function render() {
    const r = region();
    const u = state.units;

    // refreshed stamp
    $('#hc-refreshed').textContent = updatedAgo(state.refreshedAt);

    // ribbons — "hottest place in [region]" / "coldest place in [region]"
    // animate just the region span so the ribbon doesn't reflow
    const hotRegionEl = $('#hc-hot-ribbon').querySelector('.hc-ribbon-region');
    const coldRegionEl = $('#hc-cold-ribbon').querySelector('.hc-ribbon-region');
    fadeSwap([hotRegionEl, coldRegionEl], () => {
      hotRegionEl.textContent = r.headline;
      coldRegionEl.textContent = r.headline;
    });

    // hot side
    const ht = fmtTemp(r.hot.extreme.tempC, u);
    const hotMag = $('#hc-hot-mag');
    const hotPlace = $('#hc-hot-place');
    fadeSwap([hotMag, hotPlace], () => {
      hotMag.textContent = `${ht.sign}${ht.mag}`;
      hotPlace.textContent = r.hot.extreme.name;
    });
    $('#hc-hot-unit').textContent = ht.unit;
    $('#hc-hot-coords').textContent = `${r.hot.extreme.region} · ${r.hot.extreme.lat.toFixed(2)}°, ${r.hot.extreme.lon.toFixed(2)}°`;
    $('#hc-hot-spark').innerHTML = renderSpark('hot', r.hot.sparkline);

    // cold side
    const ct = fmtTemp(r.cold.extreme.tempC, u);
    const coldMag = $('#hc-cold-mag');
    const coldPlace = $('#hc-cold-place');
    fadeSwap([coldMag, coldPlace], () => {
      coldMag.textContent = `${ct.sign}${ct.mag}`;
      coldPlace.textContent = r.cold.extreme.name;
    });
    $('#hc-cold-unit').textContent = ct.unit;
    $('#hc-cold-coords').textContent = `${r.cold.extreme.region} · ${r.cold.extreme.lat.toFixed(2)}°, ${r.cold.extreme.lon.toFixed(2)}°`;
    $('#hc-cold-spark').innerHTML = renderSpark('cold', r.cold.sparkline);

    // locator chrome
    $('#hc-region-label').textContent = r.label;
    $('#hc-loc-hot').textContent =
      `${r.hot.extreme.name.toLowerCase()} · ${ht.sign}${ht.mag}${ht.unit.toLowerCase()}`;
    $('#hc-loc-cold').textContent =
      `${r.cold.extreme.name.toLowerCase()} · ${ct.sign}${ct.mag}${ct.unit.toLowerCase()}`;

    // bottom records
    const hRec = fmtTemp(r.hot.record.value, u);
    const cRec = fmtTemp(r.cold.record.value, u);
    $('#hc-rec-hot').textContent = `${hRec.sign}${hRec.mag}${hRec.unit} · ${r.hot.record.place.toLowerCase()} · ${r.hot.record.year}`;
    $('#hc-rec-cold').textContent = `${cRec.sign}${cRec.mag}${cRec.unit} · ${r.cold.record.place.toLowerCase()} · ${r.cold.record.year}`;

    // rail dots
    const rail = $('#hc-rail');
    rail.innerHTML = state.regions.map((reg, i) =>
      `<button class="hc-rail-dot ${i === state.regionIdx ? 'is-on' : ''}" data-i="${i}" title="${reg.label}" aria-label="${reg.label}"></button>`
    ).join('');

    // map
    paintMap();
  }

  // ───────────────────────────────────────────────────────────────────
  // wiring
  // ───────────────────────────────────────────────────────────────────
  function setRegion(i) {
    const n = state.regions.length;
    state.regionIdx = ((i % n) + n) % n;
    render();
  }

  function startCycle() {
    stopCycle();
    state.cycleTimer = setInterval(() => setRegion(state.regionIdx + 1), 6000);
  }
  function stopCycle() {
    if (state.cycleTimer) {
      clearInterval(state.cycleTimer);
      state.cycleTimer = null;
    }
  }

  function bind() {
    // units
    document.querySelectorAll('.hc-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.units = btn.dataset.units;
        document.querySelectorAll('.hc-pill-btn').forEach(b => b.classList.toggle('is-on', b === btn));
        render();
        if (state.history) renderLedger(state.history);
      });
    });
    // share
    $('#hc-share').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      try {
        await navigator.clipboard.writeText(window.location.href);
        btn.textContent = '✓ copied';
        setTimeout(() => { btn.textContent = '↗ share'; }, 1400);
      } catch (e) {
        btn.textContent = window.location.href;
      }
    });
    // cycler
    $('#hc-prev').addEventListener('click', () => { stopCyclerUI(); setRegion(state.regionIdx - 1); });
    $('#hc-next').addEventListener('click', () => { stopCyclerUI(); setRegion(state.regionIdx + 1); });
    $('#hc-play').addEventListener('click', () => {
      state.autoCycle = !state.autoCycle;
      const btn = $('#hc-play');
      btn.textContent = state.autoCycle ? '❚❚' : '▶';
      btn.classList.toggle('is-on', state.autoCycle);
      if (state.autoCycle) startCycle(); else stopCycle();
    });
    // rail (event delegated)
    $('#hc-rail').addEventListener('click', (e) => {
      const dot = e.target.closest('.hc-rail-dot');
      if (!dot) return;
      stopCyclerUI();
      setRegion(parseInt(dot.dataset.i, 10));
    });
    // refresh stamp tick
    setInterval(() => {
      $('#hc-refreshed').textContent = updatedAgo(state.refreshedAt);
    }, 60000);
  }
  function stopCyclerUI() {
    if (!state.autoCycle) return;
    state.autoCycle = false;
    stopCycle();
    const btn = $('#hc-play');
    btn.textContent = '▶';
    btn.classList.remove('is-on');
  }

  // ───────────────────────────────────────────────────────────────────
  // init
  // ───────────────────────────────────────────────────────────────────
  function init() {
    paintShimmer();
    paintSnow();
    bind();
    render();
    initMap();
    fetchLiveData();
    fetchHistoryAndRenderLedger();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
