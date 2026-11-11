/* ================= read aloud (text to speech) ================= */
const TTS = {
  playing: false, open: false, segs: [], i: 0, u: null, wake: null, sleepAt: 0,
  supported() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; },
  lang() { return ((Book.flow && Book.flow.lang) || 'pt').slice(0, 2).toLowerCase(); },
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
    const txt = Book.rootText;
    for (const bl of blocks) {
      const t0 = txt.slice(bl.s, bl.e); if (!t0.trim()) continue;
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
  push(s, e) { const t = Book.rootText.slice(s, e); if (/[\p{L}\p{N}]/u.test(t)) this.segs.push({ s, e, t: t.replace(/\s+/g, ' ').trim() }); },
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
  start() {
    if (!this.supported()) { toast(t('ttsNo')); return; }
    this.open = true; $('#v-book').classList.add('tts-on'); this.ui();
    this.build();
    const off = Book.curOff || 0;
    this.i = Math.max(0, this.segs.findIndex(s => s.e > off));
    this.play();
  },
  play() {
    this.playing = true; this.keepAwake(true); this.ui(); this.speak();
  },
  pause() {
    this.playing = false; this.u = null; speechSynthesis.cancel(); this.keepAwake(false); this.ui();
  },
  toggle() { this.playing ? this.pause() : this.play(); },
  skip(d) {
    this.i = clamp(this.i + d, 0, Math.max(0, this.segs.length - 1));
    if (this.playing) this.speak(); else this.follow();
  },
  stop() {
    if (!this.open) return;
    this.playing = false; this.open = false; this.u = null;
    try { speechSynthesis.cancel(); } catch (e) { }
    this.mark(null); this.keepAwake(false); this.dark(false); this.sleepAt = 0;
    $('#v-book').classList.remove('tts-on');
  },
  follow() {
    const seg = this.segs[this.i]; this.mark(seg);
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
    const v = this.voice(); bar.querySelector('.tvoice').textContent = v ? v.name.replace(/\s*\(.*\)$/, '') : t('ttsVoice');
  },
  rateNext() {
    const R = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
    const k = R.indexOf(S.ttsRate || 1); setS('ttsRate', R[(k + 1) % R.length]); this.ui();
    if (this.playing) this.speak();
  },
  sheet() {
    const wasPlaying = this.playing;
    const s = Sheets.open({
      title: t('ttsTitle'), body: b => {
        const vs = this.voices(), cur = this.voice();
        const L = el('div', { class: 'list' });
        const draw = () => {
          L.replaceChildren();
          if (!vs.length) L.append(el('p', { class: 'muted', text: t('ttsNoVoices') }));
          for (const v of vs) {
            const on = cur2() && v.voiceURI === cur2().voiceURI;
            const q = /premium/i.test(v.name) ? 'Premium' : /enhanced|aprimorad|melhorad|natural|neural/i.test(v.name) ? t('ttsEnh') : '';
            L.append(el('button', { class: 'li' + (on ? ' cur' : ''), onclick: () => { setS('ttsVoice_' + this.lang(), v.voiceURI); this.preview(v); draw(); this.ui(); } },
              icon(on ? 'check' : 'headphones'), el('div', { class: 'lt' }, v.name.replace(/\s*\(.*\)$/, ''), el('small', { text: [v.lang, q].filter(Boolean).join(' · ') }))));
          }
        };
        const cur2 = () => this.voice();
        draw();
        b.append(wGroup(t('ttsVoice'), L,
          el('div', { class: 'banner', style: { marginTop: '10px' } }, icon('info'), el('div', { text: t('ttsTip') }))),
          wGroup(t('ttsSpeed'), wSlider(0.6, 2, 0.05, S.ttsRate || 1, v => { setS('ttsRate', Math.round(v * 100) / 100); this.ui(); }, v => (+v).toFixed(2).replace('.', ',') + '×', 'speed')),
          wGroup(t('ttsSleep'), wSeg([[0, t('off')], [15, '15 min'], [30, '30 min'], [60, '60 min']], this.sleepMin || 0, m => { this.sleepMin = m; this.sleepAt = m ? Date.now() + m * 60000 : 0; if (m) toast(t('ttsSleepSet', { n: m })); })),
          wGroup(t('ttsScreen'), el('button', { class: 'btn block', onclick: () => { Sheets.close(s); this.dark(true); } }, icon('moon'), t('ttsDark')),
            el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45, margin: '8px 2px 0' }, text: t('ttsLockNote') })));
      },
      onClose: () => { if (wasPlaying && !this.playing && this.open) this.play(); },
    });
    if (this.playing) this.pause();
  },
  preview(v) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(this.lang() === 'en' ? 'Hello! This is the voice that will read your books.' : 'Olá! Esta é a voz que vai ler os seus livros.');
    u.voice = v; u.lang = v.lang; u.rate = S.ttsRate || 1; speechSynthesis.speak(u);
  },
  init() {
    if (!this.supported()) { $('#b-tts').classList.add('hide'); return; }
    speechSynthesis.getVoices();
    speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', () => this.ui());
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
