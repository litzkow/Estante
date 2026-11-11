/* ================= panel detection ================= */
function detectPanels(img, W, H, dir) {
  const maxD = 1100, sc = Math.min(1, maxD / Math.max(W, H));
  const w = Math.max(16, Math.round(W * sc)), h = Math.max(16, Math.round(H * sc));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, w, h);
  let data; try { data = cx.getImageData(0, 0, w, h).data; } catch (e) { return []; }
  // background colour = median of the outer ring
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.012));
  const R = [], G = [], B = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    if (x >= ring && x < w - ring && y >= ring && y < h - ring) continue;
    const k = (y * w + x) * 4; R.push(data[k]); G.push(data[k + 1]); B.push(data[k + 2]);
  }
  const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1] || 0; };
  const RR = R.slice(), GG = G.slice(), BB = B.slice();
  const br = med(R), bg = med(G), bb = med(B);
  // full-bleed art (no page margin): the ring is not one colour -> treat as a single splash page
  let same = 0; for (let i = 0; i < RR.length; i++) if (Math.abs(RR[i] - br) + Math.abs(GG[i] - bg) + Math.abs(BB[i] - bb) <= 66) same++;
  if (same < RR.length * 0.6) return [];
  const N = w * h, ink = new Uint8Array(N);
  for (let i = 0, k = 0; i < N; i++, k += 4) ink[i] = (Math.abs(data[k] - br) + Math.abs(data[k + 1] - bg) + Math.abs(data[k + 2] - bb)) > 66 ? 1 : 0;
  const RP = new Int32Array((w + 1) * h), CP = new Int32Array((h + 1) * w);
  for (let y = 0; y < h; y++) { let s = 0; const o = y * (w + 1), r = y * w; for (let x = 0; x < w; x++) { s += ink[r + x]; RP[o + x + 1] = s; } }
  for (let x = 0; x < w; x++) { let s = 0; const o = x * (h + 1); for (let y = 0; y < h; y++) { s += ink[y * w + x]; CP[o + y + 1] = s; } }
  const rowInk = (y, x0, x1) => RP[y * (w + 1) + x1] - RP[y * (w + 1) + x0];
  const colInk = (x, y0, y1) => CP[x * (h + 1) + y1] - CP[x * (h + 1) + y0];
  const minGap = Math.max(2, Math.round(Math.min(w, h) * 0.0035));
  const leaves = [];
  const trim = r => {
    let { x0, y0, x1, y1 } = r;
    const tw = Math.floor((x1 - x0) * 0.002), th = Math.floor((y1 - y0) * 0.002);
    while (y0 < y1 && rowInk(y0, x0, x1) <= tw) y0++;
    while (y1 > y0 && rowInk(y1 - 1, x0, x1) <= tw) y1--;
    while (x0 < x1 && colInk(x0, y0, y1) <= th) x0++;
    while (x1 > x0 && colInk(x1 - 1, y0, y1) <= th) x1--;
    return { x0, y0, x1, y1 };
  };
  // strict: (almost) no ink across the whole line.
  // relaxed: some ink allowed (a balloon crossing the gutter) but both ends of the line must be clear,
  // which a line inside a bordered panel never is.
  const gaps = (r, horiz, relaxed) => {
    const { x0, y0, x1, y1 } = r, len = horiz ? x1 - x0 : y1 - y0;
    const tol = relaxed ? Math.floor(len * 0.3) : Math.floor(len * 0.002);
    const e = Math.max(2, Math.round(len * 0.02)), need = relaxed ? Math.round(minGap * 1.5) : minGap;
    const a = horiz ? y0 : x0, b = horiz ? y1 : x1, cuts = []; let run = -1;
    for (let p = a; p <= b; p++) {
      let ok = false;
      if (p < b) {
        const v = horiz ? rowInk(p, x0, x1) : colInk(p, y0, y1);
        ok = v <= tol;
        if (ok && relaxed) ok = horiz ? (rowInk(p, x0, x0 + e) === 0 && rowInk(p, x1 - e, x1) === 0) : (colInk(p, y0, y0 + e) === 0 && colInk(p, y1 - e, y1) === 0);
      }
      if (ok) { if (run < 0) run = p; }
      else { if (run >= 0 && p - run >= need && run > a && p < b) cuts.push([run, p]); run = -1; }
    }
    return cuts;
  };
  const rec = (r, depth) => {
    r = trim(r);
    const rw = r.x1 - r.x0, rh = r.y1 - r.y0;
    if (rw < w * 0.03 || rh < h * 0.02) return;
    const big = rw * rh > w * h * 0.1;
    if (depth < 12) for (const [horiz, relaxed] of [[true, false], [false, false], [true, true], [false, true]]) {
      if (relaxed && !big) break;
      const cuts = gaps(r, horiz, relaxed); if (!cuts.length) continue;
      const segs = []; let s = horiz ? r.y0 : r.x0;
      for (const [g0, g1] of cuts) { segs.push([s, g0]); s = g1; }
      segs.push([s, horiz ? r.y1 : r.x1]);
      if (!horiz && dir === 'rtl') segs.reverse();
      for (const [a, b] of segs) rec(horiz ? { x0: r.x0, x1: r.x1, y0: a, y1: b } : { x0: a, x1: b, y0: r.y0, y1: r.y1 }, depth + 1);
      return;
    }
    leaves.push(r);
  };
  rec({ x0: 0, y0: 0, x1: w, y1: h }, 0);
  const area = w * h;
  const ps = leaves.filter(r => (r.x1 - r.x0) * (r.y1 - r.y0) >= area * 0.008);
  if (ps.length > 26 || !ps.length) return [];
  if (ps.length === 1 && (ps[0].x1 - ps[0].x0) * (ps[0].y1 - ps[0].y0) > area * 0.55) return [];
  const px = w * 0.006, py = h * 0.006;
  return ps.map(r => {
    const x0 = Math.max(0, r.x0 - px), y0 = Math.max(0, r.y0 - py), x1 = Math.min(w, r.x1 + px), y1 = Math.min(h, r.y1 + py);
    return { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h };
  });
}

