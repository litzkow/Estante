/* ================= local storage (IndexedDB) ================= */
const DB = {
  db: null, ok: false,
  mem: { books: new Map(), files: new Map(), kv: new Map() },
  async open() {
    try {
      if (!window.indexedDB) throw new Error('no idb');
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('estante', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          for (const s of ['books', 'files', 'kv']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.onblocked = () => rej(new Error('blocked'));
        setTimeout(() => rej(new Error('timeout')), 5000);
      });
      this.ok = true;
      try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
    } catch (e) { console.warn('IndexedDB indisponível', e); this.ok = false; }
  },
  _do(store, mode, fn) {
    return new Promise((res, rej) => {
      let out;
      const tx = this.db.transaction(store, mode), s = tx.objectStore(store), r = fn(s);
      if (r) r.onsuccess = () => { out = r.result; };
      tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('abort'));
    });
  },
  async get(store, key) {
    if (this.mem[store].has(key)) return this.mem[store].get(key);
    if (!this.ok) return undefined;
    try { return await this._do(store, 'readonly', s => s.get(key)); } catch (e) { return undefined; }
  },
  async put(store, key, val) {
    if (this.ok) {
      try { await this._do(store, 'readwrite', s => s.put(val, key)); this.mem[store].delete(key); return true; }
      catch (e) { console.warn('put falhou', store, e); }
    }
    this.mem[store].set(key, val); return false;
  },
  async del(store, key) {
    this.mem[store].delete(key);
    if (this.ok) try { await this._do(store, 'readwrite', s => s.delete(key)); } catch (e) { }
  },
  async delPrefix(store, prefix) {
    for (const k of [...this.mem[store].keys()]) if (String(k).startsWith(prefix)) this.mem[store].delete(k);
    if (this.ok) try { await this._do(store, 'readwrite', s => s.delete(IDBKeyRange.bound(prefix, prefix + '￿'))); } catch (e) { }
  },
  async all(store) {
    const m = new Map();
    if (this.ok) try { const vals = await this._do(store, 'readonly', s => s.getAll()); for (const v of vals || []) if (v && v.id) m.set(v.id, v); } catch (e) { }
    for (const [k, v] of this.mem[store]) m.set(k, v);
    return [...m.values()];
  },
};

/* ================= settings ================= */
const DEFAULTS = {
  lang: 'pt', theme: 'auto', goalMin: 15, toured: false, comfortAuto: true, showGoal: true, showContinue: true, starterGot: [], warm: 0, dim: 0, pause: true, anim: true,
  // comics
  cMode: 'quadros', cDir: 'ltr', cFullFirst: true, cSplit: false, cSpot: true, cBox: 'dim', comicV: 1,
  // books
  bFont: 'literata', bSize: 18, bLh: 1.6, bMargin: 'm', bJustify: false, bIndent: false, bAnim: true, bTurn: 'slide', typoV: 1,
  // translation
  trTo: 'pt',
  // library
  sort: 'recent', filter: 'all', sync: true,
  cpm: 1000, updated: 0,
};
const S = Object.assign({}, DEFAULTS);
const saveSettings = debounce(async (fromCloud) => {
  await DB.put('kv', 'settings', Object.assign({}, S));
  if (!fromCloud) Sync.pushPrefs();
}, 400);
function setS(k, v) { S[k] = v; S.updated = Date.now(); saveSettings(); }
async function loadSettings() {
  const v = await DB.get('kv', 'settings');
  if (v) Object.assign(S, v);
  if (v && !v.comicV) { S.cSplit = false; S.cFullFirst = true; S.comicV = 1; }
  if (v && !v.typoV) { S.bSize = 18; S.bJustify = false; S.bLh = 1.6; S.bTurn = S.bAnim === false ? 'none' : 'slide'; S.typoV = 1; }
  else { const l = (navigator.language || 'pt').toLowerCase(); S.lang = l.startsWith('pt') ? 'pt' : 'pt'; }
}

