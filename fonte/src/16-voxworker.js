/* ================= the voice engine, in its own thread =================
   Everything the voices need (models, voices, pronunciation, runtime) lives in the app's own site
   (vozes/), is downloaded once with progress and kept on the phone (Cache Storage).
   The heavy work runs in a Worker, so the screen never freezes and iOS doesn't close the app. */
const VOZ_CACHE = 'estante-vozes-1';
function vozBase() {
  if (window.VOZ_BASE) return window.VOZ_BASE;
  return /github\.io$/.test(location.hostname) ? new URL('vozes/', location.href).href : 'https://litzkow.github.io/Estante/vozes/';
}
// files each voice needs (sizes are approximate, for the progress bar)
const VozPack = {
  // kind: 'k' = Kokoro (most natural), 'p' = Piper (fast)
  files(kind, voice) {
    if (kind === 'k') return ['lib/kokoro/kokoro.web.js', 'lib/ort/ort-wasm-simd-threaded.jsep.mjs', 'lib/ort/ort-wasm-simd-threaded.jsep.wasm',
      'kokoro/config.json', 'kokoro/tokenizer.json', 'kokoro/tokenizer_config.json', 'kokoro/onnx/model_quantized.onnx', 'kokoro/voices/' + voice + '.bin'];
    return ['lib/vits/piper-DeOu3H9E.js', 'lib/phonemize/piper_phonemize.wasm', 'lib/phonemize/piper_phonemize.data',
      'lib/ort/ort.wasm.min.mjs', 'lib/ort/ort-wasm-simd-threaded.mjs', 'lib/ort/ort-wasm-simd-threaded.wasm',
      'piper/' + voice + '.onnx.json', 'piper/' + voice + '.onnx'];
  },
  sizeMB(kind) { return kind === 'k' ? 115 : 90; },
  async missing(kind, voice) {
    const c = await caches.open(VOZ_CACHE), b = vozBase(), out = [];
    for (const f of this.files(kind, voice)) if (!(await c.match(b + f))) out.push(f);
    return out;
  },
  async ready(kind, voice) { try { return !(await this.missing(kind, voice)).length; } catch (e) { return false; } },
  // download what is missing, reporting 0–100
  async get(kind, voice, onPct) {
    const c = await caches.open(VOZ_CACHE), b = vozBase(), miss = await this.missing(kind, voice);
    if (!miss.length) return true;
    const sizes = []; let total = 0, done = 0;
    for (const f of miss) { let n = 0; try { const h = await fetch(b + f, { method: 'HEAD', cache: 'no-store' }); n = +h.headers.get('content-length') || 0; } catch (e) { } sizes.push(n || 1e6); total += n || 1e6; }
    for (let i = 0; i < miss.length; i++) {
      let tries = 0;
      for (; ;) {
        try {
          const r = await fetch(b + miss[i], { cache: 'no-store' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const rd = r.body.getReader(), parts = []; let got = 0;
          for (; ;) { const { done: d, value } = await rd.read(); if (d) break; parts.push(value); got += value.length; onPct && onPct(Math.min(99, Math.round((done + Math.min(got, sizes[i])) * 100 / total))); }
          const type = /\.wasm$/.test(miss[i]) ? 'application/wasm' : /\.m?js$/.test(miss[i]) ? 'text/javascript' : /\.json$/.test(miss[i]) ? 'application/json' : 'application/octet-stream';
          await c.put(b + miss[i], new Response(new Blob(parts, { type }), { headers: { 'content-type': type } }));
          done += sizes[i]; break;
        } catch (e) { if (++tries >= 3) throw new Error(t('vozNet')); await new Promise(r => setTimeout(r, 1500 * tries)); }
      }
    }
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
    onPct && onPct(100);
    return true;
  },
  async remove() { try { await caches.delete(VOZ_CACHE); } catch (e) { } },
};

// the code that runs inside the worker (kept as a function, started from a Blob)
function vozWorkerMain() {
  let B = '', CN = '', kok = null, ort = null, phonMod = null;
  const sess = {}, cfgs = {};
  const KOK = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/';
  const nf = self.fetch.bind(self);
  // files come from the phone first, the site second
  async function cfetch(u, o) {
    let s = typeof u === 'string' ? u : (u && u.url) || String(u);
    if (s.startsWith(KOK)) s = B + 'kokoro/' + s.slice(KOK.length);
    if (s.startsWith(B)) { try { const c = await caches.open(CN), r = await c.match(s); if (r) return r; } catch (e) { } return nf(s); }
    return nf(u, o);
  }
  self.fetch = cfetch;
  async function modFrom(path) {
    // import a module from the phone's copy when there is one
    try { const c = await caches.open(CN), r = await c.match(B + path); if (r) { const u = URL.createObjectURL(new Blob([await r.text()], { type: 'text/javascript' })); return await import(u); } } catch (e) { }
    return import(B + path);
  }
  async function kokoro(text, voice) {
    if (!kok) {
      const m = await modFrom('lib/kokoro/kokoro.web.js');
      m.env.wasmPaths = B + 'lib/ort/';
      kok = await m.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'wasm' });
    }
    const a = await kok.generate(text, { voice });
    return { pcm: a.audio, rate: a.sampling_rate };
  }
  let phonBin = null, phonData = null, phonInst = null, phonOut = null;
  async function phonemes(text, espeakVoice) {
    if (!phonMod) phonMod = (await modFrom('lib/vits/piper-DeOu3H9E.js')).createPiperPhonemize;
    if (!phonBin) phonBin = await (await cfetch(B + 'lib/phonemize/piper_phonemize.wasm')).arrayBuffer();
    if (!phonData) phonData = await (await cfetch(B + 'lib/phonemize/piper_phonemize.data')).arrayBuffer();
    // one pronunciation engine, reused for every passage
    if (!phonInst) phonInst = await phonMod({
      print: l => { const f = phonOut; phonOut = null; if (!f) return; try { f.res(JSON.parse(l).phoneme_ids); } catch (e) { f.rej(e); } },
      printErr: l => { if (phonOut && /error/i.test(l)) { const f = phonOut; phonOut = null; f.rej(new Error(l)); } },
      wasmBinary: phonBin, noInitialRun: true,
      getPreloadedPackage: () => phonData.slice(0),
      locateFile: f => B + 'lib/phonemize/' + f.split('/').pop(),
    });
    return new Promise((res, rej) => {
      phonOut = { res, rej };
      try { phonInst.callMain(['-l', espeakVoice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']); }
      catch (e) { phonInst = null; phonOut = null; rej(e); }
      setTimeout(() => { if (phonOut) { phonOut = null; phonInst = null; rej(new Error('phonemize')); } }, 20000);
    });
  }
  async function piper(text, voice) {
    if (!ort) {
      ort = await modFrom('lib/ort/ort.wasm.min.mjs');
      ort.env.wasm.wasmPaths = B + 'lib/ort/'; ort.env.wasm.numThreads = 1;
    }
    if (!cfgs[voice]) cfgs[voice] = await (await cfetch(B + 'piper/' + voice + '.onnx.json')).json();
    const cfg = cfgs[voice];
    if (!sess[voice]) { for (const k in sess) delete sess[k]; sess[voice] = await ort.InferenceSession.create(new Uint8Array(await (await cfetch(B + 'piper/' + voice + '.onnx')).arrayBuffer())); }
    const ids = await phonemes(text, cfg.espeak.voice);
    const inf = cfg.inference || {};
    const feeds = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, inf.length_scale ?? 1, inf.noise_w ?? 0.8]), [3]),
    };
    if (cfg.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
    const out = await sess[voice].run(feeds);
    return { pcm: out.output.data, rate: cfg.audio.sample_rate };
  }
  self.onmessage = async e => {
    const m = e.data;
    if (m.op === 'init') { B = m.base; CN = m.cache; return; }
    try {
      const r = m.op === 'kokoro' ? await kokoro(m.text, m.voice) : await piper(m.text, m.voice);
      const pcm = r.pcm instanceof Float32Array ? r.pcm : Float32Array.from(r.pcm);
      self.postMessage({ id: m.id, pcm, rate: r.rate }, [pcm.buffer]);
    } catch (err) { self.postMessage({ id: m.id, err: String(err && err.message || err) }); }
  };
}

