/* ================= translation: original / translated / bilingual, English ↔ Portuguese =================
   Each chapter is translated once (in passages, keeping paragraph structure), cached on the device,
   with a per-book glossary so names and recurring expressions stay the same across the book.
   A paragraph that could not be translated keeps the original and is marked, never dropped. */
function detectLang(text) {
  const s = ' ' + (text || '').slice(0, 6000).toLowerCase().replace(/[^a-zà-ÿ\s]/g, ' ') + ' ';
  const count = ws => ws.reduce((a, w) => a + (s.split(' ' + w + ' ').length - 1), 0);
  const en = count(['the', 'and', 'of', 'to', 'was', 'he', 'it', 'that', 'his', 'with', 'you', 'had', 'her']);
  const pt = count(['de', 'que', 'não', 'uma', 'os', 'para', 'com', 'ele', 'ela', 'mas', 'se', 'como', 'era', 'você']);
  return en > pt * 1.2 ? 'en' : pt > en * 1.2 ? 'pt' : '';
}
const Trans = {
  BLOCK: 'p,h1,h2,h3,h4,h5,h6,li,figcaption,blockquote,dt,dd,td,th',
  mode(rec) { return (rec && rec.trMode) || 'orig'; },
  src(rec) { return (rec.lang || '').slice(0, 2) || rec.srcLang || 'en'; },
  target(rec) { return rec.trTo || (this.src(rec) === 'en' ? 'pt' : 'en'); },
  name(l) { return l === 'en' ? 'English' : 'Brazilian Portuguese (português do Brasil)'; },
  blocks(wrap) { return [...wrap.querySelectorAll(this.BLOCK)].filter(e => !e.querySelector(this.BLOCK) && e.textContent.trim().length > 0); },
  key(rec, ch) { return 'tr:' + rec.id + ':' + this.target(rec) + ':' + ch; },
  async glossary(rec) { return (await DB.get('kv', 'gl:' + rec.id + ':' + this.target(rec)).catch(() => null)) || {}; },
  async translateTexts(rec, texts, onProgress, signal) {
    const out = new Array(texts.length).fill(null);
    let gl = await this.glossary(rec);
    // passages of ~4500 characters, never splitting a paragraph
    const batches = []; let cur = [], len = 0;
    texts.forEach((tx, i) => { if (cur.length && len + tx.length > 4500) { batches.push(cur); cur = []; len = 0; } cur.push(i); len += tx.length; });
    if (cur.length) batches.push(cur);
    let done = 0;
    for (const b of batches) {
      const items = b.map(i => texts[i]);
      const sys = `You are an award-winning literary translator. Translate from ${this.name(this.src(rec))} to ${this.name(this.target(rec))}.
Rules: keep the meaning, tone, humour, rhythm and style of the original; translate idioms by meaning, never word for word; keep dialogue punctuation natural for the target language (Brazilian Portuguese uses em-dash dialogue when the source does); keep character and place names consistent with the glossary; keep every item as its own item (same count, same order); do not add notes, do not summarise, do not skip anything.
Book: "${rec.title}"${rec.author ? ' by ' + rec.author : ''}.
Glossary already decided (source → target), follow it: ${JSON.stringify(gl).slice(0, 3000)}
Return JSON: {"t": [translated strings, one per input item], "g": {new important names or recurring terms you decided: source → target}}`;
      let tries = 0;
      while (tries < 2) {
        tries++;
        try {
          const { text } = await AI.fn(JSON.stringify(items), { system: sys, json: true, temperature: 0.3, signal, cache: false });
          const j = JSON.parse(String(text).replace(/^```(json)?|```$/g, '').trim());
          const arr = Array.isArray(j) ? j : j.t;
          if (Array.isArray(arr) && arr.length === items.length) {
            b.forEach((i, k) => { out[i] = typeof arr[k] === 'string' && arr[k].trim() ? arr[k] : null; });
            if (j.g && typeof j.g === 'object') { gl = Object.assign({}, gl, j.g); DB.put('kv', 'gl:' + rec.id + ':' + this.target(rec), gl).catch(() => { }); }
            break;
          }
        } catch (e) { if (e.code === 'cancelled' || e.code === 'gem_quota' || e.code === 'gem_key' || e.code === 'no_ai') throw e; }
      }
      done += b.length; onProgress && onProgress(Math.round(done / texts.length * 100));
    }
    return out;
  },
  // called by the reader for every chapter before it is laid out
  async apply(wrap, ch, rec) {
    const mode = this.mode(rec); if (mode === 'orig') return wrap;
    const bl = this.blocks(wrap), texts = bl.map(e => e.textContent.replace(/\s+/g, ' ').trim());
    let tr = await DB.get('kv', this.key(rec, ch)).catch(() => null);
    if (!Array.isArray(tr) || tr.length !== texts.length || tr.some(x => x === null)) {
      if (!AI.fn) { toast(t('aiNeedKey')); return wrap; }
      const prev = Array.isArray(tr) && tr.length === texts.length ? tr : null;
      const need = texts.map((x, i) => prev && prev[i] ? null : i).filter(i => i !== null);
      busy(t('trChapter', { n: 0 }));
      try {
        const got = await this.translateTexts(rec, need.map(i => texts[i]), p => busy(t('trChapter', { n: p })));
        tr = prev || new Array(texts.length).fill(null);
        need.forEach((i, k) => { tr[i] = got[k]; });
        DB.put('kv', this.key(rec, ch), tr).catch(() => { });
      } catch (e) { busy(null); toast(AI.errText(e)); if (!prev) return wrap; tr = prev; }
      busy(null);
    }
    bl.forEach((e, i) => {
      const x = tr[i];
      if (!x) { e.classList.add('tr-miss'); e.setAttribute('data-miss', t('trMissing')); return; }
      if (mode === 'tr') { e.textContent = x; e.setAttribute('lang', this.target(rec)); }
      else {
        const c = document.createElement(e.tagName === 'LI' ? 'div' : e.tagName); c.className = 'bi-tr'; c.textContent = x; c.setAttribute('lang', this.target(rec));
        e.classList.add('bi-or'); e.after(c);
      }
    });
    wrap.classList.toggle('bilingual', mode === 'bi');
    return wrap;
  },
  sheetGroup(rec, after) {
    const src = this.src(rec), tgt = this.target(rec);
    return wGroup(t('readingLang'),
      wSeg([['orig', t('trOrig') + ' (' + (src === 'en' ? 'EN' : 'PT') + ')'], ['tr', t('trTrans') + ' (' + (tgt === 'en' ? 'EN' : 'PT') + ')'], ['bi', t('trBi')]], this.mode(rec), async x => {
        if (x !== 'orig' && !AI.fn) { Sheets.closeAll(); return aiKeySheet(); }
        rec.trMode = x; await saveRec(rec); after && after();
      }, 'wrap'),
      el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45, margin: '8px 2px 0' }, text: t('trNote') }));
  },
};

