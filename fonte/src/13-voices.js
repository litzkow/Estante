/* ================= natural voices: free neural voices that run on the phone, or Microsoft with a key =================
   neural  → English: Kokoro (kokoro-js), Portuguese: Piper (vits-web). Both run on the device, free, no limit.
   azure   → Microsoft Azure Speech with the user's own key (official free tier, then paid).
   system  → the phone's built-in voice (works everywhere, sounds robotic).
   Audio is generated per passage, cached on the device and played through an <audio> element,
   so it keeps playing with the screen locked and shows on the lock screen. */
const KOKORO_VOICES = [
  ['af_heart', 'Heart', 'f', 'ttsVWarm'], ['af_bella', 'Bella', 'f', 'ttsVExpressive'], ['af_nicole', 'Nicole', 'f', 'ttsVCalm'],
  ['am_michael', 'Michael', 'm', 'ttsVCalm'], ['am_fenrir', 'Fenrir', 'm', 'ttsVDeep'], ['am_puck', 'Puck', 'm', 'ttsVExpressive'],
  ['bf_emma', 'Emma', 'f', 'ttsVBritish'], ['bm_george', 'George', 'm', 'ttsVBritishDeep'], ['bm_fable', 'Fable', 'm', 'ttsVStory'],
];
// fast voices (Piper), kept inside the app too
const PIPER_VOICES = {
  pt: [['pt_BR-faber-medium', 'Faber', 'm', 'ttsVCalm'], ['pt_BR-cadu-medium', 'Cadu', 'm', 'ttsVWarm'], ['pt_BR-jeff-medium', 'Jeff', 'm', 'ttsVExpressive']],
  en: [['en_US-lessac-medium', 'Lessac', 'f', 'ttsVCalm'], ['en_US-ryan-medium', 'Ryan', 'm', 'ttsVDeep'], ['en_GB-alba-medium', 'Alba', 'f', 'ttsVBritish'], ['en_US-hfc_female-medium', 'Hannah', 'f', 'ttsVWarm']],
};
const AZURE_VOICES = {
  pt: [['pt-BR-FranciscaNeural', 'Francisca', 'f'], ['pt-BR-AntonioNeural', 'Antonio', 'm'], ['pt-BR-ThalitaMultilingualNeural', 'Thalita', 'f']],
  en: [['en-US-AvaNeural', 'Ava', 'f'], ['en-US-AndrewNeural', 'Andrew', 'm'], ['en-US-JennyNeural', 'Jenny', 'f'], ['en-US-GuyNeural', 'Guy', 'm'], ['en-GB-SoniaNeural', 'Sonia', 'f'], ['en-GB-RyanNeural', 'Ryan', 'm']],
};
const Voices = {
  warm: {},
  engine() { return S.ttsEngine === 'azure' ? 'azure' : 'neural'; },
  // voices to offer for this book's language (only what is really available)
  async list(lang) {
    const e = this.engine();
    if (e === 'azure') return (AZURE_VOICES[lang] || AZURE_VOICES.pt).map(([id, name, g]) => ({ id, name, desc: t(g === 'f' ? 'ttsFemale' : 'ttsMale') + ' · Microsoft' }));
    if (lang === 'en') return KOKORO_VOICES.map(([id, name, g, d]) => ({ id: 'k:' + id, name, desc: t(g === 'f' ? 'ttsFemale' : 'ttsMale') + ' · ' + t(d) + ' · ' + t('vozNatural') }))
      .concat(PIPER_VOICES.en.map(([id, name, g, d]) => ({ id: 'p:' + id, name, desc: t(g === 'f' ? 'ttsFemale' : 'ttsMale') + ' · ' + t(d) + ' · ' + t('vozFast') })));
    return PIPER_VOICES.pt.map(([id, name, g, d]) => ({ id: 'p:' + id, name, desc: t(g === 'f' ? 'ttsFemale' : 'ttsMale') + ' · ' + t(d) }));
  },
  current(lang, list) {
    const want = S['ttsN_' + this.engine() + '_' + lang];
    return (list || []).find(v => v.id === want) || (list || [])[0] || null;
  },
  // text → audio blob (wav or mp3)
  async synth(text, voiceId, lang, progress) {
    const e = this.engine();
    lang = (lang || 'pt').slice(0, 2);
    // a voice that doesn't fit the engine or the language is replaced by that language's chosen voice
    const okId = id => typeof id === 'string' && (e === 'azure' ? id.toLowerCase().startsWith(lang) : lang === 'en' ? (id.startsWith('k:') || /^p:en_/.test(id)) : /^p:pt_/.test(id));
    if (!okId(voiceId)) { const v = this.current(lang, await this.list(lang)); if (!v) throw new Error(t('ttsNoVoices')); voiceId = v.id; }
    if (e === 'azure') {
      const key = S.azKey, region = S.azRegion || 'eastus';
      if (!key) throw new Error(t('azNoKey'));
      const esc = s => s.replace(/[<&>"']/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
      const loc = voiceId.split('-').slice(0, 2).join('-');
      const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' },
        body: `<speak version="1.0" xml:lang="${loc}"><voice name="${voiceId}">${esc(text)}</voice></speak>`,
      });
      if (r.status === 401 || r.status === 403) throw new Error(t('azBadKey'));
      if (r.status === 429) throw new Error(t('azQuota'));
      if (!r.ok) throw new Error('Microsoft: ' + r.status);
      return r.blob();
    }
    // natural voices: downloaded once into the app, then generated in their own thread
    const kind = voiceId[0], vid = voiceId.slice(2);
    if (!(await VozPack.ready(kind, vid))) await VozPack.get(kind, vid, progress);
    const first = !this.warm[voiceId]; this.warm[voiceId] = true;
    if (progress && first) progress(-1);
    return VozWorker.synth(voiceId.startsWith('k:') ? 'kokoro' : 'piper', text, vid, first);
  },
};
function wavBlob(f32, rate) {
  const n = f32.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, f32[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

/* plays passages one after another, generating ahead and caching on the device */
const NeuralPlayer = {
  audio: null, chunks: [], k: 0, ahead: new Map(), urls: [], token: 0, busy: false, behind: 0,
  init() {
    if (this.audio) return;
    const a = this.audio = new Audio(); a.preload = 'auto'; a.setAttribute('playsinline', ''); a.preservesPitch = true;
    const done = () => { if (this.silent) { this.silent = false; return; } if (TTS.playing && TTS.engineAudio() && !this.loadingNow) this.next(); };
    a.addEventListener('ended', done);
    a.addEventListener('error', () => { if (this.silent || !a.getAttribute('src')) { this.silent = false; return; } done(); });
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      try {
        ms.setActionHandler('play', () => TTS.play()); ms.setActionHandler('pause', () => TTS.pause());
        ms.setActionHandler('seekbackward', () => TTS.skip(-1)); ms.setActionHandler('seekforward', () => TTS.skip(1));
        ms.setActionHandler('previoustrack', () => TTS.skip(-1)); ms.setActionHandler('nexttrack', () => TTS.skip(1));
      } catch (e) { }
    }
  },
  // passages of whole sentences, up to ~220 characters, never mixing languages (the voice model reads short input fully)
  build() {
    this.chunks = []; let cur = null;
    TTS.segs.forEach((s, i) => {
      if (cur && cur.lang === s.lang && cur.t.length + s.t.length < 220 && s.s - cur.e < 4) { cur.t += ' ' + s.t; cur.e = s.e; cur.last = i; }
      else { cur = { s: s.s, e: s.e, t: s.t, first: i, last: i, lang: s.lang }; this.chunks.push(cur); }
    });
    this.ahead.clear(); for (const u of this.urls) URL.revokeObjectURL(u); this.urls = [];
    if (this.long) { URL.revokeObjectURL(this.long.url); this.long = null; if (this.audio) this.audio.ontimeupdate = null; }
  },
  // the voice for a passage: the listener's choice for that language
  async voiceFor(lang) {
    this.vcache = this.vcache || {};
    const k = Voices.engine() + ':' + lang + ':' + (S['ttsN_' + Voices.engine() + '_' + lang] || '');
    if (!this.vcache[k]) { const v = Voices.current(lang, await Voices.list(lang)); this.vcache[k] = v ? v.id : null; }
    return this.vcache[k];
  },
  key(c, voice) { let h = 0; const s = voice + '|' + c.t; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'au:' + Voices.engine() + ':' + h; },
  async get(i, voice, lang, show) {
    const c = this.chunks[i]; if (!c) return null;
    if (this.ahead.has(i)) return this.ahead.get(i);
    const p = (async () => {
      lang = c.lang || lang || TTS.lang();
      if (lang !== this.lang || !voice) voice = await this.voiceFor(lang);
      const k = this.key(c, voice);
      let b = await DB.get('kv', k).catch(() => null);
      if (!b) { b = await Voices.synth(c.t, voice, lang, show ? pc => TTS.loading(pc) : null); DB.put('kv', k, b).catch(() => { }); }
      return b;
    })();
    this.ahead.set(i, p); p.catch(() => this.ahead.delete(i));
    return p;
  },
  async play(fromSeg, voice, lang) {
    this.init();
    const tok = ++this.token; this.voice = voice; this.lang = lang;
    this.k = Math.max(0, this.chunks.findIndex(c => c.last >= fromSeg));
    await this.start(tok);
  },
  async start(tok) {
    const c = this.chunks[this.k];
    if (!c) return TTS.nextChapter();
    TTS.i = c.first; TTS.follow(c);
    let b;
    if (this.long) return this.playLong(tok);
    if (!this.voice) { this.lang = this.lang || TTS.lang(); this.voice = await this.voiceFor(this.lang); }
    this.loadingNow = true;
    const waitFrom = Date.now(), wasAhead = this.ahead.has(this.k);
    try { TTS.loading(0); b = await this.get(this.k, this.voice, this.lang, true); }
    catch (e) { this.loadingNow = false; TTS.loading(null); if (tok === this.token) TTS.fail(e); return; }
    this.loadingNow = false;
    TTS.loading(null);
    // the phone is generating slower than it reads: say so once, with what helps
    if (wasAhead && this.k > 0 && Date.now() - waitFrom > 2500 && ++this.behind === 2 && !this.toldBehind) { this.toldBehind = true; toast(t('vozBehind'), 7000); }
    if (tok !== this.token || !TTS.playing) return;
    const u = URL.createObjectURL(b); this.urls.push(u); if (this.urls.length > 6) URL.revokeObjectURL(this.urls.shift());
    const a = this.audio; a.src = u; a.playbackRate = S.ttsRate || 1;
    try { await a.play(); } catch (e) { TTS.pause(); return; }
    this.meta();
    // generate the next passages while this one plays (one at a time: the phone does the work)
    for (let j = 1; j <= 6; j++) { if (this.k + j < this.chunks.length) { try { await this.get(this.k + j, this.voice, this.lang); } catch (e) { break; } } if (tok !== this.token) return; }
  },
  // whole chapter prepared ahead: one long audio file plays to the end even with the screen locked
  async prepare(onProgress) {
    const lang = TTS.lang(), list = await Voices.list(lang), v = Voices.current(lang, list); if (!v) throw new Error(t('ttsNoVoices'));
    this.voice = v.id; this.lang = lang;
    const from = this.k, blobs = [];
    for (let i = from; i < this.chunks.length; i++) { blobs.push(await this.get(i, v.id, lang, false)); await new Promise(r => setTimeout(r, 0)); onProgress && onProgress(Math.round((i - from + 1) / (this.chunks.length - from) * 100)); }
    const cat = await wavConcat(blobs); if (!cat) return false;
    if (this.long) URL.revokeObjectURL(this.long.url);
    this.long = { url: URL.createObjectURL(cat.blob), starts: cat.starts, from };
    return true;
  },
  async playLong(tok) {
    const L = this.long, a = this.audio;
    if (a.src !== L.url) { a.src = L.url; }
    const k0 = Math.max(0, this.k - L.from); a.currentTime = L.starts[k0] || 0; a.playbackRate = S.ttsRate || 1;
    a.ontimeupdate = () => { if (!this.long) return; let j = 0; while (j + 1 < L.starts.length && L.starts[j + 1] <= a.currentTime) j++; if (L.from + j !== this.k) { this.k = L.from + j; const c = this.chunks[this.k]; if (c) { TTS.i = c.first; if (document.visibilityState === 'visible') TTS.follow(c); } } };
    try { await a.play(); } catch (e) { TTS.pause(); return; }
    this.meta();
  },
  next() {
    if (this.long && this.audio.src === this.long.url) { this.long = null; this.audio.ontimeupdate = null; this.k = this.chunks.length; return TTS.nextChapter(); }
    if (TTS.sleepAt && Date.now() > TTS.sleepAt) { TTS.sleepAt = 0; TTS.pause(); toast(t('ttsSlept')); return; }
    this.k++; this.start(++this.token);
  },
  seek(d) { this.k = clamp(this.k + d, 0, Math.max(0, this.chunks.length - 1)); if (this.long && this.k < this.long.from) { this.long = null; this.audio.ontimeupdate = null; } if (TTS.playing) this.start(++this.token); else { const c = this.chunks[this.k]; if (c) { TTS.i = c.first; TTS.follow(c); } } },
  pause() { this.token++; if (this.audio) this.audio.pause(); },
  resume() { if (this.long && this.audio.src !== this.long.url) return false; if (this.audio && this.audio.src && this.audio.currentTime > 0 && !this.audio.ended) { this.audio.play().catch(() => { }); this.meta(); return true; } return false; },
  stop() { this.token++; if (this.audio) { this.audio.pause(); this.audio.ontimeupdate = null; this.audio.removeAttribute('src'); } this.ahead.clear(); if (this.long) { URL.revokeObjectURL(this.long.url); this.long = null; } },
  rate(r) { if (this.audio) this.audio.playbackRate = r; },
  meta() {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    try {
      const rec = Book.rec || {}; const art = [];
      if (rec.cover instanceof Blob) { if (!this.coverUrl || this.coverFor !== rec.id) { this.coverUrl = URL.createObjectURL(rec.cover); this.coverFor = rec.id; } art.push({ src: this.coverUrl, sizes: '512x512', type: rec.cover.type || 'image/jpeg' }); }
      navigator.mediaSession.metadata = new MediaMetadata({ title: niceLabel(Book.tocLabel ? Book.tocLabel(Book.ch) : '') || rec.title, artist: rec.author || '', album: rec.title || '', artwork: art });
    } catch (e) { }
  },
};

// join WAV passages into one file (same voice → same format); returns start time of each passage
async function wavConcat(blobs) {
  const parts = []; let rate = 0, ch = 1, bits = 16, total = 0; const starts = [];
  for (const b of blobs) {
    const buf = await b.arrayBuffer(), v = new DataView(buf);
    if (buf.byteLength < 44 || String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)) !== 'RIFF') return null;
    let o = 12, fmt = null, data = null;
    while (o + 8 <= buf.byteLength) {
      const id = String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3)), sz = v.getUint32(o + 4, true);
      if (id === 'fmt ') fmt = { ch: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) };
      if (id === 'data') { data = new Uint8Array(buf, o + 8, Math.min(sz, buf.byteLength - o - 8)); break; }
      o += 8 + sz + (sz & 1);
    }
    if (!fmt || !data) return null;
    if (!rate) { rate = fmt.rate; ch = fmt.ch; bits = fmt.bits; } else if (fmt.rate !== rate || fmt.ch !== ch || fmt.bits !== bits) return null;
    starts.push(total / (rate * ch * bits / 8)); parts.push(data); total += data.length;
  }
  const h = new DataView(new ArrayBuffer(44)), w = (o, s) => { for (let i = 0; i < 4; i++) h.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); h.setUint32(4, 36 + total, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, ch, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * ch * bits / 8, true); h.setUint16(32, ch * bits / 8, true); h.setUint16(34, bits, true); w(36, 'data'); h.setUint32(40, total, true);
  return { blob: new Blob([h.buffer, ...parts], { type: 'audio/wav' }), starts };
}
