// mamdani-mapper.js — special bulletin · cartography desk
// Renders the mayor's official public schedule as a live map.
// Data: ./mamdani/events.json (refreshed hourly by GH Action)
(function () {
  'use strict';

  const MAPBOX_TOKEN = 'pk.eyJ1Ijoid29qb2RhZGR5IiwiYSI6ImNtYW9zeWZkbjA4YXcyaW9mbG56c3hxY2cifQ.aFUlT5rtR2z09x0-7qDoIg';
  const NYC_CENTER = [-73.9712, 40.7300];
  const FACE_URL = 'mamdani/zohran.png';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    events: [],
    updatedAt: null,
    sourceUrl: null,
    window: 'upcoming',  // upcoming | today | week | all — default 'upcoming'
                         // (today + next 14d) so forward events surface on load.
    mode: 'pins',     // pins | heat
    map: null,
    markers: [],
    heatLayerAdded: false,
    nowTimer: null,
    savedView: null,    // { center, zoom } saved before zooming into a popup; null when at overview
    restoreTimer: null, // pending flyback if all popups close
  };

  // ---------- data load ----------
  async function loadEvents() {
    try {
      const res = await fetch('mamdani/events.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('events ' + res.status);
      const data = await res.json();
      state.events = (data.events || []).slice().sort((a, b) => a.start.localeCompare(b.start));
      state.updatedAt = data.updated_at || null;
      state.sourceUrl = data.source_url || null;
      return data;
    } catch (e) {
      console.warn('failed to load events.json', e);
      state.events = [];
      return null;
    }
  }

  // ---------- helpers ----------
  function parseISO(s) { return new Date(s); }

  function eventStatus(ev, now = new Date()) {
    if (ev.is_forward) return 'forward';
    const start = parseISO(ev.start);
    const end = parseISO(ev.end || ev.start);
    if (now < start) return 'upcoming';
    if (now > end)   return 'past';
    return 'live';
  }

  function inWindow(ev, win, now = new Date()) {
    const start = parseISO(ev.start);
    if (win === 'all') return true;
    if (win === 'today') {
      return start.toDateString() === now.toDateString();
    }
    if (win === 'upcoming') {
      // forward events scheduled today through next 14 days
      const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
      const fourteenAhead = new Date(startOfToday); fourteenAhead.setDate(startOfToday.getDate() + 14);
      return start >= startOfToday && start <= fourteenAhead;
    }
    if (win === 'week') {
      // Rolling 7 days back from now — more forgiving than Mon-Sun, since the
      // press feed lags ~1-3 days behind events. A Mon-Sun window leaves the
      // map empty every Monday morning.
      const sevenAgo = new Date(now); sevenAgo.setDate(now.getDate() - 7);
      sevenAgo.setHours(0, 0, 0, 0);
      return start >= sevenAgo && start <= now;
    }
    return true;
  }

  function fmtTime(iso) {
    return new Date(iso).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit',
    }).toLowerCase().replace(' ', '');
  }
  function fmtDay(iso) {
    return new Date(iso).toLocaleDateString('en-US', {
      timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric',
    });
  }
  function fmtRel(iso) {
    if (!iso) return '—';
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60)    return Math.max(1, Math.floor(d)) + 's ago';
    if (d < 3600)  return Math.floor(d / 60) + 'm ago';
    if (d < 86400) return Math.floor(d / 3600) + 'h ago';
    return Math.floor(d / 86400) + 'd ago';
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  // ---------- map ----------
  function initMap() {
    if (!window.mapboxgl) {
      console.error('mapbox-gl not loaded');
      return;
    }
    mapboxgl.accessToken = MAPBOX_TOKEN;
    state.map = new mapboxgl.Map({
      container: 'mm-map',
      style: 'mapbox://styles/mapbox/dark-v11',
      center: NYC_CENTER,
      zoom: 10.4,
      attributionControl: { compact: true },
      cooperativeGestures: false,
    });
    state.map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    state.map.on('load', () => {
      renderMarkers();
      maybeFitBounds();
    });
  }

  function clearMarkers() {
    // close any open popup first so we don't leave a stale reference behind;
    // also clear the saved view so a re-render at "all time" doesn't get
    // surprised by a stale flyback later.
    state.markers.forEach(m => m.remove());
    state.markers = [];
    if (state.restoreTimer) { clearTimeout(state.restoreTimer); state.restoreTimer = null; }
    state.savedView = null;
  }

  function buildMarkerEl(ev, status) {
    const el = document.createElement('div');
    el.className = 'mm-marker mm-marker--' + status;
    el.setAttribute('aria-label', `${ev.event_name} at ${ev.venue}`);
    return el;
  }

  function popupHtml(ev) {
    const status = eventStatus(ev);
    const statusLabel = { live: 'live now', upcoming: 'upcoming', past: 'earlier' }[status];
    const range = ev.end
      ? `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`
      : fmtTime(ev.start);
    const sourceLink = ev.source_url
      ? `<div class="mm-popup-source"><a href="${escapeHtml(ev.source_url)}" target="_blank" rel="noopener">official source →</a></div>`
      : '';
    return `
      <div>
        <span class="mm-popup-kicker">${escapeHtml(statusLabel)}</span>
        <h4 class="mm-popup-title">${escapeHtml(ev.event_name)}</h4>
        <div class="mm-popup-meta">
          <div class="row"><b>when</b><span>${escapeHtml(fmtDay(ev.start))}, ${escapeHtml(range)}</span></div>
          <div class="row"><b>where</b><span>${escapeHtml(ev.venue)}${ev.borough ? ', ' + escapeHtml(ev.borough) : ''}</span></div>
          ${ev.kind ? `<div class="row"><b>type</b><span>${escapeHtml(ev.kind)}</span></div>` : ''}
        </div>
        ${sourceLink}
      </div>
    `;
  }

  function renderMarkers() {
    if (!state.map) return;
    clearMarkers();
    removeHeatLayer();

    const visible = state.events.filter(ev => inWindow(ev, state.window) && ev.lng != null && ev.lat != null);

    if (state.mode === 'heat') {
      addHeatLayer(visible);
      return;
    }

    visible.forEach(ev => {
      const status = eventStatus(ev);
      const el = buildMarkerEl(ev, status);
      const popup = new mapboxgl.Popup({ offset: 28, closeButton: true, anchor: 'bottom' })
        .setHTML(popupHtml(ev));
      // wire zoom-in / zoom-back lifecycle on popup events
      popup.on('open', () => onPopupOpen(ev));
      popup.on('close', onPopupClose);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([ev.lng, ev.lat])
        .setPopup(popup)
        .addTo(state.map);
      state.markers.push(marker);
    });

    // draw the trail line for today's events in chronological order
    drawTrailLine(visible);
  }

  // ---------- popup zoom-in / zoom-out lifecycle ----------
  function onPopupOpen(ev) {
    if (!state.map) return;
    // cancel any pending flyback — we're either re-zooming or switching markers
    if (state.restoreTimer) { clearTimeout(state.restoreTimer); state.restoreTimer = null; }
    // save the overview view exactly once (the first popup open from overview)
    if (!state.savedView) {
      state.savedView = {
        center: state.map.getCenter().toArray(),
        zoom: state.map.getZoom(),
      };
    }
    // fly in: marker lands in the lower portion so the popup has space above
    const popupSpace = Math.min(180, state.map.getCanvas().clientHeight * 0.28);
    state.map.flyTo({
      center: [ev.lng, ev.lat],
      zoom: Math.max(state.map.getZoom(), 14),
      offset: [0, popupSpace],
      duration: 700,
    });
  }

  function onPopupClose() {
    // wait briefly: if another popup opens within the window (marker switch
    // or row click), onPopupOpen will cancel this restore.
    if (state.restoreTimer) clearTimeout(state.restoreTimer);
    state.restoreTimer = setTimeout(() => {
      if (state.savedView && state.map) {
        state.map.flyTo({
          center: state.savedView.center,
          zoom: state.savedView.zoom,
          duration: 700,
        });
        state.savedView = null;
      }
      state.restoreTimer = null;
    }, 850);
  }

  function drawTrailLine(visible) {
    if (!state.map) return;
    const today = visible
      .filter(ev => inWindow(ev, 'today'))
      .sort((a, b) => a.start.localeCompare(b.start));

    const sourceId = 'mm-trail';
    const layerId = 'mm-trail-line';

    if (state.map.getLayer(layerId)) state.map.removeLayer(layerId);
    if (state.map.getSource(sourceId)) state.map.removeSource(sourceId);

    if (today.length < 2 || state.window === 'all') return;

    const coords = today.map(ev => [ev.lng, ev.lat]);
    state.map.addSource(sourceId, {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } },
    });
    state.map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#E86A4E',
        'line-width': 2,
        'line-opacity': 0.5,
        'line-dasharray': [1, 2],
      },
    }, state.markers.length > 0 ? undefined : undefined);
  }

  function addHeatLayer(visible) {
    if (!state.map || !visible.length) return;
    const sourceId = 'mm-heat';
    const layerId = 'mm-heat-layer';

    if (state.map.getLayer(layerId)) state.map.removeLayer(layerId);
    if (state.map.getSource(sourceId)) state.map.removeSource(sourceId);

    state.map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: visible.map(ev => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [ev.lng, ev.lat] },
          properties: { weight: 1 },
        })),
      },
    });
    state.map.addLayer({
      id: layerId,
      type: 'heatmap',
      source: sourceId,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': 1,
        'heatmap-radius': 38,
        'heatmap-opacity': 0.85,
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0,    'rgba(15,11,8,0)',
          0.2,  'rgba(232,106,78,0.25)',
          0.5,  'rgba(232,106,78,0.6)',
          0.8,  'rgba(245,165,36,0.85)',
          1,    'rgba(255,237,158,1)',
        ],
      },
    });
    state.heatLayerAdded = true;
  }

  function removeHeatLayer() {
    if (!state.map || !state.heatLayerAdded) return;
    if (state.map.getLayer('mm-heat-layer')) state.map.removeLayer('mm-heat-layer');
    if (state.map.getSource('mm-heat')) state.map.removeSource('mm-heat');
    state.heatLayerAdded = false;
  }

  function maybeFitBounds() {
    if (!state.map) return;
    const visible = state.events.filter(ev => inWindow(ev, state.window) && ev.lng != null && ev.lat != null);
    if (visible.length < 2) return;
    const bounds = new mapboxgl.LngLatBounds();
    visible.forEach(ev => bounds.extend([ev.lng, ev.lat]));
    state.map.fitBounds(bounds, { padding: 80, maxZoom: 13, duration: 600 });
  }

  // ---------- two-column run-of-show: upcoming (forward) + earlier (past) ----------
  function renderRunOfShow() {
    const upList = $('#mm-upcoming-list');
    const earList = $('#mm-earlier-list');
    if (!upList || !earList) return;
    const now = new Date();

    // UPCOMING — forward events, sorted ascending (soonest first), capped to 3
    const upcomingAll = state.events
      .filter(ev => ev.is_forward && parseISO(ev.start) >= now)
      .sort((a, b) => a.start.localeCompare(b.start));
    const upcoming = upcomingAll.slice(0, 3);

    // EARLIER — non-forward (press-sourced) events, sorted descending (most recent first), capped to 3
    const earlierAll = state.events
      .filter(ev => !ev.is_forward)
      .sort((a, b) => b.start.localeCompare(a.start));
    const earlier = earlierAll.slice(0, 3);

    const upSum = $('#mm-up-summary');
    if (upSum) {
      const more = upcomingAll.length > 3 ? ` · +${upcomingAll.length - 3} more on map` : '';
      upSum.textContent = upcomingAll.length
        ? `next ${upcoming.length} of ${upcomingAll.length}${more}`
        : 'press office doesn\'t pre-announce much';
    }
    const earSum = $('#mm-earlier-summary');
    if (earSum) {
      earSum.textContent = earlierAll.length
        ? `last ${earlier.length} of ${earlierAll.length} on file`
        : 'no events on file';
    }

    upList.innerHTML = upcoming.length
      ? upcoming.map(rsRow).join('')
      : `<div class="mm-rs-empty">nothing pre-announced for the next 7 days. the mayor's office is sparse on forward schedules — we'll catch new ones in the daily web sweep.</div>`;

    earList.innerHTML = earlier.length
      ? earlier.map(rsRow).join('')
      : `<div class="mm-rs-empty">no past events on file.</div>`;

    // wire row clicks
    [...upList.querySelectorAll('.mm-rs-row'), ...earList.querySelectorAll('.mm-rs-row')].forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-event-id');
        const ev = state.events.find(e => e.id === id);
        if (!ev || !state.map) return;
        // Just open the popup — the popup's 'open' event triggers the fly-in
        // (onPopupOpen handles zoom + offset + saving the overview view).
        const marker = state.markers.find(m => {
          const ll = m.getLngLat();
          return Math.abs(ll.lng - ev.lng) < 1e-6 && Math.abs(ll.lat - ev.lat) < 1e-6;
        });
        if (marker && !marker.getPopup().isOpen()) marker.togglePopup();
      });
    });
  }

  // ---------- borough tracker ----------
  function renderBoroughTracker() {
    const rowsEl = $('#mm-bt-rows');
    if (!rowsEl) return;
    const headline = $('#mm-bt-headline');
    const totalEl = $('#mm-bt-total');
    const windowEl = $('#mm-bt-window');

    const now = new Date();
    const thirtyAgo = new Date(now); thirtyAgo.setDate(now.getDate() - 30);
    const inWindow30 = state.events.filter(ev => parseISO(ev.start) >= thirtyAgo && parseISO(ev.start) <= now);

    const ORDER = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];
    const tally = Object.fromEntries(ORDER.map(b => [b, []]));
    inWindow30.forEach(ev => {
      if (ev.borough && tally[ev.borough]) tally[ev.borough].push(ev);
    });

    const total = inWindow30.filter(e => e.borough).length;
    if (totalEl) totalEl.textContent = `${total} stop${total === 1 ? '' : 's'}`;
    if (windowEl) windowEl.textContent = 'last 30 days';

    // subheadline — the data, not snark (the section title IS the question now)
    if (headline) {
      if (total === 0) {
        headline.textContent = 'no data on file yet';
      } else {
        const sorted = ORDER.map(b => [b, tally[b].length]).sort((a, b) => b[1] - a[1]);
        const [winner, winnerN] = sorted[0];
        const winnerPct = Math.round((winnerN / total) * 100);
        const coverage = sorted.filter(([_, n]) => n > 0).length;
        headline.textContent = `${winner.toLowerCase()} · ${winnerPct}% · ${coverage}/5 boroughs covered`;
      }
    }

    const MAX_FACES = 10;
    rowsEl.innerHTML = ORDER.map(b => {
      const evs = tally[b];
      const n = evs.length;
      const pct = total ? Math.round((n / total) * 100) : 0;
      const facesShown = Math.min(n, MAX_FACES);
      const facesHtml = Array.from({ length: facesShown }).map((_, i) => {
        const isForward = evs[i]?.is_forward;
        return `<span class="mm-bt-face${isForward ? ' mm-bt-face--forward' : ''}" aria-hidden="true"></span>`;
      }).join('');
      const more = n > MAX_FACES ? `<span class="mm-bt-more">+${n - MAX_FACES}</span>` : '';
      const empty = n === 0 ? ' is-empty' : '';
      return `
        <div class="mm-bt-row${empty}">
          <span class="mm-bt-name">${b.toLowerCase()}</span>
          <span class="mm-bt-strip">${facesHtml || '<span style="color:var(--mute);font-family:var(--font-mono);font-size:11px;">·</span>'}${more}</span>
          <span class="mm-bt-n">${n}</span>
          <span class="mm-bt-pct">${n ? pct + '%' : '—'}</span>
        </div>
      `;
    }).join('');
  }

  function rsRow(ev) {
    const now = new Date();
    const status = eventStatus(ev, now);
    const statusLabel = { live: 'live', upcoming: 'soon', past: 'wrapped', forward: 'soon' }[status] || status;
    const dateLabel = fmtDay(ev.start).split(',')[0]; // "Tuesday" from "Tuesday, April 28"
    const dateShort = new Date(ev.start).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).toLowerCase();
    const timeLabel = ev.start.includes('T12:00:00') ? dateShort : `${dateShort} · ${fmtTime(ev.start)}`;
    return `
      <div class="mm-rs-row" data-event-id="${escapeHtml(ev.id)}">
        <span class="time">${escapeHtml(timeLabel)}</span>
        <span class="where">
          ${escapeHtml(ev.event_name)}
          <small>${escapeHtml(ev.venue)}${ev.borough ? ' · ' + escapeHtml(ev.borough.toLowerCase()) : ''}</small>
        </span>
        <span class="status-tag is-${status}">${escapeHtml(statusLabel)}</span>
      </div>
    `;
  }

  // ---------- live chip ----------
  function renderLiveChip() {
    const chip = $('#mm-live-chip');
    if (!chip) return;
    const now = new Date();
    const liveEvent = state.events.find(ev => eventStatus(ev, now) === 'live');
    if (!liveEvent) { chip.hidden = true; return; }
    chip.hidden = false;
    $('#mm-live-event').textContent = liveEvent.event_name;
    $('#mm-live-end').textContent = liveEvent.end ? fmtTime(liveEvent.end) : 'soon';
  }

  // ---------- hero meta ----------
  function renderHeroMeta() {
    const statusLine = $('#mm-status-line');
    const lastRefresh = $('#mm-last-refresh');
    const eventCount = $('#mm-event-count');
    const now = new Date();
    const liveEvent = state.events.find(ev => eventStatus(ev, now) === 'live');
    const nextEvent = state.events
      .filter(ev => {
        const s = eventStatus(ev, now);
        // include both 'upcoming' (rare — events Claude detected as scheduled future) and 'forward' (web-search-sourced)
        if (s !== 'upcoming' && s !== 'forward') return false;
        return parseISO(ev.start) >= now;
      })
      .sort((a, b) => a.start.localeCompare(b.start))[0];

    if (statusLine) {
      if (liveEvent) {
        statusLine.innerHTML = `<b style="color:var(--live)">live</b> at ${escapeHtml(liveEvent.venue)} until ${escapeHtml(fmtTime(liveEvent.end || liveEvent.start))}`;
      } else if (nextEvent) {
        const isToday = inWindow(nextEvent, 'today');
        const tag = nextEvent.is_forward ? '<span style="color:var(--accent);font-style:italic">upcoming</span>' : 'next public stop';
        statusLine.innerHTML = `${tag} · <em>${escapeHtml(nextEvent.event_name)}</em> · ${escapeHtml(isToday ? fmtTime(nextEvent.start) : fmtDay(nextEvent.start))}`;
      } else {
        statusLine.textContent = 'no upcoming public events on file';
      }
    }
    if (lastRefresh) lastRefresh.textContent = state.updatedAt ? fmtRel(state.updatedAt) : 'never';
    if (eventCount) eventCount.textContent = state.events.length + ' on file';
  }

  // ---------- toggles ----------
  function bindToggles() {
    $$('.mm-tog[data-window]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.mm-tog[data-window]').forEach(b => b.classList.toggle('is-on', b === btn));
        state.window = btn.getAttribute('data-window');
        renderMarkers();
        maybeFitBounds();
      });
    });
    $$('.mm-tog[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const isOn = btn.classList.toggle('is-on');
        state.mode = isOn ? 'heat' : 'pins';
        renderMarkers();
      });
    });
  }

  // ---------- share cards (canvas) ----------
  function bindShare() {
    $$('.mm-share-card').forEach(card => {
      card.addEventListener('click', async () => {
        const kind = card.getAttribute('data-share');
        card.classList.add('is-busy');
        try {
          const blob = await renderShareCard(kind);
          downloadBlob(blob, `mamdani-mapper-${kind}-${new Date().toISOString().slice(0,10)}.png`);
        } catch (e) {
          console.error(e);
          alert('share render failed — open the console for details');
        } finally {
          setTimeout(() => card.classList.remove('is-busy'), 300);
        }
      });
    });
  }

  async function renderShareCard(kind) {
    const W = 1200, H = 630;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // bg — paper
    ctx.fillStyle = '#0c0c0e';
    ctx.fillRect(0, 0, W, H);

    // cobalt glow
    const grad = ctx.createRadialGradient(W * 0.9, -100, 100, W * 0.9, -100, 700);
    grad.addColorStop(0, 'rgba(91,140,255,0.18)');
    grad.addColorStop(1, 'rgba(91,140,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // border + corner ticks (brand motif)
    ctx.strokeStyle = 'rgba(245,240,230,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(40, 40, W - 80, H - 80);
    ctx.strokeStyle = '#5b8cff';
    ctx.lineWidth = 2;
    const t = 18;
    [[40,40,1,1],[W-40,40,-1,1],[40,H-40,1,-1],[W-40,H-40,-1,-1]].forEach(([x,y,sx,sy]) => {
      ctx.beginPath();
      ctx.moveTo(x, y + sy * t);
      ctx.lineTo(x, y);
      ctx.lineTo(x + sx * t, y);
      ctx.stroke();
    });

    // load face
    const face = await loadImage(FACE_URL);

    // masthead — cobalt mark + receipt-style label
    ctx.fillStyle = '#5b8cff';
    ctx.fillRect(80, 80, 16, 16);
    ctx.fillStyle = '#0c0c0e';
    ctx.beginPath();
    ctx.moveTo(96, 80); ctx.lineTo(96, 86); ctx.lineTo(90, 80); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(245,240,230,0.62)';
    ctx.font = '500 13px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText('mamdani mapper · special bulletin · vol. iv · ed. one', 110, 93);

    // headline by kind
    const now = new Date();
    const today = state.events.filter(ev => inWindow(ev, 'today'));
    const week = state.events.filter(ev => inWindow(ev, 'week'));
    const all = state.events;

    let title, subtitle, stats;
    if (kind === 'today') {
      title = today.length
        ? `${today.length} stop${today.length === 1 ? '' : 's'} today.`
        : 'a quiet day at city hall.';
      subtitle = today[0] ? fmtDay(today[0].start) : fmtDay(now.toISOString());
      stats = makeStats(today);
    } else if (kind === 'week') {
      title = `${week.length} public stop${week.length === 1 ? '' : 's'} this week.`;
      subtitle = 'the mayor\'s week, mapped';
      stats = makeStats(week);
    } else {
      title = `${all.length} stops on file.`;
      subtitle = 'where his time has gone';
      stats = makeStats(all);
    }

    ctx.fillStyle = '#f5f0e6';
    ctx.font = '400 84px "Fraunces", Georgia, serif';
    wrapText(ctx, title, 80, 200, W - 460, 88);

    ctx.fillStyle = 'rgba(245,240,230,0.62)';
    ctx.font = 'italic 26px "Fraunces", Georgia, serif';
    ctx.fillText(subtitle, 80, H - 220);

    // stat row
    let x = 80;
    stats.forEach((s) => {
      ctx.fillStyle = '#5b8cff';
      ctx.font = '400 64px "Fraunces", Georgia, serif';
      ctx.fillText(s.n, x, H - 130);
      ctx.fillStyle = 'rgba(245,240,230,0.38)';
      ctx.font = '500 13px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(s.l.toLowerCase(), x, H - 100);
      x += 200;
    });

    // face circle, cobalt ring
    const fx = W - 200, fy = 250, fr = 110;
    ctx.save();
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(face, fx - fr, fy - fr - 10, fr * 2, fr * 2 + 20);
    ctx.restore();
    ctx.strokeStyle = '#5b8cff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(fx, fy, fr, 0, Math.PI * 2);
    ctx.stroke();

    // footer credit
    ctx.fillStyle = 'rgba(245,240,230,0.38)';
    ctx.font = '400 13px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText('raghavahuja.com/mamdani-mapper  ·  source: nyc.gov mayor\'s office press feed', 80, H - 60);

    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  }

  function makeStats(evs) {
    const boroughs = new Set(evs.map(e => e.borough).filter(Boolean));
    const kinds = new Set(evs.map(e => e.kind).filter(Boolean));
    return [
      { n: String(evs.length), l: 'STOPS' },
      { n: String(boroughs.size), l: 'BOROUGHS' },
      { n: String(kinds.size || '—'), l: 'EVENT TYPES' },
    ];
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const w = ctx.measureText(testLine).width;
      if (w > maxWidth && n > 0) {
        ctx.fillText(line.trim(), x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), x, y);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  // ---------- tick — refresh live state every 30s ----------
  function startTicker() {
    if (state.nowTimer) clearInterval(state.nowTimer);
    state.nowTimer = setInterval(() => {
      renderLiveChip();
      renderRunOfShow();
      renderHeroMeta();
      renderBoroughTracker();
    }, 30000);
  }

  // ---------- date label in topbar ----------
  function renderTopbarDate() {
    const el = document.getElementById('mm-today');
    if (!el) return;
    const d = new Date();
    const yy = String(d.getFullYear()).slice(2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    el.textContent = `${yy}·${mm}·${dd}`;
  }

  // ---------- boot ----------
  async function boot() {
    // standalone: no data-page guard — this script only loads on this page
    if (!document.getElementById('mm-map')) return;
    renderTopbarDate();
    bindToggles();
    bindShare();
    initMap();
    await loadEvents();
    renderHeroMeta();
    renderLiveChip();
    renderRunOfShow();
    renderBoroughTracker();
    if (state.map && state.map.loaded()) {
      renderMarkers();
      maybeFitBounds();
    }
    startTicker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
