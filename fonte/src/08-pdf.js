/* ================= PDF book reader (scroll) ================= */
const PdfBook = {
  rec: null, pdf: null, n: 0, zoom: 1, sizes: [], divs: [], rendered: new Map(), obs: null, cur: 0, tok: 0, scrollT: null,
  init() {
    this.scroll = $('#p-scroll'); this.box = $('#p-pages');
    $('#v-pdf .r-back').onclick = () => this.close();
    $('#p-in').onclick = () => this.setZoom(this.zoom * 1.25);
    $('#p-out').onclick = () => this.setZoom(this.zoom / 1.25);
    $('#p-set').onclick = () => this.settings();
    $('#p-bmk').onclick = () => this.toggleBookmark();
    $('#p-ai').onclick = () => this.aiSheet();
    const rg = $('#p-range');
    rg.oninput = () => { $('#p-label').textContent = t('pageXofY', { a: rg.value, b: this.n }); };
    rg.onchange = () => this.gotoPage(+rg.value - 1);
    this.scroll.addEventListener('scroll', () => { clearTimeout(this.scrollT); this.scrollT = setTimeout(() => this.onScroll(), 120); }, { passive: true });
    // tap to toggle UI (only real taps)
    let sx, sy, st;
    this.scroll.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; st = Date.now(); });
    this.scroll.addEventListener('pointerup', e => { if (Math.hypot(e.clientX - sx, e.clientY - sy) < 8 && Date.now() - st < 400) this.toggleUI(); });
  },
  async open(rec, blob) {
    busy(t('opening'));
    try {
      this.rec = rec; rec.bookmarks = rec.bookmarks || []; rec.prefs = rec.prefs || {};
      this.pdf = await openPdf(blob); this.n = this.pdf.numPages;
      this.zoom = rec.prefs.zoom || 1;
      this.sizes = [];
      const p1 = await this.pdf.getPage(1); const v = p1.getViewport({ scale: 1 });
      for (let i = 0; i < this.n; i++) this.sizes.push({ w: v.width, h: v.height });
      // fetch real sizes lazily for the first pages (most PDFs are uniform)
      $('#p-title').textContent = rec.title;
      $('#p-range').max = this.n;
      App.show('v-pdf');
      this.build();
      this.showUI(true);
      const pg = (rec.pos && rec.pos.page) || 0;
      requestAnimationFrame(() => this.gotoPage(pg, rec.pos && rec.pos.y));
    } finally { busy(null); }
  },
  pageW() { const W = this.scroll.clientWidth; return Math.round(Math.min(W - 16, 980) * this.zoom); },
  build() {
    this.tok++;
    this.obs && this.obs.disconnect();
    for (const c of this.rendered.values()) c.remove && c.remove();
    this.rendered.clear();
    this.box.replaceChildren(); this.divs = [];
    const w = this.pageW();
    this.box.style.width = Math.max(w + 16, this.scroll.clientWidth) + 'px';
    for (let i = 0; i < this.n; i++) {
      const s = this.sizes[i], h = Math.round(w * s.h / s.w);
      const d = el('div', { class: 'pp', style: { width: w + 'px', height: h + 'px' } }, el('span', { class: 'pn', text: String(i + 1) }));
      d.dataset.i = i; this.divs.push(d); this.box.append(d);
    }
    this.obs = new IntersectionObserver(ents => { for (const en of ents) { const i = +en.target.dataset.i; if (en.isIntersecting) this.renderPage(i); else this.dropPage(i); } }, { root: this.scroll, rootMargin: '120% 0px' });
    this.divs.forEach(d => this.obs.observe(d));
  },
  async renderPage(i) {
    if (this.rendered.has(i)) return;
    const tok = this.tok; this.rendered.set(i, 'busy');
    try {
      const d = this.divs[i], dpr = Math.min(devicePixelRatio || 1, 2.5);
      const pg = await this.pdf.getPage(i + 1);
      const v1 = pg.getViewport({ scale: 1 });
      if (Math.abs(v1.width / v1.height - this.sizes[i].w / this.sizes[i].h) > 0.01) { this.sizes[i] = { w: v1.width, h: v1.height }; d.style.height = Math.round(parseFloat(d.style.width) * v1.height / v1.width) + 'px'; }
      const cssW = parseFloat(d.style.width), sc = Math.min(cssW * dpr, 3000) / v1.width;
      const vp = pg.getViewport({ scale: sc });
      const cv = document.createElement('canvas'); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      if (tok !== this.tok || this.rendered.get(i) !== 'busy') return;
      d.prepend(cv); this.rendered.set(i, cv);
    } catch (e) { this.rendered.delete(i); }
  },
  dropPage(i) { const c = this.rendered.get(i); if (c && c !== 'busy') { c.width = c.height = 0; c.remove(); } this.rendered.delete(i); },
  onScroll() {
    const mid = this.scroll.scrollTop + this.scroll.clientHeight * 0.35;
    let lo = 0, hi = this.divs.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.divs[m].offsetTop <= mid) lo = m; else hi = m - 1; }
    this.cur = lo; this.afterMove();
  },
  afterMove() {
    const i = this.cur, d = this.divs[i];
    $('#p-range').value = i + 1;
    $('#p-label').textContent = t('pageXofY', { a: i + 1, b: this.n }) + ' · ' + Math.round(this.zoom * 100) + '%';
    const y = d ? (this.scroll.scrollTop - d.offsetTop) / d.offsetHeight : 0;
    this.rec.pos = { page: i, y: clamp(y, 0, 1) }; this.rec.posAt = Date.now(); Resume.save(this.rec);
    this.rec.pct = this.n <= 1 ? 1 : clamp(i / (this.n - 1), 0, 1);
    const bm = (this.rec.bookmarks || []).some(b => b.page === i);
    $('#p-bmk').replaceChildren(icon(bm ? 'bookmarkF' : 'bookmark')); $('#p-bmk').style.color = bm ? 'var(--accent)' : '';
    saveRecSoon(this.rec);
  },
  gotoPage(i, y = 0) {
    i = clamp(i, 0, this.n - 1); const d = this.divs[i]; if (!d) return;
    this.scroll.scrollTop = y ? d.offsetTop + y * d.offsetHeight : Math.max(0, d.offsetTop - 70);
    this.cur = i; this.afterMove();
  },
  setZoom(z) {
    z = clamp(z, 0.5, 4); const i = this.cur, d = this.divs[i];
    const y = d ? (this.scroll.scrollTop - d.offsetTop) / d.offsetHeight : 0;
    this.zoom = z; this.rec.prefs.zoom = z; saveRec(this.rec, { sync: false });
    this.build();
    requestAnimationFrame(() => { this.gotoPage(i, Math.max(0.0001, y)); this.scroll.scrollLeft = (this.box.scrollWidth - this.scroll.clientWidth) / 2; });
  },
  toggleBookmark() {
    const bms = this.rec.bookmarks; const k = bms.findIndex(b => b.page === this.cur);
    if (k >= 0) { bms.splice(k, 1); toast(t('bmRemoved')); } else { bms.push({ id: uid(), page: this.cur, created: Date.now() }); bms.sort((a, b) => a.page - b.page); toast(t('bmAdded', { p: this.cur + 1 })); }
    saveRec(this.rec); this.afterMove();
  },
  settings() {
    Sheets.open({
      title: t('settings'), body: b => {
        const bms = this.rec.bookmarks || [];
        const L = el('div', { class: 'list' });
        if (!bms.length) L.append(el('div', { class: 'empty-l', text: t('noBookmarksComic') }));
        for (const m of bms) L.append(el('button', { class: 'li', onclick: () => { Sheets.close(); this.gotoPage(m.page); } }, icon('bookmarkF'), el('div', { class: 'lt', text: t('pageN', { n: m.page + 1 }) })));
        b.append(wGroup(t('theme'), themePicker(() => { })), el('p', { class: 'muted', style: { fontSize: '12.5px', margin: '8px 0 0', lineHeight: 1.4 }, text: t('pdfThemeHelp') }), wGroup(t('bookmarks'), L), comfortGroup());
      }
    });
  },
  async pageTextOf(i) { const tc = await (await this.pdf.getPage(i + 1)).getTextContent(); let s = ''; for (const it of tc.items) { s += it.str; s += it.hasEOL ? '\n' : ' '; } return s.replace(/[ \t]+/g, ' ').trim(); },
  aiSheet() {
    if (!AI.on) return toast(t('aiOff'));
    const s = Sheets.open({
      title: t('aiTools'), body: b => {
        const L = el('div', { class: 'list' });
        const item = (ic, label, sub, fn) => L.append(el('button', { class: 'li', onclick: () => { Sheets.close(s); fn(); } }, icon(ic), el('div', { class: 'lt' }, label, el('small', { text: sub }))));
        item('summary', t('sumPage'), t('sumPageSub'), async () => {
          const parts = []; for (let i = Math.max(0, this.cur - 2); i <= this.cur; i++) parts.push(await this.pageTextOf(i));
          const tx = parts.join('\n\n'); if (!tx.trim()) return toast(t('pdfNoText'));
          aiSheet(t('sumPage'), ({ signal, onText }) => AI.fn(`Summarize these pages from the document "${this.rec.title}" in ${AI.langName(S.lang)} with 3 to 6 short bullet points starting with "•". Plain text.\n\n"""\n${tx.slice(0, 40000)}\n"""`, { signal, onText }), { ui: true });
        });
        b.append(L);
      }
    });
  },
  toggleUI() { $('#v-pdf').classList.contains('ui-off') ? this.showUI() : this.hideUI(); },
  showUI(auto) { $('#v-pdf').classList.remove('ui-off'); clearTimeout(this.uiT); if (auto) this.uiT = setTimeout(() => this.hideUI(), 2600); },
  hideUI() { clearTimeout(this.uiT); $('#v-pdf').classList.add('ui-off'); },
  close() {
    saveRecSoon.flush(); if (this.rec) saveRec(this.rec);
    this.tok++; this.obs && this.obs.disconnect();
    for (const i of [...this.rendered.keys()]) this.dropPage(i);
    this.box.replaceChildren(); this.divs = [];
    closePdf(this.pdf); this.pdf = null;
    Pause.stop(); App.show('v-lib'); Lib.render();
  },
  key2(e) {
    const H = this.scroll.clientHeight * 0.9;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); this.scroll.scrollBy({ top: H, behavior: 'smooth' }); }
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); this.scroll.scrollBy({ top: -H, behavior: 'smooth' }); }
    else if (e.key === 'ArrowRight') this.gotoPage(this.cur + 1);
    else if (e.key === 'ArrowLeft') this.gotoPage(this.cur - 1);
    else if (e.key === 'Escape') this.close();
  },
};
