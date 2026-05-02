// raghavahuja.com — site interactions
(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const active = document.body.getAttribute('data-page') || '';

  // analytics removed — kept the noop for any code still calling track()
  function track() {}

  // ---------- shared chrome injection ----------
  function mountChrome() {
    // masthead — vol/no editorial strip (3 columns)
    if (!document.querySelector('.masthead')) {
      const mh = document.createElement('div');
      mh.className = 'masthead';
      mh.setAttribute('role', 'status');
      mh.innerHTML =
        '<div class="mh-vol">vol. iv · no. 4 · portfolio</div>' +
        '<div class="mh-mid">raghavahuja.com</div>' +
        '<div class="mh-clocks">' +
          '<span>jamnapaar <b id="clk-mum">--:--</b></span>' +
          '<span>brooklyn <b id="clk-nyc">--:--</b></span>' +
        '</div>';
      document.body.insertBefore(mh, document.body.firstChild);
    }

    // nav — raghav_ blinking caret + links + day/night + ⌘K
    const navMount = document.getElementById('nav-mount');
    if (navMount) {
      const items = [
        ['index','index.html','home'],
        ['work','work.html'],
        ['docs','docs.html'],
        ['lab','lab.html'],
        ['about','about.html'],
        ['contact','contact.html'],
      ];
      navMount.outerHTML = '<nav class="nav" aria-label="primary">' +
        '<div class="nav-left">' +
          '<a href="index.html" class="brand" aria-label="raghavahuja.com — home">raghav_<span class="caret" aria-hidden="true"></span></a>' +
        '</div>' +
        '<div class="nav-links">' +
          items.map((it) => {
            const [l, h, pg] = it;
            const key = pg || l;
            return `<a href="${h}"${active===key?' class="active"':''}>${l}</a>`;
          }).join('') +
        '</div>' +
        '<div class="nav-right">' +
          '<button id="theme-toggle" class="nav-btn" aria-label="Toggle day/night theme" type="button">' +
            '<span class="theme-label">☾ night</span>' +
          '</button>' +
          '<button id="cmdk-trigger" class="nav-btn nav-btn--solid nav-search" aria-label="Open command palette" type="button">' +
            '<span>go anywhere</span><span class="kbd">⌘K</span>' +
          '</button>' +
          '<button class="nav-toggle" aria-label="Menu" aria-expanded="false" aria-controls="nav-links">' +
            '<span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span><span class="nav-toggle-bar"></span>' +
          '</button>' +
        '</div>' +
      '</nav>';
    }

    // footer
    const footMount = document.getElementById('footer-mount');
    if (footMount) {
      footMount.outerHTML = '<footer class="footer">' +
        '<div>' +
          '<div class="brand-line">raghav_<span class="caret" aria-hidden="true"></span></div>' +
          '<div class="role">design engineer · brooklyn</div>' +
          '<div class="links">' +
            '<a href="mailto:work.raghavahuja@gmail.com">work.raghavahuja@gmail.com</a> · ' +
            '<a href="https://github.com/ahujatries">github</a> · ' +
            '<a href="https://www.linkedin.com/in/raghav-ahuja-140b4aa9/">linkedin</a> · ' +
            '<a href="resume.pdf">resume</a>' +
          '</div>' +
        '</div>' +
        '<div class="right">' +
          '<div class="sign">— written, designed, shipped<br>by one person.</div>' +
          '<div style="margin-top: 10px;">set in fraunces, geist &amp; jetbrains mono.</div>' +
          '<div style="margin-top: 10px;">build <span id="build-sha">—</span> · <span id="build-deployed">shipped recently</span></div>' +
          '<div id="reader-tz"></div>' +
        '</div>' +
      '</footer>';
    }

    // grid overlay
    if (!document.getElementById('grid-overlay')) {
      const go = document.createElement('div');
      go.id = 'grid-overlay'; go.className = 'grid-overlay'; go.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(go, document.body.firstChild);
    }

    // cmdk
    if (!document.getElementById('cmdk')) {
      const cm = document.createElement('div');
      cm.id = 'cmdk'; cm.className = 'cmdk-overlay';
      cm.setAttribute('role', 'dialog'); cm.setAttribute('aria-modal', 'true'); cm.setAttribute('aria-hidden', 'true'); cm.setAttribute('aria-label', 'Command palette');
      cm.innerHTML = '<div class="cmdk" role="combobox" aria-expanded="true">' +
        '<input id="cmdk-input" type="text" placeholder="go anywhere · type a route, command, or `chai`…" autocomplete="off" spellcheck="false" aria-label="Command input">' +
        '<div id="cmdk-results" class="cmdk-results" role="listbox"></div>' +
        '<div class="cmdk-foot">' +
          '<span><kbd class="kbd">↑↓</kbd> nav</span>' +
          '<span><kbd class="kbd">↵</kbd> open</span>' +
          '<span><kbd class="kbd">esc</kbd> close</span>' +
          '<span id="cmdk-count" style="margin-left:auto;"></span>' +
        '</div>' +
      '</div>';
      document.body.appendChild(cm);
    }

    // view-source drawer
    if (!document.getElementById('vs-drawer')) {
      const vsS = document.createElement('div');
      vsS.id = 'vs-scrim'; vsS.className = 'vs-scrim'; vsS.setAttribute('aria-hidden', 'true');
      document.body.appendChild(vsS);
      const vs = document.createElement('aside');
      vs.id = 'vs-drawer'; vs.className = 'vs-drawer';
      vs.setAttribute('aria-hidden', 'true'); vs.setAttribute('aria-label', 'View source');
      vs.innerHTML = '<div class="vs-head">' +
        '<span class="label-chrome">view source · <span id="vs-name">component</span></span>' +
        '<button id="vs-close" class="vs-close" aria-label="Close">esc</button>' +
      '</div>' +
      '<pre class="vs-pre"><code id="vs-code"></code></pre>';
      document.body.appendChild(vs);
    }

    // konami toast
    if (!document.getElementById('konami-toast')) {
      const kt = document.createElement('div');
      kt.id = 'konami-toast'; kt.className = 'konami-toast';
      kt.setAttribute('role', 'status'); kt.setAttribute('aria-live', 'polite');
      kt.hidden = true;
      kt.textContent = 'नमस्ते · crt mode enabled';
      document.body.appendChild(kt);
    }
  }

  mountChrome();

  // ---------- home active state — index nav link ----------
  if (active === 'home') {
    const homeLink = document.querySelector('.nav-links a[href="index.html"]');
    if (homeLink) homeLink.classList.add('active');
  }

  // ---------- mobile nav toggle ----------
  const navEl = document.querySelector('.nav');
  const navToggle = document.querySelector('.nav-toggle');
  if (navEl && navToggle) {
    function setNavOpen(open) {
      navEl.classList.toggle('open', open);
      navToggle.setAttribute('aria-expanded', String(open));
    }
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setNavOpen(!navEl.classList.contains('open'));
    });
    // close on nav link click (before navigation kicks in, fine either way)
    navEl.querySelectorAll('.nav-links a').forEach((a) => {
      a.addEventListener('click', () => setNavOpen(false));
    });
    // close on outside click
    document.addEventListener('click', (e) => {
      if (!navEl.classList.contains('open')) return;
      if (!navEl.contains(e.target)) setNavOpen(false);
    });
    // close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navEl.classList.contains('open')) setNavOpen(false);
    });
    // close when viewport grows past breakpoint
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 720 && navEl.classList.contains('open')) setNavOpen(false);
    });
  }

  // ---------- clocks ----------
  const clocks = [
    ['clk-mum', 'Asia/Kolkata'],
    ['clk-nyc', 'America/New_York'],
  ];
  function tickClocks() {
    const now = new Date();
    for (const [id, tz] of clocks) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.textContent = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(now);
    }
  }
  tickClocks();
  setInterval(tickClocks, 1000);

  // ---------- reader timezone in footer ----------
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date().toLocaleString('sv-SE', { timeZone: tz }).replace('T', ' ').slice(0, 16);
    const rt = document.getElementById('reader-tz');
    if (rt) rt.textContent = `you: ${now} ${tz}`;
  } catch (e) {}

  // typewriter removed — Direction A hero is static: "I design systems
  // *and* build them." The italic "and" is the only accent. Fewer moving
  // parts = more editorial presence.

  // ---------- live activity (real GitHub events) ----------
  const liveSection = document.querySelector('.live-activity');
  const tickEl = document.getElementById('tick');

  function relTime(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60)   return Math.max(1, Math.floor(d)) + 's';
    if (d < 3600) return Math.floor(d / 60) + 'm';
    if (d < 86400) return Math.floor(d / 3600) + 'h';
    return Math.floor(d / 86400) + 'd';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  async function fetchGitHubEvents() {
    const cacheKey = 'gh:events';
    const cacheTtlMs = 60 * 1000;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { at, data } = JSON.parse(cached);
        if (Date.now() - at < cacheTtlMs) return data;
      }
    } catch (e) {}

    const res = await fetch('https://api.github.com/users/ahujatries/events/public', {
      headers: { 'Accept': 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error('gh ' + res.status);
    const events = await res.json();
    const commits = [];
    for (const ev of events) {
      if (ev.type !== 'PushEvent') continue;
      const repo = ev.repo.name.split('/').pop();
      for (const c of (ev.payload.commits || []).slice(0, 1)) {
        commits.push({ repo, msg: c.message.split('\n')[0], when: ev.created_at });
        if (commits.length >= 5) break;
      }
      if (commits.length >= 5) break;
    }
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: commits })); } catch (e) {}
    return commits;
  }

  function renderCommits(commits) {
    if (!liveSection || !commits || !commits.length) return;
    const rows = liveSection.querySelectorAll('.live-row');
    rows.forEach((r) => r.remove());
    const head = liveSection.querySelector('.live-head');
    const frag = document.createDocumentFragment();
    for (const c of commits) {
      const row = document.createElement('div');
      row.className = 'live-row';
      const iso = new Date(c.when).toISOString().slice(0, 10);          // 2026-04-24
      const short = iso.slice(2).replace(/-/g, '·');                    // 26·04·24
      row.innerHTML =
        '<time datetime="' + iso + '" class="date">' + short + '</time>' +
        '<span class="repo">' + escapeHtml(c.repo) + '</span>' +
        '<span class="commit-msg">' + escapeHtml(c.msg) + '</span>' +
        '<span class="when">' + escapeHtml(relTime(c.when)) + ' ago</span>';
      frag.appendChild(row);
    }
    (head ? head.after(frag) : liveSection.appendChild(frag));
  }

  function updateTickLabel(ts) {
    if (!tickEl) return;
    const d = (Date.now() - ts) / 1000;
    tickEl.textContent = d < 60 ? 'just now' : Math.floor(d / 60) + 'm ago';
  }

  if (liveSection) {
    let lastFetchAt = 0;
    async function refresh() {
      try {
        const commits = await fetchGitHubEvents();
        if (commits && commits.length) {
          renderCommits(commits);
          lastFetchAt = Date.now();
          updateTickLabel(lastFetchAt);
        }
      } catch (e) {
        // silent — leave the static fallback rows as-is
        if (tickEl) tickEl.textContent = 'cached';
      }
    }
    refresh();
    setInterval(refresh, 60000);
    if (tickEl) setInterval(() => { if (lastFetchAt) updateTickLabel(lastFetchAt); }, 15000);
  }

  // ---------- footer: real commit SHA for this repo ----------
  async function fetchSiteSha() {
    const cacheKey = 'gh:sha';
    const cacheTtlMs = 5 * 60 * 1000;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { at, data } = JSON.parse(cached);
        if (Date.now() - at < cacheTtlMs) return data;
      }
    } catch (e) {}
    const res = await fetch('https://api.github.com/repos/ahujatries/raghavahuja.com/commits?per_page=1', {
      headers: { 'Accept': 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error('gh ' + res.status);
    const [c] = await res.json();
    const data = { sha: c.sha.slice(0, 7), url: c.html_url, when: c.commit.author.date };
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data })); } catch (e) {}
    return data;
  }

  const shaEl = document.getElementById('build-sha');
  const deployedEl = document.getElementById('build-deployed');
  const heroMarkerShaEl = document.getElementById('hero-marker-sha');
  if (shaEl || deployedEl || heroMarkerShaEl) {
    fetchSiteSha().then((c) => {
      if (shaEl) {
        shaEl.innerHTML = '<a href="' + c.url + '" style="color: var(--accent);">' + c.sha + '</a>';
      }
      if (deployedEl) deployedEl.textContent = 'shipped ' + relTime(c.when) + ' ago';
      if (heroMarkerShaEl) heroMarkerShaEl.textContent = c.sha + ' · shipped ' + relTime(c.when) + ' ago';
    }).catch(() => {
      // silently keep placeholder
    });
  }

  // ---------- grid overlay ----------
  const gridEl = document.getElementById('grid-overlay');
  if (gridEl && !gridEl.children.length) {
    for (let k = 0; k < 12; k++) {
      const d = document.createElement('div');
      gridEl.appendChild(d);
    }
  }

  function isTypingTarget(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    if (e.key === 'g') gridEl?.classList.add('on');
    if (e.key === 'G') gridEl?.classList.toggle('on');
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === 'g') gridEl?.classList.remove('on');
  });

  // ---------- theme toggle ----------
  function currentTheme() {
    const explicit = document.documentElement.getAttribute('data-theme');
    if (explicit) return explicit;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function setThemeLabel() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const lbl = btn.querySelector('.theme-label');
    if (!lbl) return;
    lbl.textContent = currentTheme() === 'dark' ? '☾ night' : '☀ day';
  }
  function toggleTheme() {
    const next = currentTheme() === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    setThemeLabel();
    track('theme:toggle', { to: next });
  }
  setThemeLabel();
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);
  document.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    if (e.key === 't') toggleTheme();
  });

  // ---------- view-source drawer ----------
  const SOURCES = {
    LiveActivity: `function LiveActivity() {
  const commits = await fetch('/api/commits', {
    next: { revalidate: 60 }          // 60s edge cache —
  });                                   // N users = 1 upstream req.
  return (
    <section>
      <Header dot="live" subtitle="ahujatries" />
      {commits.map(c => <Row {...c} />)}
    </section>
  );
}`,
    WorkCard: `function WorkCard({ item }) {
  return (
    <a href={\`/work/\${item.slug}\`} className="work-card">
      <Meta n={item.n} year={item.year} />
      <h3>{item.title}</h3>
      <p>{item.tagline}</p>
      <Pills tech={item.tech} />
    </a>
  );
}`,
  };

  const vsScrim = document.getElementById('vs-scrim');
  const vsDrawer = document.getElementById('vs-drawer');
  const vsName = document.getElementById('vs-name');
  const vsCode = document.getElementById('vs-code');
  const vsClose = document.getElementById('vs-close');

  function openVS(which) {
    vsName.textContent = which || 'component';
    vsCode.textContent = SOURCES[which] || '// source for this component is not wired yet';
    vsDrawer.classList.add('open');
    vsScrim.classList.add('open');
    vsDrawer.setAttribute('aria-hidden', 'false');
    track('vs:open', { component: which || 'unknown' });
  }
  function closeVS() {
    vsDrawer.classList.remove('open');
    vsScrim.classList.remove('open');
    vsDrawer.setAttribute('aria-hidden', 'true');
  }

  document.querySelectorAll('.vs-handle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openVS(btn.getAttribute('data-vs'));
      try { localStorage.setItem('vs:seen', '1'); } catch (e) {}
      document.querySelector('.vs-hint')?.remove();
    });
  });
  vsScrim?.addEventListener('click', closeVS);
  vsClose?.addEventListener('click', closeVS);

  // ---------- first-time view-source hint ----------
  try {
    const seen = localStorage.getItem('vs:seen');
    if (!seen && !reduceMotion) {
      const firstHandle = document.querySelector('.vs-handle');
      if (firstHandle) {
        const hint = document.createElement('div');
        hint.className = 'vs-hint';
        hint.setAttribute('role', 'note');
        hint.innerHTML = 'click <code>{ }</code> to see the source';
        firstHandle.parentElement && getComputedStyle(firstHandle.parentElement).position === 'static'
          && (firstHandle.parentElement.style.position = 'relative');
        (firstHandle.parentElement || document.body).appendChild(hint);
        // auto-dismiss after 8s
        setTimeout(() => { hint.classList.add('vs-hint--gone'); }, 8000);
        setTimeout(() => { hint.remove(); }, 8400);
        // click to dismiss
        hint.addEventListener('click', () => {
          try { localStorage.setItem('vs:seen', '1'); } catch (e) {}
          hint.remove();
        });
      }
    }
  } catch (e) {}

  // ---------- command palette ----------
  const CMDK_ITEMS = [
    { label: 'home', path: '/', href: 'index.html', kind: 'route' },
    { label: 'work', path: '/work', href: 'work.html', kind: 'route' },
    { label: 'arqo · case study', path: '/work/arqo', href: 'case-study.html?slug=arqo', kind: 'route' },
    { label: 'aleida · ai EA · case study', path: '/work/aleida', href: 'case-study.html?slug=aleida', kind: 'route' },
    { label: 'JMNPR Labs · case study', path: '/work/jmnpr-labs', href: 'case-study.html?slug=jmnpr-labs', kind: 'route' },
    { label: 'EF education first · case study', path: '/work/ef', href: 'case-study.html?slug=ef', kind: 'route' },
    { label: 'futbolis · lab · case study', path: '/lab/futbolis', href: 'case-study.html?slug=futbolis', kind: 'route' },
    { label: 'the library · docs', path: '/docs', href: 'docs.html', kind: 'route' },
    { label: 'CtB framework', path: '/docs/ctb', href: 'docs.html?d=ctb', kind: 'route' },
    { label: 'MIND framework — behavioral OS', path: '/docs/mind', href: 'docs.html?d=mind', kind: 'route' },
    { label: 'HCAI framework — designing for humans', path: '/docs/hcai', href: 'docs.html?d=hcai', kind: 'route' },
    { label: 'colophon · how this site is built', path: '/docs/colophon', href: 'docs.html?d=colophon', kind: 'route' },
    { label: 'ADR · $19/mo edge cache', path: '/docs/adr-edge-cache', href: 'docs.html?d=adr-edge-cache', kind: 'route' },
    { label: 'lab', path: '/lab', href: 'lab.html', kind: 'route' },
    { label: 'the mamdani mapper · special bulletin', path: '/mamdani-mapper', href: 'mamdani-mapper.html', kind: 'route' },
    { label: 'about', path: '/about', href: 'about.html', kind: 'route' },
    { label: 'contact', path: '/contact', href: 'contact.html', kind: 'route' },
    { label: 'toggle theme', path: 't', kind: 'cmd', action: 'theme' },
    { label: 'toggle grid overlay', path: 'g', kind: 'cmd', action: 'grid' },
    { label: 'open resume (pdf)', path: '/resume.pdf', href: 'resume.pdf', kind: 'cmd' },
    { label: 'copy email', path: 'work.raghavahuja@gmail.com', kind: 'cmd', action: 'email' },
    { label: 'github · ahujatries', path: 'github.com/ahujatries', href: 'https://github.com/ahujatries', kind: 'cmd' },
    { label: 'linkedin · raghav-ahuja', path: 'linkedin.com/in/raghav-ahuja-140b4aa9', href: 'https://www.linkedin.com/in/raghav-ahuja-140b4aa9/', kind: 'cmd' },
    { label: 'tryarqo.com', path: 'tryarqo.com', href: 'https://tryarqo.com', kind: 'cmd' },
    { label: 'jmnpr.com', path: 'jmnpr.com', href: 'https://jmnpr.com', kind: 'cmd' },
    { label: 'futbolis.live', path: 'futbolis.live', href: 'https://futbolis.live', kind: 'cmd' },
    { label: 'chai', path: '☕', kind: 'easter', action: 'chai' },
  ];

  function fuzzy(q, s) {
    q = q.toLowerCase(); s = s.toLowerCase();
    let i = 0;
    for (const c of s) if (c === q[i]) i++;
    return i === q.length;
  }

  const overlay = document.getElementById('cmdk');
  const input = document.getElementById('cmdk-input');
  const results = document.getElementById('cmdk-results');
  const countEl = document.getElementById('cmdk-count');
  let sel = 0;
  let currentFiltered = [];

  function filter(q) {
    if (!q) return CMDK_ITEMS.filter((i) => i.kind !== 'easter');
    return CMDK_ITEMS.filter((i) => fuzzy(q, i.label) || fuzzy(q, i.path));
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function highlight(text, q) {
    if (!q) return escapeHtml(text);
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return escapeHtml(text);
    return escapeHtml(text.slice(0, idx)) +
      '<span class="hit">' + escapeHtml(text.slice(idx, idx + q.length)) + '</span>' +
      escapeHtml(text.slice(idx + q.length));
  }

  function render() {
    const q = input.value.trim();
    currentFiltered = filter(q);
    if (sel >= currentFiltered.length) sel = Math.max(0, currentFiltered.length - 1);
    if (currentFiltered.length === 0) {
      results.innerHTML = '<div class="cmdk-row" style="color: var(--fg-dim);">no match. try `work`, `arqo`, `theme`</div>';
    } else {
      results.innerHTML = currentFiltered.map((item, i) =>
        `<div class="cmdk-row ${i === sel ? 'selected' : ''}" data-i="${i}" role="option">
          <span>${highlight(item.label, q)}</span>
          <span class="path">${escapeHtml(item.path)}</span>
        </div>`
      ).join('');
    }
    countEl.textContent = currentFiltered.length + ' result' + (currentFiltered.length === 1 ? '' : 's');
  }

  let lastFocusEl = null;
  function openCmdk() {
    lastFocusEl = document.activeElement;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    sel = 0;
    input.value = '';
    render();
    // defer focus until after visibility flip so the browser grants it
    requestAnimationFrame(() => input.focus());
    track('cmdk:open');
  }
  function closeCmdk() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    // restore focus to what opened us (e.g. the ⌘K button) for keyboard users
    if (lastFocusEl && typeof lastFocusEl.focus === 'function') lastFocusEl.focus();
    lastFocusEl = null;
  }

  function run(item) {
    if (!item) return;
    track('cmdk:run', { item: item.label });
    if (item.action === 'theme') {
      toggleTheme();
    } else if (item.action === 'grid') {
      gridEl?.classList.toggle('on');
    } else if (item.action === 'email') {
      navigator.clipboard?.writeText('work.raghavahuja@gmail.com').catch(() => {});
      track('contact:copy-email');
    } else if (item.action === 'chai') {
      showChai(); return;
    } else if (item.href) {
      if (item.href.startsWith('http')) window.open(item.href, '_blank', 'noopener');
      else window.location.href = item.href;
    }
    closeCmdk();
  }

  function showChai() {
    results.innerHTML = `<pre style="margin:0; padding:16px; color: var(--accent); font-size:12px; line-height:14px;">      ( (
       ) )
    .______.
    |      |]   masala chai — poured.
    \\      /
     \`----'</pre>`;
    setTimeout(() => { if (overlay.classList.contains('open')) render(); }, 2800);
  }

  document.getElementById('cmdk-trigger')?.addEventListener('click', openCmdk);
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeCmdk(); });
  input?.addEventListener('input', () => { sel = 0; render(); });
  results?.addEventListener('click', (e) => {
    const row = e.target.closest('.cmdk-row');
    if (!row) return;
    const i = parseInt(row.getAttribute('data-i'), 10);
    if (!isNaN(i)) run(currentFiltered[i]);
  });
  results?.addEventListener('mousemove', (e) => {
    const row = e.target.closest('.cmdk-row');
    if (!row) return;
    const i = parseInt(row.getAttribute('data-i'), 10);
    if (!isNaN(i) && i !== sel) { sel = i; render(); }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (overlay.classList.contains('open')) closeCmdk(); else openCmdk();
      return;
    }
    if (e.key === 'Escape') {
      if (overlay.classList.contains('open')) closeCmdk();
      if (vsDrawer.classList.contains('open')) closeVS();
    }
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, currentFiltered.length - 1); render(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
    if (e.key === 'Enter')     { e.preventDefault(); run(currentFiltered[sel]); }
    // focus trap — keep tab inside the palette while open
    if (e.key === 'Tab') {
      e.preventDefault();
      // only the input is a real focusable inside the palette; keeping focus there
      // is the simplest and most natural trap.
      input.focus();
    }
  });

  // ---------- konami ----------
  const code = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  const buf = [];
  const toast = document.getElementById('konami-toast');
  document.addEventListener('keydown', (e) => {
    buf.push(e.key);
    if (buf.length > code.length) buf.shift();
    if (buf.join(',') === code.join(',')) {
      document.documentElement.style.setProperty('--accent', '#33FF66');
      document.documentElement.style.setProperty('--accent-hover', '#66FF99');
      document.documentElement.style.setProperty('--accent-press', '#22CC44');
      if (toast) { toast.hidden = false; }
    }
  });
})();
