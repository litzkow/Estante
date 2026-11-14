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
  let ps = leaves.filter(r => (r.x1 - r.x0) * (r.y1 - r.y0) >= area * 0.008);
  if (ps.length > 26 || !ps.length) return [];
  const white = r => { let ink = 0; for (let y = r.y0; y < r.y1; y += 2) ink += rowInk(y, r.x0, r.x1); return 100 - ink * 2 / Math.max(1, (r.x1 - r.x0) * (r.y1 - r.y0)) * 100; };
  const uni = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
  const dist = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));
  // logo / title / caption strips (mostly page colour, short): they belong with the nearest panel, never on their own
  for (let guard = 0; guard < 6 && ps.length > 1; guard++) {
    const k = ps.findIndex(r => (r.y1 - r.y0) < h * 0.22 && white(r) > 40);
    if (k < 0) break;
    const s = ps[k]; ps.splice(k, 1);
    let bi = 0, bd = Infinity; ps.forEach((r, i) => { const d = dist(r, s); if (d < bd) { bd = d; bi = i; } });
    ps[bi] = uni(ps[bi], s);
  }
  // balloons that spill out of a panel into the gutter: their text is ink outside every panel.
  // group that ink and give it to the nearest panel, so a balloon is never cut or shown empty
  {
    const G = Math.max(4, Math.round(Math.min(w, h) / 140)), gw = Math.ceil(w / G), gh = Math.ceil(h / G);
    const inside = (x, y) => ps.some(r => x >= r.x0 - 2 && x < r.x1 + 2 && y >= r.y0 - 2 && y < r.y1 + 2);
    const cell = new Uint8Array(gw * gh);
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
      let n = 0;
      for (let y = cy * G; y < Math.min(h, cy * G + G); y++) for (let x = cx * G; x < Math.min(w, cx * G + G); x++) if (ink[y * w + x] && !inside(x, y)) n++;
      if (n >= 2) cell[cy * gw + cx] = 1;
    }
    const seen = new Uint8Array(gw * gh), R = 2;
    for (let i = 0; i < gw * gh; i++) {
      if (!cell[i] || seen[i]) continue;
      const st = [i]; seen[i] = 1; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, cnt = 0;
      while (st.length) {
        const c = st.pop(), cx = c % gw, cy = (c / gw) | 0; cnt++;
        x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy);
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
          const j = ny * gw + nx; if (cell[j] && !seen[j]) { seen[j] = 1; st.push(j); }
        }
      }
      if (cnt < 3) continue;
      const pad = G * 2, blob = { x0: Math.max(0, x0 * G - pad), y0: Math.max(0, y0 * G - pad), x1: Math.min(w, (x1 + 1) * G + pad), y1: Math.min(h, (y1 + 1) * G + pad) };
      let bi = -1, bd = Infinity; ps.forEach((r, k) => { const d = dist(r, blob); if (d < bd) { bd = d; bi = k; } });
      if (bi >= 0 && bd < Math.min(w, h) * 0.12) ps[bi] = uni(ps[bi], blob);
    }
  }
  if (ps.length === 1 && (ps[0].x1 - ps[0].x0) * (ps[0].y1 - ps[0].y0) > area * 0.55) return [];
  // title / logo pages: the gaps between big letters look like gutters -> show the whole page
  const small = ps.filter(r => (r.x1 - r.x0) * (r.y1 - r.y0) < area * 0.04);
  if (small.length >= 3 && small.length >= ps.length / 2) return [];
  // panels must cover most of the page; otherwise it is an illustration, not a grid
  const cover = ps.reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
  if (cover < area * 0.35) return [];
  const px = w * 0.006, py = h * 0.006, BINS = 48;
  // whiteness profile across each panel: balloons are page-coloured, art is not.
  // a wide panel is only ever split where the line runs through art (never through a balloon)
  const prof = (r, horiz) => {
    const out = [], L = horiz ? r.x1 - r.x0 : r.y1 - r.y0, M = horiz ? r.y1 - r.y0 : r.x1 - r.x0;
    for (let b = 0; b < BINS; b++) {
      const a = Math.floor(b * L / BINS), e = Math.max(a + 1, Math.floor((b + 1) * L / BINS)); let ink = 0, tot = 0;
      for (let p = a; p < e; p++) { const v = horiz ? colInk(r.x0 + p, r.y0, r.y1) : rowInk(r.y0 + p, r.x0, r.x1); ink += v; tot += M; }
      out.push(Math.round(100 - ink / Math.max(1, tot) * 100));
    }
    return out;
  };
  return ps.map(r => {
    const x0 = Math.max(0, r.x0 - px), y0 = Math.max(0, r.y0 - py), x1 = Math.min(w, r.x1 + px), y1 = Math.min(h, r.y1 + py);
    return { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h, cx: prof(r, true), cy: prof(r, false) };
  });
}

