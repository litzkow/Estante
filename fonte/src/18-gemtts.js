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
  // each book or series can have its own narration (e.g. a romance told only by a female voice)
  bookKey() { const r = Book.rec || {}; return r.series || r.work || r.id || ''; },
  bookPick() { return (S.gemBook || {})[this.bookKey()] || 'default'; },
  voiceNow() {
    const bp = this.bookPick();
    if (bp === 'dualF' || bp === 'dual') { const g = this.gender(this.pov()); return g === 'f' ? (S.gemF || 'Sulafat') : (S.gemM || 'Charon'); }
    if (bp === 'f') return S.gemF || 'Sulafat';
    if (bp === 'm') return S.gemM || 'Charon';
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
    this.report();
    if (S.gemNotify && Date.now() - (this.lastCheck || 0) > 5 * 60000) { this.lastCheck = Date.now(); setTimeout(() => this.checkFamily(), 2000); }
    return blob;
  },
  // ---------- family spending: each device writes its month to gastos/<device>.json; only the payer's device adds it up and alerts ----------
  devId() { if (!S.devId) setS('devId', Math.random().toString(36).slice(2, 10)); return S.devId; },
  devName() { return /iPad|Tablet/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)) ? t('gemTablet') : t('gemPhone'); },
  report(now) {
    if (!Family.on) return;
    clearTimeout(this.repT);
    this.repT = setTimeout(async () => {
      const s = this.spend(); if (!s.usd && !now) return;
      try { await Family.putJSON('gastos/' + this.devId() + '.json', { m: s.m, usd: +s.usd.toFixed(4), sec: Math.round(s.sec), name: this.devName(), at: Date.now() }, 'Estante: gasto da voz de IA'); } catch (e) { console.warn('gasto', e); }
    }, now ? 0 : 60000);
  },
  async family() {
    const r = await Family.api(Family.repo() + '/contents/gastos', { ok404: true }); if (!r.ok) return null;
    const files = (await r.json()).filter(f => f.type === 'file' && /\.json$/.test(f.name));
    const out = [];
    for (const f of files) { const j = await Family.getJSON('gastos/' + f.name); if (j && j.m === this.month()) out.push(Object.assign({ me: f.name === this.devId() + '.json' }, j)); }
    return out;
  },
  cap() { return +S.gemCap || 30; },
  async notify(title, body) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (reg) { await reg.showNotification(title, { body, icon: 'lib/icon-192.png', badge: 'lib/icon-192.png', tag: 'gasto-' + Date.now() }); return; }
        new Notification(title, { body, icon: 'lib/icon-192.png' }); return;
      }
    } catch (e) { }
    toast(title + ' · ' + body, 8000);
  },
  // spending alerts: every $5 of the household's month, and at 80% / 100% of the Google monthly limit
  async checkFamily() {
    if (!S.gemNotify || !Family.on) return;
    const list = await this.family().catch(() => null); if (!list) return;
    // this device's own spend is always the freshest
    const me = this.spend(); const mine = list.find(x => x.me); if (mine) mine.usd = Math.max(mine.usd, me.usd); else if (me.usd) list.push({ me: true, usd: me.usd, name: this.devName() });
    const tot = list.reduce((a, x) => a + (x.usd || 0), 0); this.famTot = { tot, list };
    const key = 'gemAlert_' + this.month(); let st = {}; try { st = JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { }
    const parts = list.map(x => x.name + ' ' + this.money(x.usd || 0)).join(' · ');
    const step = Math.floor(tot / 5) * 5;
    if (tot >= this.cap() && !st.full) { st.full = true; st.p80 = true; await this.notify(t('gemNFullT'), t('gemNFullB', { u: this.money(tot), c: this.money(this.cap()), p: parts })); }
    else if (tot >= this.cap() * 0.8 && !st.p80) { st.p80 = true; await this.notify(t('gemN80T'), t('gemN80B', { u: this.money(tot), c: this.money(this.cap()), p: parts })); }
    else if (step >= 5 && step > (st.step || 0)) { await this.notify(t('gemNStepT', { u: this.money(step) }), t('gemNStepB', { u: this.money(tot), c: this.money(this.cap()), p: parts })); }
    st.step = Math.max(st.step || 0, step);
    try { localStorage.setItem(key, JSON.stringify(st)); } catch (e) { }
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
    const rec = Book.rec || {}, bname = rec.series || rec.title || '';
    const perBook = bname ? el('div', {}, lbl(t('gemThisBook', { n: bname })),
      wSeg([['default', t('gemBookDefault')], ['dual', t('gemBookDual')], ['f', t('gemBookOnly', { v: S.gemF || 'Sulafat' })], ['m', t('gemBookOnly', { v: S.gemM || 'Charon' })]], this.bookPick(),
        x => { const m = Object.assign({}, S.gemBook || {}); if (x === 'default') delete m[this.bookKey()]; else m[this.bookKey()] = x; setS('gemBook', m); NeuralPlayer.vcache = {}; onChange && onChange(); }, 'wrap')) : '';
    const bar = el('div', { class: 'gem-bar' }, el('i', { style: { width: Math.round(sm.pct * 100) + '%', background: sm.pct >= 0.8 ? '#e5484d' : '' } }));
    const hrs = sm.sec / 3600;
    return el('div', { class: 'gem-box' },
      el('input', { class: 'inp', type: 'password', autocomplete: 'off', placeholder: t('gemKeyPh'), value: S.gemKey || '', oninput: e => { setS('gemKey', e.target.value.trim()); if (S.gemKey.length > 20) { setS('ttsEngine', 'gemini'); NeuralPlayer.vcache = {}; } } }),
      el('p', { class: 'muted', style: { fontSize: '12px', lineHeight: 1.45, margin: '6px 2px 0' }, text: t('gemKeyHelp') }),
      Family.on ? el('button', { class: 'btn block', style: { marginTop: '8px' }, text: t('gemShare'), onclick: async e => {
        const b = e.currentTarget; if (!S.gemKey) { toast(t('gemNoKey')); return; }
        b.disabled = true; b.textContent = t('gemSharing');
        try { await Family.shareKey(S.gemKey); b.textContent = t('gemShared'); } catch (err) { b.disabled = false; b.textContent = t('gemShare'); toast(err.message || String(err), 5000); }
      } }) : '',
      lbl(t('gemMode')),
      wSeg([[1, t('gemDual')], [0, t('gemOne')]], S.gemDual ? 1 : 0, x => { setS('gemDual', !!x); single.classList.toggle('hide', !!x); dual.classList.toggle('hide', !x); NeuralPlayer.vcache = {}; onChange && onChange(); }),
      single, dual, perBook,
      el('div', { class: 'gem-spend' },
        el('div', { class: 'gem-row' }, el('b', { text: t('gemThisMonth') }), el('span', { text: this.money(sm.usd) + ' / ' + this.money(sm.budget) })),
        bar,
        el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px', lineHeight: 1.45 }, text: t('gemSpendLine', { h: hrs < 1 ? Math.round(sm.sec / 60) + ' min' : hrs.toFixed(1).replace('.', ',') + ' h', r: sm.dreq, c: Math.round(this.cacheMB()) }) }),
        el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px', lineHeight: 1.45 }, text: t('gemPriceLine', { p: this.money(this.perHour()) }) }),
        sm.hist.length ? el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' }, text: t('gemHist') + ' ' + sm.hist.slice(-3).map(h => h.m.slice(5) + '/' + h.m.slice(2, 4) + ': ' + this.money(h.usd)).join(' · ') }) : ''),
      Family.on ? el('div', { class: 'gem-spend' },
        el('div', { class: 'gem-row' }, el('b', { text: t('gemFamMonth') }), el('span', { class: 'gem-fam', text: this.famTot ? this.money(this.famTot.tot) + ' / ' + this.money(this.cap()) : '…' })),
        el('div', { class: 'muted gem-famlist', style: { fontSize: '12px', marginTop: '6px', lineHeight: 1.45 }, text: this.famTot ? this.famTot.list.map(x => x.name + ': ' + this.money(x.usd || 0)).join(' · ') : '' }),
        el('div', { style: { marginTop: '10px' } }, wToggle(t('gemNotifyLbl'), t('gemNotifySub'), !!S.gemNotify, async v => {
          setS('gemNotify', v);
          if (v && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (e) { } }
          if (v) { this.checkFamily(); toast(t('gemNotifyOn')); }
        }))) : '',
      lbl(t('gemBudgetLbl')),
      wSeg([[5, '$5'], [10, '$10'], [20, '$20'], [40, '$40']], this.budget(), x => { setS('gemBudget', x); const s = this.spend(); s.warned = s.usd >= x * 0.8; this.save(s); onChange && onChange(true); }));
  },
};
