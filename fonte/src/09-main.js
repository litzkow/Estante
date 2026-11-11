/* ================= comfort & theme ================= */
function applyComfort() {
  $('#warm').style.opacity = (S.warm / 100 * 0.5).toFixed(3);
  $('#dim').style.opacity = (S.dim / 100 * 0.7).toFixed(3);
}
function applyTheme() {
  document.body.className = document.body.className.replace(/\bt-\w+/g, '').trim() + ' t-' + effTheme();
  const c = { claro: '#f6f4ef', sepia: '#efe3c8', escuro: '#141518', noite: '#000000' }[effTheme()];
  const m = $('meta[name=theme-color]'); if (m) m.content = c;
}
function themePicker(after) {
  const box = el('div', { class: 'themes' });
  const defs = [['auto', t('autoTheme'), 'linear-gradient(135deg,#fbfaf7 50%,#1e1f22 50%)', '#e8a33d'], ['claro', t('light'), '#fbfaf7', '#1d1c1a'], ['sepia', t('sepia'), '#f3e7cf', '#4a3b27'], ['escuro', t('dark'), '#1e1f22', '#d9d4cb'], ['noite', t('night'), '#000', '#9d968a']];
  const btns = defs.map(([k, label, bg, fg]) => el('button', { class: S.theme === k ? 'on' : '', style: { background: bg, color: fg, borderColor: S.theme === k ? 'var(--accent)' : (k === 'noite' ? '#333' : 'transparent') }, onclick: () => { setS('theme', k); applyTheme(); btns.forEach(x => { x.classList.remove('on'); x.style.borderColor = 'transparent'; }); const b = btns[defs.findIndex(d => d[0] === k)]; b.classList.add('on'); b.style.borderColor = 'var(--accent)'; after && after(); } }, el('b', { text: 'Aa' }), label));
  box.append(...btns); return box;
}
function comfortGroup() {
  return wGroup(t('eyeComfort'),
    el('div', { style: { margin: '4px 0 2px', fontSize: '14px', fontWeight: 600 }, text: t('warmFilter') }),
    wSlider(0, 100, 1, S.warm, v => { S.warm = v; applyComfort(); setS('warm', v); }, v => v + '%', 'flame'),
    el('div', { style: { margin: '12px 0 2px', fontSize: '14px', fontWeight: 600 }, text: t('dimScreen') }),
    wSlider(0, 100, 1, S.dim, v => { S.dim = v; applyComfort(); setS('dim', v); }, v => v + '%', 'moon'),
    wToggle(t('pauseRem'), t('pauseRemSub'), S.pause, v => setS('pause', v)));
}

/* ================= 20-20-20 reminder ================= */
const Pause = {
  acc: 0, last: 0, timer: null,
  start() { this.last = performance.now(); clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 15000); },
  stop() { clearInterval(this.timer); this.timer = null; },
  tick() {
    const now = performance.now();
    if (document.visibilityState === 'visible') this.acc += now - this.last;
    this.last = now;
    if (S.pause && this.acc >= 20 * 60 * 1000 && !Sheets.stack.length) { this.acc = 0; this.show(); }
  },
  show() {
    const bd = el('div', { class: 'backdrop center' });
    let n = 20;
    const count = el('div', { class: 'count', text: '20' });
    const card = el('div', { class: 'pause-card' }, el('div', { class: 'eye' }, icon('eye')), el('h3', { text: t('pauseTitle') }), el('p', { text: t('pauseText') }), count,
      el('button', { class: 'btn block', text: t('skip'), onclick: () => { clearInterval(iv); bd.remove(); } }));
    bd.append(card); $('#sheets').append(bd);
    const iv = setInterval(() => { n--; count.textContent = n; if (n <= 0) { clearInterval(iv); count.textContent = '✓'; card.querySelector('button').textContent = t('backToReading'); card.querySelector('button').classList.add('primary'); } }, 1000);
  },
};

/* ================= global settings ================= */
async function settingsSheet() {
  let est = null;
  try { est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; } catch (e) { }
  Sheets.open({
    title: t('settings'), body: b => {
      b.append(
        wGroup(t('language'), wSeg([['pt', 'Português'], ['en', 'English']], S.lang, v => { setS('lang', v); applyI18n(); Sheets.closeAll(); Lib.render(); settingsSheet(); })),
        wGroup(t('theme'), themePicker()),
        comfortGroup(),
        wGroup(t('comicsDefault'),
          wSeg([['quadros', t('mode_quadros'), 'panels'], ['largura', t('mode_largura'), 'width'], ['pagina', t('mode_pagina'), 'page']], S.cMode, v => setS('cMode', v)),
          el('div', { style: { height: '8px' } }),
          wSeg([['ltr', t('western'), 'ltr'], ['rtl', t('manga'), 'rtl']], S.cDir, v => setS('cDir', v))),
        wGroup(t('syncTitle'),
          Sync.ready ? wToggle(t('syncOn'), t('syncSub'), S.sync, v => { setS('sync', v); Lib.render(); }) : el('div', { class: 'banner' }, icon('cloud'), el('div', { text: t('syncUnavailable') }))),
        wGroup('Claude', el('div', { class: 'banner' }, icon('sparkle'), el('div', { text: AI.on ? t('aiAvailable') : t('aiUnavailable') }))),
        wGroup(t('storage'),
          el('div', { class: 'banner' }, icon('info'), el('div', { text: (DB.ok ? t('storageLocal') : t('memOnly')) + (est && est.usage ? ' ' + t('storageUsed', { u: fmtSize(est.usage) }) : '') })),
          el('button', { class: 'btn block', style: { marginTop: '6px' }, onclick: async () => { const all = await DB.all('books'); for (const x of all) { await DB.delPrefix('kv', 'pn:' + x.id + ':'); await DB.delPrefix('kv', 'th:' + x.id + ':'); } toast(t('cacheCleared')); } }, icon('trash'), t('clearCache'))),
        wGroup(t('howTo'), el('div', { class: 'list' },
          ...[['hand', t('help1')], ['panels', t('help2')], ['zoomIn', t('help3')], ['type', t('help4')], ['cloud', t('help6')]].map(([ic, tx]) => el('div', { class: 'li', style: { display: 'flex', gap: '12px', padding: '11px 2px', borderBottom: '1px solid var(--line)', fontSize: '14px', lineHeight: 1.45 } }, icon(ic), el('div', { class: 'lt', text: tx }))))),
        el('p', { class: 'muted', style: { textAlign: 'center', fontSize: '12px', marginTop: '22px' }, text: 'Estante · v1.0' }));
    }
  });
}