/* split very wide / very tall panels so text stays big on the screen */
function splitPanel(p, sa, dir) {
  if (!S.cSplit) return [p];
  const r = (p.w / p.h) / sa, ov = 0.12;
  const mk = (n, horiz) => {
    const prof = horiz ? p.cx : p.cy;
    // older cached pages have no profile: keep the whole panel rather than risk cutting a balloon
    if (!prof || !prof.length) return [p];
    const B = prof.length, cuts = [];
    for (let k = 1; k < n; k++) {
      const ideal = k / n * B, win = Math.round(B * 0.2);
      let best = -1, bs = Infinity;
      for (let b = Math.max(1, Math.round(ideal - win)); b <= Math.min(B - 2, Math.round(ideal + win)); b++) {
        const sc = (prof[b - 1] + prof[b] * 2 + prof[b + 1]) / 4 + Math.abs(b - ideal) * 0.8;
        if (sc < bs) { bs = sc; best = b; }
      }
      // the best line still crosses a lot of white (a balloon): do not split at all
      if (best < 0 || (prof[best - 1] + prof[best] * 2 + prof[best + 1]) / 4 > 40) return [p];
      cuts.push((best + 0.5) / B);
    }
    const L = horiz ? p.w : p.h, o = L * 0.05, out = [], edges = [0, ...cuts, 1];
    for (let k = 0; k < edges.length - 1; k++) {
      const a = Math.max(0, edges[k] * L - (k ? o : 0)), b = Math.min(L, edges[k + 1] * L + (k < edges.length - 2 ? o : 0));
      out.push(horiz ? { x: p.x + a, y: p.y, w: b - a, h: p.h } : { x: p.x, y: p.y + a, w: p.w, h: b - a });
    }
    if (horiz && dir === 'rtl') out.reverse();
    void ov; return out;
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
      tap: (x, y) => {
        const W = this.stage.clientWidth, zone = x / W, now = performance.now();
        // double tap on a panel while seeing the whole page: guided reading starts at that panel (like Comixology)
        if (this.lastTap && now - this.lastTap.t < 320 && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 40) {
          clearTimeout(this.tapT); this.lastTap = null; this.enterPanelAt(x, y); return;
        }
        this.lastTap = { t: now, x, y };
        const act = () => {
          if (zone > 0.3 && zone < 0.7) return this.toggleUI();
          const fwd = zone >= 0.7;
          (this.dir === 'rtl' ? !fwd : fwd) ? this.next() : this.prev();
        };
        const r = this.steps[this.step];
        if (r && r.full && this.mode === 'quadros' && this.steps.length > 1) { clearTimeout(this.tapT); this.tapT = setTimeout(act, 300); } else act();
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
    $('#c-tr').onclick = () => this.toggleTr();
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
  key(i) { return 'pn:' + this.rec.id + ':' + i + ':' + this.dir + ':v2'; },
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
    const ps = pg.panels.map(p => ({ x: p.x * W, y: p.y * H, w: p.w * W, h: p.h * H, cx: p.cx, cy: p.cy }));
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
      this.drawTr(pg);
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
    Object.assign(this.spot.style, { left: q.sx + 'px', top: q.sy + 'px', width: q.sw + 'px', height: q.sh + 'px', boxShadow: `0 0 0 300vmax rgba(0,0,0,${(!r.full && !r.strip) ? ({ off: 0, dim: 0.78, black: 1 }[S.cBox || (S.cSpot ? 'dim' : 'off')]) : 0})` });
    this.resetZoom(false);
    this.minimap(r);
  },
  enterPanelAt(x, y) {
    const r = this.steps[this.step]; if (!r) return;
    const st = this.stage.getBoundingClientRect(), q = this.rectFor(r);
    const px = (x - st.left - q.tx) / q.s, py = (y - st.top - q.ty) / q.s;
    const k = this.steps.findIndex(s => !s.full && px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h);
    if (k >= 0) { this.step = k; this.apply(true); this.afterMove(); }
    else if (!r.full) { const f = this.steps.findIndex(s => s.full); if (f >= 0) { this.step = f; this.apply(true); this.afterMove(); } }
  },
  // ---------- translated balloons (AI reads the page, finds each balloon and translates it) ----------
  trLang() { return (this.rec.prefs.trTo) || (S.lang === 'en' ? 'en' : 'pt'); },
  async toggleTr() {
    if (!AI.fn) return aiKeySheet();
    const on = !this.rec.prefs.tr;
    if (on) {
      const pick = await new Promise(res => Sheets.open({ title: t('cTrTitle'), body: b => b.append(
        el('p', { class: 'muted', style: { lineHeight: 1.5, marginTop: 0 }, text: t('cTrIntro') }),
        el('button', { class: 'btn primary block', text: t('cTrTo') + ' Português', onclick: () => { Sheets.close(); res('pt'); } }),
        el('button', { class: 'btn block', style: { marginTop: '8px' }, text: t('cTrTo') + ' English', onclick: () => { Sheets.close(); res('en'); } })), onClose: () => res(null) }));
      if (!pick) return;
      this.rec.prefs.trTo = pick;
    }
    this.rec.prefs.tr = on; await saveRec(this.rec);
    $('#c-tr').classList.toggle('on', on);
    if (this.cur) this.drawTr(this.cur);
  },
  async trData(pg, force) {
    const key = 'ctr:' + this.rec.id + ':' + pg.i + ':' + this.trLang();
    if (!force) { const c = await DB.get('kv', key).catch(() => null); if (c) return c; }
    const sc = Math.min(1, 1400 / Math.max(pg.w, pg.h)), cv = document.createElement('canvas');
    cv.width = Math.round(pg.w * sc); cv.height = Math.round(pg.h * sc); cv.getContext('2d').drawImage(pg.img, 0, 0, cv.width, cv.height);
    const blob = await canvasBlob(cv, 'image/jpeg', 0.85);
    const lang = this.trLang() === 'en' ? 'English' : 'Brazilian Portuguese';
    const prompt = `This is one page of a comic${this.dir === 'rtl' ? ' (manga, read right to left)' : ''}. Find every speech balloon, thought balloon, caption/narration box and meaningful sound effect with text.
For each one give its box as [ymin, xmin, ymax, xmax] normalized 0-1000 to this image (the inside of the balloon), the exact original text, and a natural ${lang} translation that keeps tone, humour and character voice (if the text is already in ${lang}, repeat it).
Rules: one item per balloon, never merge two balloons, never split one balloon; list items in reading order (${this.dir === 'rtl' ? 'right to left' : 'left to right'}, top to bottom, panel by panel); conf is your confidence 0-1 that the text was read correctly.
Return only JSON: {"lang":"source language code","items":[{"box":[..],"kind":"speech|thought|caption|sfx","text":"..","tr":"..","conf":0.9}]}`;
    const { text } = await AI.vision(blob, prompt, { json: true, temperature: 0.2 });
    const j = JSON.parse(String(text).replace(/^```(json)?|```$/g, '').trim());
    const items = (j.items || []).filter(it => Array.isArray(it.box) && it.box.length === 4 && (it.tr || it.text));
    const data = { lang: j.lang || '', items };
    DB.put('kv', key, data).catch(() => { });
    return data;
  },
  async drawTr(pg) {
    this.cam.querySelectorAll('.ctr-layer').forEach(x => x.remove());
    if (!this.rec.prefs.tr || !AI.fn) return;
    const layer = el('div', { class: 'ctr-layer', style: { width: pg.w + 'px', height: pg.h + 'px' } });
    this.cam.append(layer);
    let data;
    try { $('#c-load').classList.remove('hide'); data = await this.trData(pg); }
    catch (e) { toast(AI.errText(e)); return; }
    finally { $('#c-load').classList.add('hide'); }
    if (this.cur !== pg) return;
    pg.tr = data;
    for (const it of data.items) {
      if (it.kind === 'sfx' && !S.cTrSfx) continue;
      const [y0, x0, y1, x1] = it.box.map(Number), bx = el('div', { class: 'ctr-b' + (it.kind === 'caption' ? ' cap' : '') + ((it.conf ?? 1) < 0.6 ? ' low' : '') });
      Object.assign(bx.style, { left: x0 / 1000 * pg.w + 'px', top: y0 / 1000 * pg.h + 'px', width: Math.max(20, (x1 - x0) / 1000 * pg.w) + 'px', height: Math.max(16, (y1 - y0) / 1000 * pg.h) + 'px' });
      const sp = el('span', { text: it.tr || it.text }); bx.append(sp); layer.append(bx);
      // fit the text inside the balloon
      let lo = 6, hi = Math.max(10, (y1 - y0) / 1000 * pg.h * 0.5);
      for (let k = 0; k < 9; k++) { const mid = (lo + hi) / 2; sp.style.fontSize = mid + 'px'; if (sp.scrollHeight <= bx.clientHeight && sp.scrollWidth <= bx.clientWidth) lo = mid; else hi = mid; }
      sp.style.fontSize = lo + 'px';
      bx.onclick = e => { e.stopPropagation(); bx.classList.toggle('orig'); sp.textContent = bx.classList.contains('orig') ? it.text : (it.tr || it.text); };
    }
  },
  linesSheet() {
    const pg = this.cur, d = pg && pg.tr;
    Sheets.open({ title: t('cLines'), body: b => {
      if (!d || !d.items.length) { b.append(el('p', { class: 'muted', text: this.rec.prefs.tr ? t('cLinesNone') : t('cLinesOff') })); return; }
      b.append(...d.items.map((it, i) => el('div', { class: 'cline' + ((it.conf ?? 1) < 0.6 ? ' low' : '') },
        el('small', { text: (i + 1) + ' · ' + t('cKind_' + (it.kind || 'speech')) + ((it.conf ?? 1) < 0.6 ? ' · ' + t('cLow') : '') }),
        el('div', { class: 'co', text: it.text }), el('div', { class: 'ct', text: it.tr || '' }))),
        el('button', { class: 'btn block', style: { marginTop: '12px' }, text: t('cRedo'), onclick: async () => { Sheets.close(); try { await this.trData(pg, true); this.drawTr(pg); } catch (e) { toast(AI.errText(e)); } } }));
    } });
  },
  minimap(r) {
    let m = $('#c-map');
    if (!m) { m = el('div', { id: 'c-map' }, el('img'), el('i')); $('#v-comic').append(m); }
    const pg = this.cur; if (!pg) return;
    const show = this.mode === 'quadros' && !r.full && this.steps.length > 1;
    m.classList.toggle('on', show); if (!show) return;
    const img = m.firstChild; if (img.src !== pg.url) img.src = pg.url;
    const MW = 58, MH = MW * pg.h / pg.w; m.style.width = MW + 'px'; m.style.height = MH + 'px';
    Object.assign(m.lastChild.style, { left: (r.x / pg.w * MW) + 'px', top: (r.y / pg.h * MH) + 'px', width: (r.w / pg.w * MW) + 'px', height: (r.h / pg.h * MH) + 'px' });
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
            wToggle(t('splitWide'), t('splitWideSub2'), S.cSplit, v => { setS('cSplit', v); this.relayout(); }),
            el('button', { class: 'btn block', style: { margin: '10px 0' }, onclick: () => { Sheets.closeAll(); this.linesSheet(); } }, icon('translate'), t('cLines')),
            el('div', { style: { margin: '12px 0 6px', fontSize: '14px', fontWeight: 600 }, text: t('cBoxT') }),
            wSeg([['off', t('cBoxOff')], ['dim', t('cBoxDim')], ['black', t('cBoxBlack')]], S.cBox || (S.cSpot ? 'dim' : 'off'), v => { setS('cBox', v); this.apply(false); }),
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
