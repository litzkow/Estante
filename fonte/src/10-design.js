/* ================= design: splash, tour, daily goal, open transition, auto theme ================= */
const LOGO = `<svg viewBox="0 0 120 120" class="logo" aria-hidden="true">
  <g class="lg-books">
    <g class="lb" style="--d:0"><rect x="27" y="30" width="15" height="62" rx="2.6" fill="#e8a33d"/><rect x="27" y="37" width="15" height="2.2" fill="#a77526"/><rect x="27" y="81" width="15" height="2.2" fill="#a77526"/></g>
    <g class="lb" style="--d:1"><rect x="45" y="20" width="15" height="72" rx="2.6" fill="#f6ecd6"/><rect x="45" y="27" width="15" height="2.2" fill="#b3ab9a"/><rect x="45" y="81" width="15" height="2.2" fill="#b3ab9a"/></g>
    <g class="lb" style="--d:2"><rect x="63" y="36" width="13" height="56" rx="2.6" fill="#d9694a"/><rect x="63" y="43" width="13" height="2.2" fill="#9c4b35"/><rect x="63" y="81" width="13" height="2.2" fill="#9c4b35"/></g>
    <g class="lb lean" style="--d:3"><g transform="rotate(17 80 92)"><rect x="80" y="36" width="13" height="56" rx="2.6" fill="#7aa6c9"/><rect x="80" y="43" width="13" height="2.2" fill="#587892"/></g></g>
  </g>
  <rect class="lg-shelf" x="18" y="92" width="84" height="4" rx="2" fill="#f6ecd6"/>
</svg>`;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- splash ---------- */
const Splash = {
  t0: performance.now(),
  async hide() {
    const s = $('#splash'); if (!s) return;
    const min = reduceMotion() ? 0 : 1500;
    const wait = Math.max(0, min - (performance.now() - this.t0));
    await new Promise(r => { const tm = setTimeout(r, wait); s.onclick = () => { clearTimeout(tm); r(); }; });
    s.classList.add('out');
    setTimeout(() => s.remove(), 520);
  },
};

