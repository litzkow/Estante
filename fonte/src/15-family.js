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
          wToggle(t('famAuto'), t('famAutoSub'), S.famAuto !== false, v => setS('famAuto', v)),
          el('p', { class: 'muted', style: { fontSize: '12.5px', lineHeight: 1.45 }, text: t('famWife') }));
      },
    });
  },
};
