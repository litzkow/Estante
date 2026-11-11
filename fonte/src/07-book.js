/* ================= text helpers ================= */
const FONTS = {
  literata: "'Literata', Georgia, serif",
  atkinson: "'Atkinson Hyperlegible', Verdana, sans-serif",
  inter: "'Inter', system-ui, -apple-system, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
};
const HL_COLORS = { y: '#ffd640', g: '#78d278', b: '#6eaaff', p: '#ff82b4' };
function textOffset(root, node, off) {
  const r = document.createRange(); r.setStart(root, 0);
  try { r.setEnd(node, off); } catch (e) { return 0; }
  return r.toString().length;
}
function wrapOffsets(root, s, e, mk) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let pos = 0, n; const tg = [];
  while ((n = w.nextNode())) {
    const L = n.data.length, a = pos, b = pos + L;
    if (b > s && a < e && L) tg.push([n, Math.max(0, s - a), Math.min(L, e - a)]);
    pos = b; if (pos >= e) break;
  }
  const made = [];
  for (const [n0, x, y] of tg) {
    let node = n0;
    if (y < node.data.length) node.splitText(y);
    if (x > 0) node = node.splitText(x);
    if (!node.data.length) continue;
    const m = mk(); node.parentNode.insertBefore(m, node); m.appendChild(node); made.push(m);
  }
  return made;
}
function unwrap(m) { const p = m.parentNode; if (!p) return; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); }

