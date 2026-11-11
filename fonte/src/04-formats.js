/* ================= PDF.js (lazy) ================= */
let pdfjsP = null;
const PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/';
function getPdfjs() {
  if (!pdfjsP) pdfjsP = import(PDFJS_BASE + 'pdf.min.mjs').then(m => {
    const wsrc = PDFJS_BASE + 'pdf.worker.min.mjs';
    try {
      // a cross-origin worker cannot start directly: wrap it in a same-origin blob module
      const u = URL.createObjectURL(new Blob(['import "' + wsrc + '";'], { type: 'text/javascript' }));
      m.GlobalWorkerOptions.workerPort = new Worker(u, { type: 'module' });
    } catch (e) { m.GlobalWorkerOptions.workerSrc = wsrc; }
    return m;
  }).catch(e => { pdfjsP = null; throw new Error(t('pdfLibFail')); });
  return pdfjsP;
}
async function openPdf(blob) {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  return pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
}
function closePdf(pdf) { try { if (!pdf) return; const lt = pdf.loadingTask; if (lt && lt.destroy) lt.destroy(); else if (pdf.destroy) pdf.destroy(); } catch (e) { } }
async function renderPdfPage(pdf, n, targetW, maxH = 4200) {
  const pg = await pdf.getPage(n);
  const vp1 = pg.getViewport({ scale: 1 });
  let sc = targetW / vp1.width; if (vp1.height * sc > maxH) sc = maxH / vp1.height;
  const vp = pg.getViewport({ scale: sc });
  const cv = document.createElement('canvas'); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
  const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
  await pg.render({ canvasContext: cx, viewport: vp }).promise;
  pg.cleanup && pg.cleanup();
  return cv;
}

