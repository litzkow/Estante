/* ================= ready-made audiobooks =================
   The whole book is narrated ahead of time (on GitHub, with the natural voices) into one MP3 per chapter,
   plus the time of every sentence. The phone only plays it: no waiting, no pauses, screen locked like Spotify,
   and the text follows the voice. Books in the app's site: audio/<book>/<voice>/. */
const AB_VOICES = {
  af_heart: ['Heart', 'f', 'en'], bm_george: ['George', 'm', 'en'], bf_emma: ['Emma', 'f', 'en'], am_michael: ['Michael', 'm', 'en'], bm_fable: ['Fable', 'm', 'en'],
  pf_dora: ['Dora', 'f', 'pt'], pm_alex: ['Alex', 'm', 'pt'], pm_santa: ['Santa', 'm', 'pt'],
};
const AudioBook = {
  idx: null, idxAt: 0, maps: new Map(),
  base() { return /github\.io$/.test(location.hostname) ? new URL('audio/', location.href).href : (window.AUDIO_BASE || 'https://litzkow.github.io/Estante/audio/'); },
  key(rec) { return rec && rec.fname ? rec.fname.replace(/\.[a-z0-9]+$/i, '') : ''; },
  async index() {
    if (this.idx && Date.now() - this.idxAt < 10 * 60000) return this.idx;
    try { const r = await fetch(this.base() + 'index.json', { cache: 'no-cache' }); if (r.ok) { this.idx = await r.json(); this.idxAt = Date.now(); DB.put('kv', 'ab:index', this.idx).catch(() => { }); } } catch (e) { }
    if (!this.idx) this.idx = (await DB.get('kv', 'ab:index').catch(() => null)) || {};
    return this.idx;
  },
  // narrated voices ready for this book
  async voices(rec) {
    const e = (await this.index())[this.key(rec)]; if (!e) return [];
    return Object.keys(e.voices || {}).map(v => ({ id: 'a:' + v, name: (AB_VOICES[v] || [v])[0], g: (AB_VOICES[v] || [])[1], chapters: e.voices[v].chapters || [] }));
  },
  async has(rec, voice, ch) { return (await this.voices(rec)).some(v => v.id === voice && v.chapters.includes(ch)); },
  async chapter(rec, voice, ch) {
    const k = this.key(rec) + '/' + voice + '/' + String(ch).padStart(3, '0');
    if (!this.maps.has(k)) this.maps.set(k, fetch(this.base() + k + '.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }));
    try { const m = await this.maps.get(k); return { url: this.base() + k + '.mp3', times: m.times || [], dur: m.dur, len: m.len }; }
    catch (e) { this.maps.delete(k); throw e; }
  },
  // export what the narrator needs: each chapter's sentences exactly as the app shows them
  async exportBook() {
    const out = { title: Book.rec.title, key: this.key(Book.rec), lang: (Book.flow.lang || '').slice(0, 2), chapters: [] };
    for (let i = 0; i < Book.data.count; i++) {
      await Book.render(i, { frac: 0 }); TTS.build();
      out.chapters.push({ i, label: Book.tocLabel ? Book.tocLabel(i) : '', len: (Book.rootText || '').length, segs: TTS.segs.map(s => [s.s, s.e, s.t, s.lang]) });
    }
    return out;
  },
};