/* ---------- first-run tour ---------- */
const TOUR_ART = {
  welcome: LOGO,
  add: `<svg viewBox="0 0 200 150"><rect x="62" y="8" width="76" height="134" rx="12" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>
    <g fill="var(--card2)"><rect x="72" y="26" width="17" height="25" rx="2"/><rect x="92" y="26" width="17" height="25" rx="2"/><rect x="112" y="26" width="17" height="25" rx="2"/><rect x="72" y="58" width="17" height="25" rx="2"/></g>
    <rect x="92" y="58" width="17" height="25" rx="2" fill="#e8a33d" class="tw-pop"/>
    <g class="tw-files"><rect x="10" y="40" width="34" height="42" rx="4" fill="#d9694a"/><text x="27" y="66" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">CBZ</text>
    <rect x="156" y="60" width="34" height="42" rx="4" fill="#7aa6c9"/><text x="173" y="86" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">EPUB</text></g>
    <rect x="100" y="112" width="30" height="18" rx="7" fill="#e8a33d"/><path d="M115 116v10M110 121h10" stroke="#1a1307" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  comic: `<svg viewBox="0 0 200 150"><rect x="40" y="6" width="120" height="138" rx="6" fill="#fff" stroke="var(--line)" stroke-width="2"/>
    <g fill="#c9d6e3"><rect x="48" y="14" width="104" height="38" rx="2"/><rect x="48" y="58" width="50" height="40" rx="2"/><rect x="48" y="104" width="104" height="32" rx="2"/></g>
    <circle cx="70" cy="30" r="8" fill="#e8a33d"/><path d="M58 52l20-16 14 10 18-14 42 20" fill="#9fb6cc"/>
    <rect x="102" y="58" width="50" height="40" rx="2" fill="#f2b8a0" class="tw-panel"/><ellipse cx="127" cy="72" rx="13" ry="7" fill="#fff"/>
    <rect x="102" y="58" width="50" height="40" rx="3" fill="none" stroke="#e8a33d" stroke-width="3" class="tw-focus"/></svg>`,
  book: `<svg viewBox="0 0 200 150"><rect x="30" y="10" width="140" height="130" rx="8" fill="var(--paper)" stroke="var(--line)" stroke-width="2"/>
    <g fill="var(--muted)" opacity=".45"><rect x="46" y="28" width="108" height="5" rx="2.5"/><rect x="46" y="42" width="96" height="5" rx="2.5"/><rect x="46" y="70" width="104" height="5" rx="2.5"/><rect x="46" y="84" width="88" height="5" rx="2.5"/><rect x="46" y="112" width="100" height="5" rx="2.5"/></g>
    <rect x="44" y="53" width="94" height="11" rx="3" fill="#e8a33d" opacity=".55" class="tw-hl"/><rect x="46" y="56" width="90" height="5" rx="2.5" fill="var(--fg)" opacity=".7"/>
    <g class="tw-bar"><rect x="70" y="94" width="96" height="30" rx="10" fill="#202126"/><circle cx="88" cy="109" r="5" fill="#e8a33d"/><circle cx="108" cy="109" r="5" fill="#7aa6c9"/><path d="M124 104l2 4 4 1-4 1-2 4-2-4-4-1 4-1z" fill="#fff"/><rect x="138" y="106" width="18" height="5" rx="2.5" fill="#fff" opacity=".7"/></g></svg>`,
  comfort: `<svg viewBox="0 0 200 150"><defs><linearGradient id="twg" x1="0" x2="1"><stop offset="0" stop-color="#7aa6c9"/><stop offset="1" stop-color="#e8a33d"/></linearGradient></defs>
    <rect x="30" y="60" width="140" height="10" rx="5" fill="url(#twg)"/><circle cx="130" cy="65" r="11" fill="#fff" stroke="#e8a33d" stroke-width="3" class="tw-knob"/>
    <path d="M60 30c12-14 34-14 46 0-12 14-34 14-46 0z" fill="none" stroke="var(--fg)" stroke-width="3"/><circle cx="83" cy="30" r="6" fill="var(--fg)"/>
    <text x="132" y="38" font-size="20" font-weight="700" fill="#e8a33d">20·20·20</text>
    <g fill="var(--muted)" opacity=".7"><rect x="40" y="92" width="120" height="6" rx="3"/><rect x="40" y="106" width="100" height="6" rx="3"/><rect x="40" y="120" width="110" height="6" rx="3"/></g></svg>`,
};
const Tour = {
  maybe() { if (!S.toured) this.show(); },
  show() {
    const slides = [['welcome', 'tw1t', 'tw1'], ['add', 'tw2t', 'tw2'], ['comic', 'tw3t', 'tw3'], ['book', 'tw4t', 'tw4'], ['comfort', 'tw5t', 'tw5']];
    let i = 0;
    const art = el('div', { class: 'tw-art' }), h = el('h2'), p = el('p'), dots = el('div', { class: 'tw-dots' }, ...slides.map(() => el('i')));
    const next = el('button', { class: 'btn primary', onclick: () => go(i + 1) });
    const skip = el('button', { class: 'btn ghost', text: t('skip'), onclick: () => end() });
    const card = el('div', { class: 'tw-card' }, art, el('div', { class: 'tw-txt' }, h, p), dots, el('div', { class: 'tw-btns' }, skip, next));
    const bd = el('div', { class: 'tour' }, card);
    const go = n => {
      if (n >= slides.length) return end();
      i = n; const [k, tt, tx] = slides[i];
      card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
      art.innerHTML = TOUR_ART[k]; h.textContent = t(tt); p.textContent = t(tx);
      [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i));
      next.textContent = i === slides.length - 1 ? t('twStart') : t('twNext');
      skip.style.visibility = i === slides.length - 1 ? 'hidden' : '';
    };
    const end = () => { setS('toured', true); bd.classList.add('out'); setTimeout(() => bd.remove(), 300); };
    let sx = null;
    card.addEventListener('pointerdown', e => sx = e.clientX);
    card.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (dx < -50) go(i + 1); else if (dx > 50 && i > 0) go(i - 1); });
    document.body.append(bd); go(0);
  },
};

/* ---------- reading time, daily goal and streak ---------- */
const Goal = {
  days: {}, lastInput: 0,
  ymd(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
  async init() {
    this.days = (await DB.get('kv', 'stats').catch(() => null) || {}).days || {};
    const mark = () => this.lastInput = performance.now();
    ['pointerdown', 'keydown', 'wheel'].forEach(ev => addEventListener(ev, mark, { passive: true, capture: true }));
    setInterval(() => this.tick(), 15000);
  },
  tick() {
    if (App.view === 'v-lib' || document.visibilityState !== 'visible' || performance.now() - this.lastInput > 3 * 60 * 1000) return;
    const k = this.ymd(); const before = this.today();
    this.days[k] = (this.days[k] || 0) + 15;
    if (before < S.goalMin * 60 && this.today() >= S.goalMin * 60) toast(t('goalDone'));
    this.save();
  },
  save: debounce(() => { DB.put('kv', 'stats', { days: Goal.days }).catch(() => { }); }, 2000),
  today() { return this.days[this.ymd()] || 0; },
  streak() {
    const g = S.goalMin * 60, d = new Date(); let n = 0;
    if ((this.days[this.ymd(d)] || 0) >= g) n++;
    for (; ;) { d.setDate(d.getDate() - 1); if ((this.days[this.ymd(d)] || 0) >= g) n++; else break; }
    return n;
  },
  week() {
    const out = [], d = new Date(); d.setDate(d.getDate() - 6);
    for (let j = 0; j < 7; j++) { out.push([new Date(d), this.days[this.ymd(d)] || 0]); d.setDate(d.getDate() + 1); }
    return out;
  },
  ring(frac, size = 56) {
    const r = 23, c = 2 * Math.PI * r, f = Math.min(1, frac);
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 56 56'); s.setAttribute('class', 'ring' + (f >= 1 ? ' full' : '')); s.style.width = s.style.height = size + 'px';
    s.innerHTML = `<circle cx="28" cy="28" r="${r}" class="rt"/><circle cx="28" cy="28" r="${r}" class="rv" stroke-dasharray="${c}" stroke-dashoffset="${c}" style="--to:${c * (1 - f)}"/>`;
    return s;
  },
  widget() {
    const sec = this.today(), g = S.goalMin * 60, st = this.streak(), min = Math.floor(sec / 60);
    return el('button', { class: 'today', onclick: () => this.sheet() },
      el('div', { class: 'tring' }, this.ring(sec / g), el('b', { text: sec >= g ? '✓' : String(min) })),
      el('div', { class: 'tinfo' },
        el('div', { class: 'tl', text: t('today') }),
        el('div', { class: 'tv', text: sec >= g ? t('goalMet') : t('goalOf').replace('{n}', min).replace('{g}', S.goalMin) })),
      el('div', { class: 'streak' + (st ? ' on' : '') }, icon('flame'), el('span', { text: String(st) })));
  },
  sheet() {
    const s = Sheets.open({
      title: t('goalTitle'), body: b => {
        const wk = this.week(), g = S.goalMin * 60, max = Math.max(g, ...wk.map(x => x[1]));
        const days = (S.lang === 'en' ? 'SMTWTFS' : 'DSTQQSS').split('');
        b.append(el('div', { class: 'gstats' },
          el('div', {}, el('b', { text: String(this.streak()) }), el('span', { text: t('streakDays') })),
          el('div', {}, el('b', { text: String(Math.round(wk.reduce((a, x) => a + x[1], 0) / 60)) }), el('span', { text: t('weekMin') }))),
          el('div', { class: 'week' }, ...wk.map(([d, v]) => el('div', { class: 'wd' + (v >= g ? ' met' : '') },
            el('div', { class: 'wb' }, el('i', { style: { height: Math.max(4, v / max * 100) + '%' } }), el('hr', { style: { bottom: (g / max * 100) + '%' } })),
            el('span', { text: days[d.getDay()] })))),
          el('div', { class: 'gl', style: { margin: '18px 0 8px' }, text: t('dailyGoal') }));
        const row = el('div', { class: 'seg goalseg' });
        for (const m of [5, 10, 15, 20, 30, 45, 60]) row.append(el('button', { class: S.goalMin === m ? 'on' : '', text: m + ' min', onclick: () => { setS('goalMin', m); Sheets.close(s); Lib.render(); } }));
        b.append(row, el('button', { class: 'btn block', style: { marginTop: '14px' }, text: t('hideGoal'), onclick: () => { setS('showGoal', false); Sheets.close(s); Lib.render(); toast(t('hideGoalToast')); } }));
      },
    });
  },
};

/* ---------- opening transition: the cover grows into the reader ---------- */
const OpenFx = {
  start(from, bg) {
    if (!from || reduceMotion()) return null;
    const r = from.getBoundingClientRect(); if (!r.width) return null;
    const box = el('div', { class: 'openfx', style: { background: bg } });
    const img = from.querySelector('img, .gen'); if (img) box.append(img.cloneNode(true));
    document.body.append(box);
    const W = innerWidth, H = innerHeight;
    const a = box.animate([
      { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: '8px' },
      { left: '0px', top: '0px', width: W + 'px', height: H + 'px', borderRadius: '0px' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    if (box.firstChild) box.firstChild.animate([{ opacity: 1 }, { opacity: 1, offset: .45 }, { opacity: 0 }], { duration: 420, fill: 'forwards' });
    return { box, done: a.finished };
  },
  async end(fx) {
    if (!fx) return;
    await fx.done.catch(() => { });
    const a = fx.box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
    await a.finished.catch(() => { }); fx.box.remove();
  },
};

/* ---------- greeting ---------- */
function greeting() {
  const h = new Date().getHours();
  return t(h < 5 ? 'gNight' : h < 12 ? 'gMorning' : h < 18 ? 'gAfternoon' : 'gNight');
}

/* ---------- automatic theme ---------- */
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
function effTheme() { return S.theme === 'auto' ? (darkMQ.matches ? 'escuro' : 'claro') : S.theme; }
darkMQ.addEventListener && darkMQ.addEventListener('change', () => { if (S.theme === 'auto') applyTheme(); });

/* ---------- free books bundled with the site: added to the shelf automatically ---------- */
const Starter = {
  base: /github\.io$/.test(location.hostname) ? 'livros/' : 'https://litzkow.github.io/Estante/livros/',
  async run() {
    let cat;
    try { cat = await (await fetch(this.base + 'catalogo.json', { cache: 'no-cache' })).json(); } catch (e) { return; }
    await this.tag(cat);
    const got = new Set(S.starterGot || []);
    const todo = cat.filter(x => !got.has(x.file));
    if (!todo.length) return;
    const ban = el('div', { class: 'banner dl' }, icon('download'), el('div', { class: 'dlt' }, el('div', { class: 'dlm' }), el('div', { class: 'hbar' }, el('i'))));
    $('#l-banner').append(ban);
    const total = todo.reduce((a, x) => a + x.size, 0); let done = 0, k = 0;
    const upd = name => { ban.querySelector('.dlm').textContent = t('dlBooks').replace('{n}', ++k).replace('{t}', todo.length) + ' · ' + name; ban.querySelector('i').style.width = Math.round(done / total * 100) + '%'; };
    const batch = [];
    const flush = async () => { if (batch.length) { await importFiles(batch.splice(0)); setS('starterGot', [...got]); } };
    for (const x of todo) {
      upd(x.title);
      try {
        const r = await fetch(this.base + encodeURIComponent(x.file));
        if (!r.ok) throw new Error(r.status);
        const reader = r.body.getReader(); const parts = [];
        for (; ;) { const { done: d, value } = await reader.read(); if (d) break; parts.push(value); done += value.length; ban.querySelector('i').style.width = Math.round(done / total * 100) + '%'; }
        batch.push(new File(parts, x.file)); got.add(x.file);
        if (x.big) await flush();
      } catch (e) { console.warn('starter', x.file, e); }
    }
    await flush();
    ban.remove();
    await this.tag(cat);
  },
  async tag(cat) {
    let ch = false;
    for (const b of await DB.all('books')) {
      const x = cat.find(x => x.file === b.fname);
      if (!x) continue;
      if (x.work && (b.work !== x.work || b.lang !== x.lang)) { b.work = x.work; b.lang = x.lang; await DB.put('books', b.id, b); ch = true; }
      if (x.cover && b.cv !== x.cv) {
        try { const r = await fetch(this.base + x.cover); if (r.ok) { b.cover = await r.blob(); b.cv = x.cv; await DB.put('books', b.id, b); ch = true; } } catch (e) { }
      }
    }
    if (ch) Lib.render();
  },
};
