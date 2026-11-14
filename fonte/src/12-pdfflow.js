/* ================= PDF → book: ebook-style PDFs become a real reflowable book =================
   Text is rebuilt into lines and paragraphs; headings come from bigger type; running headers and
   page numbers are dropped; pictures are cut out of the page and kept where they were. */
class PdfFlow {
  // stamps that PDF converters print over every page (not part of the book)
  static WM = /\*{2,}\s*[^*]{0,40}(demo|watermark|evaluation|trial|unregistered)[^*]{0,40}\*{2,}|ebook converter demo watermarks|evaluation (only|copy|version)\.?|created (with|by) .{0,30}(trial|demo|unregistered).{0,20}/gi;
  constructor(pdf, rec) { this.pdf = pdf; this.rec = rec; this.urls = []; this.plain = new Map(); this.lang = rec.lang || ''; this.title = rec.title; this.author = rec.author || ''; }
  static async open(blob, rec) {
    const pdf = await openPdf(blob);
    const f = new PdfFlow(pdf, rec);
    await f.structure();
    return f;
  }
  get count() { return this.spine.length; }
  async structure() {
    const n = this.pdf.numPages;
    // chapters from the PDF outline (bookmarks); otherwise every ~12 pages
    let marks = [];
    try {
      const walk = async (items, depth) => {
        for (const it of items || []) {
          let p = null;
          try {
            let d = it.dest; if (typeof d === 'string') d = await this.pdf.getDestination(d);
            if (Array.isArray(d) && d[0]) p = (await this.pdf.getPageIndex(d[0])) + 1;
          } catch (e) { }
          if (p) marks.push({ label: (it.title || '').trim(), page: p, depth });
          if (depth < 2 && it.items && it.items.length) await walk(it.items, depth + 1);
        }
      };
      await walk(await this.pdf.getOutline(), 0);
    } catch (e) { }
    marks = marks.filter(m => m.label).sort((a, b) => a.page - b.page || a.depth - b.depth);
    const starts = [];
    for (const m of marks) if (!starts.length || m.page > starts[starts.length - 1].page) starts.push(m);
    if (!starts.length || starts[0].page > 1) starts.unshift({ label: this.title || t('part') + ' 1', page: 1, depth: 0, front: true });
    // very long sections are cut into parts of at most 40 pages (keeps each piece light on a phone)
    this.spine = []; this.toc = [];
    starts.forEach((s, k) => {
      const end = k + 1 < starts.length ? starts[k + 1].page - 1 : n;
      if (end < s.page) return;
      this.toc.push({ label: s.label, depth: s.depth, idx: this.spine.length, frag: '' });
      for (let a = s.page; a <= end; a += 40) this.spine.push({ from: a, to: Math.min(end, a + 39), href: 'p' + a, size: Math.max(400, (Math.min(end, a + 39) - a + 1) * 1800), head: a === s.page && !s.front ? s.label : '' });
    });
    if (!marks.length) { this.toc = []; this.spine = []; for (let a = 1; a <= n; a += 12) { this.spine.push({ from: a, to: Math.min(n, a + 11), href: 'p' + a, size: (Math.min(n, a + 11) - a + 1) * 1800 }); this.toc.push({ label: t('pageN', { n: a }), depth: 0, idx: this.spine.length - 1, frag: '' }); } }
    // start at the first real chapter (skip cover, contents, copyright…)
    const FRONT = /^(cover|capa|title|contents|sum[aá]rio|[ií]ndice|copyright|dedica|also by|praise|table of)/i;
    const CH = /^(chapter|cap[ií]tulo|prologue|pr[oó]logo|one\b|um\b|1\b|i\b|part (one|1)|parte (um|1))/i;
    const st = this.toc.find(e => CH.test(e.label.trim())) || this.toc.find(e => e.idx > 0 && !FRONT.test(e.label) && !/\.(com|org|net)\b/i.test(e.label) && e.label.toLowerCase() !== (this.title || '').toLowerCase());
    this.start = st ? st.idx : 0;
    // running headers: text that repeats at the top/bottom of many pages
    this.repeat = new Map();
  }
  async pageData(p) {
    const page = await this.pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!it.str) continue;
      const tr = it.transform, x = tr[4], y = vp.height - tr[5], fs = Math.hypot(tr[2], tr[3]) || it.height || 10;
      items.push({ s: it.str, x, y, w: it.width, fs, eol: it.hasEOL });
    }
    // body size of this page (weighted by text length)
    const fsw = items.map(it => [it.fs, it.s.length]).sort((a, b) => a[0] - b[0]);
    let half = fsw.reduce((a, q) => a + q[1], 0) / 2, pbody = 11; for (const [f, n] of fsw) { half -= n; if (half <= 0) { pbody = f; break; } }
    // drop caps: one big letter at the start of a chapter belongs to the first line next to it
    const caps = [];
    for (let k = items.length - 1; k >= 0; k--) { const it = items[k]; if (it.s.trim().length <= 2 && /[A-Za-zÀ-ÿ]/.test(it.s) && it.fs > pbody * 1.8) { caps.push(it); items.splice(k, 1); } }
    // lines: same baseline (tolerance relative to font size), left to right
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const L = lines[lines.length - 1];
      if (L && Math.abs(L.y - it.y) < Math.max(2, it.fs * 0.45)) { L.items.push(it); L.fs = Math.max(L.fs, it.fs); }
      else lines.push({ y: it.y, fs: it.fs, items: [it] });
    }
    for (const L of lines) {
      L.items.sort((a, b) => a.x - b.x);
      let s = '', end = null;
      for (const it of L.items) {
        if (end != null && it.x - end > it.fs * 0.18 && !/\s$/.test(s) && !/^\s/.test(it.s)) s += ' ';
        s += it.s; end = it.x + it.w;
      }
      if (s.replace(PdfFlow.WM, '') !== s) this.wmCount = (this.wmCount || 0) + 1;
      L.text = s.replace(PdfFlow.WM, ' ').replace(/\s+/g, ' ').trim(); L.x = L.items[0].x; L.r = end; L.page = p;
      // the line's size is that of most of its letters (not of one big initial)
      const ws = L.items.map(it => [it.fs, it.s.length]).sort((a, b) => a[0] - b[0]); let hh = ws.reduce((a, q) => a + q[1], 0) / 2; for (const [f, n] of ws) { hh -= n; if (hh <= 0) { L.fs = f; break; } }
    }
    for (const c of caps) {
      const L = lines.filter(L => L.x >= c.x - 2 && L.y >= c.y - c.fs * 1.15 && L.y <= c.y + pbody).sort((a, b) => a.y - b.y)[0];
      if (L) { L.text = c.s.trim() + L.text; L.x = c.x; }
    }
    // pictures: where the page paints images, and how big
    const figs = [];
    try {
      const ops = await page.getOperatorList(), O = pdfjsMod().OPS;
      let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
      const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
      for (let k = 0; k < ops.fnArray.length; k++) {
        const fn = ops.fnArray[k], a = ops.argsArray[k];
        if (fn === O.save) stack.push(ctm.slice());
        else if (fn === O.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (fn === O.transform) ctm = mul(ctm, a);
        else if (fn === O.paintFormXObjectBegin) { stack.push(ctm.slice()); if (a && Array.isArray(a[0]) && a[0].length === 6) ctm = mul(ctm, a[0]); }
        else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
        else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintJpegXObject || fn === O.paintImageXObjectRepeat) {
          const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => [ctm[0] * u + ctm[2] * v + ctm[4], ctm[1] * u + ctm[3] * v + ctm[5]]);
          const xs = pts.map(q => q[0]), ys = pts.map(q => vp.height - q[1]);
          const r = { x0: Math.max(0, Math.min(...xs)), x1: Math.min(vp.width, Math.max(...xs)), y0: Math.max(0, Math.min(...ys)), y1: Math.min(vp.height, Math.max(...ys)) };
          const area = (r.x1 - r.x0) * (r.y1 - r.y0);
          if (area > vp.width * vp.height * 0.015 && r.x1 - r.x0 > 30 && r.y1 - r.y0 > 30) figs.push(r);
        }
      }
    } catch (e) { }
    return { page, vp, lines, figs };
  }
  async crop(pd, r) {
    const sc = Math.min(3, Math.max(1.5, 1400 / pd.vp.width));
    const vp = pd.page.getViewport({ scale: sc });
    const cv = document.createElement('canvas'); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    await pd.page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    const out = document.createElement('canvas');
    const w = Math.max(1, Math.round((r.x1 - r.x0) * sc)), h = Math.max(1, Math.round((r.y1 - r.y0) * sc));
    out.width = w; out.height = h;
    out.getContext('2d').drawImage(cv, Math.round(r.x0 * sc), Math.round(r.y0 * sc), w, h, 0, 0, w, h);
    const b = await canvasBlob(out, 'image/jpeg', 0.88);
    const u = URL.createObjectURL(b); this.urls.push(u); return u;
  }
  async chapter(i) {
    const sp = this.spine[i], wrap = document.createElement('div'); wrap.className = 'chap pdfflow';
    const pages = [];
    for (let p = sp.from; p <= sp.to; p++) pages.push(await this.pageData(p));
    // typical body size and left edge
    const sizes = []; for (const pd of pages) for (const L of pd.lines) if (L.text.length > 30) sizes.push(Math.round(L.fs * 2) / 2);
    sizes.sort((a, b) => a - b); const body = sizes[sizes.length >> 1] || 11;
    // running headers / page numbers: short lines in the top or bottom margin that are numbers or repeat
    const edgeTxt = new Map();
    for (const pd of pages) for (const L of pd.lines) if (L.y < pd.vp.height * 0.08 || L.y > pd.vp.height * 0.93) { const k = L.text.replace(/\d+/g, '#').toLowerCase(); edgeTxt.set(k, (edgeTxt.get(k) || 0) + 1); }
    const isFurniture = (pd, L) => {
      if (!(L.y < pd.vp.height * 0.08 || L.y > pd.vp.height * 0.93)) return false;
      if (/^[\divxlc\s.\-–—|]+$/i.test(L.text)) return true;
      const k = L.text.replace(/\d+/g, '#').toLowerCase();
      return pages.length > 3 && (edgeTxt.get(k) || 0) >= Math.max(3, pages.length * 0.3);
    };
    let para = null, lastL = null, lineGap = body * 1.25;
    const flush = () => { if (para && para.text.trim()) wrap.append(para.el); para = null; };
    const textLines = [];
    for (const pd of pages) {
      const W = pd.vp.width, lefts = pd.lines.filter(L => L.text.length > 30).map(L => L.x).sort((a, b) => a - b);
      const left = lefts.length ? lefts[Math.floor(lefts.length * 0.2)] : W * 0.1;
      const widths = pd.lines.filter(L => L.text.length > 30).map(L => L.r - L.x).sort((a, b) => a - b);
      const full = widths.length ? widths[Math.floor(widths.length * 0.8)] : W * 0.7;
      const txtChars = pd.lines.reduce((a, L) => a + L.text.length, 0);
      // a page that is a picture (no real text): keep the whole page as an illustration
      if (txtChars < 40 && pd.figs.length) {
        flush(); const fig = el('figure', { class: 'pf-full' }); const img = el('img', { alt: '' }); fig.append(img); wrap.append(fig);
        const r = pd.figs.reduce((a, f) => ({ x0: Math.min(a.x0, f.x0), y0: Math.min(a.y0, f.y0), x1: Math.max(a.x1, f.x1), y1: Math.max(a.y1, f.y1) }));
        img.src = await this.crop(pd, r); lastL = null; continue;
      }
      // pictures placed by their vertical position among the lines
      const queue = pd.figs.slice().sort((a, b) => a.y0 - b.y0);
      for (const L of pd.lines) {
        while (queue.length && queue[0].y0 <= L.y - L.fs) {
          flush(); const f = queue.shift(), fig = el('figure'), img = el('img', { alt: '' }); fig.append(img); wrap.append(fig);
          img.src = await this.crop(pd, f); lastL = null;
        }
        if (isFurniture(pd, L) || !L.text) continue;
        // lines that sit inside a picture are its labels, already in the image
        if (pd.figs.some(f => L.y > f.y0 + 2 && L.y < f.y1 - 2 && L.x >= f.x0 - 2 && L.r <= f.x1 + 2)) continue;
        const big = L.fs > body * 1.22, center = Math.abs((L.x + L.r) / 2 - W / 2) < W * 0.06 && L.r - L.x < full * 0.75;
        const gap = lastL && lastL.page === pd.page && !lastL.fig ? L.y - lastL.y : lineGap;
        const indent = L.x > left + body * 0.9 && L.x < left + body * 4;
        const prevShort = lastL && (lastL.r - lastL.x) < full * 0.82 && /[.!?:;”"’)\]…—]$/.test(lastL.text);
        const startsPara = !para || big !== para.big || gap > lineGap * 1.6 || indent || prevShort || (center && !para.center);
        if (startsPara) {
          flush();
          const tag = big ? (L.fs > body * 1.6 ? 'h1' : 'h2') : 'p';
          para = { el: el(tag), text: '', big, center };
          if (center && !big) para.el.className = 'pf-center';
        }
        // join: hyphenated word at the end of the line is glued back together
        if (para.text && /[A-Za-zÀ-ÿ]-$/.test(para.text) && /^[a-zà-ÿ]/.test(L.text)) para.text = para.text.slice(0, -1) + '\u2060' + L.text;
        else para.text += (para.text ? ' ' : '') + L.text;
        para.el.textContent = para.text;
        if (lastL && lastL.page === pd.page && !big && gap > 0 && gap < body * 2.2) lineGap = lineGap * 0.9 + gap * 0.1;
        lastL = L; textLines.push(L.text);
      }
      while (queue.length) { flush(); const f = queue.shift(), fig = el('figure'), img = el('img', { alt: '' }); fig.append(img); wrap.append(fig); img.src = await this.crop(pd, f); lastL = null; }
    }
    flush();
    // resolve line-end hyphens: "some-thing" becomes "something" only if that word appears elsewhere
    const words = new Set((wrap.textContent.replace(/\u2060/g, '-').match(/[A-Za-zÀ-ÿ]+/g) || []).map(w => w.toLowerCase()));
    for (const n of wrap.querySelectorAll('p,h1,h2')) if (n.textContent.includes('\u2060')) n.textContent = n.textContent.replace(/([A-Za-zÀ-ÿ]+)\u2060([a-zà-ÿ]+)/g, (m, a, b) => words.has((a + b).toLowerCase()) && !/-/.test(a) ? a + b : a + '-' + b).replace(/\u2060/g, '-');
    if (!wrap.childNodes.length) wrap.append(el('p', { class: 'pf-center', text: '—' }));
    this.plain.set(i, wrap.textContent);
    return wrap;
  }
  async text(i) {
    if (this.plain.has(i)) return this.plain.get(i);
    const sp = this.spine[i]; let s = '';
    for (let p = sp.from; p <= sp.to; p++) { const tc = await (await this.pdf.getPage(p)).getTextContent(); s += tc.items.map(x => x.str).join(' ') + '\n'; }
    this.plain.set(i, s); return s;
  }
  locate(href) { const m = /^p(\d+)/.exec(href || ''); const p = m ? +m[1] : 1; return { idx: Math.max(0, this.spine.findIndex(s => p >= s.from && p <= s.to)), frag: '' }; }
  close() { for (const u of this.urls) URL.revokeObjectURL(u); this.urls = []; closePdf(this.pdf); }
}