/* ================= i18n application ================= */
function applyI18n() {
  document.documentElement.lang = S.lang === 'en' ? 'en' : 'pt-BR';
  $$('[data-t]').forEach(e => { e.textContent = t(e.dataset.t); });
  $$('[data-tl]').forEach(e => { e.setAttribute('aria-label', t(e.dataset.tl)); e.title = t(e.dataset.tl); });
  $$('[data-tp]').forEach(e => { e.placeholder = t(e.dataset.tp); });
}

/* ================= app shell ================= */
const App = {
  view: 'v-lib',
  show(id) { if (id === 'v-lib' && this.view !== 'v-lib') setTimeout(() => Lib.render(), 0); this.view = id; $$('.view').forEach(v => v.classList.toggle('on', v.id === id)); Sheets.closeAll(); Book.hideSel && Book.hideSel(); },
  async init() {
    $$('[data-ic]').forEach(e => e.prepend(icon(e.dataset.ic)));
    await DB.open();
    await loadSettings();
    applyTheme(); applyComfort(); applyI18n();
    Comic.init(); Book.init(); PdfBook.init();
    // library controls
    $('#l-add').onclick = () => $('#l-file').click();
    $('#l-file').onchange = e => { const f = [...e.target.files]; e.target.value = ''; importFiles(f); };
    $('#l-set').onclick = () => settingsSheet();
    $('#l-sort').onclick = () => Lib.sortSheet();
    $('#l-search').onclick = () => { $('#l-sbar').classList.add('on'); $('#l-q').focus(); };
    $('#l-sclose').onclick = () => { $('#l-sbar').classList.remove('on'); $('#l-q').value = ''; Lib.q = ''; Lib.render(); };
    $('#l-q').addEventListener('input', debounce(() => { Lib.q = $('#l-q').value.trim(); Lib.render(); }, 200));
    // drag & drop (tablets / desktop)
    let dc = 0;
    addEventListener('dragenter', e => { if (this.view !== 'v-lib') return; e.preventDefault(); dc++; $('#l-drop').classList.add('on'); });
    addEventListener('dragover', e => { if (this.view === 'v-lib') e.preventDefault(); });
    addEventListener('dragleave', () => { if (--dc <= 0) { dc = 0; $('#l-drop').classList.remove('on'); } });
    addEventListener('drop', e => { e.preventDefault(); dc = 0; $('#l-drop').classList.remove('on'); if (this.view === 'v-lib' && e.dataTransfer && e.dataTransfer.files.length) importFiles(e.dataTransfer.files); });
    // keyboard
    addEventListener('keydown', e => {
      if (Sheets.stack.length) { if (e.key === 'Escape') Sheets.close(); return; }
      if (/INPUT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) return;
      if (this.view === 'v-comic') Comic.key2(e); else if (this.view === 'v-book') Book.key2(e); else if (this.view === 'v-pdf') PdfBook.key2(e);
    });
    // resize
    addEventListener('resize', debounce(() => { if (this.view === 'v-comic') Comic.relayout(); else if (this.view === 'v-book') Book.relayout(); }, 220));
    // stop iOS page zoom gestures inside readers
    document.addEventListener('gesturestart', e => e.preventDefault());
    // save on hide
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveRecSoon.flush(); });
    addEventListener('pagehide', () => saveRecSoon.flush());
    await Goal.init();
    Lib.animNext = true;
    await Lib.render();
    Splash.hide().then(() => Tour.maybe());
    // platform capabilities arrive later
    AI.init();
    Sync.init().then(async () => { if (Sync.on) { if (await Sync.pullPrefs()) { applyTheme(); applyComfort(); applyI18n(); } Lib.render(); } });
  },
};
document.addEventListener('DOMContentLoaded', () => App.init());
// installable version (GitHub Pages): offline cache + automatic updates
if ('serviceWorker' in navigator && /github\.io$/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.update && setInterval(() => reg.update(), 60 * 60 * 1000);
  }).catch(() => { });
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || App.view !== 'v-lib') return; reloaded = true; location.reload();
  });
}