/* ================= cloud sync (Claude db) ================= */
const Sync = {
  db: null, uid: null, ready: false, chain: Promise.resolve(), cloudBooks: [],
  async init() {
    try {
      if (!window.claude || !claude.use) return;
      const [db, user] = await Promise.all([claude.use('db'), claude.use('user')]);
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      this.db = db; this.uid = id; this.ready = true;
    } catch (e) { console.warn('sync off', e); }
  },
  get on() { return this.ready && S.sync; },
  col() { return this.db.collection('data/users/' + this.uid); },
  q(fn) { this.chain = this.chain.then(fn).catch(e => console.warn('sync', e)); return this.chain; },
  async timed(p, ms = 6000) { return Promise.race([p, sleep(ms).then(() => { throw new Error('timeout'); })]); },
  async pull(fp) {
    if (!this.on || !fp || fp[0] !== 'b') return null;
    try { const s = await this.timed(this.col().doc(fp).get()); return s.exists ? s.data() : null; } catch (e) { return null; }
  },
  push(rec) {
    if (!this.on || !rec.fp || rec.fp[0] !== 'b') return;
    const body = {
      title: rec.title || '', author: rec.author || '', kind: rec.kind, format: rec.format, fname: rec.fname || '',
      pos: rec.pos || null, pct: rec.pct || 0, finished: !!rec.finished, updated: rec.updated || Date.now(),
      bookmarks: (rec.bookmarks || []).slice(0, 300), highlights: (rec.highlights || []).slice(0, 600),
    };
    // keep under 256 KiB
    let json = JSON.stringify(body);
    while (json.length > 240000 && body.highlights.length) { body.highlights.shift(); json = JSON.stringify(body); }
    this.q(() => this.timed(this.col().doc(rec.fp).set(body), 10000));
  },
  remove(fp) { if (!this.on || !fp || fp[0] !== 'b') return; this.q(() => this.col().doc(fp).delete()); },
  async list() {
    if (!this.on) return [];
    try { const s = await this.timed(this.col().limit(500).get(), 7000); return s.docs.filter(d => d.id[0] === 'b').map(d => Object.assign({ fp: d.id }, d.data())); }
    catch (e) { return []; }
  },
  pushPrefs() {
    if (!this.on) return;
    const p = {}; for (const k of ['lang', 'theme', 'warm', 'dim', 'pause', 'anim', 'cMode', 'cDir', 'cFullFirst', 'cSplit', 'cSpot', 'bFont', 'bSize', 'bLh', 'bMargin', 'bJustify', 'bIndent', 'bAnim', 'trTo', 'cpm', 'updated']) p[k] = S[k];
    this.q(() => this.col().doc('prefs').set(p));
  },
  async pullPrefs() {
    if (!this.on) return false;
    try {
      const s = await this.timed(this.col().doc('prefs').get());
      if (s.exists) { const d = s.data(); if ((d.updated || 0) > (S.updated || 0)) { Object.assign(S, d); saveSettings(true); return true; } }
    } catch (e) { }
    return false;
  },
};

/* merge cloud record into local (newest wins) */
function mergeCloud(rec, cloud) {
  if (!cloud) return false;
  if ((cloud.updated || 0) <= (rec.updated || 0)) return false;
  rec.pos = cloud.pos || rec.pos; rec.pct = cloud.pct || 0; rec.finished = !!cloud.finished;
  rec.bookmarks = cloud.bookmarks || []; rec.highlights = cloud.highlights || [];
  rec.updated = cloud.updated;
  return true;
}

/* ================= records ================= */
async function saveRec(rec, { sync = true } = {}) {
  rec.updated = Date.now();
  // the shelf may have updated cover / language / series while this book was open: keep those
  try { const cur = await DB.get('books', rec.id); if (cur) for (const k of ['cover', 'cv', 'work', 'lang', 'series', 'snum']) if (cur[k] !== undefined) rec[k] = cur[k]; } catch (e) { }
  await DB.put('books', rec.id, rec);
  if (sync) Sync.push(rec);
}
const saveRecSoon = debounce(rec => saveRec(rec), 1200);
/* reading position: written instantly (synchronously) on every move, so it survives the app being closed
   or killed by the phone; the database copy follows a moment later and syncs to other devices */
const Resume = {
  save(rec) { try { localStorage.setItem('pos:' + rec.id, JSON.stringify({ pos: rec.pos, pct: rec.pct, at: Date.now() })); } catch (e) { } },
  apply(rec) {
    try {
      const j = JSON.parse(localStorage.getItem('pos:' + rec.id) || 'null');
      if (j && j.pos && j.at > (rec.posAt || rec.updated || 0)) { rec.pos = j.pos; rec.pct = j.pct ?? rec.pct; }
    } catch (e) { }
  },
};

/* ================= Claude (sample) ================= */
const AI = {
  fn: null, imgs: false, checked: false,
  async init() {
    document.body.classList.add('no-ai');
    this.fn = null; this.provider = '';
    try {
      if (window.claude && claude.use) {
        const f = await claude.use('sample');
        if (f) { this.fn = f; this.provider = 'claude'; try { const lim = await f.limits(); this.imgs = !!(lim && lim.images); } catch (e) { } }
      }
    } catch (e) { }
    // outside Claude: the reader's own free Google Gemini key
    if (!this.fn && S.gemKey) { this.fn = (p, o) => Gemini.run(p, o); this.provider = 'gemini'; this.imgs = true; }
    this.checked = true;
    document.body.classList.toggle('no-ai', !this.fn);
  },
  // one image + instructions → text (comics, illustrations)
  async vision(blob, prompt, opts = {}) {
    if (this.provider === 'gemini') return Gemini.run(prompt, { ...opts, image: blob });
    if (this.provider === 'claude') { const b64 = await blobB64(blob); return this.fn([{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: blob.type || 'image/jpeg', data: b64 } }, { type: 'text', text: prompt }] }], opts); }
    throw Object.assign(new Error('no ai'), { code: 'no_ai' });
  },
  get on() { return !!this.fn; },
  errText(e) {
    const c = e && e.code;
    if (c === 'not_granted' || c === 'sampling_disabled' || c === 'not_declared') return t('aiDenied');
    if (c === 'rate_limited') return t('aiRate');
    if (c === 'refused') return t('aiRefused');
    if (c === 'image_rejected') return t('aiImgBad');
    if (c === 'images_unavailable') return t('aiNoImg');
    if (c === 'prompt_too_large') return t('aiTooLarge');
    if (c === 'session_expired') return t('aiSession');
    if (c === 'no_ai') return t('aiNeedKey');
    if (c === 'gem_key') return t('gemBadKey');
    if (c === 'gem_quota') return t('gemQuota');
    return t('aiFail');
  },
  langName(code) { return code === 'en' ? 'English' : 'português do Brasil'; },
};

