'use strict';
/* ================= utilities ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const natCmp = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;
const fold = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function debounce(fn, ms) {
  let tm = null, last = null;
  const d = (...a) => { last = a; clearTimeout(tm); tm = setTimeout(() => { tm = null; const x = last; last = null; fn(...x); }, ms); };
  d.flush = () => { if (tm) { clearTimeout(tm); tm = null; const x = last; last = null; return fn(...x); } };
  return d;
}
function fmtSize(b) { if (!b) return '—'; const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return (i ? b.toFixed(1) : b) + ' ' + u[i]; }
function cleanTitle(name) { return name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Sem título'; }
function hueOf(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; }
function dirname(p) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
function resolvePath(base, rel) {
  rel = (rel || '').split('#')[0];
  try { rel = decodeURIComponent(rel); } catch (e) { }
  if (rel.startsWith('/')) return rel.slice(1);
  const out = [];
  for (const p of (base ? base.split('/') : []).concat(rel.split('/'))) {
    if (p === '..') out.pop(); else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}
function loadImg(url) {
  return new Promise((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => rej(new Error('img')); im.src = url; });
}
function canvasBlob(cv, type = 'image/jpeg', q = 0.88) {
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('blob')), type, q));
}
async function thumbFrom(src, w, h, maxW = 360) {
  const s = Math.min(1, maxW / w), cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
  const cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(src, 0, 0, cv.width, cv.height);
  return canvasBlob(cv, 'image/jpeg', 0.82);
}
async function fingerprint(blob) {
  try {
    const head = await blob.slice(0, 1 << 20).arrayBuffer();
    const tail = blob.size > (2 << 20) ? await blob.slice(blob.size - (1 << 20)).arrayBuffer() : new ArrayBuffer(0);
    const sz = new TextEncoder().encode('|' + blob.size + '|');
    const all = new Uint8Array(head.byteLength + tail.byteLength + sz.length);
    all.set(new Uint8Array(head), 0); all.set(sz, head.byteLength); all.set(new Uint8Array(tail), head.byteLength + sz.length);
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', all));
    return 'b' + [...d.slice(0, 12)].map(x => x.toString(16).padStart(2, '0')).join('');
  } catch (e) { return 'l' + uid(); }
}

/* ================= icons ================= */
const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  sort: '<path d="M7 4v16M3.5 16.5L7 20l3.5-3.5M13 6h8M13 11h6M13 16h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  translate: '<path d="M4 5h9M8.5 3v2M6 5c.6 3 2.6 5.3 5 6.5M11 5c-.7 3.3-3 6-6.5 7.5"/><path d="M12.5 21l4-10 4 10M14 17.5h5"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.2c2.4.1 4 1.7 4.5 4.6"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0116 0v3"/><rect x="3" y="14" width="4.5" height="7" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="7" rx="1.5"/>',
  playF: '<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>',
  pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor"/>',
  skipBack: '<path d="M11 7L6 12l5 5M18 7l-5 5 5 5"/>',
  skipFwd: '<path d="M13 7l5 5-5 5M6 7l5 5-5 5"/>',
  speed: '<path d="M4.5 16a8 8 0 1115 0"/><path d="M12 16l4-5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  more: '<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  type: '<path d="M4 19l5-14 5 14M5.8 14h6.4M15 19l3-8 3 8M15.9 16.6h4.2"/>',
  bookmark: '<path d="M6 4h12v17l-6-4.5L6 21z"/>',
  bookmarkF: '<path d="M6 4h12v17l-6-4.5L6 21z" fill="currentColor"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>',
  panels: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 11h17M12 11v9.5"/>',
  page: '<rect x="5.5" y="3" width="13" height="18" rx="1.5"/>',
  width: '<path d="M3 12h18M6.5 8.5L3 12l3.5 3.5M17.5 8.5L21 12l-3.5 3.5"/>',
  translate: '<path d="M4 5h9M8.5 3v2M6 5c.5 3 2.6 5.6 5.5 7M11 5c-.6 3.4-3 6.4-6.5 8"/><path d="M12.5 21l4-9 4 9M13.8 18h5.4"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6M11 8v6"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2M8 11h6"/>',
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9.5 7V4.5h5V7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.4"/>',
  folder: '<path d="M3.5 7.5a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>',
  flip: '<path d="M4 12a8 8 0 0113.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 01-13.7 5.6L4 15M4 20v-5h5"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5zM20 5.5A1.5 1.5 0 0018.5 4H13v16h5.5a1.5 1.5 0 001.5-1.5z"/>',
  comic: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 12h8M11.5 4v16"/><path d="M14.5 8.5h3.5M14.5 11.5h2.5"/>',
  note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A8 8 0 019.5 4.5a8 8 0 1010 10z"/>',
  flame: '<path d="M12 21c3.6 0 6-2.5 6-6 0-4-3.5-6-4-10-2.5 1.5-4 4-4 6.5C8.8 10.5 8 9.6 8 8c-1.5 1.5-2 3.5-2 5.5 0 4 2.4 7.5 6 7.5z"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 00.6-7.95A6 6 0 006.6 9.3 4.6 4.6 0 007 18.5z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.5 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.5-3.6-8.5S9.5 6.1 12 3.5z"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 013 0V11M11 10.5V4a1.5 1.5 0 013 0v6.5M14 10.5V5.5a1.5 1.5 0 013 0V13c0 4.5-2.5 7.5-6 7.5-2.6 0-4-1.3-5.5-3.5L3.8 14a1.5 1.5 0 012.4-1.8L8 14"/>',
  summary: '<path d="M5 5h14M5 9.5h14M5 14h9M5 18.5h6"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  rtl: '<path d="M20 12H5M9 8l-4 4 4 4"/>',
  ltr: '<path d="M4 12h15M15 8l4 4-4 4"/>',
  shelf: '<path d="M3.5 20.5h17M6 20.5V6M9.5 20.5V4M13 20.5V8M16.5 20.5l2.5-13"/>',
};
function icon(name, cls) {
  const s = `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const t = document.createElement('template'); t.innerHTML = s; return t.content.firstChild;
}

/* ================= toast / busy ================= */
let toastT;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms);
}
function busy(text) {
  const b = $('#busy');
  if (text == null) { b.classList.remove('on'); return; }
  $('#busy-t').textContent = text; b.classList.add('on');
}

/* ================= sheets ================= */
const Sheets = {
  stack: [],
  open({ title, body, center = false, onClose, actions, wide } = {}) {
    const bd = el('div', { class: 'backdrop' + (center ? ' center' : '') });
    const sh = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', style: wide ? { maxWidth: '760px' } : null });
    if (!center) sh.append(el('div', { class: 'grab' }));
    const head = el('div', { class: 'sh-head' }, el('h3', { text: title || '' }), actions || null,
      el('button', { class: 'icon', 'aria-label': t('close'), onclick: () => this.close(entry) }, icon('x')));
    const b = el('div', { class: 'sh-body' });
    sh.append(head, b); bd.append(sh);
    const entry = { bd, sh, body: b, onClose, head };
    bd.addEventListener('pointerdown', e => { if (e.target === bd) entry.downOnBd = true; });
    bd.addEventListener('click', e => { if (e.target === bd && entry.downOnBd) this.close(entry); entry.downOnBd = false; });
    // swipe down to close
    let sy = null;
    sh.addEventListener('touchstart', e => { if (b.scrollTop <= 0) sy = e.touches[0].clientY; else sy = null; }, { passive: true });
    sh.addEventListener('touchmove', e => { if (sy == null) return; const dy = e.touches[0].clientY - sy; if (dy > 0 && !center) sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
    sh.addEventListener('touchend', e => { if (sy == null) return; const dy = (e.changedTouches[0].clientY - sy); sh.style.transform = ''; if (dy > 110 && !center) this.close(entry); sy = null; });
    if (typeof body === 'function') body(b, entry); else if (body) b.append(body);
    $('#sheets').append(bd);
    this.stack.push(entry);
    return entry;
  },
  close(entry) {
    entry = entry || this.stack[this.stack.length - 1];
    if (!entry) return;
    const i = this.stack.indexOf(entry); if (i >= 0) this.stack.splice(i, 1);
    entry.bd.remove();
    try { entry.onClose && entry.onClose(); } catch (e) { console.warn(e); }
  },
  closeAll() { while (this.stack.length) this.close(); },
  confirm(title, msg, okText, danger) {
    return new Promise(res => {
      let done = false;
      const s = this.open({
        title, center: true, onClose: () => { if (!done) res(false); }, body: b => {
          b.append(el('p', { class: 'muted', style: { lineHeight: 1.5, margin: '0 0 18px' }, text: msg }),
            el('div', { style: { display: 'flex', gap: '10px' } },
              el('button', { class: 'btn', style: { flex: 1 }, onclick: () => this.close(s), text: t('cancel') }),
              el('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), style: { flex: 1 }, onclick: () => { done = true; res(true); this.close(s); }, text: okText || 'OK' })));
        }
      });
    });
  },
  prompt(title, value, opts = {}) {
    return new Promise(res => {
      let done = false;
      const s = this.open({
        title, center: true, onClose: () => { if (!done) res(null); }, body: b => {
          const inp = opts.multi ? el('textarea', { class: 'field' }) : el('input', { class: 'field', type: 'text' });
          inp.value = value || ''; if (opts.placeholder) inp.placeholder = opts.placeholder;
          const ok = () => { done = true; res(inp.value.trim()); this.close(s); };
          inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !opts.multi) ok(); });
          b.append(inp, el('div', { style: { display: 'flex', gap: '10px', marginTop: '16px' } },
            el('button', { class: 'btn', style: { flex: 1 }, onclick: () => this.close(s), text: t('cancel') }),
            el('button', { class: 'btn primary', style: { flex: 1 }, onclick: ok, text: opts.ok || t('save') })));
          setTimeout(() => { inp.focus(); inp.select && inp.select(); }, 60);
        }
      });
    });
  },
};

/* ================= setting widgets ================= */
function wSeg(options, cur, onChange, cls) {
  const box = el('div', { class: 'seg' + (cls ? ' ' + cls : '') });
  const btns = options.map(([v, label, ic]) => {
    const b = el('button', { class: v === cur ? 'on' : '', onclick: () => { btns.forEach(x => x.classList.remove('on')); b.classList.add('on'); onChange(v); } }, ic ? icon(ic) : null, label);
    return b;
  });
  box.append(...btns); return box;
}
function wToggle(title, sub, val, onChange) {
  const sw = el('div', { class: 'sw-t' + (val ? ' on' : '') });
  const row = el('button', { class: 'row-t', style: { width: '100%', textAlign: 'left' }, onclick: () => { val = !val; sw.classList.toggle('on', val); onChange(val); } },
    el('div', { class: 'tx' }, el('b', { text: title }), sub ? el('small', { text: sub }) : null), sw);
  row.setAttribute('role', 'switch'); return row;
}
function wSlider(min, max, step, val, onInput, fmt, ic) {
  const out = el('output', { text: fmt ? fmt(val) : val });
  const r = el('input', { type: 'range', min, max, step, value: val });
  r.addEventListener('input', () => { const v = +r.value; out.textContent = fmt ? fmt(v) : v; onInput(v); });
  return el('div', { class: 'sl' }, ic ? icon(ic) : null, r, out);
}
function wGroup(label, ...kids) { return el('div', { class: 'grp' }, label ? el('div', { class: 'gl', text: label }) : null, ...kids); }

/* ================= gestures ================= */
function gestures(target, h) {
  const pts = new Map(); let st = null, pinch = null, moved = false, multi = false;
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  target.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { target.setPointerCapture(e.pointerId); } catch (_) { }
    if (pts.size === 1) { st = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = false; multi = false; h.down && h.down(e); }
    else if (pts.size === 2 && h.pinchStart) { const [a, b] = [...pts.values()]; pinch = { d: d2(a, b), c: mid(a, b) }; multi = true; moved = true; h.pinchStart(pinch.c); }
  });
  target.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) { const [a, b] = [...pts.values()]; h.pinchMove && h.pinchMove(d2(a, b) / pinch.d, mid(a, b), pinch.c); return; }
    if (st && pts.size === 1 && !multi) {
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!moved && Math.hypot(dx, dy) > 10) moved = true;
      if (moved && h.pan) h.pan(dx, dy, e);
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 1 && pinch) { pinch = null; h.pinchEnd && h.pinchEnd(); const [p] = [...pts.values()]; st = { x: p.x, y: p.y, t: performance.now() }; return; }
    if (pts.size) return;
    if (pinch) { pinch = null; h.pinchEnd && h.pinchEnd(); st = null; return; }
    if (!st) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y, dt = performance.now() - st.t;
    const consumed = h.panEnd ? h.panEnd(dx, dy) : false;
    if (e.type === 'pointercancel') { st = null; return; }
    if (!moved && dt < 550 && !multi) h.tap && h.tap(e.clientX, e.clientY, e);
    else if (!consumed && !multi && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2 && dt < 900) h.swipe && h.swipe(dx < 0 ? 'left' : 'right');
    else if (!consumed && !multi && h.vswipe && Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.2 && dt < 900) h.vswipe(dy < 0 ? 'up' : 'down');
    st = null;
  };
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}
