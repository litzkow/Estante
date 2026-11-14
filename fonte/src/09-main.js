/* ================= comfort & theme ================= */
// automatic eye comfort: warmer and a bit dimmer in the evening and at night (like Night Shift)
function autoComfort(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  const ramp = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  const night = h >= 12 ? ramp(h, 17.5, 21) : 1 - ramp(h, 5.5, 7.5);
  const late = h >= 12 ? ramp(h, 21, 23) : 1 - ramp(h, 4.5, 6);
  return { warm: Math.round(night * 45), dim: Math.round(late * 18) };
}
function applyComfort() {
  const c = S.comfortAuto ? autoComfort() : { warm: S.warm, dim: S.dim };
  $('#warm').style.opacity = (c.warm / 100 * 0.5).toFixed(3);
  $('#dim').style.opacity = (c.dim / 100 * 0.7).toFixed(3);
}
setInterval(() => { if (S.comfortAuto) applyComfort(); }, 5 * 60 * 1000);
function applyTheme() {
  document.body.className = document.body.className.replace(/\bt-\w+/g, '').trim() + ' t-' + effTheme();
  document.documentElement.className = 't-' + effTheme();
  const c = { claro: '#f6f4ef', sepia: '#efe3c8', escuro: '#141518', noite: '#000000', branco: '#f7f7f5', creme: '#f5eedd', quente: '#efe0c2', antigo: '#e2cfa8', eink: '#e7e7e2', meianoite: '#0d1320' }[effTheme()];
  const m = $('meta[name=theme-color]'); if (m) m.content = c;
}
function themePicker(after) {
  const box = el('div', { class: 'themes' });
  const defs = [['auto', t('autoTheme'), 'linear-gradient(135deg,#fbfaf7 50%,#1e1f22 50%)', '#e8a33d'], ['claro', t('light'), '#fbfaf7', '#1d1c1a'], ['branco', t('thBranco'), '#ffffff', '#141414'], ['creme', t('thCreme'), '#f8f1e1', '#2f281d'], ['quente', t('thQuente'), '#f2e2c0', '#3a2c18'], ['sepia', t('sepia'), '#f3e7cf', '#4a3b27'], ['antigo', t('thAntigo'), 'radial-gradient(circle,#f0e0bd 30%,#c9a86e)', '#3b2a14'], ['eink', t('thEink'), '#e9e9e4', '#2a2a2a'], ['escuro', t('dark'), '#1e1f22', '#d9d4cb'], ['meianoite', t('thMeia'), '#101828', '#c3cad6'], ['noite', t('night'), '#000', '#9d968a']];
  const btns = defs.map(([k, label, bg, fg]) => el('button', { class: S.theme === k ? 'on' : '', style: { background: bg, color: fg, borderColor: S.theme === k ? 'var(--accent)' : (k === 'noite' ? '#333' : 'transparent') }, onclick: () => { setS('theme', k); applyTheme(); btns.forEach(x => { x.classList.remove('on'); x.style.borderColor = 'transparent'; }); const b = btns[defs.findIndex(d => d[0] === k)]; b.classList.add('on'); b.style.borderColor = 'var(--accent)'; after && after(); } }, el('b', { text: 'Aa' }), label));
  box.append(...btns); return box;
}
function comfortGroup() {
  const manual = el('div', { class: S.comfortAuto ? 'hide' : '' });
  const box = wGroup(t('eyeComfort'),
    wToggle(t('comfortAuto'), t('comfortAutoSub'), S.comfortAuto, v => { setS('comfortAuto', v); applyComfort(); manual.classList.toggle('hide', v); }),
    manual,
    wToggle(t('pauseRem'), t('pauseRemSub'), S.pause, v => setS('pause', v)));
  manual.append(
    el('div', { style: { margin: '10px 0 2px', fontSize: '14px', fontWeight: 600 }, text: t('warmFilter') }),
    wSlider(0, 100, 1, S.warm, v => { S.warm = v; applyComfort(); setS('warm', v); }, v => v + '%', 'flame'),
    el('div', { style: { margin: '12px 0 2px', fontSize: '14px', fontWeight: 600 }, text: t('dimScreen') }),
    wSlider(0, 100, 1, S.dim, v => { S.dim = v; applyComfort(); setS('dim', v); }, v => v + '%', 'moon'));
  return box;
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
        wGroup(t('homeScreen'),
          wToggle(t('showGoal'), t('showGoalSub'), S.showGoal, v => { setS('showGoal', v); Lib.render(); }),
          wToggle(t('showContinue'), null, S.showContinue, v => { setS('showContinue', v); Lib.render(); }),
          el('div', { style: { margin: '12px 0 6px', fontSize: '14px', fontWeight: 600 }, text: t('pageTurn') }),
          wSeg([['curl', t('ptCurl')], ['hard', t('ptHard')], ['slide', t('ptSlide')], ['vertical', t('ptVertical')], ['fade', t('ptFade')], ['none', t('ptNone')]], S.bTurn || 'slide', x => { setS('bTurn', x); setS('bAnim', x !== 'none'); }, 'wrap')),
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
        el('p', { class: 'muted', style: { textAlign: 'center', fontSize: '12px', marginTop: '22px' }, text: 'Estante · v1.1' }));
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
  show(id) { document.documentElement.dataset.view = id; if (id === 'v-lib' && this.view !== 'v-lib') setTimeout(() => Lib.render(), 0); this.view = id; $$('.view').forEach(v => v.classList.toggle('on', v.id === id)); Sheets.closeAll(); Book.hideSel && Book.hideSel(); },
  async init() {
    $$('[data-ic]').forEach(e => e.prepend(icon(e.dataset.ic)));
    await DB.open();
    await loadSettings();
    applyTheme(); applyComfort(); applyI18n();
    Comic.init(); Book.init(); PdfBook.init(); TTS.init();
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
    Splash.hide().then(() => { Tour.maybe(); Starter.run(); });
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