/* AI result sheet: streams text into a sheet */
function aiSheet(title, run, opts = {}) {
  let ctl = new AbortController();
  const s = Sheets.open({
    title, onClose: () => ctl.abort(), body: b => {
      const think = el('div', { class: 'ai-think' }, el('div', { class: 'spin' }), el('span', { text: t('thinking') }));
      const out = el('div', { class: 'ai-out' + (opts.ui ? ' ui' : '') });
      const foot = el('div', { style: { display: 'flex', gap: '10px', marginTop: '18px' } });
      b.append(think, out, foot);
      const stop = el('button', { class: 'btn', style: { flex: 1 }, text: t('stop'), onclick: () => ctl.abort() });
      foot.append(stop);
      (async () => {
        try {
          const res = await run({ signal: ctl.signal, onText: ({ text }) => { think.classList.add('hide'); out.textContent = text; }, out, think });
          think.classList.add('hide');
          if (res && res.render) { out.replaceChildren(); res.render(out); }
          else if (res && res.text != null) out.textContent = res.text;
          foot.replaceChildren(
            el('button', { class: 'btn', style: { flex: 1 }, onclick: async () => { try { await navigator.clipboard.writeText(out.innerText); toast(t('copied')); } catch (e) { toast(t('copyFail')); } } }, icon('copy'), t('copy')),
            el('button', { class: 'btn primary', style: { flex: 1 }, text: t('done'), onclick: () => Sheets.close(s) }));
          if (res && res.truncated) out.append(el('p', { class: 'muted', style: { fontSize: '13px', fontFamily: 'var(--ui)' }, text: t('aiTrunc') }));
        } catch (e) {
          think.classList.add('hide');
          if (e && e.code === 'cancelled') { foot.replaceChildren(el('button', { class: 'btn block', text: t('close'), onclick: () => Sheets.close(s) })); return; }
          if (e && e.text) out.textContent = e.text;
          out.append(el('p', { class: 'muted', style: { fontFamily: 'var(--ui)', fontSize: '14px' }, text: AI.errText(e) }));
          foot.replaceChildren(el('button', { class: 'btn block', text: t('close'), onclick: () => Sheets.close(s) }));
        }
      })();
    }
  });
  return s;
}

function blobB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); }); }
/* Google Gemini with the reader's own key (free tier in Google AI Studio) */
const Gemini = {
  models() { return [S.gemModel, 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'].filter(Boolean); },
  async run(p, opts = {}) {
    const key = S.gemKey; if (!key) throw Object.assign(new Error('no key'), { code: 'no_ai' });
    const contents = [];
    if (Array.isArray(p)) for (const m of p) contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: typeof m.content === 'string' ? m.content : (m.content || []).map(c => c.text || '').join('\n') }] });
    else contents.push({ role: 'user', parts: [{ text: p }] });
    if (opts.image) contents[contents.length - 1].parts.unshift({ inline_data: { mime_type: opts.image.type || 'image/jpeg', data: await blobB64(opts.image) } });
    const body = { contents, generationConfig: { temperature: opts.temperature ?? 0.4, maxOutputTokens: opts.maxTokens || 8192 } };
    if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
    if (opts.json) body.generationConfig.responseMimeType = 'application/json';
    let last;
    for (const m of this.models()) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: opts.signal }).catch(e => { if (e.name === 'AbortError') throw Object.assign(e, { code: 'cancelled' }); throw e; });
      if (r.status === 404) { last = r; continue; }
      if (r.status === 400 || r.status === 401 || r.status === 403) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error((j.error && j.error.message) || 'key'), { code: /key/i.test(JSON.stringify(j)) ? 'gem_key' : 'refused' }); }
      if (r.status === 429) throw Object.assign(new Error('quota'), { code: 'gem_quota' });
      if (!r.ok) throw new Error('Gemini ' + r.status);
      const j = await r.json(); S.gemModel = m;
      const text = ((j.candidates || [])[0]?.content?.parts || []).map(x => x.text || '').join('');
      if (opts.onText) opts.onText({ text });
      return { text, truncated: (j.candidates || [])[0]?.finishReason === 'MAX_TOKENS' };
    }
    throw new Error('Gemini ' + (last ? last.status : '?'));
  },
};
