/* ================= ready-made audiobooks =================
   The whole book is narrated ahead of time (on GitHub, with the natural voices) into one MP3 per chapter,
   plus the time of every sentence. The phone only plays it: no waiting, no pauses, screen locked like Spotify,
   and the text follows the voice. Books in the app's site: audio/<book>/<voice>/. */
const AB_VOICES = {
  af_heart: ['Heart', 'f', 'en'], bm_george: ['George', 'm', 'en'], bf_emma: ['Emma', 'f', 'en'], am_michael: ['Michael', 'm', 'en'], bm_fable: ['Fable', 'm', 'en'],
  pf_dora: ['Dora', 'f', 'pt'], pm_alex: ['Alex', 'm', 'pt'], pm_santa: ['Santa', 'm', 'pt'],
};
// voice id → [name, gender, language]; Google voices: en-GB-Chirp3-HD-Charon
const CHIRP_F = /^(Achernar|Aoede|Autonoe|Callirrhoe|Despina|Erinome|Gacrux|Kore|Laomedeia|Leda|Pulcherrima|Sulafat|Vindemiatrix|Zephyr)$/;
function abVoice(v) {
  if (AB_VOICES[v]) return AB_VOICES[v];
  const m = /^([a-z]{2})-[A-Z]{2}-Chirp3-HD-(\w+)$/.exec(v);
  if (m) return [m[2], CHIRP_F.test(m[2]) ? 'f' : 'm', m[1], true];
  return [v, '', ''];
}
const AudioBook = {
  idx: null, idxAt: 0, maps: new Map(),
  base() { return /github\.io$/.test(location.hostname) ? new URL('audio/', location.href).href : (window.AUDIO_BASE || 'https://litzkow.github.io/Estante/audio/'); },
  // books that came with the app are known by file name; your own books by their fingerprint (same on every phone)
  key(rec) {
    if (!rec) return '';
    if (!rec.fileOf && rec.fname && (S.starterGot || []).includes(rec.fname)) return rec.fname.replace(/\.[a-z0-9]+$/i, '');
    return (rec.fp || rec.id || '').replace(/[^a-z0-9]+/gi, '-');
  },
  // the app's site (books that came with it) + the family's private repository (your own books)
  async index() {
    if (this.idx && Date.now() - this.idxAt < 10 * 60000) return this.idx;
    const idx = {};
    try { const r = await fetch(this.base() + 'index.json', { cache: 'no-cache' }); if (r.ok) for (const [k, v] of Object.entries(await r.json())) idx[k] = Object.assign(v, { src: 'pub' }); } catch (e) { }
    if (Family.on) { try { const r = await Family.api(Family.repo() + '/contents/audio/index.json', { raw: true, ok404: true }); if (r.ok) for (const [k, v] of Object.entries(await r.json())) idx[k] = Object.assign(v, { src: 'priv' }); } catch (e) { } }
    if (Object.keys(idx).length) { this.idx = idx; this.idxAt = Date.now(); DB.put('kv', 'ab:index', idx).catch(() => { }); }
    else this.idx = (await DB.get('kv', 'ab:index').catch(() => null)) || {};
    return this.idx;
  },
  // narrated voices ready for this book
  async voices(rec) {
    const e = (await this.index())[this.key(rec)]; if (!e) return [];
    // the most natural (Google) first
    return Object.keys(e.voices || {}).map(v => { const x = abVoice(v); return { id: 'a:' + v, name: x[0], g: x[1], lang: x[2], hd: !!x[3], chapters: e.voices[v].chapters || [] }; }).sort((a, b) => b.hd - a.hd);
  },
  async has(rec, voice, ch) { return (await this.voices(rec)).some(v => v.id === voice && v.chapters.includes(ch)); },
  async src(rec) { const e = (await this.index())[this.key(rec)]; return e ? e.src : 'pub'; },
  async getFile(rec, path, asJson) {
    if ((await this.src(rec)) === 'priv') {
      const r = await Family.api(Family.repo() + '/contents/audio/' + path, { raw: true });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // the iPhone only plays a downloaded file when it's labeled as MP3
      return asJson ? r.json() : URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: 'audio/mpeg' }));
    }
    if (!asJson) return this.base() + path;
    const r = await fetch(this.base() + path); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
  },
  async chapter(rec, voice, ch) {
    const k = this.key(rec) + '/' + voice + '/' + String(ch).padStart(3, '0');
    if (!this.maps.has(k)) this.maps.set(k, (async () => { const m = await this.getFile(rec, k + '.json', true); m.url = await this.getFile(rec, k + '.mp3', false); return m; })());
    try { const m = await this.maps.get(k); return { url: m.url, times: m.times || [], dur: m.dur, len: m.len }; }
    catch (e) { this.maps.delete(k); throw e; }
  },
  // the next chapter is fetched while this one plays, so the change is instant (even with the screen locked)
  prefetch(rec, voice, ch) { this.has(rec, 'a:' + voice, ch).then(ok => { if (ok) this.chapter(rec, voice, ch).catch(() => { }); }); if (this.maps.size > 6) { const [k0, p0] = this.maps.entries().next().value; this.maps.delete(k0); p0.then(m => { if (m.url.startsWith('blob:')) URL.revokeObjectURL(m.url); }).catch(() => { }); } },
  // export what the narrator needs: each chapter's sentences exactly as the app shows them
  async exportBook() {
    const out = { title: Book.rec.title, key: this.key(Book.rec), lang: (Book.flow.lang || '').slice(0, 2), chapters: [] };
    for (let i = 0; i < Book.data.count; i++) {
      await Book.render(i, { frac: 0 }); TTS.build();
      out.chapters.push({ i, label: Book.tocLabel ? Book.tocLabel(i) : '', len: (Book.rootText || '').length, segs: TTS.segs.map(s => [s.s, s.e, s.t, s.lang, s.blk, s.h ? 1 : 0]) });
    }
    return out;
  },
};
