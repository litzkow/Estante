/* ================= library ================= */
const Lib = {
  books: [], urls: [], memOnly: false, q: '',
  coverEl(b) {
    if (b.cover instanceof Blob) {
      const u = URL.createObjectURL(b.cover); this.urls.push(u);
      return el('img', { src: u, alt: '', loading: 'lazy', decoding: 'async' });
    }
    return el('div', { class: 'gen', style: { background: genCoverColor(b.title || '') } }, el('div', { class: 'gt', text: b.title || '' }), el('div', { class: 'ga', text: b.author || (b.kind === 'comic' ? t('comic') : t('book')) }));
  },
  pctLabel(b) {
    if (b.finished) return t('finished');
    if (!b.pct) return b.opened ? t('started') : t('notStarted');
    return Math.round(b.pct * 100) + '%';
  },
  kindLabel(b) { return b.kind === 'comic' ? t('comic') : t('book'); },
  filtered() {
    let list = this.books.slice();
    const f = S.filter;
    if (f === 'comic' || f === 'book') list = list.filter(b => b.kind === f);
    else if (f === 'reading') list = list.filter(b => b.pct > 0 && !b.finished);
    else if (f === 'done') list = list.filter(b => b.finished);
    else if (f.startsWith('c:')) list = list.filter(b => (b.collections || []).includes(f.slice(2)));
    if (this.q) { const q = fold(this.q); list = list.filter(b => fold((b.title || '') + ' ' + (b.author || '') + ' ' + (b.collections || []).join(' ')).includes(q)); }
    const by = {
      recent: (a, b) => (b.opened || b.added) - (a.opened || a.added),
      added: (a, b) => b.added - a.added,
      title: (a, b) => natCmp(a.title || '', b.title || ''),
      author: (a, b) => natCmp(a.author || '~', b.author || '~') || natCmp(a.title, b.title),
      progress: (a, b) => (b.finished ? 1 : b.pct || 0) - (a.finished ? 1 : a.pct || 0),
    }[S.sort] || ((a, b) => 0);
    return list.sort(by);
  },
  collections() { const s = new Set(); for (const b of this.books) for (const c of b.collections || []) s.add(c); return [...s].sort(natCmp); },
  async render() {
    for (const u of this.urls) URL.revokeObjectURL(u); this.urls = [];
    this.books = await DB.all('books');
    // banner
    const ban = $('#l-banner'); ban.replaceChildren();
    if (!DB.ok || this.memOnly) ban.append(el('div', { class: 'banner' }, icon('info'), el('div', { text: t('memOnly') })));
    // hero
    const hero = $('#l-hero'); hero.replaceChildren();
    const cont = this.books.filter(b => b.opened && !b.finished).sort((a, b) => b.opened - a.opened)[0];
    if (cont && !this.q) {
      hero.append(el('button', { class: 'hero', onclick: () => this.open(cont.id) },
        el('div', { class: 'hcover' }, this.coverEl(cont)),
        el('div', { class: 'hinfo' },
          el('div', { class: 'hlabel', text: t('continue') }),
          el('div', { class: 'htitle', text: cont.title }),
          el('div', { class: 'hsub', text: [cont.author, this.kindLabel(cont), this.pctLabel(cont)].filter(Boolean).join(' · ') }),
          el('div', { class: 'hbar' }, el('i', { style: { width: Math.round((cont.pct || 0) * 100) + '%' } }))),
        el('div', { class: 'hgo' }, icon('play'))));
    }
    // chips
    const chips = $('#l-chips'); chips.replaceChildren();
    const cdefs = [['all', t('all')], ['comic', t('comics'), 'comic'], ['book', t('books'), 'book'], ['reading', t('reading')], ['done', t('finishedPl')]];
    for (const c of this.collections()) cdefs.push(['c:' + c, c, 'folder']);
    if (!cdefs.some(c => c[0] === S.filter)) S.filter = 'all';
    for (const [v, label, ic] of cdefs) chips.append(el('button', { class: 'chip' + (S.filter === v ? ' on' : ''), onclick: () => { setS('filter', v); this.render(); } }, ic ? icon(ic) : null, label));
    // grid
    const grid = $('#l-grid'); grid.replaceChildren();
    const list = this.filtered();
    for (const b of list) grid.append(this.card(b));
    // empty
    const em = $('#l-empty');
    if (!this.books.length) {
      em.classList.remove('hide'); chips.classList.add('hide');
      em.replaceChildren(
        el('div', { class: 'art' }, icon('shelf')),
        el('h3', { text: t('emptyTitle') }),
        el('p', { text: t('emptyText') }),
        el('button', { class: 'btn primary', onclick: () => $('#l-file').click() }, icon('plus'), t('addFirst')),
        el('div', { class: 'fmts', text: t('formats') }));
      $('#l-add').classList.add('hide');
    } else {
      chips.classList.remove('hide'); $('#l-add').classList.remove('hide');
      if (!list.length) { em.classList.remove('hide'); em.replaceChildren(el('p', { text: this.q ? t('noResults') : t('nothingHere') })); }
      else em.classList.add('hide');
    }
    this.renderGhosts();
  },
  async renderGhosts() {
    const box = $('#l-ghosts'); box.replaceChildren();
    if (!Sync.on || this.q) return;
    const cloud = await Sync.list();
    const have = new Set(this.books.map(b => b.fp));
    const missing = cloud.filter(c => !have.has(c.fp) && c.title);
    if (!missing.length) return;
    box.append(el('div', { class: 'sec-h', style: { marginTop: '28px' } }, el('h2', { text: t('otherDevices') })));
    const g = el('div', { class: 'grid' });
    for (const c of missing.slice(0, 40)) {
      g.append(el('div', { class: 'card ghost' },
        el('button', { class: 'cover', onclick: () => this.ghostInfo(c) }, this.coverEl({ title: c.title, author: c.author, kind: c.kind }),
          el('div', { class: 'cbar' }, el('i', { style: { width: Math.round((c.pct || 0) * 100) + '%' } }))),
        el('div', { class: 'crow' }, el('div', { class: 'ctext' }, el('div', { class: 'ctitle', text: c.title }), el('div', { class: 'cmeta', text: this.pctLabel(c) })))));
    }
    box.append(g);
  },
  ghostInfo(c) {
    const s = Sheets.open({
      title: c.title, center: true, body: b => {
        b.append(el('p', { style: { lineHeight: 1.55, margin: '0 0 8px' }, text: t('ghostText', { f: c.fname || c.title }) }),
          el('p', { class: 'muted', style: { fontSize: '13px', margin: '0 0 18px' }, text: t('progressLbl') + ': ' + this.pctLabel(c) }),
          el('div', { style: { display: 'flex', gap: '10px' } },
            el('button', { class: 'btn', style: { flex: 1 }, text: t('forget'), onclick: async () => { Sync.remove(c.fp); Sheets.close(s); await sleep(300); this.renderGhosts(); } }),
            el('button', { class: 'btn primary', style: { flex: 1 }, text: t('addFile'), onclick: () => { Sheets.close(s); $('#l-file').click(); } })));
      }
    });
  },
  card(b) {
    const cover = el('button', { class: 'cover', 'aria-label': b.title, onclick: () => this.open(b.id) }, this.coverEl(b),
      el('span', { class: 'badge', text: b.format === 'cbz' ? 'HQ' : b.format.toUpperCase() }),
      b.finished ? el('span', { class: 'done' }, icon('check')) : null,
      (b.pct > 0 && !b.finished) ? el('div', { class: 'cbar' }, el('i', { style: { width: Math.round(b.pct * 100) + '%' } })) : null);
    return el('div', { class: 'card' }, cover,
      el('div', { class: 'crow' },
        el('div', { class: 'ctext' }, el('div', { class: 'ctitle', text: b.title }),
          el('div', { class: 'cmeta', text: [b.author, this.pctLabel(b)].filter(Boolean).join(' · ') })),
        el('button', { class: 'icon more', 'aria-label': t('options'), onclick: () => this.menu(b) }, icon('more'))));
  },
  menu(b) {
    const s = Sheets.open({
      title: b.title, body: body => {
        const L = el('div', { class: 'list' });
        const item = (ic, label, fn, cls, sub) => L.append(el('button', { class: 'li ' + (cls || ''), onclick: () => { Sheets.close(s); fn(); } }, icon(ic), el('div', { class: 'lt' }, label, sub ? el('small', { text: sub }) : null)));
        item('play', b.pct ? t('continueReading') : t('startReading'), () => this.open(b.id));
        item('info', t('details'), () => this.info(b));
        item('edit', t('editDetails'), () => this.edit(b));
        item('folder', t('collections'), () => this.collectionsFor(b), '', (b.collections || []).join(', ') || null);
        if (b.format === 'pdf') item('flip', b.kind === 'comic' ? t('openAsBook') : t('openAsComic'), async () => { b.kind = b.kind === 'comic' ? 'book' : 'comic'; b.pos = null; await saveRec(b); this.render(); toast(b.kind === 'comic' ? t('nowComic') : t('nowBook')); });
        item('check', b.finished ? t('markUnread') : t('markRead'), async () => { b.finished = !b.finished; if (b.finished) b.pct = 1; else if (b.pct >= 1) b.pct = 0.99; await saveRec(b); this.render(); });
        item('trash', t('remove'), async () => {
          if (await Sheets.confirm(t('removeQ'), t('removeText', { t: b.title }), t('remove'), true)) {
            await DB.del('books', b.id); await DB.del('files', b.id); await DB.delPrefix('kv', 'pn:' + b.id + ':');
            this.render(); toast(t('removed'));
          }
        }, 'danger');
        body.append(L);
      }
    });
  },
  info(b) {
    Sheets.open({
      title: t('details'), body: body => {
        const dl = el('dl', { class: 'kv' });
        const row = (k, v) => { if (v != null && v !== '') dl.append(el('dt', { text: k }), el('dd', { text: String(v) })); };
        row(t('title'), b.title); row(t('author'), b.author); row(t('type'), this.kindLabel(b)); row(t('format'), b.format === 'cbz' ? 'CBZ (ZIP)' : b.format.toUpperCase());
        row(t('pagesLbl'), b.pages); row(t('chaptersLbl'), b.chapters); row(t('size'), fmtSize(b.size)); row(t('file'), b.fname);
        row(t('progressLbl'), this.pctLabel(b)); row(t('bookmarks'), (b.bookmarks || []).length || null); row(t('highlights'), (b.highlights || []).length || null);
        row(t('addedOn'), new Date(b.added).toLocaleDateString(S.lang === 'en' ? 'en-US' : 'pt-BR'));
        if (b.opened) row(t('lastRead'), new Date(b.opened).toLocaleString(S.lang === 'en' ? 'en-US' : 'pt-BR', { dateStyle: 'medium', timeStyle: 'short' }));
        body.append(dl);
      }
    });
  },
  edit(b) {
    const s = Sheets.open({
      title: t('editDetails'), center: true, body: body => {
        const ti = el('input', { class: 'field', value: b.title || '' }); const au = el('input', { class: 'field', value: b.author || '', placeholder: t('author') });
        body.append(el('div', { class: 'gl', style: { fontSize: '12px', color: 'var(--muted)', margin: '0 0 6px' }, text: t('title') }), ti,
          el('div', { class: 'gl', style: { fontSize: '12px', color: 'var(--muted)', margin: '14px 0 6px' }, text: t('author') }), au,
          el('button', { class: 'btn primary block', style: { marginTop: '18px' }, text: t('save'), onclick: async () => { b.title = ti.value.trim() || b.title; b.author = au.value.trim(); await saveRec(b); Sheets.close(s); this.render(); } }));
      }
    });
  },
  collectionsFor(b) {
    const s = Sheets.open({
      title: t('collections'), body: body => {
        const draw = () => {
          body.replaceChildren();
          const all = [...new Set(this.collections().concat(b.collections || []))].sort(natCmp);
          const L = el('div', { class: 'list' });
          if (!all.length) L.append(el('div', { class: 'empty-l', text: t('noCollections') }));
          for (const c of all) {
            const on = (b.collections || []).includes(c);
            L.append(el('button', { class: 'li' + (on ? ' cur' : ''), onclick: async () => { b.collections = on ? b.collections.filter(x => x !== c) : (b.collections || []).concat(c); await saveRec(b, { sync: false }); draw(); this.render(); } }, icon(on ? 'check' : 'folder'), el('div', { class: 'lt', text: c })));
          }
          body.append(L, el('button', { class: 'btn block', style: { marginTop: '12px' }, onclick: async () => { const n = await Sheets.prompt(t('newCollection'), '', { placeholder: t('collectionPh'), ok: t('create') }); if (n) { b.collections = [...new Set((b.collections || []).concat(n))]; await saveRec(b, { sync: false }); draw(); this.render(); } } }, icon('plus'), t('newCollection')));
        };
        draw();
      }
    });
  },
  sortSheet() {
    const s = Sheets.open({
      title: t('sortBy'), body: body => {
        const L = el('div', { class: 'list' });
        for (const [v, label] of [['recent', t('sRecent')], ['added', t('sAdded')], ['title', t('sTitle')], ['author', t('sAuthor')], ['progress', t('sProgress')]])
          L.append(el('button', { class: 'li' + (S.sort === v ? ' cur' : ''), onclick: () => { setS('sort', v); Sheets.close(s); this.render(); } }, icon(S.sort === v ? 'check' : 'sort'), el('div', { class: 'lt', text: label })));
        body.append(L);
      }
    });
  },
  async open(id) {
    const rec = await DB.get('books', id);
    if (!rec) return;
    const blob = await DB.get('files', id);
    if (!blob) { Sheets.confirm(t('fileMissing'), t('fileMissingText'), t('addFile')).then(ok => ok && $('#l-file').click()); return; }
    // resume from another device?
    const cloud = await Sync.pull(rec.fp);
    if (mergeCloud(rec, cloud)) toast(t('syncedPos'));
    rec.opened = Date.now();
    await DB.put('books', rec.id, rec);
    Pause.start();
    try {
      if (rec.kind === 'comic') await Comic.open(rec, blob);
      else if (rec.format === 'pdf') await PdfBook.open(rec, blob);
      else await Book.open(rec, blob);
    } catch (e) {
      console.error(e); busy(null); Pause.stop(); App.show('v-lib');
      Sheets.open({ title: t('openFail'), center: true, body: b => b.append(el('p', { style: { lineHeight: 1.5 }, text: (e && e.message) || String(e) }), el('button', { class: 'btn primary block', text: 'OK', onclick: () => Sheets.close() })) });
    }
  },
};