/* ================= book reader (EPUB / TXT) ================= */
const Book = {
  rec: null, data: null, ch: 0, page: 0, pages: 1, tok: 0, tn: [], rootText: '', cum: [], total: 1,
  FW: 0, FH: 0, mx: 24, col: 300, G: 48, cpp: 1, turnAt: 0, chat: [],
  init() {
    this.frame = $('#b-frame'); this.flow = $('#b-flow');
    gestures(this.frame, {
      tap: (x, y, e) => {
        const sel = getSelection();
        if (sel && !sel.isCollapsed) { sel.removeAllRanges(); this.hideSel(); return; }
        const a = e.target.closest && e.target.closest('a');
        if (a) { if (a.dataset.ihref) { this.follow(a.dataset.ihref); return; } if (a.href) return; }
        const mk = e.target.closest && e.target.closest('mark[data-id]');
        if (mk) { this.hlMenu(mk.dataset.id); return; }
        const W = this.frame.clientWidth, z = (x - this.frame.getBoundingClientRect().left) / W;
        if (z > 0.3 && z < 0.7) return this.toggleUI();
        z >= 0.7 ? this.next() : this.prev();
      },
      swipe: d => { const sel = getSelection(); if (sel && !sel.isCollapsed) return; d === 'left' ? this.next() : this.prev(); },
      vswipe: d => { const sel = getSelection(); if (sel && !sel.isCollapsed) return; if (S.bTurn === 'vertical') d === 'up' ? this.next() : this.prev(); },
    });
    $('#b-x').onclick = () => this.close();
    $('#b-lang').onclick = () => this.switchLang();
    // tap zones in the top/bottom margins as well
    for (const id of ['#b-head', '#b-foot']) $(id).style.pointerEvents = 'none';
    $('#v-book .r-back').onclick = () => this.close();
    $('#b-aa').onclick = () => this.settings();
    $('#b-toc').onclick = () => this.tocSheet();
    $('#b-bmk').onclick = () => this.toggleBookmark();
    $('#b-find').onclick = () => this.searchSheet();
    $('#b-ai').onclick = () => this.aiSheet();
    const rg = $('#b-range');
    rg.oninput = () => { $('#b-label').textContent = Math.round(rg.value / 10) + '%'; };
    rg.onchange = () => this.jumpPct(rg.value / 1000);
    document.addEventListener('selectionchange', debounce(() => this.onSel(), 220));
    this.selbar = $('#selbar');
  },
  async open(rec, blob) {
    busy(t('opening'));
    try {
      this.rec = rec; rec.highlights = rec.highlights || []; rec.bookmarks = rec.bookmarks || [];
      if (rec.format === 'epub') this.data = await EpubBook.open(blob);
      else this.data = new TxtBook(decodeText(await blob.arrayBuffer()), rec.title);
      const sz = this.data.spine.map(s => s.size);
      this.cum = [0]; for (const s of sz) this.cum.push(this.cum[this.cum.length - 1] + s);
      this.total = this.cum[this.cum.length - 1] || 1;
      this.chat = [];
      $('#b-title').textContent = rec.title;
      this.flow.lang = (this.data.lang || rec.lang || (S.lang === 'en' ? 'en' : 'pt')).slice(0, 5);
      App.show('v-book');
      this.applyStyle();
      this.showUI(true);
      const pos = rec.pos || {};
      this.sib = Lib.sibling(rec);
      $('#b-lang').classList.toggle('hide', !this.sib);
      if (this.sib) $('#b-lang').textContent = langName(this.sib.lang);
      if (pos.jump) { delete rec.pos; await this.jumpTo(pos.jump); }
      else if (!rec.pos) await this.render(this.data.start || 0, { frac: 0 });
      else await this.render(clamp(pos.ch || 0, 0, this.data.count - 1), pos.off != null ? { offset: pos.off } : { frac: pos.frac || 0 });
    } finally { busy(null); }
    if (!(await DB.get('kv', 'hint:book'))) { DB.put('kv', 'hint:book', 1); const h = el('div', { class: 'hint' }, el('div', { text: t('hintBack') }), el('div', { text: t('hintMenuSel') }), el('div', { text: t('hintNext') })); $('#v-book').append(h); setTimeout(() => h.remove(), 3400); }
  },
  applyStyle() {
    const f = this.flow;
    f.style.setProperty('--bk-font', FONTS[S.bFont] || FONTS.literata);
    f.style.setProperty('--bk-size', S.bSize + 'px');
    f.style.setProperty('--bk-lh', S.bLh);
    f.style.setProperty('--bk-ps', S.bIndent ? '0' : '0.65em');
    f.classList.toggle('just', !!S.bJustify);
    f.classList.toggle('indent', !!S.bIndent);
    this.layout();
  },
  layout() {
    const FW = this.frame.clientWidth, FH = this.frame.clientHeight;
    this.FW = FW; this.FH = FH;
    let mx = { s: 18, m: 28, l: 44 }[S.bMargin] || 28;
    if (FW > 600) mx += 12;
    let cpp = (FW >= 900 && FW > FH * 1.15) ? 2 : 1;
    let col = cpp === 2 ? (FW - 4 * mx) / 2 : FW - 2 * mx;
    const maxCol = S.bSize * 36;
    if (col > maxCol) { mx = cpp === 2 ? (FW - 2 * maxCol) / 4 : (FW - maxCol) / 2; col = maxCol; }
    this.mx = mx; this.col = col; this.G = 2 * mx; this.cpp = cpp;
    const f = this.flow;
    Object.assign(f.style, { left: mx + 'px', width: (cpp === 2 ? FW - 2 * mx : col) + 'px', columnWidth: col + 'px', columnCount: cpp, columnGap: this.G + 'px' });
    f.style.setProperty('--bk-h', FH + 'px');
  },
  async waitImgs() {
    const imgs = [...this.flow.querySelectorAll('img')];
    await Promise.race([Promise.all(imgs.map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))), sleep(3000)]);
  },
  measure() {
    const cols = Math.max(1, Math.round((this.flow.scrollWidth + this.G) / (this.col + this.G)));
    this.pages = Math.max(1, Math.ceil(cols / this.cpp));
  },
  buildTN() {
    const root = this.flow.firstElementChild; this.tn = []; this.rootText = '';
    if (!root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n, pos = 0;
    while ((n = w.nextNode())) { const L = n.data.length; if (L && /\S/.test(n.data)) this.tn.push({ n, s: pos, L }); pos += L; }
    this.rootText = root.textContent;
  },
  absX(rect) { return rect.left - this.flow.getBoundingClientRect().left; },
  nodeX(i) { const r = document.createRange(); r.selectNodeContents(this.tn[i].n); const rs = r.getClientRects(); return rs.length ? this.absX(rs[0]) : null; },
  charX(n, k) { const r = document.createRange(); r.setStart(n, k); r.setEnd(n, Math.min(n.data.length, k + 1)); const rs = r.getClientRects(); return rs.length ? this.absX(rs[0]) : null; },
  pageOfX(x) { return clamp(Math.floor((x + 1) / this.FW), 0, this.pages - 1); },
  offsetAtPage(p) {
    const tn = this.tn; if (!tn.length) return 0;
    if (p <= 0) return 0;
    const X = p * this.FW - 2;
    let lo = 0, hi = tn.length;
    while (lo < hi) { const m = (lo + hi) >> 1, x = this.nodeX(m); if (x == null || x < X) lo = m + 1; else hi = m; }
    const prev = tn[lo - 1];
    if (prev) {
      // does the previous node continue onto this page?
      const r = document.createRange(); r.selectNodeContents(prev.n); const rs = r.getClientRects();
      const last = rs[rs.length - 1];
      if (last && this.absX(last) >= X) {
        let a = 0, b = prev.L;
        while (a < b) { const m = (a + b) >> 1, x = this.charX(prev.n, m); if (x == null || x < X) a = m + 1; else b = m; }
        return prev.s + a;
      }
    }
    return lo < tn.length ? tn[lo].s : this.rootText.length;
  },
  pageOfOffset(off) {
    const tn = this.tn; if (!tn.length) return 0;
    let lo = 0, hi = tn.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tn[m].s <= off) lo = m; else hi = m - 1; }
    const t0 = tn[lo]; const k = clamp(off - t0.s, 0, Math.max(0, t0.L - 1));
    const x = this.charX(t0.n, k);
    return x == null ? 0 : this.pageOfX(x);
  },
  async render(ch, where = {}) {
    const tok = ++this.tok;
    let node;
    try { node = await this.data.chapter(ch); } catch (e) { node = el('div', { class: 'chap' }, el('p', { text: '—' })); }
    if (tok !== this.tok) return;
    this.ch = ch;
    this.flow.style.transition = 'none'; this.flow.style.transform = 'translateX(0)';
    this.flow.replaceChildren(node);
    this.flow.classList.toggle('opener', (node.textContent || '').trim().length < 160 && !node.querySelector('img,svg'));
    this.applyHighlights();
    await this.waitImgs();
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(1500)]);
    if (tok !== this.tok) return;
    this.measure(); this.buildTN();
    let p = 0;
    if (where === 'end') p = this.pages - 1;
    else if (where.offset != null) p = this.pageOfOffset(where.offset);
    else if (where.anchor) { const t2 = this.flow.querySelector('#' + CSS.escape(where.anchor)) || this.flow.querySelector(`[name="${CSS.escape(where.anchor)}"]`); if (t2) { const r = t2.getClientRects()[0] || t2.getBoundingClientRect(); p = this.pageOfX(this.absX(r)); } }
    else if (where.frac != null) p = Math.min(this.pages - 1, Math.floor(where.frac * this.pages + 1e-6));
    this.showPage(p, false);
    if (where.flash) this.flash(where.flash[0], where.flash[1]);
  },
  showPage(p, anim, dir) {
    const np = clamp(p, 0, this.pages - 1), mode = S.bTurn || 'slide';
    if (anim && np !== this.page && mode !== 'slide' && mode !== 'none') {
      const g = this.snap(); dir = dir || (np > this.page ? 1 : -1);
      this.page = np; this.flow.style.transition = 'none'; this.flow.style.transform = `translateX(${-this.page * this.FW}px)`;
      this.afterMove(); this.play(g, dir, mode); return;
    }
    this.page = np;
    this.flow.style.transition = anim && mode === 'slide' ? 'transform .26s cubic-bezier(.3,.7,.3,1)' : 'none';
    this.flow.style.transform = `translateX(${-this.page * this.FW}px)`;
    this.afterMove();
  },
  next() {
    this.trackSpeed();
    if (this.page < this.pages - 1) this.showPage(this.page + 1, true);
    else if (this.ch < this.data.count - 1) this.turnChapter(this.ch + 1, { frac: 0 }, 1);
    else this.finish();
  },
  prev() {
    this.turnAt = 0;
    if (this.page > 0) this.showPage(this.page - 1, true);
    else if (this.ch > 0) this.turnChapter(this.ch - 1, 'end', -1);
    else toast(t('atStart'));
  },
  async turnChapter(ch, where, dir) {
    const mode = S.bTurn || 'slide';
    const g = mode !== 'none' ? this.snap() : null;
    await this.render(ch, where);
    if (g) this.play(g, dir, mode === 'slide' ? 'slideG' : mode);
  },
  snap() {
    this.endFx();
    const g = this.frame.cloneNode(true); g.classList.add('pt-ghost');
    this.frame.after(g); this.ghost = g; return g;
  },
  endFx() { (this.fx || []).forEach(a => { try { a.finish(); } catch (e) { } }); this.fx = []; if (this.ghost) { this.ghost.remove(); this.ghost = null; } },
  play(g, dir, mode) {
    const F = this.frame, ease = 'cubic-bezier(.2,.75,.25,1)', D = mode === 'curl' ? 560 : mode === 'fade' ? 300 : 420;
    const on = (top, below) => { top.style.zIndex = 3; below.style.zIndex = 2; };
    let a = [];
    if (mode === 'vertical') {
      if (dir > 0) { on(F, g); a = [F.animate([{ transform: 'translateY(100%)', boxShadow: '0 -20px 40px rgba(0,0,0,.25)' }, { transform: 'none', boxShadow: '0 -20px 40px rgba(0,0,0,0)' }], { duration: D, easing: ease }), g.animate([{ transform: 'none', filter: 'brightness(1)' }, { transform: 'scale(.94)', filter: 'brightness(.8)' }], { duration: D, easing: ease })]; }
      else { on(g, F); a = [g.animate([{ transform: 'none' }, { transform: 'translateY(100%)' }], { duration: D, easing: ease }), F.animate([{ transform: 'scale(.94)', filter: 'brightness(.8)' }, { transform: 'none', filter: 'brightness(1)' }], { duration: D, easing: ease })]; }
    } else if (mode === 'curl') {
      const out = [{ transform: 'perspective(1800px) rotateY(0)', filter: 'brightness(1)', boxShadow: '0 0 0 rgba(0,0,0,0)' }, { transform: 'perspective(1800px) rotateY(-30deg)', filter: 'brightness(.95)', boxShadow: '20px 0 40px rgba(0,0,0,.3)', offset: .35 }, { transform: 'perspective(1800px) rotateY(-100deg)', filter: 'brightness(.7)', boxShadow: '40px 0 60px rgba(0,0,0,0)' }];
      if (dir > 0) { on(g, F); g.style.transformOrigin = '0 50%'; a = [g.animate(out, { duration: D, easing: 'ease-in-out' }), F.animate([{ filter: 'brightness(.8)' }, { filter: 'brightness(1)' }], { duration: D })]; }
      else { on(F, g); F.style.transformOrigin = '0 50%'; a = [F.animate(out.slice().reverse().map((k, i) => ({ ...k, offset: [0, .65, 1][i] })), { duration: D, easing: 'ease-in-out' }), g.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(.8)' }], { duration: D })]; }
    } else if (mode === 'fade') {
      on(g, F); a = [g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D, easing: 'ease-out' })];
    } else {
      on(g, F); const x = dir > 0 ? '-100%' : '100%', y = dir > 0 ? '100%' : '-100%';
      a = [g.animate([{ transform: 'none' }, { transform: `translateX(${x})` }], { duration: 300, easing: ease }), F.animate([{ transform: `translateX(${y})` }, { transform: 'none' }], { duration: 300, easing: ease })];
    }
    this.fx = a;
    Promise.all(a.map(x => x.finished)).catch(() => { }).then(() => { if (this.ghost === g) { g.remove(); this.ghost = null; } F.style.zIndex = ''; F.style.transformOrigin = ''; });
  },
  async jumpTo(j) {
    // same chapter number in the other language if possible, else same percentage
    if (j.num) { const e = this.data.toc.find(e => chapNum(e.label) === j.num); if (e) return this.render(e.idx, { frac: j.frac || 0 }); }
    return this.jumpPct(j.pct || 0);
  },
  async switchLang() {
    TTS.stop();
    const sib = this.sib; if (!sib) return;
    const num = chapNum(this.tocLabel(this.ch));
    const jump = { pct: this.pct(), num, frac: this.page / this.pages };
    saveRecSoon.flush && saveRecSoon.flush(); await saveRec(this.rec);
    sib.pos = Object.assign({}, sib.pos || {}, { jump }); await DB.put('books', sib.id, sib);
    this.endFx(); Lib.open(sib.id);
  },
  trackSpeed() {
    const now = Date.now();
    if (this.turnAt) {
      const dt = now - this.turnAt, cpp = this.rootText.length / this.pages;
      if (dt > 2500 && dt < 240000 && cpp > 200) { const cpm = cpp / (dt / 60000); S.cpm = clamp(Math.round(S.cpm * 0.88 + cpm * 0.12), 300, 4000); saveSettings(); }
    }
    this.turnAt = now;
  },
  finish() {
    if (!this.rec.finished) { this.rec.finished = true; this.rec.pct = 1; saveRec(this.rec); }
    Sheets.open({
      title: t('theEnd'), center: true, body: b => b.append(el('p', { class: 'muted', style: { lineHeight: 1.5, margin: '0 0 18px' }, text: t('endBook', { t: this.rec.title }) }),
        el('div', { style: { display: 'flex', gap: '10px' } },
          el('button', { class: 'btn', style: { flex: 1 }, text: t('stay'), onclick: () => Sheets.close() }),
          el('button', { class: 'btn primary', style: { flex: 1 }, text: t('toShelf'), onclick: () => { Sheets.close(); this.close(); } })))
    });
  },
  tocLabel(ch) {
    let lab = '';
    for (const e of this.data.toc) { if (e.idx < ch) lab = e.label; else if (e.idx === ch) return e.label; }
    return lab;
  },
  pct() {
    const sz = this.data.spine[this.ch].size;
    if (this.ch === this.data.count - 1 && this.page === this.pages - 1) return 1;
    return clamp((this.cum[this.ch] + (this.page / this.pages) * sz) / this.total, 0, 1);
  },
  afterMove() {
    const pct = this.pct(), chapLabel = this.tocLabel(this.ch) || this.rec.title;
    const left = this.pages - this.page - 1, cpp = this.rootText.length / this.pages;
    const mins = Math.max(0, Math.round(left * cpp / (S.cpm || 1000)));
    $('#b-h1').textContent = niceLabel(chapLabel);
    $('#b-h2').textContent = '';
    $('#b-f1').textContent = left > 0 ? t(left === 1 ? 'pageLeft1' : 'pagesLeft', { n: left }) : t('lastPageCh');
    $('#b-f2').textContent = (left > 0 ? t('minLeft', { m: mins < 1 ? '<1' : mins }) + ' · ' : '') + Math.round(pct * 100) + '%';
    $('#b-range').value = Math.round(pct * 1000);
    $('#b-label').textContent = t('chapterN', { n: this.ch + 1, m: this.data.count }) + ' · ' + Math.round(pct * 100) + '%';
    const off = this.offsetAtPage(this.page);
    this.curOff = off;
    this.rec.pos = { ch: this.ch, off, frac: this.page / this.pages };
    this.rec.pct = pct;
    if (pct >= 1 && !this.rec.finished) { /* finished on explicit end */ }
    const bm = this.bmHere();
    $('#b-bm').classList.toggle('on', !!bm);
    $('#b-bmk').replaceChildren(icon(bm ? 'bookmarkF' : 'bookmark'));
    $('#b-bmk').style.color = bm ? 'var(--accent)' : '';
    saveRecSoon(this.rec);
  },
  relayout() {
    if (!this.data) return;
    const off = this.curOff || 0;
    this.applyStyle();
    this.measure(); this.buildTN();
    this.showPage(this.pageOfOffset(off), false);
  },
  async jumpPct(p) {
    const target = p * this.total; let ch = 0;
    while (ch < this.data.count - 1 && this.cum[ch + 1] <= target) ch++;
    const frac = clamp((target - this.cum[ch]) / (this.data.spine[ch].size || 1), 0, 0.9999);
    await this.render(ch, { frac });
  },
  async follow(href) {
    const { idx, frag } = this.data.locate(href);
    if (idx < 0) return;
    if (idx === this.ch && frag) { const t2 = this.flow.querySelector('#' + CSS.escape(frag)); if (t2) { this.showPage(this.pageOfX(this.absX(t2.getClientRects()[0] || t2.getBoundingClientRect())), true); return; } }
    await this.render(idx, frag ? { anchor: frag } : { frac: 0 });
  },
  toggleUI() { $('#v-book').classList.contains('ui-off') ? this.showUI() : this.hideUI(); },
  showUI(auto) { $('#v-book').classList.remove('ui-off'); clearTimeout(this.uiT); if (auto) this.uiT = setTimeout(() => this.hideUI(), 2600); },
  hideUI() { clearTimeout(this.uiT); $('#v-book').classList.add('ui-off'); },

  /* ----- bookmarks ----- */
  bmHere() {
    const a = this.curOff, b = this.page < this.pages - 1 ? this.offsetAtPage(this.page + 1) : Infinity;
    return (this.rec.bookmarks || []).find(m => m.ch === this.ch && m.off >= a && m.off < b);
  },
  toggleBookmark() {
    const ex = this.bmHere();
    if (ex) { this.rec.bookmarks = this.rec.bookmarks.filter(m => m !== ex); toast(t('bmRemoved')); }
    else {
      const snip = this.rootText.slice(this.curOff, this.curOff + 140).replace(/\s+/g, ' ').trim();
      this.rec.bookmarks.push({ id: uid(), ch: this.ch, off: this.curOff, label: snip, pct: this.pct(), created: Date.now() });
      this.rec.bookmarks.sort((x, y) => x.ch - y.ch || x.off - y.off);
      toast(t('bmAddedBook'));
    }
    saveRec(this.rec); this.afterMove();
  },

  /* ----- highlights ----- */
  applyHighlights() {
    const root = this.flow.firstElementChild; if (!root) return;
    for (const h of (this.rec.highlights || []).filter(h => h.ch === this.ch)) {
      wrapOffsets(root, h.s, h.e, () => { const m = document.createElement('mark'); m.className = 'hl-' + (h.color || 'y') + (h.note ? ' hl-note' : ''); m.dataset.id = h.id; return m; });
    }
  },
  onSel() {
    if (!$('#v-book').classList.contains('on')) return this.hideSel();
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return this.hideSel();
    const r = sel.getRangeAt(0);
    if (!this.flow.contains(r.commonAncestorContainer)) return this.hideSel();
    const text = sel.toString().trim(); if (!text) return this.hideSel();
    this.selRange = r.cloneRange(); this.selText = text;
    const bar = this.selbar; bar.replaceChildren();
    for (const [c, col] of Object.entries(HL_COLORS)) bar.append(el('button', { class: 'sw', style: { background: col }, 'aria-label': t('highlight'), onclick: () => this.addHL(c) }));
    bar.append(...[el('span', { class: 'sep' }),
      el('button', { onclick: () => this.addNote() }, icon('note')),
      AI.on ? el('button', { onclick: () => this.explainSel() }, icon('sparkle'), t('explain')) : null,
      el('button', { onclick: async () => { try { await navigator.clipboard.writeText(this.selText); toast(t('copied')); } catch (e) { toast(t('copyFail')); } this.clearSel(); } }, icon('copy'))].filter(Boolean));
    bar.classList.add('on');
    const rr = r.getBoundingClientRect(), bw = bar.offsetWidth, bh = bar.offsetHeight;
    let x = clamp(rr.left + rr.width / 2 - bw / 2, 8, innerWidth - bw - 8);
    let y = rr.top - bh - 12; if (y < 60) y = rr.bottom + 14;
    if (y + bh > innerHeight - 10) y = innerHeight - bh - 10;
    bar.style.left = x + 'px'; bar.style.top = y + 'px';
  },
  hideSel() { this.selbar && this.selbar.classList.remove('on'); },
  clearSel() { getSelection().removeAllRanges(); this.hideSel(); },
  selOffsets() {
    const root = this.flow.firstElementChild, r = this.selRange;
    if (!root || !r) return null;
    const s = textOffset(root, r.startContainer, r.startOffset), e = textOffset(root, r.endContainer, r.endOffset);
    return e > s ? { s, e } : null;
  },
  addHL(color, note) {
    const o = this.selOffsets(); if (!o) return;
    const h = { id: uid(), ch: this.ch, s: o.s, e: o.e, text: this.rootText.slice(o.s, o.e).slice(0, 2000), color, note: note || '', created: Date.now() };
    this.rec.highlights.push(h);
    this.clearSel();
    const root = this.flow.firstElementChild;
    wrapOffsets(root, h.s, h.e, () => { const m = document.createElement('mark'); m.className = 'hl-' + color + (h.note ? ' hl-note' : ''); m.dataset.id = h.id; return m; });
    this.buildTN();
    saveRec(this.rec);
    return h;
  },
  async addNote() {
    const o = this.selOffsets(); if (!o) return;
    const saved = this.selRange;
    const n = await Sheets.prompt(t('addNote'), '', { multi: true, placeholder: t('notePh') });
    if (n == null) return;
    this.selRange = saved; this.addHL('y', n);
  },
  hlMenu(id) {
    const h = this.rec.highlights.find(x => x.id === id); if (!h) return;
    const s = Sheets.open({
      title: t('highlight'), body: b => {
        b.append(el('p', { style: { fontFamily: 'var(--serif)', fontSize: '16px', lineHeight: 1.5, margin: '0 0 6px', borderLeft: '4px solid ' + HL_COLORS[h.color || 'y'], paddingLeft: '12px' }, text: h.text }));
        if (h.note) b.append(el('p', { class: 'muted', style: { margin: '6px 0 0', lineHeight: 1.45 }, text: h.note }));
        const cols = el('div', { style: { display: 'flex', gap: '12px', margin: '16px 0 6px' } });
        for (const [c, col] of Object.entries(HL_COLORS)) cols.append(el('button', { style: { width: '38px', height: '38px', borderRadius: '50%', background: col, border: c === h.color ? '3px solid var(--fg)' : '3px solid transparent' }, onclick: () => { h.color = c; saveRec(this.rec); Sheets.close(s); this.rerenderMarks(); } }));
        const L = el('div', { class: 'list' });
        L.append(el('button', { class: 'li', onclick: async () => { Sheets.close(s); const n = await Sheets.prompt(t('editNote'), h.note, { multi: true, placeholder: t('notePh') }); if (n != null) { h.note = n; saveRec(this.rec); this.rerenderMarks(); } } }, icon('note'), el('div', { class: 'lt', text: h.note ? t('editNote') : t('addNote') })));
        if (AI.on) L.append(el('button', { class: 'li', onclick: () => { Sheets.close(s); this.explainText(h.text); } }, icon('sparkle'), el('div', { class: 'lt', text: t('explain') })));
        L.append(el('button', { class: 'li', onclick: async () => { try { await navigator.clipboard.writeText(h.text); toast(t('copied')); } catch (e) { toast(t('copyFail')); } } }, icon('copy'), el('div', { class: 'lt', text: t('copy') })));
        L.append(el('button', { class: 'li danger', onclick: () => { this.rec.highlights = this.rec.highlights.filter(x => x !== h); saveRec(this.rec); Sheets.close(s); this.rerenderMarks(); toast(t('hlRemoved')); } }, icon('trash'), el('div', { class: 'lt', text: t('removeHl') })));
        b.append(cols, L);
      }
    });
  },
  rerenderMarks() {
    const root = this.flow.firstElementChild; if (!root) return;
    for (const m of [...root.querySelectorAll('mark[data-id]')]) unwrap(m);
    root.normalize();
    this.applyHighlights(); this.buildTN();
  },
  flash(s, e) {
    const root = this.flow.firstElementChild; if (!root) return;
    const ms = wrapOffsets(root, s, e, () => el('mark', { class: 'find' }));
    this.buildTN();
    setTimeout(() => { ms.forEach(m => m.style.background = 'transparent'); }, 1600);
    setTimeout(() => { ms.forEach(unwrap); this.buildTN(); }, 2700);
  },

  /* ----- sheets ----- */
  settings() {
    Sheets.open({
      title: t('textSettings'), body: b => {
        const v = el('div', { class: 'v', text: S.bSize });
        const setSize = d => { setS('bSize', clamp(S.bSize + d, 13, 34)); v.textContent = S.bSize; this.relayout(); };
        const fonts = el('div', { class: 'fonts' });
        for (const [k, label] of [['literata', 'Literata'], ['atkinson', 'Atkinson'], ['inter', 'Inter'], ['georgia', 'Georgia']]) {
          const btn = el('button', { class: S.bFont === k ? 'on' : '', style: { fontFamily: FONTS[k] }, text: label, onclick: () => { setS('bFont', k); fonts.querySelectorAll('button').forEach(x => x.classList.remove('on')); btn.classList.add('on'); this.relayout(); } });
          fonts.append(btn);
        }
        b.append(
          wGroup(t('fontSize'), el('div', { class: 'stepper' }, el('button', { style: { fontSize: '15px' }, onclick: () => setSize(-1) }, 'A−'), v, el('button', { style: { fontSize: '20px' }, onclick: () => setSize(1) }, 'A+'))),
          wGroup(t('font'), fonts, el('p', { class: 'muted', style: { fontSize: '12.5px', margin: '8px 0 0', lineHeight: 1.4 }, text: t('fontHelp') })),
          wGroup(t('spacing'), wSeg([[1.4, t('compact')], [1.6, t('normal')], [1.85, t('airy')]], S.bLh, x => { setS('bLh', x); this.relayout(); })),
          wGroup(t('margins'), wSeg([['s', t('narrow')], ['m', t('medium')], ['l', t('wide')]], S.bMargin, x => { setS('bMargin', x); this.relayout(); })),
          wGroup(t('theme'), themePicker(() => this.relayout())),
          wGroup(t('layout'),
            wToggle(t('justify'), null, S.bJustify, x => { setS('bJustify', x); this.relayout(); }),
            wToggle(t('indent'), t('indentSub'), S.bIndent, x => { setS('bIndent', x); this.relayout(); }),
            ),
          wGroup(t('pageTurn'), wSeg([['slide', t('ptSlide')], ['vertical', t('ptVertical')], ['curl', t('ptCurl')], ['fade', t('ptFade')], ['none', t('ptNone')]], S.bTurn || 'slide', x => { setS('bTurn', x); setS('bAnim', x !== 'none'); }, 'wrap')),
          comfortGroup());
      }
    });
  },
  tocSheet() {
    const s = Sheets.open({
      title: this.rec.title, body: b => {
        const box = el('div');
        const show = tab => {
          box.replaceChildren();
          const L = el('div', { class: 'list' });
          if (tab === 'toc') {
            const toc = this.data.toc.length ? this.data.toc : this.data.spine.map((x, i) => ({ label: t('part') + ' ' + (i + 1), idx: i, depth: 0 }));
            const curLabel = this.tocLabel(this.ch);
            for (const e of toc) L.append(el('button', { class: 'li' + (e.idx === this.ch && e.label === curLabel ? ' cur' : ''), style: { paddingLeft: (4 + e.depth * 18) + 'px' }, onclick: () => { Sheets.close(s); this.render(e.idx, e.frag ? { anchor: e.frag } : { frac: 0 }); } }, el('div', { class: 'lt', text: e.label })));
          } else if (tab === 'bm') {
            const bms = this.rec.bookmarks || [];
            if (!bms.length) L.append(el('div', { class: 'empty-l', text: t('noBookmarks') }));
            for (const m of bms) L.append(el('button', { class: 'li', onclick: () => { Sheets.close(s); this.render(m.ch, { offset: m.off }); } }, icon('bookmarkF'), el('div', { class: 'lt' }, m.label || '…', el('small', { text: (this.tocLabel(m.ch) || t('chapterN', { n: m.ch + 1, m: this.data.count })) + ' · ' + Math.round((m.pct || 0) * 100) + '%' }))));
          } else {
            const hls = (this.rec.highlights || []).slice().sort((a, c) => a.ch - c.ch || a.s - c.s);
            if (!hls.length) L.append(el('div', { class: 'empty-l', text: t('noHighlights') }));
            for (const h of hls) L.append(el('button', { class: 'hl-row', style: { width: '100%' }, onclick: () => { Sheets.close(s); this.render(h.ch, { offset: h.s }); } }, el('span', { class: 'bar', style: { background: HL_COLORS[h.color || 'y'] } }), el('div', { class: 'bx' }, el('q', { text: h.text }), h.note ? el('div', { class: 'nt', text: '✎ ' + h.note }) : null, el('small', { text: this.tocLabel(h.ch) || t('chapterN', { n: h.ch + 1, m: this.data.count }) }))));
            if (hls.length) L.append(el('button', { class: 'btn block', style: { marginTop: '14px' }, onclick: async () => { const txt = `${this.rec.title}${this.rec.author ? ' — ' + this.rec.author : ''}\n\n` + hls.map(h => `“${h.text}”${h.note ? '\n  ✎ ' + h.note : ''}`).join('\n\n'); try { await navigator.clipboard.writeText(txt); toast(t('copied')); } catch (e) { toast(t('copyFail')); } } }, icon('copy'), t('copyAllHl')));
          }
          box.append(L);
          if (tab === 'toc') setTimeout(() => { const c = L.querySelector('.cur'); c && c.scrollIntoView({ block: 'center' }); }, 30);
        };
        b.append(el('div', { class: 'tabs2' }, wSeg([['toc', t('contents')], ['bm', t('bookmarks')], ['hl', t('highlights')]], 'toc', show)), box);
        show('toc');
      }
    });
  },
  searchSheet() {
    let run = 0;
    Sheets.open({
      title: t('searchBook'), onClose: () => { run++; }, body: b => {
        const inp = el('input', { class: 'field', type: 'search', placeholder: t('searchBookPh') });
        const info = el('div', { class: 'muted', style: { fontSize: '13px', margin: '10px 0 4px' } });
        const res = el('div');
        b.append(inp, info, res);
        const go = debounce(async () => {
          const my = ++run; res.replaceChildren();
          const q = fold(inp.value.trim()); if (q.length < 2) { info.textContent = ''; return; }
          let count = 0;
          for (let i = 0; i < this.data.count && my === run; i++) {
            info.textContent = t('searching', { p: Math.round(i / this.data.count * 100) });
            const txt = await this.data.text(i); if (my !== run) return;
            let F = '', map = [];
            for (let k = 0; k < txt.length; k++) { const f = fold(txt[k]); F += f; for (let j = 0; j < f.length; j++) map.push(k); }
            let at = F.indexOf(q);
            while (at >= 0 && count < 300) {
              const s0 = map[at], e0 = map[at + q.length - 1] + 1;
              const a = Math.max(0, s0 - 50), z = Math.min(txt.length, e0 + 70);
              const pre = (a > 0 ? '…' : '') + txt.slice(a, s0).replace(/\s+/g, ' '), mid = txt.slice(s0, e0), post = txt.slice(e0, z).replace(/\s+/g, ' ') + (z < txt.length ? '…' : '');
              const ch = i;
              res.append(el('button', { class: 'res', onclick: () => { Sheets.close(); this.render(ch, { offset: s0, flash: [s0, e0] }); } }, el('small', { text: this.tocLabel(i) || t('chapterN', { n: i + 1, m: this.data.count }) }), pre, el('mark', { text: mid }), post));
              count++; at = F.indexOf(q, at + q.length);
            }
            if (i % 4 === 3) await sleep(0);
          }
          if (my === run) info.textContent = count ? t('nResults', { n: count >= 300 ? '300+' : count }) : t('noResults');
        }, 350);
        inp.addEventListener('input', go);
        setTimeout(() => inp.focus(), 80);
      }
    });
  },
  pageText(p = this.page) {
    const a = this.offsetAtPage(p), b = p < this.pages - 1 ? this.offsetAtPage(p + 1) : this.rootText.length;
    return this.rootText.slice(a, b).trim();
  },
  contextSoFar(maxChars = 60000) {
    const end = this.page < this.pages - 1 ? this.offsetAtPage(this.page + 1) : this.rootText.length;
    return this.rootText.slice(Math.max(0, end - maxChars), end);
  },
  aiSheet() {
    if (!AI.on) return toast(t('aiOff'));
    const s = Sheets.open({
      title: t('aiTools'), body: b => {
        const L = el('div', { class: 'list' });
        const item = (ic, label, sub, fn) => L.append(el('button', { class: 'li', onclick: () => { Sheets.close(s); fn(); } }, icon(ic), el('div', { class: 'lt' }, label, el('small', { text: sub }))));
        item('summary', t('recap'), t('recapSub'), () => this.recap());
        item('hand', t('askBook'), t('askBookSub'), () => this.askSheet());
        item('sparkle', t('explainSel'), t('explainSelSub'), () => toast(t('selectFirst'), 3500));
        b.append(L);
      }
    });
  },
  explainSel() {
    const tx = this.selText; const o = this.selOffsets();
    const ctx = o ? this.rootText.slice(Math.max(0, o.s - 700), Math.min(this.rootText.length, o.e + 400)) : '';
    this.clearSel(); this.explainText(tx, ctx);
  },
  explainText(tx, ctx) {
    const lang = AI.langName(S.lang);
    aiSheet(t('explain'), ({ signal, onText }) =>
      AI.fn(`A reader of the book "${this.rec.title}"${this.rec.author ? ' by ' + this.rec.author : ''} selected this passage and wants to understand it:\n\n"${tx.slice(0, 1500)}"\n\n${ctx ? 'Surrounding text for context:\n"""' + ctx + '"""\n\n' : ''}Explain in ${lang}, in 2 to 5 short sentences: what it means here, plus the meaning of any hard or foreign word, idiom or reference. If it is in another language, also give a natural translation. Do not reveal anything that happens later in the book. Plain text only.`, { signal, onText, modelTier: 'quick' }), { ui: true });
  },
  recap() {
    const lang = AI.langName(S.lang);
    const ctx = this.contextSoFar(60000);
    const chap = this.tocLabel(this.ch) || t('chapterN', { n: this.ch + 1, m: this.data.count });
    aiSheet(t('recap'), ({ signal, onText }) =>
      AI.fn(`You are helping someone who is reading "${this.rec.title}"${this.rec.author ? ' by ' + this.rec.author : ''}. Below is the text of the current section ("${chap}") up to the point where they stopped. Write a recap in ${lang} of what has happened so far in this section: who is involved, the key events and anything important to remember. Use 3 to 6 short bullet points starting with "•". Only use the text given: never mention or guess anything after it.\n\n"""\n${ctx}\n"""`, { signal, onText }), { ui: true });
  },
  askSheet() {
    const lang = AI.langName(S.lang);
    let ctl = null;
    Sheets.open({
      title: t('askBook'), onClose: () => ctl && ctl.abort(), body: b => {
        const log = el('div');
        const inp = el('input', { class: 'field', placeholder: t('askPh') });
        const send = el('button', { class: 'btn primary', style: { flex: 'none' } }, icon('chevR'));
        b.append(el('p', { class: 'muted', style: { fontSize: '13.5px', lineHeight: 1.45, margin: '0 0 12px' }, text: t('askIntro') }), log, el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', position: 'sticky', bottom: 0, background: 'var(--card)', paddingTop: '6px' } }, inp, send));
        const draw = () => {
          log.replaceChildren();
          for (const m of this.chat) log.append(el('div', { style: { margin: '10px 0', padding: '10px 14px', borderRadius: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap', background: m.role === 'user' ? 'var(--card2)' : 'transparent', fontFamily: m.role === 'user' ? 'var(--ui)' : 'var(--serif)', fontSize: m.role === 'user' ? '15px' : '16.5px' }, text: m.content }));
        };
        draw();
        const ask = async () => {
          const q = inp.value.trim(); if (!q || ctl) return;
          inp.value = ''; this.chat.push({ role: 'user', content: q }); draw();
          const bubble = el('div', { style: { margin: '10px 0', padding: '10px 14px', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontFamily: 'var(--serif)', fontSize: '16.5px' } }, el('span', { class: 'muted', text: t('thinking') }));
          log.append(bubble); bubble.scrollIntoView({ block: 'end' });
          const rules = `You answer questions from someone reading "${this.rec.title}"${this.rec.author ? ' by ' + this.rec.author : ''}. Answer in ${lang}, briefly and clearly. Base answers on the excerpt below, which ends exactly where the reader currently is. NEVER reveal or hint at events after that point; if asked about the future, say you can't spoil it. If the excerpt doesn't contain the answer, say so (you may add general knowledge about real-world facts, words or history).\n\nExcerpt (up to the reader's position):\n"""\n${this.contextSoFar(45000)}\n"""`;
          ctl = new AbortController();
          try {
            const turns = this.chat.slice(-8);
            const { text } = await AI.fn([{ role: 'user', content: rules }, { role: 'assistant', content: 'OK.' }, ...turns], { signal: ctl.signal, cache: false, onText: ({ text }) => { bubble.textContent = text; } });
            this.chat.push({ role: 'assistant', content: text });
          } catch (e) { if (e.code !== 'cancelled') bubble.textContent = (e.text || '') + '\n' + AI.errText(e); this.chat.pop(); }
          ctl = null; draw(); log.lastChild && log.lastChild.scrollIntoView({ block: 'end' });
        };
        send.onclick = ask; inp.addEventListener('keydown', e => { if (e.key === 'Enter') ask(); });
        setTimeout(() => inp.focus(), 80);
      }
    });
  },
  close() {
    TTS.stop();
    this.hideSel();
    saveRecSoon.flush();
    if (this.rec) saveRec(this.rec);
    this.tok++; this.flow.replaceChildren();
    this.data && this.data.close(); this.data = null;
    Pause.stop(); App.show('v-lib'); Lib.render();
  },
  key2(e) {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); this.next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); this.prev(); }
    else if (e.key === 'Escape') this.close();
  },
};

function chapNum(label) {
  const s = (label || '').replace(/^(cap[ií]tulo|chapter|cap\.?)\s+/i, '').trim();
  if (/^(ep[ií]logo|epilogue)$/i.test(s)) return 'epi';
  const m = s.match(/^([IVXLC]+|\d+)\b\.?$/i) || s.match(/^([IVXLC]+|\d+)[.:\s—-]/i);
  if (!m) return '';
  const r = m[1].toUpperCase(); if (/^\d+$/.test(r)) return String(+r);
  const v = { I: 1, V: 5, X: 10, L: 50, C: 100 }; let n = 0;
  for (let i = 0; i < r.length; i++) { const a = v[r[i]], b = v[r[i + 1]] || 0; n += a < b ? -a : a; }
  return String(n);
}
function niceLabel(l) {
  if (S.lang === 'en') return l;
  const M = { 'titlepage': 'Folha de rosto', 'title page': 'Folha de rosto', 'imprint': 'Créditos', 'dedication': 'Dedicatória', 'colophon': 'Colofão', 'uncopyright': 'Licença', 'epigraph': 'Epígrafe', 'preface': 'Prefácio', "translator’s preface": 'Prefácio do tradutor', "translator's preface": 'Prefácio do tradutor', 'introduction': 'Introdução', 'contents': 'Sumário', 'endnotes': 'Notas', 'epilogue': 'Epílogo', 'halftitle': 'Folha de rosto' };
  const k = (l || '').trim().toLowerCase();
  if (M[k]) return M[k];
  return l.replace(/^Part\s+/i, 'Parte ').replace(/^Book\s+/i, 'Livro ').replace(/^Chapter\s+/i, 'Capítulo ');
}
function langName(l) { return (l || '').toLowerCase().startsWith('en') ? 'English' : 'Português'; }
