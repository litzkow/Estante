/* ================= AI voice (Gemini TTS) read live by the app, with the listener's own key =================
   The app reads the book aloud as you listen, a few minutes ahead; what was already heard stays on the phone.
   Every request is counted: tokens → dollars, per month, with a budget that stops the voice when it is reached. */
const GEMINI_VOICES = [
  ['Sulafat', 'f', 'gemVWarm'], ['Leda', 'f', 'gemVYoung'], ['Despina', 'f', 'gemVSmooth'], ['Aoede', 'f', 'gemVLight'], ['Kore', 'f', 'gemVFirm'],
  ['Charon', 'm', 'gemVDeep'], ['Algieba', 'm', 'gemVSmooth'], ['Umbriel', 'm', 'gemVEasy'], ['Achird', 'm', 'gemVFriendly'], ['Orus', 'm', 'gemVFirm'], ['Enceladus', 'm', 'gemVBreathy'],
];
// names that open a chapter and tell whose eyes we see it through (romances with two narrators)
const FEMALE_NAMES = new Set(('hannah grace sabrina allie summer brenna demi taylor mackenzie mack ivy diana gigi sarah anna ana maria julia laura ' +
  'emma olivia sophia sofia isabella mia amelia charlotte ava lucy lily rose kate katie jess jessica jenna jenny claire chloe zoe ellie ' +
  'hermione luna ginny mikasa elizabeth bella alice clara beatriz helena mariana camila larissa karina paula amanda').split(' '));