/* split very wide / very tall panels so text stays big on the screen */
function splitPanel(p, sa, dir) {
  if (!S.cSplit) return [p];
  const r = (p.w / p.h) / sa, ov = 0.12;
  const mk = (n, horiz) => {
    const out = [];
    if (horiz) { const sw = p.w / (n - (n - 1) * ov), st = sw * (1 - ov); for (let k = 0; k < n; k++) out.push({ x: p.x + k * st, y: p.y, w: sw, h: p.h }); if (dir === 'rtl') out.reverse(); }
    else { const sh = p.h / (n - (n - 1) * ov), st = sh * (1 - ov); for (let k = 0; k < n; k++) out.push({ x: p.x, y: p.y + k * st, w: p.w, h: sh }); }
    return out;
  };
  if (r > 2.3) return mk(Math.min(3, Math.max(2, Math.round(Math.sqrt(r)))), true);
  if (1 / r > 2.3) return mk(Math.min(3, Math.max(2, Math.round(Math.sqrt(1 / r)))), false);
  return [p];
}

/* ================= comic source ================= */
async function comicSource(rec, blob) {
  if (rec.format === 'pdf') {
    const pdf = await openPdf(blob);
    const tw = () => Math.round(Math.min(2400, Math.max(1500, Math.max(innerWidth, innerHeight) * (devicePixelRatio || 1) * 1.1)));
    return {
      count: pdf.numPages,
      async page(i) { const cv = await renderPdfPage(pdf, i + 1, tw(), 4600); const b = await canvasBlob(cv, 'image/jpeg', 0.9); const url = URL.createObjectURL(b); const img = await loadImg(url); return { url, img, w: img.naturalWidth, h: img.naturalHeight }; },
      async thumb(i) { const cv = await renderPdfPage(pdf, i + 1, 200); return canvasBlob(cv, 'image/jpeg', 0.75); },
      close() { try { closePdf(pdf); } catch (e) { } },
    };
  }
  const zip = await JSZip.loadAsync(blob);
  const names = zipImages(zip);
  if (!names.length) throw new Error(t('errNoImages', { f: rec.title }));
  const pageBlob = async i => new Blob([await zip.file(names[i]).async('blob')], { type: mimeOf(names[i]) });
  return {
    count: names.length,
    async page(i) { const url = URL.createObjectURL(await pageBlob(i)); const img = await loadImg(url); return { url, img, w: img.naturalWidth, h: img.naturalHeight }; },
    async thumb(i) { const url = URL.createObjectURL(await pageBlob(i)); try { const im = await loadImg(url); return await thumbFrom(im, im.naturalWidth, im.naturalHeight, 200); } finally { URL.revokeObjectURL(url); } },
    close() { },
  };
}