/* how to get the free Gemini key, and where to paste it */
function aiKeySheet() {
  Sheets.open({
    title: t('aiKeyTitle'), body: b => {
      const inp = el('input', { class: 'inp', placeholder: t('gemKeyPh'), value: S.gemKey || '' });
      b.append(
        el('p', { style: { lineHeight: 1.5, marginTop: 0 }, text: t('aiKeyIntro') }),
        el('ol', { class: 'steps' }, ...[t('gemStep1'), t('gemStep2'), t('gemStep3'), t('gemStep4')].map(s => el('li', { text: s }))),
        inp,
        el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45 }, text: t('gemPrivacy') }),
        el('button', { class: 'btn primary block', text: t('save'), onclick: async () => { setS('gemKey', inp.value.trim()); await AI.init(); Sheets.close(); toast(AI.fn ? t('gemOk') : t('gemRemoved')); } }));
    },
  });
}

/* words saved while reading, with the sentence they came from */
const Vocab = {
  async all() { return (await DB.get('kv', 'vocab').catch(() => null)) || []; },
  async add(w, ctx, rec, tr) {
    const list = await this.all(); w = w.trim(); if (!w) return;
    if (!list.some(x => x.w.toLowerCase() === w.toLowerCase())) list.unshift({ w, ctx: (ctx || '').slice(0, 300), tr: tr || '', book: rec ? rec.title : '', lang: rec ? Trans.src(rec) : '', at: Date.now() });
    await DB.put('kv', 'vocab', list); toast(t('vocabSaved'));
  },
  async sheet() {
    const list = await this.all();
    Sheets.open({
      title: t('vocabTitle'), body: b => {
        if (!list.length) { b.append(el('p', { class: 'muted', text: t('vocabEmpty') })); return; }
        const L = el('div', { class: 'list' });
        const draw = () => { L.replaceChildren(...list.map((x, i) => el('div', { class: 'li vocab' },
          el('div', { class: 'lt' }, el('b', { text: x.w }), x.tr ? el('div', { class: 'vtr', text: x.tr }) : '', el('small', { text: '“' + x.ctx + '” · ' + x.book })),
          el('button', { class: 'icon', onclick: async () => { list.splice(i, 1); await DB.put('kv', 'vocab', list); draw(); } }, icon('trash'))))); };
        draw(); b.append(L);
      },
    });
  },
};