const GemTTS = {
  MODEL: 'gemini-3.8-flash-tts',
  // Google's price for this model (per 1M tokens): promo until 31 Dec 2026, doubles on 1 Jan 2027. Audio = 25 tokens per second.
  price() { return Date.now() < Date.UTC(2027, 0, 1) ? { in: 0.5, out: 9 } : { in: 1, out: 18 }; },
  perHour() { return 90000 * this.price().out / 1e6; },
  month() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); },
  today() { return new Date().toISOString().slice(0, 10); },
  spend() {
    let s = null; try { s = JSON.parse(localStorage.getItem('gemSpend') || 'null'); } catch (e) { }
    if (!s || s.m !== this.month()) s = { m: this.month(), usd: 0, sec: 0, req: 0, warned: false, hist: (s && s.hist) || [] };
    if (s.d !== this.today()) { s.d = this.today(); s.dreq = 0; }
    return s;
  },
  save(s) { try { localStorage.setItem('gemSpend', JSON.stringify(s)); } catch (e) { } },
  budget() { return +S.gemBudget || 10; },
  // a closed month goes into the history (last 12)
  roll() {
    let s = null; try { s = JSON.parse(localStorage.getItem('gemSpend') || 'null'); } catch (e) { }
    if (s && s.m !== this.month() && s.usd > 0) { const h = (s.hist || []).concat([{ m: s.m, usd: s.usd, sec: s.sec }]).slice(-12); this.save({ m: this.month(), usd: 0, sec: 0, req: 0, hist: h }); }
  },
  summary() {
    const s = this.spend(), b = this.budget();
    return { usd: s.usd, sec: s.sec, req: s.req, dreq: s.dreq || 0, budget: b, pct: Math.min(1, s.usd / b), hist: s.hist || [] };
  },
  money(x) { return '$' + (x < 1 ? x.toFixed(2) : x.toFixed(2)).replace('.', ','); },
  // whose chapter is it? The first line of the chapter when it is just a name (HANNAH, Garrett…)
  pov() {
    const fl = Book.flow, txt = fl ? [...fl.querySelectorAll('h1,h2,h3,h4,h5,p')].slice(0, 5).map(x => (x.textContent || '').trim()).filter(Boolean) : [];
    for (const l of txt.slice(0, 4)) {
      const m = l.match(/^([A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]{1,15})$/);
      if (m && !/^(cap[ií]tulo|chapter|parte|part|ep[ií]logo|epilogue|pr[oó]logo|prologue)$/i.test(m[1])) return m[1][0] + m[1].slice(1).toLowerCase();
    }
    return null;
  },
  gender(name) {
    if (!name) return null;
    const o = (S.gemPov || {})[name.toLowerCase()]; if (o) return o;
    const n = name.toLowerCase();
    return FEMALE_NAMES.has(n) || /a$/.test(n) ? 'f' : 'm';
  },
  // which voice reads this chapter
  voiceNow() {
    if (!S.gemDual) return S.gemVoice || 'Charon';
    const g = this.gender(this.pov());
    return g === 'f' ? (S.gemF || 'Sulafat') : (S.gemM || 'Charon');
  },
  style(lang) {
    return lang === 'en'
      ? 'Professional audiobook narration, natural, warm and immersive voice. Calm, natural pace with nuance: tension in tense moments, lightness and humor in funny moments, emotion in sad moments, intimacy in romantic moments. Bring the dialogue to life with a distinct manner for each character.'
      : 'Narração brasileira de audiolivro profissional, voz natural, calorosa e envolvente. Ritmo calmo e natural, com nuances: tensão nos momentos de tensão, leveza e humor nos momentos engraçados, emoção nos momentos tristes, intimidade nos momentos românticos. Dá vida às falas, com um jeito diferente para cada personagem.';
  },
  async synth(text, voice, lang) {
    if (!S.gemKey) throw new Error(t('gemNoKey'));
    const s = this.spend(), b = this.budget();
    if (s.usd >= b) throw new Error(t('gemBudgetHit', { b: this.money(b) }));
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text, speechMetadata: { style: this.style(lang) } }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    });
    let j = null;
    for (let k = 0; k < 4; k++) {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + this.MODEL + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': S.gemKey }, body });
      if (r.ok) { j = await r.json(); break; }
      if (r.status === 400 || r.status === 401 || r.status === 403) throw new Error(t('gemBadKey'));
      if (r.status === 402) throw new Error(t('gemNoCredit'));
      if ((r.status === 429 || r.status >= 500) && k < 3) { await sleep(4000 * (k + 1)); continue; }
      throw new Error(r.status === 429 ? t('gemDayLimit') : 'Gemini: ' + r.status);
    }
    const part = ((((j.candidates || [])[0] || {}).content || {}).parts || []).find(p => p.inlineData);
    if (!part) throw new Error(t('gemEmpty'));
    const raw = Uint8Array.from(atob(part.inlineData.data), c => c.charCodeAt(0));
    let blob, sec;
    if (raw[0] === 0x52 && raw[1] === 0x49 && raw[2] === 0x46 && raw[3] === 0x46) { blob = new Blob([raw], { type: 'audio/wav' }); const dv = new DataView(raw.buffer); sec = (raw.length - 44) / (dv.getUint32(28, true) || 48000); }
    else { const rate = +((part.inlineData.mimeType || '').match(/rate=(\d+)/) || [0, 24000])[1]; const i16 = new Int16Array(raw.buffer, 0, raw.length >> 1); const f = new Float32Array(i16.length); for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32768; blob = wavBlob(f, rate); sec = i16.length / rate; }
    // count what Google will charge
    const u = j.usageMetadata || {}, p = this.price();
    const tin = u.promptTokenCount || Math.ceil(text.length / 4) + 80, tout = u.candidatesTokenCount || Math.ceil(sec * 25);
    const usd = (tin * p.in + tout * p.out) / 1e6;
    const s2 = this.spend(); s2.usd += usd; s2.sec += sec; s2.req++; s2.dreq = (s2.dreq || 0) + 1;
    if (!s2.warned && s2.usd >= b * 0.8) { s2.warned = true; setTimeout(() => toast(t('gemBudget80', { u: this.money(s2.usd), b: this.money(b) }), 7000), 50); }
    this.save(s2);
    return blob;
  },
  // the AI voice audio stays on the phone so listening again costs nothing; the oldest goes when it passes ~400 MB
  async remember(key, size) {
    let idx = []; try { idx = JSON.parse(localStorage.getItem('gemCache') || '[]'); } catch (e) { }
    idx = idx.filter(x => x[0] !== key); idx.push([key, size]);
    let tot = idx.reduce((a, x) => a + x[1], 0);
    while (tot > 400e6 && idx.length > 1) { const [k, sz] = idx.shift(); tot -= sz; try { await DB.del('kv', k); } catch (e) { } }
    try { localStorage.setItem('gemCache', JSON.stringify(idx)); } catch (e) { }
  },
  cacheMB() { try { return JSON.parse(localStorage.getItem('gemCache') || '[]').reduce((a, x) => a + x[1], 0) / 1e6; } catch (e) { return 0; } },
  // settings block (inside the voice sheet)
  box(onChange) {
    const sm = this.summary();
    const vopts = g => GEMINI_VOICES.filter(v => !g || v[1] === g).map(([n, gg, d]) => el('option', { value: n, text: n + ' · ' + t(gg === 'f' ? 'ttsFemale' : 'ttsMale') + ' · ' + t(d) }));
    const sel = (key, g, def) => { const s = el('select', { class: 'inp', onchange: e => { setS(key, e.target.value); NeuralPlayer.vcache = {}; onChange && onChange(); } }, ...vopts(g)); s.value = S[key] || def; return s; };
    const lbl = txt => el('div', { class: 'muted', style: { fontSize: '12.5px', margin: '10px 2px 4px' }, text: txt });
    const pov = this.pov();
    const single = el('div', { class: S.gemDual ? 'hide' : '' }, lbl(t('gemVoiceOne')), sel('gemVoice', null, 'Charon'));
    const dual = el('div', { class: S.gemDual ? '' : 'hide' }, lbl(t('gemVoiceF')), sel('gemF', 'f', 'Sulafat'), lbl(t('gemVoiceM')), sel('gemM', 'm', 'Charon'),
      pov ? el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 2px 0' } },
        el('span', { class: 'muted', style: { fontSize: '12.5px', flex: 1 }, text: t('gemPovNow', { n: pov, g: t(this.gender(pov) === 'f' ? 'ttsFemale' : 'ttsMale').toLowerCase() }) }),
        el('button', { class: 'btn', style: { padding: '6px 12px' }, text: t('gemPovSwap'), onclick: () => { const m = Object.assign({}, S.gemPov || {}); m[pov.toLowerCase()] = this.gender(pov) === 'f' ? 'm' : 'f'; setS('gemPov', m); NeuralPlayer.vcache = {}; onChange && onChange(true); } })) : '');
    const bar = el('div', { class: 'gem-bar' }, el('i', { style: { width: Math.round(sm.pct * 100) + '%', background: sm.pct >= 0.8 ? '#e5484d' : '' } }));
    const hrs = sm.sec / 3600;
    return el('div', { class: 'gem-box' },
      el('input', { class: 'inp', type: 'password', autocomplete: 'off', placeholder: t('gemKeyPh'), value: S.gemKey || '', oninput: e => setS('gemKey', e.target.value.trim()) }),
      el('p', { class: 'muted', style: { fontSize: '12px', lineHeight: 1.45, margin: '6px 2px 0' }, text: t('gemKeyHelp') }),
      lbl(t('gemMode')),
      wSeg([[1, t('gemDual')], [0, t('gemOne')]], S.gemDual ? 1 : 0, x => { setS('gemDual', !!x); single.classList.toggle('hide', !!x); dual.classList.toggle('hide', !x); NeuralPlayer.vcache = {}; onChange && onChange(); }),
      single, dual,
      el('div', { class: 'gem-spend' },
        el('div', { class: 'gem-row' }, el('b', { text: t('gemThisMonth') }), el('span', { text: this.money(sm.usd) + ' / ' + this.money(sm.budget) })),
        bar,
        el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px', lineHeight: 1.45 }, text: t('gemSpendLine', { h: hrs < 1 ? Math.round(sm.sec / 60) + ' min' : hrs.toFixed(1).replace('.', ',') + ' h', r: sm.dreq, c: Math.round(this.cacheMB()) }) }),
        el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px', lineHeight: 1.45 }, text: t('gemPriceLine', { p: this.money(this.perHour()) }) }),
        sm.hist.length ? el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' }, text: t('gemHist') + ' ' + sm.hist.slice(-3).map(h => h.m.slice(5) + '/' + h.m.slice(2, 4) + ': ' + this.money(h.usd)).join(' · ') }) : ''),
      lbl(t('gemBudgetLbl')),
      wSeg([[5, '$5'], [10, '$10'], [20, '$20'], [40, '$40']], this.budget(), x => { setS('gemBudget', x); const s = this.spend(); s.warned = s.usd >= x * 0.8; this.save(s); onChange && onChange(true); }));
  },
};
