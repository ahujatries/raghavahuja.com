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
        <div class="availability"><span class="pulse"></span><span>open to roles</span></div>
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
    { kind: 'mail',   label: 'hire',         hint: 'mailto, subj: hiring',      href: 'mailto:work.raghavahuja@gmail.com?subject=hiring' },
    { kind: 'mail',   label: 'email',        hint: 'mailto, blank',             href: 'mailto:work.raghavahuja@gmail.com' },
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

  function filtered(){
    const q = cmdkQ.toLowerCase();
    return ITEMS.filter(i => !q || i.label.toLowerCase().includes(q) || i.hint.toLowerCase().includes(q));
  }
  function renderCmdk(){
    const el = document.getElementById('cmdk-overlay');
    if (!el) return;
    const items = filtered();
    if (cmdkSel >= items.length) cmdkSel = Math.max(0, items.length-1);
    const groups = {};
    items.forEach(it => { (groups[it.kind] = groups[it.kind] || []).push(it); });
    let idx = -1;
    const inner = `
      <div class="cmdk-pal" onclick="event.stopPropagation()">
        <div class="cmdk-input">
          <span style="color:var(--heat);font-size:14px;font-weight:600">›</span>
          <input id="cmdk-q" placeholder="type a thing — work · arqo · hire · email · resume · tweaks" value="${cmdkQ.replace(/"/g,'&quot;')}"/>
          <span class="cmdk-esc">ESC</span>
        </div>
        <div class="cmdk-list">
          ${items.length === 0 ? '<div style="padding:24px 20px;color:var(--fg-dim);font-size:13px;font-style:italic">nothing matches. that is the honest answer.</div>' : ''}
          ${Object.keys(groups).map(k => `
            <div class="cmdk-group">${groupLabels[k] || k.toUpperCase()}</div>
            ${groups[k].map(it => { idx++; const sel = idx === cmdkSel; return `
              <a class="cmdk-row${sel?' sel':''}" data-idx="${idx}" href="${it.href || '#'}" data-action="${it.action || ''}">
                <span>${it.label}</span><span class="cmdk-hint">${it.hint}</span>
              </a>
            `;}).join('')}
          `).join('')}
        </div>
        <div class="cmdk-foot"><span>↑↓ NAVIGATE · ↵ SELECT</span><span>${items.length} ITEMS</span></div>
      </div>`;
    el.innerHTML = inner;
    const inp = document.getElementById('cmdk-q');
    if (inp) {
      inp.focus();
      inp.addEventListener('input', (e) => { cmdkQ = e.target.value; cmdkSel = 0; renderCmdk(); });
    }
    el.querySelectorAll('.cmdk-row').forEach(row => {
      row.addEventListener('mouseenter', () => { cmdkSel = +row.dataset.idx; renderCmdk(); });
      row.addEventListener('click', (e) => {
        const idx = +row.dataset.idx;
        const it = items[idx];
        if (it.action === 'tweaks') { e.preventDefault(); closeCmdk(); openTweaks(); return; }
        if (it.action === 'theme')  { e.preventDefault(); /* no-op, doctrine */ closeCmdk(); return; }
        if (!it.href || it.href === '#') e.preventDefault();
      });
    });
  }
  function openCmdk(){
    if (cmdkOpen) return;
    cmdkOpen = true; cmdkQ = ''; cmdkSel = 0;
    const el = document.createElement('div');
    el.id = 'cmdk-overlay';
    document.body.appendChild(el);
    el.addEventListener('click', closeCmdk);
    renderCmdk();
  }
  function closeCmdk(){
    cmdkOpen = false;
    const el = document.getElementById('cmdk-overlay');
    if (el) el.remove();
  }
  window.addEventListener('open-cmdk', openCmdk);
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); cmdkOpen ? closeCmdk() : openCmdk(); }
    else if (e.key === 'Escape' && cmdkOpen) closeCmdk();
    else if (cmdkOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
      e.preventDefault();
      const items = filtered();
      if (e.key === 'ArrowDown') cmdkSel = Math.min(items.length-1, cmdkSel+1);
      if (e.key === 'ArrowUp')   cmdkSel = Math.max(0, cmdkSel-1);
      if (e.key === 'Enter')     {
        const it = items[cmdkSel];
        if (!it) return;
        if (it.action === 'tweaks') { closeCmdk(); openTweaks(); return; }
        if (it.action === 'theme')  { closeCmdk(); return; }
        if (it.href) location.href = it.href;
      }
      renderCmdk();
    }
  });
})();