/* ================= comic reader ================= */
const Comic = {
  rec: null, src: null, cache: new Map(), page: 0, step: 0, steps: [], cur: null, token: 0,
  z: { s: 1, x: 0, y: 0 }, zb: null, uiT: null,
  get mode() { return (this.rec && this.rec.prefs.mode) || S.cMode; },
  get dir() { return (this.rec && this.rec.prefs.dir) || S.cDir; },
  init() {
    this.stage = $('#c-stage'); this.zoomer = $('#c-zoom'); this.cam = $('#c-cam'); this.spot = $('#c-spot');
    gestures(this.stage, {
      tap: (x) => {
        const W = this.stage.clientWidth, zone = x / W;
        if (zone > 0.3 && zone < 0.7) return this.toggleUI();
        const fwd = zone >= 0.7;
        (this.dir === 'rtl' ? !fwd : fwd) ? this.next() : this.prev();
      },
      swipe: d => { if (this.z.s > 1.05) return; const fwd = d === 'left'; (this.dir === 'rtl' ? !fwd : fwd) ? this.next() : this.prev(); },
      down: () => { this.zb = Object.assign({}, this.z); },
      pan: (dx, dy) => { if (this.z.s <= 1.02) return; this.z.x = this.zb.x + dx; this.z.y = this.zb.y + dy; this.applyZoom(false); },
      panEnd: () => this.z.s > 1.02,
      pinchStart: () => { this.zb = Object.assign({}, this.z); },
      pinchMove: (k, c, c0) => {
        const s = clamp(this.zb.s * k, 1, 6), f = s / this.zb.s;
        this.z.s = s; this.z.x = c.x - (c0.x - this.zb.x) * f; this.z.y = c.y - (c0.y - this.zb.y) * f; this.applyZoom(false);
      },
      pinchEnd: () => { if (this.z.s < 1.06) this.resetZoom(true); },
    });
    $('#c-mode').onclick = () => this.cycleMode();
    $('#c-set').onclick = () => this.settings();
    $('#c-grid').onclick = () => this.pagesSheet();
    $('#c-bmk').onclick = () => this.toggleBookmark();
    const rg = $('#c-range');
    rg.oninput = () => { $('#c-label').textContent = t('pageXofY', { a: rg.value, b: this.src.count }); };
    rg.onchange = () => this.goto(+rg.value - 1, 0);
    $('#v-comic .r-back').onclick = () => this.close();
  },
  async open(rec, blob) {
    this.rec = rec; rec.prefs = rec.prefs || {};
    busy(t('opening'));
    try { this.src = await comicSource(rec, blob); } finally { busy(null); }
    this.cache.clear(); this.cur = null; this.cam.replaceChildren();
    $('#c-title').textContent = rec.title;
    const rg = $('#c-range'); rg.max = this.src.count; rg.min = 1;
    App.show('v-comic');
    this.showUI(true);
    const pos = rec.pos || {};
    await this.goto(clamp(pos.page || 0, 0, this.src.count - 1), pos.step || 0, false);
    if (!(await DB.get('kv', 'hint:comic'))) { DB.put('kv', 'hint:comic', 1); this.hint(); }
  },
  hint() {
    const back = t('hintBack'), fwd = t('hintNext');
    const h = el('div', { class: 'hint' }, el('div', { text: this.dir === 'rtl' ? fwd : back }), el('div', { text: t('hintMenu') }), el('div', { text: this.dir === 'rtl' ? back : fwd }));
    $('#v-comic').append(h); setTimeout(() => h.remove(), 3200);
  },
  size() { return { SW: this.stage.clientWidth || innerWidth, SH: this.stage.clientHeight || innerHeight }; },
  key(i) { return 'pn:' + this.rec.id + ':' + i + ':' + this.dir; },
  load(i) {
    if (this.cache.has(i)) return this.cache.get(i);
    const p = (async () => {
      const pg = await this.src.page(i);
      let panels = await DB.get('kv', this.key(i));
      if (!Array.isArray(panels)) { panels = detectPanels(pg.img, pg.w, pg.h, this.dir); DB.put('kv', this.key(i), panels); }
      pg.i = i; pg.panels = panels; return pg;
    })();
    p.catch(() => this.cache.delete(i));
    this.cache.set(i, p); return p;
  },
  evict(center) {
    for (const [k, p] of this.cache) if (Math.abs(k - center) > 3) { this.cache.delete(k); p.then(pg => { if (this.cur !== pg) URL.revokeObjectURL(pg.url); }).catch(() => { }); }
  },
  computeSteps(pg) {
    const W = pg.w, H = pg.h, { SW, SH } = this.size(), full = { x: 0, y: 0, w: W, h: H, full: true };
    const m = this.mode;
    if (m === 'pagina') return [full];
    if (m === 'largura') {
      const s = SW / W, vis = SH / s;
      if (vis >= H * 0.97) return [full];
      const n = Math.max(2, Math.ceil((H - vis * 0.1) / (vis * 0.9))), st = (H - vis) / (n - 1);
      return Array.from({ length: n }, (_, k) => ({ x: 0, y: k * st, w: W, h: vis, strip: true }));
    }
    const ps = pg.panels.map(p => ({ x: p.x * W, y: p.y * H, w: p.w * W, h: p.h * H }));
    if (ps.length <= 1) return [full];
    const out = S.cFullFirst ? [full] : [];
    const sa = SW / SH;
    for (const p of ps) out.push(...splitPanel(p, sa, this.dir));
    return out;
  },
  async goto(i, step, animate = true) {
    const tok = ++this.token;
    const ld = setTimeout(() => $('#c-load').classList.remove('hide'), 250);
    let pg;
    try { pg = await this.load(i); }
    catch (e) { clearTimeout(ld); $('#c-load').classList.add('hide'); toast(t('pageFail')); return; }
    clearTimeout(ld); $('#c-load').classList.add('hide');
    if (tok !== this.token) return;
    const changed = this.cur !== pg;
    this.cur = pg; this.page = i;
    if (changed) {
      pg.img.style.width = pg.w + 'px'; pg.img.style.height = pg.h + 'px';
      pg.img.style.opacity = '0'; pg.img.style.transition = 'opacity .18s';
      this.cam.replaceChildren(pg.img);
      requestAnimationFrame(() => { pg.img.style.opacity = '1'; });
    }
    this.steps = this.computeSteps(pg);
    this.step = step === 'last' ? this.steps.length - 1 : clamp(step | 0, 0, this.steps.length - 1);
    this.apply(changed ? false : animate);
    this.afterMove();
    this.evict(i);
    for (const n of [i + 1, i + 2, i - 1]) if (n >= 0 && n < this.src.count) this.load(n).catch(() => { });
  },
  rectFor(r) {
    const { SW, SH } = this.size();
    const pad = r.full || r.strip ? 0 : Math.min(14, SW * 0.03);
    const s = Math.min((SW - 2 * pad) / r.w, (SH - 2 * pad) / r.h);
    return { s, tx: (SW - r.w * s) / 2 - r.x * s, ty: (SH - r.h * s) / 2 - r.y * s, sx: (SW - r.w * s) / 2, sy: (SH - r.h * s) / 2, sw: r.w * s, sh: r.h * s };
  },
  apply(animate) {
    const r = this.steps[this.step]; if (!r) return;
    const q = this.rectFor(r);
    const tr = animate && S.anim ? 'transform .42s cubic-bezier(.25,.8,.25,1)' : 'none';
    const trs = animate && S.anim ? 'all .42s cubic-bezier(.25,.8,.25,1)' : 'none';
    this.cam.style.transition = tr; this.spot.style.transition = trs;
    this.cam.style.transform = `translate(${q.tx}px,${q.ty}px) scale(${q.s})`;
    Object.assign(this.spot.style, { left: q.sx + 'px', top: q.sy + 'px', width: q.sw + 'px', height: q.sh + 'px', boxShadow: `0 0 0 300vmax rgba(0,0,0,${(!r.full && !r.strip && S.cSpot) ? 0.8 : 0})` });
    this.resetZoom(false);
  },
  applyZoom(anim) {
    this.zoomer.style.transition = anim ? 'transform .25s ease' : 'none';
    this.zoomer.style.transform = `translate(${this.z.x}px,${this.z.y}px) scale(${this.z.s})`;
  },
  resetZoom(anim) { this.z = { s: 1, x: 0, y: 0 }; this.applyZoom(anim); },
  next() {
    if (this.z.s > 1.05) this.resetZoom(true);
    if (this.step < this.steps.length - 1) { this.step++; this.apply(true); this.afterMove(); }
    else if (this.page < this.src.count - 1) this.goto(this.page + 1, 0);
    else this.finish();
  },
  prev() {
    if (this.z.s > 1.05) this.resetZoom(true);
    if (this.step > 0) { this.step--; this.apply(true); this.afterMove(); }
    else if (this.page > 0) this.goto(this.page - 1, 'last');
    else toast(t('atStart'));
  },
  finish() {
    if (!this.rec.finished) { this.rec.finished = true; this.rec.pct = 1; saveRec(this.rec); }
    Sheets.open({
      title: t('theEnd'), center: true, body: b => b.append(el('p', { class: 'muted', style: { lineHeight: 1.5, margin: '0 0 18px' }, text: t('endComic', { t: this.rec.title }) }),
        el('div', { style: { display: 'flex', gap: '10px' } },
          el('button', { class: 'btn', style: { flex: 1 }, text: t('stay'), onclick: () => Sheets.close() }),
          el('button', { class: 'btn primary', style: { flex: 1 }, text: t('toShelf'), onclick: () => { Sheets.close(); this.close(); } })))
    });
  },
  afterMove() {
    const n = this.src.count, i = this.page;
    $('#c-range').value = i + 1;
    let lbl = t('pageXofY', { a: i + 1, b: n });
    const cur = this.steps[this.step];
    if (this.mode === 'quadros' && this.steps.length > 1) {
      const panelSteps = this.steps.filter(s => !s.full).length;
      const k = this.steps.slice(0, this.step + 1).filter(s => !s.full).length;
      lbl += cur.full ? ' · ' + t('fullPage') : ' · ' + t('panelXofY', { a: k, b: panelSteps });
    }
    $('#c-label').textContent = lbl;
    const dots = $('#c-steps'); dots.replaceChildren();
    if (this.steps.length > 1 && this.steps.length <= 24) for (let k = 0; k < this.steps.length; k++) dots.append(el('i', { class: k === this.step ? 'on' : '' }));
    const ic = { quadros: 'panels', pagina: 'page', largura: 'width' }[this.mode];
    $('#c-mode').replaceChildren(icon(ic), t('mode_' + this.mode));
    const bm = (this.rec.bookmarks || []).some(b => b.page === i);
    $('#c-bmk').replaceChildren(icon(bm ? 'bookmarkF' : 'bookmark'));
    $('#c-bmk').style.color = bm ? 'var(--accent)' : '';
    // progress
    this.rec.pos = { page: i, step: this.step };
    const pct = n <= 1 ? 1 : (i + (this.steps.length > 1 ? this.step / this.steps.length : 0)) / (n - 1);
    this.rec.pct = clamp(i >= n - 1 ? 1 : pct, 0, 1);
    saveRecSoon(this.rec);
  },
  toggleUI() { $('#v-comic').classList.contains('ui-off') ? this.showUI() : this.hideUI(); },
  showUI(auto) { $('#v-comic').classList.remove('ui-off'); clearTimeout(this.uiT); if (auto) this.uiT = setTimeout(() => this.hideUI(), 2800); },
  hideUI() { clearTimeout(this.uiT); $('#v-comic').classList.add('ui-off'); },
  cycleMode() {
    const order = ['quadros', 'largura', 'pagina'];
    this.setMode(order[(order.indexOf(this.mode) + 1) % 3]);
    toast(t('modeToast_' + this.mode));
  },
  setMode(m) { this.rec.prefs.mode = m; saveRec(this.rec, { sync: false }); if (this.cur) { this.steps = this.computeSteps(this.cur); this.step = 0; this.apply(true); this.afterMove(); } },
  setDir(d) {
    this.rec.prefs.dir = d; saveRec(this.rec, { sync: false });
    this.cache.clear(); const p = this.page; this.cur = null; this.goto(p, 0, false);
  },
  relayout() { if (!this.cur) return; const k = this.step; this.steps = this.computeSteps(this.cur); this.step = clamp(k, 0, this.steps.length - 1); this.apply(false); this.afterMove(); },
  toggleBookmark() {
    const bms = this.rec.bookmarks = this.rec.bookmarks || [];
    const i = bms.findIndex(b => b.page === this.page);
    if (i >= 0) { bms.splice(i, 1); toast(t('bmRemoved')); }
    else { bms.push({ id: uid(), page: this.page, created: Date.now() }); bms.sort((a, b) => a.page - b.page); toast(t('bmAdded', { p: this.page + 1 })); }
    saveRec(this.rec); this.afterMove();
  },
  settings() {
    Sheets.open({
      title: t('comicSettings'), body: b => {
        b.append(
          wGroup(t('readMode'), wSeg([['quadros', t('mode_quadros'), 'panels'], ['largura', t('mode_largura'), 'width'], ['pagina', t('mode_pagina'), 'page']], this.mode, v => this.setMode(v))),
          el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45, margin: '8px 0 0' }, text: t('modeHelp') }),
          wGroup(t('direction'), wSeg([['ltr', t('western'), 'ltr'], ['rtl', t('manga'), 'rtl']], this.dir, v => this.setDir(v))),
          wGroup(t('panelView'),
            wToggle(t('fullFirst'), t('fullFirstSub'), S.cFullFirst, v => { setS('cFullFirst', v); this.relayout(); }),
            wToggle(t('splitWide'), t('splitWideSub'), S.cSplit, v => { setS('cSplit', v); this.relayout(); }),
            wToggle(t('spotlight'), t('spotlightSub'), S.cSpot, v => { setS('cSpot', v); this.relayout(); }),
            wToggle(t('animZoom'), null, S.anim, v => setS('anim', v)),
            wToggle(t('defaultsAll'), t('defaultsAllSub'), false, v => { if (v) { setS('cMode', this.mode); setS('cDir', this.dir); toast(t('savedDefaults')); } })),
          comfortGroup());
      }
    });
  },
  pagesSheet() {
    const self = this; let obs;
    const s = Sheets.open({
      title: t('pages'), wide: true, onClose: () => obs && obs.disconnect(), body: b => {
        const bms = (this.rec.bookmarks || []);
        const tabs = el('div', { class: 'tabs2' });
        const box = el('div');
        const showGrid = (onlyBm) => {
          box.replaceChildren();
          const g = el('div', { class: 'thumbs' });
          const list = onlyBm ? bms.map(x => x.page) : Array.from({ length: this.src.count }, (_, i) => i);
          if (!list.length) { box.append(el('div', { class: 'list' }, el('div', { class: 'empty-l', text: t('noBookmarksComic') }))); return; }
          obs && obs.disconnect();
          obs = new IntersectionObserver(ents => { for (const en of ents) if (en.isIntersecting) { obs.unobserve(en.target); fill(en.target); } }, { root: b, rootMargin: '300px' });
          for (const i of list) {
            const btn = el('button', { class: i === this.page ? 'cur' : '', onclick: () => { Sheets.close(s); this.goto(i, 0, false); } }, el('span', { text: String(i + 1) }), bms.some(x => x.page === i) ? el('i', { class: 'bm' }) : null);
            btn.dataset.i = i; g.append(btn); obs.observe(btn);
          }
          box.append(g);
          setTimeout(() => { const c = g.querySelector('.cur'); c && c.scrollIntoView({ block: 'center' }); }, 50);
        };
        async function fill(btn) {
          const i = +btn.dataset.i, key = 'th:' + self.rec.id + ':' + i;
          let blob = await DB.get('kv', key);
          if (!(blob instanceof Blob)) { try { blob = await self.src.thumb(i); DB.put('kv', key, blob); } catch (e) { return; } }
          const u = URL.createObjectURL(blob); const im = el('img', { src: u, alt: '' }); im.onload = () => URL.revokeObjectURL(u); btn.prepend(im);
        }
        tabs.append(wSeg([['all', t('allPages')], ['bm', t('bookmarks') + (bms.length ? ` (${bms.length})` : '')]], 'all', v => showGrid(v === 'bm')));
        b.append(tabs, box); showGrid(false);
      }
    });
  },
  close() {
    saveRecSoon.flush();
    saveRec(this.rec);
    this.token++;
    for (const p of this.cache.values()) p.then(pg => URL.revokeObjectURL(pg.url)).catch(() => { });
    this.cache.clear(); this.cur = null; this.cam.replaceChildren();
    this.src && this.src.close(); this.src = null;
    Pause.stop(); App.show('v-lib'); Lib.render();
  },
  key2(e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); this.dir === 'rtl' && e.key === 'ArrowRight' ? this.prev() : this.next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.dir === 'rtl' && e.key === 'ArrowLeft' ? this.next() : this.prev(); }
    else if (e.key === 'Escape') this.close();
  },
};