const VozWorker = {
  w: null, n: 0, wait: new Map(),
  start() {
    if (this.w) return this.w;
    const src = '(' + vozWorkerMain.toString() + ')()';
    this.w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' });
    this.w.postMessage({ op: 'init', base: vozBase(), cache: VOZ_CACHE });
    this.w.onmessage = e => { const p = this.wait.get(e.data.id); if (!p) return; this.wait.delete(e.data.id); clearTimeout(p.to); e.data.err ? p.rej(new Error(e.data.err)) : p.res(e.data); };
    this.w.onerror = e => { const err = new Error((e && e.message) || t('vozCrash')); for (const p of this.wait.values()) { clearTimeout(p.to); p.rej(err); } this.wait.clear(); this.kill(); };
    return this.w;
  },
  kill() { try { this.w && this.w.terminate(); } catch (e) { } this.w = null; },
  // text → wav blob; the first passage may take long (the voice is loaded into memory)
  synth(op, text, voice, first) {
    const w = this.start(), id = ++this.n;
    return new Promise((res, rej) => {
      const to = setTimeout(() => { this.wait.delete(id); this.kill(); rej(new Error(t('vozSlow'))); }, first ? 240000 : 120000);
      this.wait.set(id, { res: d => res(wavBlob(d.pcm, d.rate)), rej, to });
      w.postMessage({ op, id, text, voice });
    });
  },
};
