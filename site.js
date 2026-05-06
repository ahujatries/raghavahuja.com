// site.js — shared chrome: topbar inject, dual clock, ⌘K, tweaks (heat color)
(function(){
  // --- 1. Inject topbar ---
  const slot = document.getElementById('topbar-slot');
  if (slot) {
    const here = location.pathname.replace(/\/+$/, '/').replace(/index\.html$/, '');
    slot.innerHTML = renderTopbar(here);
    wireTopbar();
  }

  // --- 2. Dual clock ---
  function dualClock() {
    const fmt = (tz) => new Intl.DateTimeFormat('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:tz }).format(new Date());
    return `<div style="display:flex;gap:18px;align-items:center;font-family:var(--font-mono)">
      <div style="display:flex;flex-direction:column;gap:2px">
        <div style="font-size:9.5px;letter-spacing:0.12em;text-transform:uppercase;color:var(--fg-faint)">BROOKLYN</div>
        <div style="font-size:13px;color:var(--fg-dim);font-variant-numeric:tabular-nums">${fmt('America/New_York')}</div>
      </div>
      <div style="width:1px;height:20px;background:var(--rule)"></div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <div style="font-size:9.5px;letter-spacing:0.12em;text-transform:uppercase;color:var(--fg-faint)">MUMBAI</div>
        <div style="font-size:13px;color:var(--fg-dim);font-variant-numeric:tabular-nums">${fmt('Asia/Kolkata')}</div>
      </div>
    </div>`;
  }
  function tickClock(){
    const el = document.getElementById('topbar-clock');
    if (el) el.innerHTML = dualClock();
  }
  tickClock(); setInterval(tickClock, 30000);

  function renderTopbar(path){
    const has = (seg) => path.startsWith(seg);
    return `
    <header class="topbar">
      <a href="/" class="wm">raghav<span class="dot">.</span><span class="meta">/ design engineer</span></a>
      <nav class="nav">
        <a href="/work" class="${has('/work') ? 'active' : ''}">work</a>
        <a href="/receipts" class="${has('/receipts') ? 'active' : ''}">receipts</a>
        <a href="/about" class="${has('/about') ? 'active' : ''}">about</a>
        <a href="/now" class="${has('/now') ? 'active' : ''}">now</a>
        <a href="/stack" class="${has('/stack') ? 'active' : ''}">stack</a>
        <a href="mailto:work.raghavahuja@gmail.com">email</a>
      </nav>
      <div class="right">
        <div id="topbar-clock"></div>
        <button class="kbd" id="cmdk-trigger">⌘K</button>
      </div>
    </header>`;
  }

  function wireTopbar(){
    const btn = document.getElementById('cmdk-trigger');
    if (btn) btn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('open-cmdk')));
  }

  // --- 3. Tweaks: heat color (sodium / iodine / sienna) ---
  const HEAT = /*EDITMODE-BEGIN*/{
    "heat": "sodium"
  }/*EDITMODE-END*/;
  const PRESETS = {
    sodium:  { heat: '#ff7a2b', pressed: '#e0651c' },
    iodine:  { heat: '#d83a2a', pressed: '#b82c1f' },
    sienna:  { heat: '#c45a2e', pressed: '#a14722' },
  };
  function applyHeat(name){
    const p = PRESETS[name] || PRESETS.sodium;
    document.documentElement.style.setProperty('--heat', p.heat);
    document.documentElement.style.setProperty('--heat-pressed', p.pressed);
    try { localStorage.setItem('heat', name); } catch(e){}
  }
  const saved = (function(){ try { return localStorage.getItem('heat'); } catch(e){ return null; }})();
  applyHeat(saved || HEAT.heat);

  // Tweaks panel
  let tweaksOpen = false;
  function buildTweaksPanel(){
    const el = document.createElement('div');
    el.id = 'tweaks-panel';
    el.style.cssText = `
      position: fixed; right: 24px; bottom: 24px;
      width: 280px; background: var(--bg-deeper);
      border: 1px solid var(--rule-strong);
      padding: 16px; z-index: 999;
      font-family: var(--font-mono); font-size: 12px;
      box-shadow: 0 0 0 1px var(--rule-strong);
      animation: tweak-in 200ms var(--ease);
    `;
    const cur = (function(){ try { return localStorage.getItem('heat') || HEAT.heat; } catch(e){ return HEAT.heat; }})();
    el.innerHTML = `
      <style>@keyframes tweak-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }</style>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:10.5px;letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-dim);font-weight:600">TWEAKS</div>
        <button id="tweaks-close" style="background:none;border:none;color:var(--fg-dim);cursor:pointer;font-size:14px">×</button>
      </div>
      <div style="font-size:9.5px;letter-spacing:0.14em;text-transform:uppercase;color:var(--fg-faint);margin-bottom:8px">HEAT COLOR</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
        ${['sodium','iodine','sienna'].map(name => `
          <button data-heat="${name}" style="
            border:1px solid ${cur===name?'var(--heat)':'var(--rule-strong)'};
            background:transparent;padding:10px 6px;cursor:pointer;
            color:${cur===name?'var(--heat)':'var(--fg-dim)'};
            font-family:inherit;font-size:11px;letter-spacing:0.08em;
            display:flex;flex-direction:column;align-items:center;gap:6px;
          ">
            <span style="width:18px;height:18px;background:${PRESETS[name].heat};display:block"></span>
            ${name}
          </button>
        `).join('')}
      </div>
      <div style="font-size:11px;color:var(--fg-faint);margin-top:14px;line-height:1.5">
        the brand color is the streetlamp at 2am. pick one and live with it.
      </div>
    `;
    el.querySelector('#tweaks-close').addEventListener('click', closeTweaks);
    el.querySelectorAll('[data-heat]').forEach(b => {
      b.addEventListener('click', () => { applyHeat(b.dataset.heat); closeTweaks(); openTweaks(); });
    });
    document.body.appendChild(el);
  }
  function openTweaks(){
    closeTweaks();
    buildTweaksPanel();
    tweaksOpen = true;
  }
  function closeTweaks(){
    const el = document.getElementById('tweaks-panel');
    if (el) el.remove();
    tweaksOpen = false;
  }
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === '__activate_edit_mode') openTweaks();
    if (e.data.type === '__deactivate_edit_mode') closeTweaks();
  });
  window.parent.postMessage({type:'__edit_mode_available'}, '*');

  // --- 4. ⌘K palette ---
  let cmdkOpen = false, cmdkSel = 0, cmdkQ = '';
  const ITEMS = [
    { kind: 'go',     label: 'home',         hint: '/',                         href: '/' },
    { kind: 'go',     label: 'work',         hint: 'all case studies',          href: '/work' },
    { kind: 'go',     label: 'arqo',         hint: 'open the arqo case study',  href: '/work/arqo' },
    { kind: 'go',     label: 'jmnpr',        hint: 'one-person studio',         href: '/work/jmnpr' },
    { kind: 'go',     label: 'EF',           hint: 'request access',            href: '/work/ef' },
    { kind: 'go',     label: 'receipts',     hint: 'weekend builds',            href: '/receipts' },
    { kind: 'go',     label: 'about',        hint: '/about',                    href: '/about' },
    { kind: 'go',     label: 'now',          hint: '/now',                      href: '/now' },
    { kind: 'go',     label: 'stack',        hint: '/stack',                    href: '/stack' },
    { kind: 'mail',   label: 'email',        hint: 'mailto · work.raghavahuja@gmail.com', href: 'mailto:work.raghavahuja@gmail.com' },
    { kind: 'mail',   label: 'contact',      hint: 'open the contact page',     href: '/contact' },
    { kind: 'social', label: 'github',       hint: '↗',                         href: 'https://github.com/raghavahuja' },
    { kind: 'social', label: 'linkedin',     hint: '↗',                         href: 'https://www.linkedin.com/in/raghavahuja/' },
    { kind: 'social', label: 'twitter',      hint: '↗',                         href: 'https://twitter.com/ahujatries' },
    { kind: 'file',   label: 'resume',       hint: 'download the pdf',          href: '/resume.pdf' },
    { kind: 'sys',    label: 'theme',        hint: 'toggle (off — by design)',  action: 'theme' },
    { kind: 'sys',    label: 'tweaks',       hint: 'open the heat color panel', action: 'tweaks' },
    { kind: 'sys',    label: 'hot & cold',   hint: 'live receipt — temperatures',href: '/hot-cold' },
    { kind: 'sys',    label: 'mamdani map',  hint: 'live receipt — nyc mayor',  href: '/mamdani-mapper' },
  ];
  const groupLabels = { go: 'NAVIGATE', mail: 'EMAIL', social: 'SOCIAL', file: 'FILES', sys: 'SYSTEM' };

  function isExt(it){ return it && (it.kind === 'mail' || it.kind === 'social' || it.kind === 'file'); }
  function filtered(){
    const q = cmdkQ.toLowerCase().trim();
    return ITEMS.filter(i => !q || i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q));
  }

  // Build the palette chrome once. Input listener attaches once, so caret/IME state survives every list re-render.
  function mountCmdk(){
    const el = document.getElementById('cmdk-overlay');
    if (!el) return;
    el.innerHTML = `
      <div class="cmdk-pal" onclick="event.stopPropagation()">
        <div class="cmdk-input">
          <span style="color:var(--heat);font-size:14px;font-weight:600">›</span>
          <input id="cmdk-q" placeholder="type a thing — work · arqo · email · resume · tweaks" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"/>
          <span class="cmdk-esc">ESC</span>
        </div>
        <div class="cmdk-list" id="cmdk-list"></div>
        <div class="cmdk-foot" id="cmdk-foot"></div>
      </div>`;
    const inp = document.getElementById('cmdk-q');
    inp.value = cmdkQ;
    inp.focus();
    // Caret to end so re-opens feel natural.
    try { inp.setSelectionRange(cmdkQ.length, cmdkQ.length); } catch (_) {}
    inp.addEventListener('input', () => {
      cmdkQ = inp.value;
      cmdkSel = 0;
      renderList();
    });
    renderList();
  }

  function renderList(){
    const list = document.getElementById('cmdk-list');
    const foot = document.getElementById('cmdk-foot');
    if (!list) return;
    const items = filtered();
    if (cmdkSel >= items.length) cmdkSel = Math.max(0, items.length - 1);
    const groups = {};
    items.forEach(it => { (groups[it.kind] = groups[it.kind] || []).push(it); });
    let idx = -1;
    list.innerHTML = items.length === 0
      ? '<div style="padding:24px 20px;color:var(--fg-dim);font-size:13px;font-style:italic">nothing matches. that is the honest answer.</div>'
      : Object.keys(groups).map(k => `
          <div class="cmdk-group">${groupLabels[k] || k.toUpperCase()}</div>
          ${groups[k].map(it => { idx++; const sel = idx === cmdkSel; const ext = isExt(it); return `
            <a class="cmdk-row${sel?' sel':''}" data-idx="${idx}" href="${it.href || '#'}" data-action="${it.action || ''}"${ext ? ' target="_blank" rel="noopener"' : ''}>
              <span>${it.label}</span><span class="cmdk-hint">${it.hint}</span>
            </a>
          `;}).join('')}
        `).join('');
    foot.innerHTML = `<span>↑↓ NAVIGATE · ↵ SELECT · ESC CLOSE</span><span>${items.length} ITEM${items.length===1?'':'S'}</span>`;
    const rows = list.querySelectorAll('.cmdk-row');
    rows.forEach(row => {
      // Hover only toggles .sel — no DOM rebuild, no focus loss while typing.
      row.addEventListener('mouseenter', () => {
        const next = +row.dataset.idx;
        if (next === cmdkSel) return;
        cmdkSel = next;
        rows.forEach(r => r.classList.toggle('sel', +r.dataset.idx === cmdkSel));
      });
      row.addEventListener('click', (e) => {
        const it = filtered()[+row.dataset.idx];
        if (!it) { e.preventDefault(); return; }
        if (it.action === 'tweaks') { e.preventDefault(); closeCmdk(); openTweaks(); return; }
        if (it.action === 'theme')  { e.preventDefault(); closeCmdk(); return; }
        if (!it.href || it.href === '#') { e.preventDefault(); return; }
        // External (target=_blank) opens a new tab — close the overlay so the current page is usable.
        // Internal — default <a> handles navigation; close so the overlay doesn't briefly persist.
        closeCmdk();
      });
    });
  }

  function moveSel(delta){
    const items = filtered();
    if (!items.length) return;
    cmdkSel = Math.max(0, Math.min(items.length - 1, cmdkSel + delta));
    const list = document.getElementById('cmdk-list');
    if (!list) return;
    list.querySelectorAll('.cmdk-row').forEach(r => r.classList.toggle('sel', +r.dataset.idx === cmdkSel));
    const sel = list.querySelector('.cmdk-row.sel');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  }

  function openCmdk(){
    if (cmdkOpen) return;
    cmdkOpen = true; cmdkQ = ''; cmdkSel = 0;
    const el = document.createElement('div');
    el.id = 'cmdk-overlay';
    document.body.appendChild(el);
    el.addEventListener('click', closeCmdk);
    mountCmdk();
  }
  function closeCmdk(){
    cmdkOpen = false;
    const el = document.getElementById('cmdk-overlay');
    if (el) el.remove();
  }
  window.addEventListener('open-cmdk', openCmdk);
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      cmdkOpen ? closeCmdk() : openCmdk();
      return;
    }
    if (!cmdkOpen) return;
    if (e.key === 'Escape')    { e.preventDefault(); closeCmdk(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1);  return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); moveSel(-1); return; }
    if (e.key === 'Enter')     {
      e.preventDefault();
      const it = filtered()[cmdkSel];
      if (!it) return;
      if (it.action === 'tweaks') { closeCmdk(); openTweaks(); return; }
      if (it.action === 'theme')  { closeCmdk(); return; }
      if (it.href && it.href !== '#') {
        if (isExt(it)) window.open(it.href, '_blank', 'noopener');
        else location.href = it.href;
        closeCmdk();
      }
    }
  });
})();
