/* ================= family library: a private GitHub repository shared by the household =================
   Every book or comic added on one phone is uploaded to the private repo; the other phones download it.
   Only people with the access key (a GitHub token for that one private repo) can see the files. */
const Family = {
  get on() { return !!(S.famRepo && S.famToken); },
  async api(path, opts = {}) {
    const r = await fetch('https://api.github.com' + path, {
      ...opts, headers: { Authorization: 'Bearer ' + S.famToken, Accept: opts.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    if (r.status === 401 || r.status === 403) throw new Error(t('famDenied'));
    if (r.status === 404 && !opts.ok404) throw new Error(t('famNotFound'));
    return r;
  },
  repo() { return '/repos/' + S.famRepo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, ''); },
  async list() {
    const r = await this.api(this.repo() + '/contents/livros', { ok404: true });
    if (r.status === 404) return [];
    const j = await r.json(); return Array.isArray(j) ? j.filter(f => f.type === 'file') : [];
  },
  safe(name) { return name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, ' ').trim() || 'livro'; },
  b64(buf) {
    const u = new Uint8Array(buf); let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  },
  async upload(blob, name) {
    if (blob.size > 95 * 1024 * 1024) throw new Error(t('famTooBig', { f: name }));
    const R = this.repo();
    const ref = await (await this.api(R + '/git/ref/heads/main')).json();
    const head = ref.object.sha;
    const cm = await (await this.api(R + '/git/commits/' + head)).json();
    const bl = await (await this.api(R + '/git/blobs', { method: 'POST', body: JSON.stringify({ content: this.b64(await blob.arrayBuffer()), encoding: 'base64' }) })).json();
    const tr = await (await this.api(R + '/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: cm.tree.sha, tree: [{ path: 'livros/' + this.safe(name), mode: '100644', type: 'blob', sha: bl.sha }] }) })).json();
    const nc = await (await this.api(R + '/git/commits', { method: 'POST', body: JSON.stringify({ message: 'Estante: ' + this.safe(name), tree: tr.sha, parents: [head] }) })).json();
    await this.api(R + '/git/refs/heads/main', { method: 'PATCH', body: JSON.stringify({ sha: nc.sha }) });
  },
  // everything on this phone that the family library does not have yet (the free books come from the site)
  async pushAll(onProgress) {
    const remote = new Set((await this.list()).map(f => f.name));
    const books = (await DB.all('books')).filter(b => !(S.starterGot || []).includes(b.fname));
    let n = 0;
    for (const b of books) {
      const nm = this.safe(b.fname || b.title + '.' + b.format);
      if (remote.has(nm)) continue;
      const blob = await DB.get('files', b.id); if (!blob) continue;
      onProgress && onProgress(b.title);
      await this.upload(blob, nm); remote.add(nm); n++;
    }
    return n;
  },
  // new files from the family library → this phone
  async sync(quiet) {
    if (!this.on || this.syncing) return;
    this.syncing = true;
    try {
      const remote = await this.list();
      const have = new Set((await DB.all('books')).map(b => this.safe(b.fname || '')));
      const got = new Set(S.famGot || []);
      const todo = remote.filter(f => !have.has(f.name) && !got.has(f.sha));
      for (const f of todo) {
        if (!quiet) toast(t('famDownloading', { f: f.name }));
        const r = await this.api(this.repo() + '/contents/' + f.path.split('/').map(encodeURIComponent).join('/'), { raw: true });
        const blob = await r.blob();
        this.importing = true;
        try { await importFiles([new File([blob], f.name)]); } finally { this.importing = false; }
        got.add(f.sha); setS('famGot', [...got]);
      }
      if (todo.length) { await splitCollections(); await Lib.render(); }
      // obras.json: the same book in two languages becomes one book with a PT · EN switch
      try { const c = await this.api(this.repo() + '/contents/obras.json', { raw: true, ok404: true }); if (c.ok) { const cat = await c.json(); if (Array.isArray(cat)) await Starter.tag(cat.filter(x => !x.cover)); } } catch (e) { console.warn('obras', e); }
    } catch (e) { if (!quiet) toast(e.message || String(e)); console.warn('family', e); }
    finally { this.syncing = false; }
  },
  // called after the reader adds files on this phone
  async afterImport(files) {
    if (!this.on || this.importing || S.famAuto === false) return;
    for (const f of files) {
      try { toast(t('famUploading', { f: f.name })); await this.upload(f, f.name); toast(t('famUploaded')); }
      catch (e) { toast(e.message || String(e)); }
    }
  },
  convite() { return location.origin + location.pathname + '#familia=' + btoa(unescape(encodeURIComponent(JSON.stringify({ r: S.famRepo, t: S.famToken })))); },
  // the invite works opened as a link or pasted in the family screen (the home-screen app doesn't share data with Safari)
  async usarConvite(txt) {
    const m = String(txt || '').match(/familia=([A-Za-z0-9+/=_-]+)/); if (!m) return false;
    try {
      const j = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
      if (!j.r || !j.t) return false;
      setS('famRepo', j.r); setS('famToken', j.t); AudioBook.idx = null;
      const n = (await this.list()).length; toast(t('famOk', { n }), 6000); this.sync(); return true;
    } catch (e) { toast(e.message || String(e), 6000); return false; }
  },
  // ---- guided invite: nothing is unlocked in Safari; only the installed app joins, after she accepts ----
  standalone() { return navigator.standalone === true || !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches); },
  ios() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); },
  tela(titulo, corpo, botoes) {
    const card = el('div', { class: 'tw-card in' }, el('div', { class: 'tw-art', html: TOUR_ART.welcome }),
      el('div', { class: 'tw-txt' }, el('h2', { text: titulo }), corpo), el('div', { class: 'tw-btns', style: { flexDirection: 'column', gap: '8px', marginTop: '14px' } }, ...botoes.map(b => { b.style.flex = 'none'; b.style.width = '100%'; b.style.minHeight = '50px'; return b; })));
    const bd = el('div', { class: 'tour' }, card); document.body.append(bd);
    return () => { bd.classList.add('out'); setTimeout(() => bd.remove(), 300); };
  },
  passos(lista) {
    const SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-3px;margin:0 2px"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
    return el('ol', { style: { textAlign: 'left', margin: '12px 0 4px', paddingLeft: '22px', lineHeight: 1.55, fontSize: '15px' } },
      ...lista.map(x => el('li', { style: { margin: '6px 0' }, html: esc(t(x)).replace('[c]', SHARE) })));
  },
  async fromLink() {
    if (!/familia=/.test(location.hash)) return;
    const h = location.hash; history.replaceState(null, '', location.pathname + location.search);
    this.pendente = location.origin + location.pathname + '#' + h.slice(h.indexOf('familia='));
    await new Promise(r => setTimeout(r, 900)); // after the splash
    if (this.ios() && !this.standalone()) {
      // Safari: only explains how to install; the invite goes to the clipboard, the books stay locked
      const msg = el('p', { text: t('famInvTx') }), lista = this.passos(['famInvS1', 'famInvS2', 'famInvS3']);
      const btn = el('button', { class: 'btn primary', text: t('famInvGo'), onclick: async () => {
        try { await navigator.clipboard.writeText(this.pendente); } catch (e) { }
        msg.textContent = t('famInvCopied'); btn.textContent = t('famInvOk'); btn.onclick = () => fechar();
      } });
      const fechar = this.tela(t('famInvT'), el('div', {}, msg, lista), [btn]);
    } else {
      // installed app (or a computer/Android browser): asks before joining
      const fechar = this.tela(t('famInvJoinT'), el('p', { text: t('famInvJoinTx') }), [
        el('button', { class: 'btn primary', text: t('famInvEnter'), onclick: async () => { fechar(); await this.usarConvite(this.pendente); Lib.render(); } }),
        el('button', { class: 'btn ghost', text: t('famInvLater'), onclick: () => fechar() })]);
    }
  },
  // installed app, not connected yet: "Got an invite?" (reads the link she copied in Safari)
  async perguntar() {
    if (this.on || this.pendente || !this.standalone() || S.famNoAsk) return false;
    return new Promise(res => {
      const campo = el('input', { class: 'inp', style: { marginTop: '10px', display: 'none' }, placeholder: t('famPastePh') });
      const msg = el('p', { text: t('famInvAppTx') });
      const entrar = async txt => { if (await this.usarConvite(txt)) { fechar(); Lib.render(); res(true); return true; } return false; };
      const fechar = this.tela(t('famInvAppT'), el('div', {}, msg, campo), [
        el('button', { class: 'btn primary', text: t('famInvEnter'), onclick: async () => {
          if (campo.style.display !== 'none' && campo.value) { if (!(await entrar(campo.value))) msg.textContent = t('famBadInvite'); return; }
          let txt = ''; try { txt = await navigator.clipboard.readText(); } catch (e) { }
          if (!(await entrar(txt))) { msg.textContent = t('famInvFail'); campo.style.display = ''; campo.focus(); }
        } }),
        el('button', { class: 'btn ghost', text: t('famInvNo'), onclick: () => { setS('famNoAsk', true); fechar(); res(false); } })]);
    });
  },
  sheet() {
    Sheets.open({
      title: t('famTitle'), body: b => {
        const repo = el('input', { class: 'inp', placeholder: t('famRepoPh'), value: S.famRepo || '' });
        const tok = el('input', { class: 'inp', style: { marginTop: '8px' }, placeholder: t('famTokPh'), value: S.famToken || '', type: 'password' });
        const status = el('p', { class: 'muted', style: { fontSize: '13px', lineHeight: 1.45 } });
        b.append(
          el('p', { style: { lineHeight: 1.5, marginTop: 0 }, text: t('famIntro') }),
          el('ol', { class: 'steps' }, ...[t('famStep1'), t('famStep2'), t('famStep3'), t('famStep4')].map(s => el('li', { text: s }))),
          repo, tok, status,
          el('button', { class: 'btn primary block', text: t('famConnect'), onclick: async () => {
            setS('famRepo', repo.value.trim()); setS('famToken', tok.value.trim()); status.textContent = t('famTesting');
            try { const n = (await this.list()).length; status.textContent = t('famOk', { n }); this.sync(); }
            catch (e) { status.textContent = e.message || String(e); }
          } }),
          el('button', { class: 'btn block', style: { marginTop: '8px' }, text: t('famPushAll'), onclick: async e => {
            const btn = e.currentTarget; btn.disabled = true;
            try { const n = await this.pushAll(name => { btn.textContent = t('famUploading', { f: name }); }); btn.textContent = t('famPushed', { n }); }
            catch (err) { btn.disabled = false; btn.textContent = t('famPushAll'); status.textContent = err.message || String(err); }
          } }),
          this.on && el('button', { class: 'btn block', style: { marginTop: '8px' }, text: t('famInvite'), onclick: async () => {
            const url = this.convite();
            try { if (navigator.share) { await navigator.share({ title: 'Estante', text: t('famInviteMsg'), url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
            try { await navigator.clipboard.writeText(url); toast(t('famInviteCopied'), 5000); } catch (e) { prompt(t('famInviteCopy'), url); }
          } }),
          this.on && el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45 }, text: t('famInviteNote') }),
          (() => { const inp = el('input', { class: 'inp', style: { marginTop: '14px' }, placeholder: t('famPastePh') });
            return el('div', {}, inp, el('button', { class: 'btn block', style: { marginTop: '8px' }, text: t('famPaste'), onclick: async () => {
              if (await this.usarConvite(inp.value)) { repo.value = S.famRepo; tok.value = S.famToken; status.textContent = t('famLinked'); } else status.textContent = t('famBadInvite');
            } })); })(),
          wToggle(t('famAuto'), t('famAutoSub'), S.famAuto !== false, v => setS('famAuto', v)),
          el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45 }, text: t('famWife') }));
      },
    });
  },
};
