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
    this.open = true; $('#v-book').classList.add('tts-on'); this.ui();
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
  loading(pc) {
    const tv = $('#tts-bar .tvoice'); if (!tv) return;
    if (pc == null) { this.ui(); return; }
    tv.textContent = pc === -1 ? t('vozWarm') : pc >= 0 && pc < 100 && pc !== 0 ? t('ttsDownloading', { n: pc }) : t('ttsPreparing');
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
    $('#v-book').classList.remove('tts-on');
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
  async nextChapter() {
    if (Book.ch >= Book.data.count - 1) { this.pause(); toast(t('ttsEnd')); return; }
    await Book.turnChapter(Book.ch + 1, { frac: 0 }, 1);
    this.build(); this.i = 0;
    if (this.engineAudio()) { NeuralPlayer.build(); if (this.playing) { const lang = this.lang(), list = await Voices.list(lang), v = Voices.current(lang, list); if (v) NeuralPlayer.play(0, v.id, lang); } return; }
    if (this.playing) this.speak();
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
    bar.querySelector('.trate').textContent = (S.ttsRate || 1).toFixed(S.ttsRate % 1 ? (S.ttsRate * 10 % 1 ? 2 : 1) : 0).replace('.', ',') + '×';
    const v = this.engineAudio() ? null : this.voice(); bar.querySelector('.tvoice').textContent = this.engineAudio() ? (this.vname || t('ttsVoice')) : (v ? v.name.replace(/\s*\(.*\)$/, '') : t('ttsVoice'));
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
        const engSeg = wSeg([['neural', t('ttsEngNeural')], ['azure', 'Microsoft']], Voices.engine(), x => { setS('ttsEngine', x); NeuralPlayer.stop(); azBox.classList.toggle('hide', x !== 'azure'); draw(); this.ui(); }, 'wrap');
        const azBox = el('div', { class: Voices.engine() === 'azure' ? '' : 'hide', style: { marginTop: '10px' } },
          el('input', { class: 'inp', placeholder: t('azKeyPh'), value: S.azKey || '', oninput: e => setS('azKey', e.target.value.trim()) }),
          el('input', { class: 'inp', style: { marginTop: '6px' }, placeholder: t('azRegionPh'), value: S.azRegion || '', oninput: e => setS('azRegion', e.target.value.trim().toLowerCase()) }),
          el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45, margin: '6px 2px 0' }, text: t('azHelp') }));
        const note = el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45, margin: '8px 2px 0' } });
        const draw = async () => {
          L.replaceChildren(el('p', { class: 'muted', text: t('ttsLoadingList') }));
          note.textContent = { neural: t('ttsNeuralNote'), azure: t('ttsAzureNote'), system: t('ttsTip') }[Voices.engine()];
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
        b.append(wGroup(t('ttsEngine'), engSeg, azBox), wGroup(t('ttsVoice') + ' · ' + (lang === 'en' ? 'English' : 'Português'), L, note),
          wGroup(t('ttsSpeed'), wSlider(0.75, 3, 0.05, S.ttsRate || 1, v => { setS('ttsRate', Math.round(v * 100) / 100); NeuralPlayer.rate(S.ttsRate); this.ui(); }, v => (+v).toFixed(2).replace('.', ',') + '×', 'speed')),
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
    const bar = $('#tts-bar');
    bar.querySelector('.tback').onclick = () => this.skip(-1);
    bar.querySelector('.tfwd').onclick = () => this.skip(1);
    bar.querySelector('.tplay').onclick = () => this.toggle();
    bar.querySelector('.trate').onclick = () => this.rateNext();
    bar.querySelector('.tvoice').onclick = () => this.sheet();
    bar.querySelector('.tmoon').onclick = () => this.dark(true);
    bar.querySelector('.tx').onclick = () => this.stop();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.playing) { this.keepAwake(true); if (!speechSynthesis.speaking) this.speak(); } });
  },
};