/* ================= comic archives ================= */
const IMG_RE = /\.(jpe?g|png|webp|gif|avif|bmp|jfif)$/i;
function mimeOf(name) {
  const e = (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml', css: 'text/css', xhtml: 'application/xhtml+xml', html: 'text/html' }[e] || 'application/octet-stream';
}
function zipImages(zip) {
  return Object.keys(zip.files).filter(n => !zip.files[n].dir && IMG_RE.test(n) && !/(^|\/)(__MACOSX\/|\.)/.test(n)).sort(natCmp);
}

/* ================= EPUB ================= */
const byTag = (doc, name) => [...doc.getElementsByTagNameNS('*', name)];
function parseXML(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
function zipFile(zip, path) {
  let f = zip.file(path);
  if (f) return f;
  const low = path.toLowerCase();
  const k = Object.keys(zip.files).find(n => n.toLowerCase() === low);
  return k ? zip.file(k) : null;
}
async function parseEpub(zip) {
  const cont = zipFile(zip, 'META-INF/container.xml');
  if (!cont) throw new Error(t('errEpub'));
  const enc = zipFile(zip, 'META-INF/encryption.xml');
  if (enc) {
    const ex = parseXML(await enc.async('string'));
    const drm = byTag(ex, 'EncryptedData').some(ed => {
      const alg = byTag(ed, 'EncryptionMethod')[0]?.getAttribute('Algorithm') || '';
      const uri = byTag(ed, 'CipherReference')[0]?.getAttribute('URI') || '';
      const fontObf = /idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC/.test(alg);
      return !fontObf && !/\.(otf|ttf|woff2?)$/i.test(uri);
    });
    if (drm) throw new Error(t('errDrm'));
  }
  const opfPath = parseXML(await cont.async('string')).getElementsByTagNameNS('*', 'rootfile')[0]?.getAttribute('full-path');
  const opfF = opfPath && zipFile(zip, opfPath);
  if (!opfF) throw new Error(t('errEpub'));
  const opf = parseXML(await opfF.async('string'));
  const base = dirname(opfPath);
  const manifest = {};
  for (const it of byTag(opf, 'item')) {
    const id = it.getAttribute('id'); if (!id) continue;
    manifest[id] = { id, href: resolvePath(base, it.getAttribute('href')), type: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' };
  }
  const spineEl = byTag(opf, 'spine')[0];
  const spine = [];
  for (const ir of byTag(opf, 'itemref')) {
    const m = manifest[ir.getAttribute('idref')];
    if (m && /x?html|xml/.test(m.type || 'html')) {
      const f = zipFile(zip, m.href);
      const size = (f && f._data && f._data.uncompressedSize) || 4000;
      spine.push({ href: m.href, size: Math.max(400, size), linear: ir.getAttribute('linear') !== 'no' });
    }
  }
  if (!spine.length) throw new Error(t('errEpub'));
  const txt = n => (byTag(opf, n)[0]?.textContent || '').trim();
  const title = txt('title'), author = txt('creator'), lang = txt('language');
  // cover
  let coverHref = null;
  const ci = Object.values(manifest).find(m => /cover-image/.test(m.props));
  if (ci) coverHref = ci.href;
  if (!coverHref) {
    const meta = byTag(opf, 'meta').find(m => m.getAttribute('name') === 'cover');
    const m = meta && manifest[meta.getAttribute('content')];
    if (m && /image/.test(m.type)) coverHref = m.href;
  }
  if (!coverHref) { const m = Object.values(manifest).find(m => /image/.test(m.type) && /cover/i.test(m.id + m.href)); if (m) coverHref = m.href; }
  // toc
  const toc = [];
  const hrefIdx = (href) => {
    const [p, frag] = href.split('#');
    const i = spine.findIndex(s => s.href === p || s.href.toLowerCase() === p.toLowerCase());
    return { idx: i, frag: frag ? decodeURIComponent(frag) : '' };
  };
  try {
    const nav = Object.values(manifest).find(m => /\bnav\b/.test(m.props));
    if (nav) {
      const nd = new DOMParser().parseFromString(await zipFile(zip, nav.href).async('string'), 'application/xhtml+xml');
      const navs = byTag(nd, 'nav');
      const tn = navs.find(n => /toc/.test(n.getAttribute('epub:type') || n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '')) || navs[0];
      const walk = (ol, depth) => {
        for (const li of [...ol.children].filter(c => c.localName === 'li')) {
          const a = [...li.children].find(c => c.localName === 'a' || c.localName === 'span');
          if (a) {
            const href = a.getAttribute('href');
            const label = a.textContent.replace(/\s+/g, ' ').trim();
            if (href && label) { const r = hrefIdx(resolvePath(dirname(nav.href), href) + (href.includes('#') ? '#' + href.split('#')[1] : '')); if (r.idx >= 0) toc.push({ label, depth, ...r }); }
          }
          const sub = [...li.children].find(c => c.localName === 'ol');
          if (sub) walk(sub, depth + 1);
        }
      };
      const ol = tn && [...tn.getElementsByTagNameNS('*', 'ol')][0];
      if (ol) walk(ol, 0);
    }
    if (!toc.length) {
      const tocId = spineEl && spineEl.getAttribute('toc');
      const ncx = (tocId && manifest[tocId]) || Object.values(manifest).find(m => /ncx/.test(m.type));
      if (ncx) {
        const nd = parseXML(await zipFile(zip, ncx.href).async('string'));
        for (const np of byTag(nd, 'navPoint')) {
          let depth = 0, p = np.parentNode; while (p && p.localName === 'navPoint') { depth++; p = p.parentNode; }
          const label = (byTag(np, 'text')[0]?.textContent || '').replace(/\s+/g, ' ').trim();
          const src = byTag(np, 'content')[0]?.getAttribute('src');
          if (label && src) { const r = hrefIdx(resolvePath(dirname(ncx.href), src) + (src.includes('#') ? '#' + src.split('#')[1] : '')); if (r.idx >= 0) toc.push({ label, depth, ...r }); }
        }
      }
    }
  } catch (e) { console.warn('toc', e); }
  let start = -1;
  try {
    const nav = Object.values(manifest).find(m => /\bnav\b/.test(m.props));
    if (nav) {
      const nd = new DOMParser().parseFromString(await zipFile(zip, nav.href).async('string'), 'application/xhtml+xml');
      for (const a of byTag(nd, 'a')) {
        const ty = a.getAttribute('epub:type') || a.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || '';
        if (/bodymatter/.test(ty)) { const h = a.getAttribute('href'); start = hrefIdx(resolvePath(dirname(nav.href), h.split('#')[0])).idx; break; }
      }
    }
    if (start < 0) { const r = byTag(opf, 'reference').find(r => /^(text|start)$/i.test(r.getAttribute('type') || '')); if (r) start = hrefIdx(resolvePath(dirname(opfPath), r.getAttribute('href').split('#')[0])).idx; }
  } catch (e) { }
  if (start < 0) {
    const FRONT = /^(cover|capa|title ?page|half ?title|imprint|copyright|cr[eé]ditos|dedica|epigra|contents|table of contents|sum[aá]rio|[ií]ndice|preface|pref[aá]cio|introduc|introdu[cç]|foreword|translator|tradu|note|nota|colophon|frontispiece|illustrations|list of|pr[oó]logo do tradutor)/i;
    const e = toc.find(e => e.idx > 0 && !FRONT.test(e.label) && e.label.trim().toLowerCase() !== title.trim().toLowerCase());
    if (e) start = e.idx;
  }
  return { title, author, lang, spine, toc, coverHref, start: Math.max(0, start) };
}

function sanitizeInto(root) {
  root.querySelectorAll('script,style,link,meta,title,iframe,object,embed,form,input,button,textarea,select,audio,video,noscript,base,head').forEach(n => n.remove());
  for (const n of root.querySelectorAll('*')) {
    for (const a of [...n.attributes]) {
      const nm = a.name.toLowerCase();
      if (nm.startsWith('on') || nm === 'style' || nm === 'srcset' || nm === 'bgcolor' || nm === 'color' || nm === 'face' || nm === 'size' && n.localName === 'font') n.removeAttribute(a.name);
    }
    if (n.localName === 'font') n.removeAttribute('size');
  }
}

class EpubBook {
  constructor(zip, meta) { this.zip = zip; Object.assign(this, meta); this.urls = new Map(); this.plain = new Map(); }
  static async open(blob) { const zip = await JSZip.loadAsync(blob); return new EpubBook(zip, await parseEpub(zip)); }
  get count() { return this.spine.length; }
  async res(path) {
    if (this.urls.has(path)) return this.urls.get(path);
    const f = zipFile(this.zip, path); if (!f) return '';
    const b = await f.async('blob');
    const u = URL.createObjectURL(new Blob([b], { type: mimeOf(path) }));
    this.urls.set(path, u); return u;
  }
  async parseDoc(i) {
    const it = this.spine[i]; const f = zipFile(this.zip, it.href);
    const src = f ? await f.async('string') : '<p>—</p>';
    let doc = new DOMParser().parseFromString(src, 'application/xhtml+xml');
    if (doc.getElementsByTagName('parsererror').length || !(doc.body || byTag(doc, 'body')[0])) doc = new DOMParser().parseFromString(src, 'text/html');
    const body = doc.body || byTag(doc, 'body')[0] || doc.documentElement;
    // move src away before the nodes enter the live document (or the browser would fetch them)
    for (const im of byTag(body, 'img')) { const v = im.getAttribute('src'); if (v != null) { im.setAttribute('data-src', v); im.removeAttribute('src'); } im.removeAttribute('srcset'); }
    for (const so of byTag(body, 'source')) so.remove();
    const wrap = document.createElement('div'); wrap.className = 'chap';
    for (const n of [...body.childNodes]) wrap.appendChild(document.importNode(n, true));
    sanitizeInto(wrap);
    return wrap;
  }
  async chapter(i) {
    const wrap = await this.parseDoc(i), base = dirname(this.spine[i].href);
    const jobs = [];
    for (const img of wrap.querySelectorAll('img')) {
      const s = img.getAttribute('data-src'); img.removeAttribute('data-src');
      if (s && !/^(https?:|data:)/i.test(s)) jobs.push(this.res(resolvePath(base, s)).then(u => { img.src = u; }));
      else if (s && /^data:/i.test(s)) img.src = s;
    }
    for (const im of wrap.querySelectorAll('image')) {
      const s = im.getAttribute('xlink:href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || im.getAttribute('href');
      if (s) jobs.push(this.res(resolvePath(base, s)).then(u => { im.setAttribute('href', u); try { im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', u); } catch (e) { } }));
    }
    for (const a of wrap.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href');
      if (/^[a-z][a-z0-9+.-]*:/i.test(h)) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
      else { a.dataset.ihref = h.startsWith('#') ? this.spine[i].href + h : resolvePath(base, h) + (h.includes('#') ? '#' + h.split('#')[1] : ''); a.removeAttribute('href'); a.setAttribute('role', 'link'); }
    }
    await Promise.all(jobs);
    return wrap;
  }
  async text(i) {
    if (this.plain.has(i)) return this.plain.get(i);
    const w = await this.parseDoc(i); const s = w.textContent;
    this.plain.set(i, s); return s;
  }
  locate(href) {
    const [p, frag] = href.split('#');
    const idx = this.spine.findIndex(s => s.href === p || s.href.toLowerCase() === (p || '').toLowerCase());
    return { idx, frag: frag ? decodeURIComponent(frag) : '' };
  }
  close() { for (const u of this.urls.values()) URL.revokeObjectURL(u); this.urls.clear(); }
}

/* ================= TXT ================= */
function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}
class TxtBook {
  constructor(text, title) {
    text = text.replace(/\r\n?/g, '\n').replace(/﻿/g, '');
    let paras = text.split(/\n\s*\n/);
    if (paras.length < text.length / 3000) paras = text.split(/\n/);
    paras = paras.map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
    const isHead = p => p.length < 90 && (/^(cap[ií]tulo|chapter|parte|part|livro|book|pr[oó]logo|prologue|ep[ií]logo|epilogue)\b/i.test(p) || /^[IVXLC]+\.?$/.test(p));
    this.spine = []; this.toc = []; this.title = title; this.author = ''; this.lang = '';
    let cur = [], len = 0, head = null;
    const flush = () => { if (!cur.length) return; this.spine.push({ paras: cur, size: Math.max(400, len), head }); if (head) this.toc.push({ label: head, depth: 0, idx: this.spine.length - 1, frag: '' }); cur = []; len = 0; head = null; };
    for (const p of paras) {
      if (isHead(p) && cur.length) flush();
      if (isHead(p) && !cur.length) head = p;
      if (len > 30000 && !isHead(p)) flush();
      cur.push(p); len += p.length;
    }
    flush();
    if (!this.spine.length) this.spine.push({ paras: [''], size: 400 });
    if (!this.toc.length) this.spine.forEach((s, i) => this.toc.push({ label: t('part') + ' ' + (i + 1), depth: 0, idx: i, frag: '' }));
  }
  get count() { return this.spine.length; }
  async chapter(i) {
    const w = document.createElement('div'); w.className = 'chap';
    for (const p of this.spine[i].paras) w.append(p === this.spine[i].head ? el('h2', { text: p }) : el('p', { text: p }));
    return w;
  }
  async parseDoc(i) { return this.chapter(i); }
  async text(i) { return (await this.chapter(i)).textContent; }
  locate() { return { idx: -1 }; }
  close() { }
}

/* ================= import ================= */
async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const s = String.fromCharCode(...b);
  if (s.startsWith('PK')) return 'zip';
  if (s.startsWith('%PDF')) return 'pdf';
  if (s.startsWith('Rar!')) return 'rar';
  if (s.startsWith('7z')) return '7z';
  if (/\.(mobi|azw3?|kfx|prc)$/i.test(file.name) || s.slice(0, 8) === 'BOOKMOBI') return 'kindle';
  if (/\.(txt|text|md)$/i.test(file.name) || /^text\//.test(file.type)) return 'txt';
  if (/^image\//.test(file.type) || IMG_RE.test(file.name)) return 'image';
  return 'unknown';
}
function genCoverColor(title) { const h = hueOf(title); return `linear-gradient(160deg,hsl(${h},45%,38%),hsl(${(h + 40) % 360},50%,22%))`; }

async function addRecord(rec, blob) {
  rec.fp = await fingerprint(blob);
  // already in library?
  const all = await DB.all('books');
  const dup = all.find(b => b.fp === rec.fp);
  if (dup) { toast(t('alreadyHave', { t: dup.title })); return dup; }
  const okFile = await DB.put('files', rec.id, blob);
  if (!okFile) Lib.memOnly = true;
  rec.size = blob.size; rec.added = Date.now(); rec.opened = 0; rec.updated = 0;
  rec.pct = 0; rec.pos = null; rec.bookmarks = []; rec.highlights = []; rec.collections = rec.collections || [];
  // resume from cloud if this file exists elsewhere
  const cloud = await Sync.pull(rec.fp);
  if (cloud) { mergeCloud(rec, cloud); if (cloud.title && cloud.title !== rec.title && rec.titleGuess) rec.title = cloud.title; }
  await DB.put('books', rec.id, rec);
  return rec;
}

async function importComicZip(blob, name, zip) {
  zip = zip || await JSZip.loadAsync(blob);
  const imgs = zipImages(zip);
  if (!imgs.length) throw new Error(t('errNoImages', { f: name }));
  const first = await zip.file(imgs[0]).async('blob');
  let cover = null;
  try { const u = URL.createObjectURL(new Blob([first], { type: mimeOf(imgs[0]) })); const im = await loadImg(u); cover = await thumbFrom(im, im.naturalWidth, im.naturalHeight); URL.revokeObjectURL(u); } catch (e) { }
  let title = cleanTitle(name.split('/').pop()), author = '';
  const ci = Object.keys(zip.files).find(n => /comicinfo\.xml$/i.test(n));
  if (ci) { try { const x = parseXML(await zip.file(ci).async('string')); const g = n => (byTag(x, n)[0]?.textContent || '').trim(); const s = g('Series'), num = g('Number'), tt = g('Title'); if (s) title = s + (num ? ' #' + num : '') + (tt && tt !== s ? ' — ' + tt : ''); else if (tt) title = tt; author = g('Writer'); } catch (e) { } }
  return addRecord({ id: uid(), kind: 'comic', format: 'cbz', title, author, fname: name, cover, pages: imgs.length, prefs: {}, titleGuess: true }, blob);
}
async function importImages(files) {
  files.sort((a, b) => natCmp(a.name, b.name));
  const zip = new JSZip();
  files.forEach((f, i) => zip.file(String(i + 1).padStart(4, '0') + '_' + f.name.replace(/[\/\\]/g, '_'), f));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/vnd.comicbook+zip' });
  let name = files[0].name.replace(/[\s_\-]*\d+\.[a-z0-9]+$/i, '').replace(/\.[a-z0-9]+$/i, '');
  if (!name || name.length < 2) name = t('imagesTitle') + ' ' + new Date().toLocaleDateString();
  return importComicZip(blob, name + '.cbz', zip);
}
// cover thumbnail; SVG covers (Standard Ebooks) get an explicit size, or fall back to the picture inside them (iPhone needs this)
async function epubCover(zip, href) {
  const tryBlob = async (blob, w0, h0) => { const u = URL.createObjectURL(blob); try { const im = await loadImg(u); const w = im.naturalWidth || w0, h = im.naturalHeight || h0; if (!w || !h) throw 0; return await thumbFrom(im, w, h); } finally { URL.revokeObjectURL(u); } };
  try {
    const f = zipFile(zip, href); if (!f) return null;
    if (/\.svg$/i.test(href)) {
      let s = await f.async('string');
      const vb = (s.match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/) || []).slice(1).map(Number);
      const W = vb[0] || 1400, H = vb[1] || 2100;
      if (!/<svg[^>]*\swidth=/.test(s)) s = s.replace(/<svg\b/, `<svg width="${W}" height="${H}"`);
      try { return await tryBlob(new Blob([s], { type: 'image/svg+xml' }), W, H); } catch (e) { }
      const m = s.match(/href="data:(image\/[a-z+]+);base64,([^"]+)"/);
      if (m) { const bin = atob(m[2]), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return await tryBlob(new Blob([a], { type: m[1] }), W, H); }
      return null;
    }
    return await tryBlob(new Blob([await f.async('blob')], { type: mimeOf(href) }));
  } catch (e) { return null; }
}
// one-time repair of covers that came out blank on the phone
async function fixCovers() {
  if (S.coverFix) return;
  for (const b of await DB.all('books')) {
    if (b.format !== 'epub') continue;
    try {
      const blob = await DB.get('files', b.id); if (!blob) continue;
      const zip = await JSZip.loadAsync(blob); const meta = await parseEpub(zip);
      if (!meta.coverHref || !/\.svg$/i.test(meta.coverHref)) continue;
      const c = await epubCover(zip, meta.coverHref); if (c) { b.cover = c; await DB.put('books', b.id, b); }
    } catch (e) { }
  }
  setS('coverFix', 1); Lib.render();
}
async function importEpub(file, zip) {
  const meta = await parseEpub(zip);
  let cover = null;
  if (meta.coverHref) cover = await epubCover(zip, meta.coverHref);
  return addRecord({ id: uid(), kind: 'book', format: 'epub', title: meta.title || cleanTitle(file.name), author: meta.author, lang: meta.lang, fname: file.name, cover, chapters: meta.spine.length, prefs: {} }, file);
}
async function importPdf(file) {
  const pdf = await openPdf(file);
  let cover = null, kind = 'comic';
  try { const cv = await renderPdfPage(pdf, 1, 360); cover = await canvasBlob(cv, 'image/jpeg', 0.82); } catch (e) { }
  try {
    let chars = 0; const n = Math.min(pdf.numPages, 4);
    for (let i = 1; i <= n; i++) { const tc = await (await pdf.getPage(i)).getTextContent(); chars += tc.items.reduce((s, it) => s + (it.str || '').length, 0); }
    if (chars / n > 350) kind = 'book';
  } catch (e) { }
  let title = cleanTitle(file.name), author = '';
  try { const md = await pdf.getMetadata(); const inf = md && md.info || {}; if (inf.Title && inf.Title.trim().length > 2 && !/^untitled|microsoft word|^\(?anonymous/i.test(inf.Title)) title = inf.Title.trim(); author = (inf.Author || '').trim(); if (/^\(?(anonymous|unknown)\)?$/i.test(author)) author = ''; } catch (e) { }
  const pages = pdf.numPages; closePdf(pdf);
  return addRecord({ id: uid(), kind, format: 'pdf', title, author, fname: file.name, cover, pages, prefs: {} }, file);
}
async function importTxt(file) {
  const text = decodeText(await file.arrayBuffer());
  return addRecord({ id: uid(), kind: 'book', format: 'txt', title: cleanTitle(file.name), author: '', fname: file.name, cover: null, prefs: {} }, new Blob([text], { type: 'text/plain' }));
}
async function importFiles(list) {
  const files = [...list]; if (!files.length) return;
  const kinds = await Promise.all(files.map(sniff));
  const images = files.filter((f, i) => kinds[i] === 'image');
  const others = files.map((f, i) => [f, kinds[i]]).filter(([, k]) => k !== 'image');
  let added = 0, last = null;
  const errs = [];
  busy(t('adding'));
  try {
    if (images.length) { try { last = await importImages(images); added++; } catch (e) { errs.push(e.message); } }
    let n = 0;
    for (const [f, k] of others) {
      n++; busy(t('adding') + (others.length > 1 ? ` (${n}/${others.length})` : ''));
      try {
        if (k === 'zip') {
          const zip = await JSZip.loadAsync(f);
          if (zipFile(zip, 'META-INF/container.xml')) last = await importEpub(f, zip);
          else last = await importComicZip(f, f.name, zip);
        } else if (k === 'pdf') last = await importPdf(f);
        else if (k === 'txt') last = await importTxt(f);
        else if (k === 'rar' || k === '7z') throw new Error(t('errRar', { f: f.name }));
        else if (k === 'kindle') throw new Error(t('errKindle', { f: f.name }));
        else throw new Error(t('errUnknown', { f: f.name }));
        added++;
      } catch (e) { console.warn(e); errs.push(e && e.message ? e.message : t('errUnknown', { f: f.name })); }
    }
  } finally { busy(null); }
  await Lib.render();
  if (errs.length) Sheets.open({ title: t('someFailed'), center: true, body: b => { for (const m of errs) b.append(el('p', { style: { lineHeight: 1.5 }, text: m })); b.append(el('button', { class: 'btn primary block', text: 'OK', onclick: () => Sheets.close() })); } });
  else if (added === 1 && last) toast(t('addedOne', { t: last.title }));
  else if (added > 1) toast(t('addedMany', { n: added }));
}
