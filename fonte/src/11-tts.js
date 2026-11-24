/* ================= read aloud (text to speech) ================= */
const TTS = {
  playing: false, open: false, segs: [], i: 0, u: null, wake: null, sleepAt: 0,
  supported() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; },
  lang() {
    const rec = Book.rec;
    if (rec && typeof Trans !== 'undefined' && Trans.mode(rec) === 'tr') return Trans.target(rec);
    if (this._lk !== Book.rootText) { this._lk = Book.rootText; this._l = detectLang(Book.rootText || '') || ''; }
    return (this._l || (Book.flow && Book.flow.lang) || (rec && rec.lang) || 'pt').slice(0, 2).toLowerCase();
  },
  // the language of one block: a translated paragraph says so; an untranslated one stays in the book's language
  blockLang(b, def) {
    const l = b && b.closest && b.closest('[lang]'); const v = l && l.getAttribute('lang');
    return v && v !== (Book.flow && Book.flow.lang) ? v.slice(0, 2).toLowerCase() : def;
  },
  NOVELTY: /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|fred|kathy|grandma|grandpa|rocko|shelley|flo|eddy|reed|sandy|deranged|hysterical|pipe organ)\b/i,
  score(v) {
    const n = v.name;
    return (/premium/i.test(n) ? 50 : 0) + (/enhanced|aprimorad|melhorad|natural|neural/i.test(n) ? 30 : 0) + (/google|microsoft/i.test(n) ? 12 : 0) + (v.localService ? 2 : 0) + (/-BR$/i.test(v.lang) || /en-US/i.test(v.lang) ? 3 : 0);
  },
  voices() {
    const l = this.lang();
    return speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(l) && !this.NOVELTY.test(v.name)).sort((a, b) => this.score(b) - this.score(a) || a.name.localeCompare(b.name));
  },
  voice() {
    const vs = this.voices(), want = S['ttsVoice_' + this.lang()];
    return vs.find(v => v.voiceURI === want) || vs[0] || null;
  },
  // split the chapter into readable pieces (paragraphs, then sentences, max ~220 chars)
  build() {
    const root = Book.flow.firstElementChild; this.segs = []; if (!root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n, pos = 0, cur = null;
    const BLK = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,pre,figcaption,dt,dd,div,section,header,hgroup';
    const blocks = [];
    while ((n = w.nextNode())) {
      const b = n.parentElement && n.parentElement.closest(BLK);
      const len = n.data.length;
      if (!cur || cur.b !== b) { cur = { b, s: pos, e: pos + len }; blocks.push(cur); } else cur.e = pos + len;
      pos += len;
    }
    const txt = Book.rootText, def = this.lang(), tr = Book.rec && typeof Trans !== 'undefined' ? Trans.mode(Book.rec) : 'orig';
    let bi = 0;
    for (const bl of blocks) {
      const t0 = txt.slice(bl.s, bl.e); if (!t0.trim()) continue;
      // which paragraph, and is it a title (the narrator pauses around titles)
      this.curBlk = bi++; this.curHead = !!(bl.b && bl.b.closest && bl.b.closest('h1,h2,h3,h4,h5,h6,header,hgroup,.chap-title,.ch-title,.ch-num'));
      // bilingual: read the original only; translated mode: a paragraph that wasn't translated is read in its own language
      if (bl.b && bl.b.closest && bl.b.closest('.bi-tr')) continue;
      this.curLang = tr === 'tr' && bl.b && bl.b.closest && bl.b.closest('.tr-miss') ? (detectLang(t0) || def) : this.blockLang(bl.b, def);
      const re = /[^.!?…]+(?:[.!?…]+["”’»)\]]*|$)\s*/g; let m;
      while ((m = re.exec(t0)) && m[0]) {
        let a = bl.s + m.index, piece = m[0];
        while (piece.length > 240) {
          let cut = Math.max(piece.lastIndexOf(', ', 220), piece.lastIndexOf('; ', 220), piece.lastIndexOf(' — ', 220));
          if (cut < 60) cut = piece.lastIndexOf(' ', 220); if (cut < 40) cut = 220;
          this.push(a, a + cut + 1); a += cut + 1; piece = piece.slice(cut + 1);
        }
        this.push(a, a + piece.length);
      }
    }
  },
  push(s, e) { const t = Book.rootText.slice(s, e); if (/[\p{L}\p{N}]/u.test(t)) this.segs.push({ s, e, t: t.replace(/\s+/g, ' ').trim(), lang: this.curLang || this.lang(), blk: this.curBlk, h: this.curHead }); },
  range(s, e) {
    const root = Book.flow.firstElementChild; if (!root) return null;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n, pos = 0; const r = document.createRange(); let started = false;
    while ((n = w.nextNode())) {
      const len = n.data.length;
      if (!started && s < pos + len) { r.setStart(n, Math.max(0, s - pos)); started = true; }
      if (started && e <= pos + len) { r.setEnd(n, Math.max(0, e - pos)); return r; }
      pos += len;
    }
    return started ? r : null;
  },
  mark(seg) {
    if (!window.CSS || !CSS.highlights || typeof Highlight === 'undefined') return;
    CSS.highlights.delete('tts');
    if (!seg) return;
    const r = this.range(seg.s, seg.e); if (r) CSS.highlights.set('tts', new Highlight(r));
  },
  // ---------- controls ----------
  engineAudio() { return Voices.engine() !== 'system'; },
  start() {
    if (!this.engineAudio() && !this.supported()) { toast(t('ttsNo')); return; }
    if (this.engineAudio()) { NeuralPlayer.init(); this.unlock(); }
    this.open = true; $('#v-book').classList.add('tts-on'); this.ui(); this.fpOpen();
    this.build();
    const off = Book.curOff || 0;
    this.i = Math.max(0, this.segs.findIndex(s => s.e > off));
    if (this.engineAudio()) NeuralPlayer.build();
    this.play();
  },
  // iPhone only lets audio start from a tap: start the player silently right now, inside the tap
  unlock() {
    // iPhone only lets a page play sound that starts from a tap: play a short real silence now, during the tap,
    // so the same player may play the book a moment later (after it's downloaded or generated)
    try {
      const a = NeuralPlayer.audio; if (NeuralPlayer.unlocked && a.src) return;
      if (!this.silentUrl) this.silentUrl = URL.createObjectURL(wavBlob(new Float32Array(4800), 16000));
      NeuralPlayer.silent = true; a.src = this.silentUrl;
      a.play().then(() => { NeuralPlayer.unlocked = true; }).catch(() => { });
    } catch (e) { }
  },
  async play() {
    this.playing = true; this.keepAwake(true); this.ui();
    if (!this.engineAudio()) return this.speak();
    this.unlock();
    if (NeuralPlayer.resume()) return;
    const lang = this.lang(), list = await Voices.list(lang), v = Voices.current(lang, list);
    if (!v) { this.fail(new Error(t('ttsNoVoices'))); return; }
    this.vname = v.name; this.ui();
    NeuralPlayer.play(this.i, v.id, lang);
  },
  pause() {
    this.playing = false; this.u = null;
    if (this.engineAudio()) NeuralPlayer.pause(); else speechSynthesis.cancel();
    this.keepAwake(false); this.ui();
  },
  loading(pc, kind) {
    const tv = $('#tts-bar .tvoice'); if (!tv) return;
    if (pc == null) { this.loadTxt = ''; this.ui(); return; }
    this.loadTxt = tv.textContent = pc === -1 ? t('vozWarm') : pc >= 0 && pc < 100 && pc !== 0 ? t(kind === 'ab' ? 'abDownloading' : 'ttsDownloading', { n: pc }) : t('ttsPreparing');
  },
  fail(e) {
    this.pause(); this.loading(null);
    Sheets.open({ title: t('ttsFailT'), center: true, body: b => b.append(
      el('p', { style: { lineHeight: 1.5 }, text: ((e && e.message) || String(e)) }),
      ((e && e.message) || '') === t('vozNet') ? '' : el('p', { class: 'muted', style: { lineHeight: 1.5, fontSize: '13.5px' }, text: t('ttsFailHelp') }),
      this.diagEl(),
      el('button', { class: 'btn primary block', text: t('vozRetry'), onclick: () => { Sheets.close(); this.ui(); this.play(); } }),
      el('button', { class: 'btn block', style: { marginTop: '8px' }, text: 'OK', onclick: () => Sheets.close() })) });
  },
  toggle() { this.playing ? this.pause() : this.play(); },
  // a small technical line (helps find what's wrong from a screenshot)
  diagEl() {
    const p = el('p', { class: 'muted', style: { fontSize: '11px', lineHeight: 1.4, margin: '10px 2px', opacity: .7, wordBreak: 'break-all' }, text: '…' });
    (async () => {
      const rec = Book.rec, key = AudioBook.key(rec); let idx = {}, n = '?';
      try { AudioBook.idxAt = 0; idx = await AudioBook.index(); n = Object.keys(idx).length; } catch (e) { n = 'erro ' + e.message; }
      const e = idx[key], vs = e ? Object.keys(e.voices || {}).map(v => v.replace('-Chirp3-HD', '') + ':' + (e.voices[v].chapters || []).length).join(',') : '-';
      p.textContent = ['fam ' + (Family.on ? 'sim' : 'não'), 'índice ' + n, 'chave ' + key, 'cap ' + Book.ch, 'vozes ' + vs, 'voz ' + (NeuralPlayer.voice || '-'), 'erro ' + (NeuralPlayer.lastErr || '-')].join(' · ');
    })();
    return p;
  },
  skip(d) {
    if (this.engineAudio()) return NeuralPlayer.seek(d);
    this.i = clamp(this.i + d, 0, Math.max(0, this.segs.length - 1));
    if (this.playing) this.speak(); else this.follow();
  },
  stop() {
    if (!this.open) return;
    this.playing = false; this.open = false; this.u = null;
    try { speechSynthesis.cancel(); } catch (e) { }
    try { NeuralPlayer.stop(); } catch (e) { }
    this.mark(null); this.keepAwake(false); this.dark(false); this.sleepAt = 0;
    $('#v-book').classList.remove('tts-on'); this.fpClose();
  },
  follow(range) {
    const seg = range || this.segs[this.i]; this.mark(seg);
    if (seg) { const p = Book.pageOfOffset(seg.s); if (p !== Book.page) Book.showPage(p, true, 1); }
  },
  speak() {
    speechSynthesis.cancel();
    if (this.sleepAt && Date.now() > this.sleepAt) { this.sleepAt = 0; this.pause(); toast(t('ttsSlept')); return; }
    const seg = this.segs[this.i];
    if (!seg) return this.nextChapter();
    this.follow();
    const u = new SpeechSynthesisUtterance(seg.t);
    const v = this.voice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = this.lang() === 'en' ? 'en-US' : 'pt-BR';
    u.rate = S.ttsRate || 1; u.pitch = 1;
    const go = () => { if (this.u !== u || !this.playing) return; this.i++; this.speak(); };
    u.onend = go;
    u.onerror = e => { if (e.error === 'interrupted' || e.error === 'canceled') return; go(); };
    this.u = u;
    speechSynthesis.speak(u);
  },
  // ---------- chapter announcements: "Fim do capítulo 3, Jon." · pause · "Capítulo 4: Tyrion." ----------
  // is this line just the chapter's title ("Capítulo 3", "Jon", "Prólogo"…)?
  isHeadSeg(txt) {
    const a = (txt || '').trim().replace(/[.:]$/, '').toLowerCase(), L = this.chLabel().toLowerCase();
    return !!a && a.length <= 60 && (a === L || a === niceLabel(Book.tocLabel ? Book.tocLabel(Book.ch) : '').toLowerCase() || /^(cap[ií]tulo|chapter)\s+[\divxlc]+$/i.test(a) || this.isSpecial(a));
  },
  isSpecial(l) { return /^(pr[oó]logo|ep[ií]logo|prologue|epilogue|introdu[cç][aã]o|introduction|pref[aá]cio|preface|ap[eê]ndice|appendix)$/i.test(l); },
  chNum(ch) {
    const toc = (Book.data && Book.data.toc || []).filter(e => e.idx >= 0 && e.idx < Book.data.count);
    if (!toc.length) return ch + 1;
    const real = toc.filter(e => !this.isSpecial(niceLabel(e.label)));
    const i = real.findIndex(e => e.idx === ch); return i >= 0 ? i + 1 : ch + 1;
  },
  annText(ch, kind) {
    const L = this.chLabel(ch), plain = /^(cap[ií]tulo|chapter)\s*\d+$/i.test(L);
    if (this.isSpecial(L)) return kind === 'end' ? t('annEndSpecial', { c: L }) : L + '.';
    if (plain || !L) return kind === 'end' ? t('annEndN', { n: this.chNum(ch) }) : t('annStartN', { n: this.chNum(ch) });
    return kind === 'end' ? t('annEndNamed', { n: this.chNum(ch), c: L }) : t('annStartNamed', { n: this.chNum(ch), c: L });
  },
  async sayLocal(text) {
    if (!('speechSynthesis' in window)) return;
    await new Promise(res => { try { const u = new SpeechSynthesisUtterance(text); u.lang = this.lang() === 'en' ? 'en-US' : 'pt-BR'; u.rate = S.ttsRate || 1; u.onend = u.onerror = () => res(); speechSynthesis.speak(u); setTimeout(res, 9000); } catch (e) { res(); } });
  },
  async announce(text) {
    if (!text || S.ttsAnnounce === false) return;
    const lang = this.lang(), eng = Voices.engine(), gem = eng === 'gemini' && S.gemKey;
    const key = 'ann:' + eng + ':' + (gem ? GemTTS.voiceNow() : '') + ':' + text;
    let blob = null;
    try {
      blob = await DB.get('kv', key);
      if (!blob) {
        blob = gem ? await GemTTS.synth(text, GemTTS.voiceNow(), lang) : await Voices.synth(text, await NeuralPlayer.voiceFor(lang), lang);
        if (blob) DB.put('kv', key, blob).catch(() => { });
      }
    } catch (e) { blob = null; }
    if (!blob) return this.sayLocal(text);
    const N = NeuralPlayer; N.init(); const a = N.audio, u = URL.createObjectURL(blob);
    N.announcing = true; a.ontimeupdate = null;
    await new Promise(res => {
      let ok = false; const end = () => { if (ok) return; ok = true; a.removeEventListener('ended', end); a.removeEventListener('pause', onPause); res(); };
      const onPause = () => { if (!this.playing) end(); };
      a.addEventListener('ended', end); a.addEventListener('pause', onPause);
      a.src = u; a.playbackRate = S.ttsRate || 1; a.play().catch(end); setTimeout(end, 20000);
    });
    N.announcing = false; setTimeout(() => URL.revokeObjectURL(u), 2000);
  },
  async nextChapter() {
    const ann = this.playing && S.ttsAnnounce !== false;
    if (ann) { this.loading(t('annNow')); await this.announce(this.annText(Book.ch, 'end')); this.loading(null); if (!this.playing) return; }
    if (this.sleepEoc) { this.sleepEoc = false; await Book.turnChapter(Math.min(Book.ch + 1, Book.data.count - 1), { frac: 0 }, 1); this.build(); this.i = 0; if (this.engineAudio()) NeuralPlayer.build(); this.pause(); toast(t('ttsSlept')); return; }
    if (Book.ch >= Book.data.count - 1) { if (ann) await this.announce(t('annBookEnd')); this.pause(); toast(t('ttsEnd')); return; }
    if (ann) { await sleep(1500); if (!this.playing) return; }
    await Book.turnChapter(Book.ch + 1, { frac: 0 }, 1);
    Resume.save(Book.rec); saveRec(Book.rec).catch(() => { }); // where you are is saved before the next chapter even starts
    this.build(); this.i = 0; this.ui();
    // audiobooks already read their own chapter title; the live voices get the announcement and skip the title line
    const lang0 = this.lang(), v0 = this.engineAudio() ? Voices.current(lang0, await Voices.list(lang0)) : null, isAb = v0 && v0.id.startsWith('a:');
    let skip = 0;
    if (ann && !isAb) { await this.announce(this.annText(Book.ch, 'start')); if (!this.playing) return; await sleep(700); if (!this.playing) return; if (this.segs[0] && this.isHeadSeg(this.segs[0].t)) skip = 1; }
    if (this.engineAudio()) { NeuralPlayer.build(); if (this.playing) { const lang = this.lang(), list = await Voices.list(lang), v = Voices.current(lang, list); if (v) NeuralPlayer.play(skip, v.id, lang); } return; }
    if (this.playing) { this.i = skip; this.speak(); }
  },
  // ---------- screen ----------
  async keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !this.wake) { this.wake = await navigator.wakeLock.request('screen'); this.wake.addEventListener('release', () => { this.wake = null; }); }
      if (!on && this.wake) { await this.wake.release(); this.wake = null; }
    } catch (e) { }
  },
  dark(on) {
    let d = $('#ttsdark');
    if (!on) { if (d) d.remove(); return; }
    if (d) return;
    d = el('div', { id: 'ttsdark', onclick: () => this.dark(false) }, el('div', { class: 'tdh', text: t('ttsDarkHint') }));
    document.body.append(d);
  },
  // ---------- interface ----------
  ui() {
    const bar = $('#tts-bar'); if (!bar) return;
    bar.querySelector('.tplay').replaceChildren(icon(this.playing ? 'pause' : 'playF'));
    const v = this.engineAudio() ? null : this.voice();
    this.vlabel = this.engineAudio() ? (this.vname || t('ttsVoice')) : (v ? v.name.replace(/\s*\(.*\)$/, '') : t('ttsVoice'));
    bar.querySelector('.mp-t').textContent = this.chLabel();
    this.tick(); this.fpRender();
  },
  // ---------- player (mini at the bottom + full screen, like the big audiobook apps) ----------
  chLabel(ch = Book.ch) { const l = niceLabel(Book.data && Book.tocLabel ? Book.tocLabel(ch) : ''); if (/^\d{1,3}\.?$/.test(l)) return t('fpChN', { n: parseInt(l) }); return l || (Book.rec && Book.rec.title) || ''; },
  rateTxt() { const r = S.ttsRate || 1; return String(r).replace('.', ',') + '×'; },
  hms(x) { x = Math.max(0, Math.round(x || 0)); const h = Math.floor(x / 3600), m = Math.floor(x % 3600 / 60), s = x % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); },
  // where we are in the chapter (only ready audiobooks have a real clock)
  clock() {
    const N = NeuralPlayer, A = N.ab, a = N.audio;
    if (!this.engineAudio() || !A || !a) return null;
    if (N.abPhase !== 'main') return { music: true };
    const dur = A.dur || a.duration || 0; return { cur: a.currentTime || 0, dur };
  },
  tick() {
    // sleep timer also works in the middle of a chapter
    if (this.sleepAt && Date.now() > this.sleepAt && this.playing) { this.sleepAt = 0; this.pause(); toast(t('ttsSlept')); }
    const c = this.clock(), bar = $('#tts-bar');
    if (bar) {
      const sub = bar.querySelector('.tvoice');
      sub.textContent = this.loadTxt ? this.loadTxt : this.vlabel + (c && c.music ? ' · ' + t('fpMusic') : c && c.dur ? ' · −' + this.hms(c.dur - c.cur) : '');
      bar.querySelector('.mp-prog').style.width = c && c.dur ? (100 * c.cur / c.dur).toFixed(2) + '%' : '0';
    }
    const fp = this.fp; if (!fp || !fp.classList.contains('on')) return;
    const r = fp.querySelector('.fp-range'), sc = fp.querySelector('.fp-scrub');
    sc.style.visibility = c ? '' : 'hidden';
    if (c && !this.dragging) {
      if (c.music) { r.max = 1; r.value = 0; fp.querySelector('.fp-el').textContent = t('fpMusic'); fp.querySelector('.fp-rest').textContent = ''; }
      else { r.max = Math.max(1, c.dur); r.value = c.cur; fp.querySelector('.fp-el').textContent = this.hms(c.cur); fp.querySelector('.fp-rest').textContent = '−' + this.hms(c.dur - c.cur); }
      r.style.setProperty('--p', (100 * r.value / r.max).toFixed(2) + '%');
    }
    const tm = fp.querySelector('.fp-timer b');
    tm.textContent = this.sleepEoc ? t('fpEocShort') : this.sleepAt ? Math.max(1, Math.ceil((this.sleepAt - Date.now()) / 60000)) + ' min' : t('fpOff');
  },
  skip30(d) {
    const c = this.clock(), N = NeuralPlayer;
    if (c && c.music) { if (d > 0) N.next(); return; }
    if (c) { N.audio.currentTime = clamp(c.cur + 30 * d, 0, Math.max(0, c.dur - 0.5)); this.tick(); return; }
    this.skip(d);
  },
  async goChapter(ch, play = true) {
    if (!Book.data) return;
    ch = clamp(ch, 0, Book.data.count - 1);
    if (!this.open) { Book.manualAt = Date.now(); await Book.turnChapter(ch, { frac: 0 }, ch >= Book.ch ? 1 : -1); return; }
    Book.manualAt = Date.now(); // you chose the chapter: start it from the beginning
    const was = this.playing || play;
    if (this.engineAudio()) NeuralPlayer.stop();
    await Book.turnChapter(ch, { frac: 0 }, ch >= Book.ch ? 1 : -1);
    this.build(); this.i = 0;
    if (this.engineAudio()) NeuralPlayer.build();
    if (was) { this.playing = false; await this.play(); }
    this.ui();
  },
  prevChapter() { const c = this.clock(); if (c && !c.music && c.cur > 5) { NeuralPlayer.audio.currentTime = 0; this.tick(); return; } this.goChapter(Book.ch - 1); },
  fpBuild() {
    if (this.fp) return this.fp;
    const SVG = p => '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
    const R30 = (dir) => '<svg viewBox="0 0 32 32" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (dir < 0 ? '<path d="M9 9a10 10 0 1 1-2.2 10"/><path d="M9 4v5H4"/>' : '<path d="M23 9a10 10 0 1 0 2.2 10"/><path d="M23 4v5h5"/>') + '<text x="16" y="20.5" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui">30</text></svg>';
    const btn = (cls, html, on, label) => el('button', { class: cls, html, onclick: on, 'aria-label': label || '' });
    const tool = (cls, ico, label, on) => el('button', { class: 'fp-tool ' + cls, onclick: on }, typeof ico === 'string' ? el('b', { text: ico }) : ico, el('span', { text: label }));
    const range = el('input', { type: 'range', class: 'fp-range', min: 0, max: 1, step: 1, value: 0 });
    range.addEventListener('input', () => { this.dragging = true; const c = this.clock(); range.style.setProperty('--p', (100 * range.value / range.max).toFixed(2) + '%'); if (c && c.dur) { this.fp.querySelector('.fp-el').textContent = this.hms(+range.value); this.fp.querySelector('.fp-rest').textContent = '−' + this.hms(c.dur - range.value); } });
    range.addEventListener('change', () => { const c = this.clock(); if (c && !c.music) NeuralPlayer.audio.currentTime = +range.value; this.dragging = false; this.tick(); });
    const fp = el('div', { id: 'fp' },
      el('div', { class: 'fp-top' },
        btn('icon fp-down', SVG('<path d="M6 9l6 6 6-6"/>'), () => this.fpClose(), t('fpMin')),
        el('div', { class: 'fp-kick', text: t('fpNow') }),
        btn('icon fp-more', '', () => this.sheet(), t('ttsTitle'))),
      el('div', { class: 'fp-cover' }),
      el('div', { class: 'fp-meta' }, el('div', { class: 'fp-book' }),
        el('button', { class: 'fp-ch', onclick: () => this.chapters() }, el('span', { class: 'fp-chl' }), el('i', { html: SVG('<path d="M6 9l6 6 6-6"/>') }))),
      el('div', { class: 'fp-scrub' }, range, el('div', { class: 'fp-times' }, el('span', { class: 'fp-el' }), el('span', { class: 'fp-chn' }), el('span', { class: 'fp-rest' }))),
      el('div', { class: 'fp-ctl' },
        btn('icon fp-prev', SVG('<path d="M6 5v14"/><path d="M19 6l-9 6 9 6z" fill="currentColor"/>'), () => this.prevChapter(), t('fpPrevCh')),
        btn('icon fp-b30', R30(-1), () => this.skip30(-1), t('fpBack30')),
        btn('fp-play', '', () => this.toggle(), 'play'),
        btn('icon fp-f30', R30(1), () => this.skip30(1), t('fpFwd30')),
        btn('icon fp-next', SVG('<path d="M18 5v14"/><path d="M5 6l9 6-9 6z" fill="currentColor"/>'), () => this.goChapter(Book.ch + 1), t('fpNextCh'))),
      el('div', { class: 'fp-tools' },
        tool('fp-speed', '1×', t('fpSpeed'), () => this.speedSheet()),
        tool('fp-timer', '', t('fpTimer'), () => this.timerSheet()),
        tool('fp-list', icon('list'), t('fpChapters'), () => this.chapters()),
        tool('fp-dark', icon('eye'), t('fpDark'), () => { this.fpClose(); this.dark(true); }),
        tool('fp-voice', icon('sliders'), t('fpVoice'), () => this.sheet())));
    fp.querySelector('.fp-more').append(icon('sliders'));
    fp.querySelector('.fp-timer b').before(icon('moon')); fp.querySelector('.fp-speed b').before(icon('speed'));
    // swipe down to shrink (like Apple Books / Audible)
    let y0 = null;
    fp.addEventListener('pointerdown', e => { y0 = e.target.closest('.fp-range,.fp-ctl,.fp-tools') ? null : e.clientY; });
    fp.addEventListener('pointerup', e => { if (y0 != null && e.clientY - y0 > 90) this.fpClose(); y0 = null; });
    document.body.append(fp); this.fp = fp; return fp;
  },
  fpOpen() { this.fpBuild(); this.fp.classList.add('on'); document.documentElement.classList.add('fp-open'); this.fpRender(); this.tick(); },
  fpClose() { if (this.fp) this.fp.classList.remove('on'); document.documentElement.classList.remove('fp-open'); },
  fpRender() {
    const fp = this.fp; if (!fp) return;
    const rec = Book.rec || {};
    fp.querySelector('.fp-play').replaceChildren(icon(this.playing ? 'pause' : 'playF'));
    fp.querySelector('.fp-book').textContent = rec.title || '';
    fp.querySelector('.fp-chl').textContent = this.chLabel();
    fp.querySelector('.fp-chn').textContent = Book.data ? t('fpChOf', { i: Book.ch + 1, n: Book.data.count }) : '';
    fp.querySelector('.fp-speed b').textContent = this.rateTxt();
    const cv = fp.querySelector('.fp-cover'), mc = $('#tts-bar .mp-cover');
    if (this.coverFor !== rec.id) {
      this.coverFor = rec.id; if (this.coverUrl) URL.revokeObjectURL(this.coverUrl); this.coverUrl = rec.cover instanceof Blob ? URL.createObjectURL(rec.cover) : null;
      for (const c of [cv, mc]) { c.replaceChildren(this.coverUrl ? el('img', { src: this.coverUrl, alt: '' }) : el('span', { class: 'fp-nocover', text: (rec.title || '?').slice(0, 1) })); }
    }
  },
  async chapters() {
    if (!Book.data) return;
    const lang = this.lang(), v = this.engineAudio() ? Voices.current(lang, await Voices.list(lang)) : null;
    let pronto = null;
    if (v && v.id.startsWith('a:')) { const x = (await AudioBook.voices(Book.rec)).find(y => y.id === v.id); pronto = x ? new Set(x.chapters) : null; }
    const toc = (Book.data.toc || []).filter(e => e.idx >= 0 && e.idx < Book.data.count);
    const itens = toc.length ? toc : Array.from({ length: Book.data.count }, (_, i) => ({ idx: i, label: t('fpChN', { n: i + 1 }) }));
    Sheets.open({ title: t('fpChapters'), body: b => {
      for (const e of itens) {
        const atual = e.idx === Book.ch, falta = pronto && !pronto.has(e.idx);
        b.append(el('button', { class: 'fp-chrow' + (atual ? ' on' : '') + (falta ? ' off' : ''), onclick: () => { Sheets.close(); this.goChapter(e.idx); } },
          el('span', { class: 'fp-chname', text: /^\d{1,3}\.?$/.test(niceLabel(e.label)) ? t('fpChN', { n: parseInt(niceLabel(e.label)) }) : (niceLabel(e.label) || t('fpChN', { n: e.idx + 1 })) }),
          el('span', { class: 'fp-chst', text: atual ? (this.playing ? t('fpPlaying') : t('fpHere')) : falta ? t('fpNotYet') : '' })));
      }
      setTimeout(() => { const on = b.querySelector('.fp-chrow.on'); if (on) on.scrollIntoView({ block: 'center' }); }, 60);
    } });
  },
  speedSheet() {
    const R = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
    Sheets.open({ title: t('fpSpeed'), center: true, body: b => b.append(el('div', { class: 'fp-grid' }, ...R.map(r => el('button', { class: 'btn' + ((S.ttsRate || 1) === r ? ' primary' : ''), text: String(r).replace('.', ',') + '×', onclick: () => {
      setS('ttsRate', r); if (this.engineAudio() && !(NeuralPlayer.ab && NeuralPlayer.abPhase !== 'main')) NeuralPlayer.rate(r); else if (!this.engineAudio() && this.playing) this.speak();
      Sheets.close(); this.ui();
    } })))) });
  },
  timerSheet() {
    const set = (m, eoc) => { this.sleepEoc = !!eoc; this.sleepAt = m ? Date.now() + m * 60000 : 0; this.sleepMin = m; Sheets.close(); this.tick(); if (m) toast(t('ttsSleepSet', { n: m })); else if (eoc) toast(t('fpEocSet')); };
    Sheets.open({ title: t('fpTimer'), center: true, body: b => b.append(el('div', { class: 'fp-grid' },
      el('button', { class: 'btn' + (!this.sleepAt && !this.sleepEoc ? ' primary' : ''), text: t('fpOff'), onclick: () => set(0) }),
      ...[15, 30, 45, 60].map(m => el('button', { class: 'btn', text: m + ' min', onclick: () => set(m) })),
      el('button', { class: 'btn' + (this.sleepEoc ? ' primary' : ''), text: t('fpEoc'), onclick: () => set(0, true) }))) });
  },
  rateNext() {
    const R = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    const k = R.indexOf(S.ttsRate || 1); setS('ttsRate', R[(k + 1) % R.length]); this.ui();
    if (this.engineAudio()) NeuralPlayer.rate(S.ttsRate); else if (this.playing) this.speak();
  },
  sheet() {
    const wasPlaying = this.playing;
    const s = Sheets.open({
      title: t('ttsTitle'), body: b => {
        const L = el('div', { class: 'list' }), lang = this.lang();
        const engSeg = wSeg([['gemini', t('ttsEngGemini')], ['neural', t('ttsEngNeural')], ['azure', 'Microsoft']], Voices.engine(), x => { setS('ttsEngine', x); NeuralPlayer.stop(); NeuralPlayer.build(); azBox.classList.toggle('hide', x !== 'azure'); gemWrap.classList.toggle('hide', x !== 'gemini'); draw(); this.ui(); }, 'wrap');
        const gemWrap = el('div', { class: Voices.engine() === 'gemini' ? '' : 'hide', style: { marginTop: '10px' } });
        const gemDraw = () => gemWrap.replaceChildren(GemTTS.box(re => { NeuralPlayer.stop(); NeuralPlayer.build(); draw(); if (re) gemDraw(); this.ui(); }));
        gemDraw();
        const azBox = el('div', { class: Voices.engine() === 'azure' ? '' : 'hide', style: { marginTop: '10px' } },
          el('input', { class: 'inp', placeholder: t('azKeyPh'), value: S.azKey || '', oninput: e => setS('azKey', e.target.value.trim()) }),
          el('input', { class: 'inp', style: { marginTop: '6px' }, placeholder: t('azRegionPh'), value: S.azRegion || '', oninput: e => setS('azRegion', e.target.value.trim().toLowerCase()) }),
          el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45, margin: '6px 2px 0' }, text: t('azHelp') }));
        const note = el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45, margin: '8px 2px 0' } });
        const draw = async () => {
          L.replaceChildren(el('p', { class: 'muted', text: t('ttsLoadingList') }));
          note.textContent = { neural: t('ttsNeuralNote'), azure: t('ttsAzureNote'), gemini: t('gemNote'), system: t('ttsTip') }[Voices.engine()];
          if (Voices.engine() === 'system') {
            const vs = this.voices(), cur = this.voice(); L.replaceChildren();
            if (!vs.length) L.append(el('p', { class: 'muted', text: t('ttsNoVoices') }));
            for (const v of vs) {
              const on = cur && v.voiceURI === cur.voiceURI;
              L.append(el('button', { class: 'li' + (on ? ' cur' : ''), onclick: () => { setS('ttsVoice_' + lang, v.voiceURI); this.preview(v); draw(); this.ui(); } },
                icon(on ? 'check' : 'headphones'), el('div', { class: 'lt' }, v.name.replace(/\s*\(.*\)$/, ''), el('small', { text: v.lang }))));
            }
            return;
          }
          const vs = await Voices.list(lang), cur = Voices.current(lang, vs); L.replaceChildren();
          if (!vs.length) L.append(el('p', { class: 'muted', text: t('ttsNoVoices') }));
          for (const v of vs) {
            const on = cur && v.id === cur.id;
            const sm = el('small', { text: v.desc });
            L.append(el('button', { class: 'li' + (on ? ' cur' : ''), onclick: async () => { setS('ttsN_' + Voices.engine() + '_' + lang, v.id); setS('ttsLive_' + lang, !v.id.startsWith('a:')); setS('ttsPicked_' + lang, true); this.vname = v.name; NeuralPlayer.stop(); L.querySelectorAll('.li').forEach(x => x.classList.toggle('cur', x === sm.closest('.li'))); this.ui(); await this.previewN(v, lang, pc => { sm.textContent = pc === -1 ? t('vozWarm') : t('ttsDownloading', { n: Math.max(0, pc) }); }); sm.textContent = v.desc + ' · ' + t('vozHave'); } },
              icon(on ? 'check' : 'headphones'), el('div', { class: 'lt' }, v.name, sm)));
            // is it already on the phone?
            if (Voices.engine() === 'neural' && !v.id.startsWith('a:')) VozPack.ready(v.id[0], v.id.slice(2)).then(ok => { sm.textContent = v.desc + ' · ' + (ok ? t('vozHave') : t('vozGet', { n: VozPack.sizeMB(v.id[0]) })); });
          }
        };
        draw();
        b.append(wGroup(t('ttsEngine'), engSeg, azBox, gemWrap), wGroup(t('ttsVoice') + ' · ' + (lang === 'en' ? 'English' : 'Português'), L, note),
          wGroup(t('ttsSpeed'), wSlider(0.75, 3, 0.05, S.ttsRate || 1, v => { setS('ttsRate', Math.round(v * 100) / 100); NeuralPlayer.rate(S.ttsRate); this.ui(); }, v => (+v).toFixed(2).replace('.', ',') + '×', 'speed')),
          Book.rec && (() => { const d = el('p', { class: 'muted', style: { fontSize: '11.5px', margin: '0 2px 6px' } });
            (async () => { const A = NeuralPlayer.ab; if (!A) return; const k = AudioBook.key(Book.rec) + '/' + NeuralPlayer.voice.slice(2) + '/' + String(A.ch).padStart(3, '0') + '.mp3?v=' + A.dur;
              const g = await AudioBook.cached(k), p = AudioBook.getPos(Book.rec, NeuralPlayer.voice, A.ch);
              d.textContent = t('abDiag', { s: t(A.sync ? 'abYes' : 'abNo'), c: t(g ? 'abYes' : 'abNo'), p: p ? Math.floor(p.t / 60) + ':' + String(Math.round(p.t % 60)).padStart(2, '0') : '–' }) + (A.sync ? '' : ' (' + (Book.rootText || '').length + '/' + A.len + ')'); })().catch(() => { });
            return d; })(),
          Book.rec && el('button', { class: 'btn block', style: { margin: '4px 0 12px' }, text: t('abGetAll'), onclick: async ev => {
            const btn = ev.currentTarget, lang = this.lang(), v = Voices.current(lang, await Voices.list(lang));
            if (!v || !v.id.startsWith('a:')) { toast(t('abGetAllPick'), 5000); return; }
            btn.disabled = true;
            try {
              const n = await AudioBook.downloadAll(Book.rec, v.id, (i, tot) => { btn.textContent = t('abGetAllN', { i, n: tot }); });
              btn.textContent = n < 0 ? t('abGetAllPub') : t('abGetAllDone', { n });
            } catch (e) { btn.disabled = false; btn.textContent = t('abGetAll'); toast(t('abNet'), 5000); }
          } }),
          wGroup(t('annLbl'), wSeg([[1, t('annYes')], [0, t('off')]], S.ttsAnnounce === false ? 0 : 1, x => setS('ttsAnnounce', !!x)), el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45, margin: '8px 2px 0' }, text: t('annNote') })),
          wGroup(t('abMusic'), wSeg([[1, t('abMusicYes')], [0, t('off')]], S.abMusic === false ? 0 : 1, x => setS('abMusic', !!x)), el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45, margin: '8px 2px 0' }, text: t('abMusicNote') })),
          wGroup(t('ttsSleep'), wSeg([[0, t('off')], [15, '15 min'], [30, '30 min'], [60, '60 min']], this.sleepMin || 0, m => { this.sleepMin = m; this.sleepAt = m ? Date.now() + m * 60000 : 0; if (m) toast(t('ttsSleepSet', { n: m })); })),
          wGroup(t('ttsScreen'),
            this.engineAudio() ? el('button', { class: 'btn block primary', style: { marginBottom: '8px' }, onclick: async e => {
              const btn = e.currentTarget; btn.disabled = true;
              try { if (!NeuralPlayer.chunks.length) { this.build(); NeuralPlayer.build(); } const ok = await NeuralPlayer.prepare(p => { btn.textContent = t('ttsPreparingCh', { n: p }); }); btn.textContent = ok ? t('ttsPrepared') : t('ttsPrepFail'); }
              catch (err) { btn.disabled = false; btn.textContent = t('ttsPrepare'); this.fail(err); }
            } }, icon('download'), t('ttsPrepare')) : '',
            el('button', { class: 'btn block', onclick: () => { Sheets.close(s); this.dark(true); } }, icon('moon'), t('ttsDark')),
            el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45, margin: '8px 2px 0' }, text: this.engineAudio() ? t('ttsLockNoteN') : t('ttsLockNote') }),
            this.diagEl()));
      },
      onClose: () => { if (wasPlaying && !this.playing && this.open) this.play(); },
    });
    if (this.playing) this.pause();
  },
  async previewN(v, lang, onPct) {
    NeuralPlayer.init(); this.unlock();
    if (v.id.startsWith('a:')) { try { const m = await AudioBook.chapter(Book.rec, v.id.slice(2), Book.ch); const a = NeuralPlayer.audio; NeuralPlayer.silent = false; a.src = m.url; a.playbackRate = S.ttsRate || 1; a.play().catch(() => { }); setTimeout(() => { if (!TTS.playing) a.pause(); }, 9000); } catch (e) { this.fail(new Error(t('abNet'))); } return; }
    const tx = lang === 'en' ? 'Hello! This is the voice that will read your books.' : 'Olá! Esta é a voz que vai ler os seus livros.';
    try { this.loading(0); const b = await Voices.synth(tx, v.id, lang, pc => { this.loading(pc); onPct && onPct(pc); }); this.loading(null); const a = NeuralPlayer.audio; NeuralPlayer.silent = false; a.src = URL.createObjectURL(b); a.playbackRate = S.ttsRate || 1; a.play().catch(() => { }); }
    catch (e) { this.loading(null); this.fail(e); }
  },
  preview(v) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(this.lang() === 'en' ? 'Hello! This is the voice that will read your books.' : 'Olá! Esta é a voz que vai ler os seus livros.');
    u.voice = v; u.lang = v.lang; u.rate = S.ttsRate || 1; speechSynthesis.speak(u);
  },
  init() {
    if (this.supported()) {
      speechSynthesis.getVoices();
      speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', () => this.ui());
    }
    $('#b-tts').onclick = () => this.open ? this.toggle() : this.start();
    // big, easy "Listen" button (the small headphones up top were hard to hit)
    const bl = $('#b-listen'); bl.append(el('span', { text: t('abOuvir') })); bl.onclick = () => this.open ? this.toggle() : this.start();
    const bar = $('#tts-bar');
    bar.querySelector('.mp-30').innerHTML = '<svg viewBox="0 0 32 32" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9a10 10 0 1 1-2.2 10"/><path d="M9 4v5H4"/><text x="16" y="20.5" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor" stroke="none" font-family="system-ui">30</text></svg>';
    bar.querySelector('.mp-30').onclick = () => this.skip30(-1);
    bar.querySelector('.tplay').onclick = () => this.toggle();
    bar.querySelector('.mp-main').onclick = () => this.fpOpen();
    bar.querySelector('.tx').onclick = () => { this.fpClose(); this.stop(); };
    // swipe the mini player up to open it big
    let y0 = null; bar.addEventListener('pointerdown', e => { y0 = e.clientY; }); bar.addEventListener('pointerup', e => { if (y0 != null && y0 - e.clientY > 40) this.fpOpen(); y0 = null; });
    setInterval(() => { if (this.open) this.tick(); }, 500);
    // chapter name up top: tap to change chapter (like Audible / Apple Books)
    const h1 = $('#b-h1'); h1.classList.add('chbtn'); h1.onclick = e => { e.stopPropagation(); this.chapters(); };
    const bt = $('#b-title'); bt.onclick = () => this.chapters();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.playing) { this.keepAwake(true); if (!speechSynthesis.speaking) this.speak(); } });
  },
};
