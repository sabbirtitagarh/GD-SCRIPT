/** GD SCRIPT – dashboard.js (dashboard.html): script library, search, favourites, status cards */
(async function () {
  'use strict';
  const GDS = window.GDS, $ = GDS.$, h = GDS.h;
  await GDS.init({ page: 'dashboard' });

  const prof = GDS.profile.get();
  $('#welcomeTitle').textContent = GDS.t('dash.welcome') + (prof.guest ? '' : ', ' + prof.username);
  if (prof.brand.welcome) $('#welcomeMsg').textContent = prof.brand.welcome;
  else if (prof.brand.brandName) $('#welcomeMsg').textContent = prof.brand.brandName + ' – write, read and record in one place.';
  if (prof.guest) $('#guestBanner').classList.remove('hide');
  const mail = GDS.config.SUPPORT_EMAIL || ''; $('#supportMail').textContent = mail; $('#supportMail').href = 'mailto:' + mail + '?subject=' + encodeURIComponent('GD SCRIPT support');

  /* ---------------- state + rendering ---------------- */
  let all = [], query = '', cat = '', sort = 'updated', matched = null;
  const minutes = (w) => GDS.readMinutes(w);

  function statusChip(m) {
    if (prof.guest || !GDS.store.driveOn()) return null;
    return m.dirty ? h('span', { class: 'chip warn' }, GDS.icon('cloudoff'), 'Not synced') : h('span', { class: 'chip ok' }, GDS.icon('cloud'), 'Drive');
  }

  function card(m) {
    const fav = h('button', { class: 'btn ghost icon sm' + (m.fav ? ' fav-on' : ''), type: 'button', 'aria-label': m.fav ? 'Remove from favourites' : 'Add to favourites', 'aria-pressed': String(!!m.fav) }, GDS.icon('star'));
    fav.addEventListener('click', async () => { await GDS.store.save(m.id, { fav: !m.fav }); });
    const read = h('a', { class: 'btn secondary icon sm', href: 'teleprompter.html?id=' + encodeURIComponent(m.id), 'aria-label': 'Read “' + m.title + '” in teleprompter', title: GDS.t('btn.read') }, GDS.icon('play'));
    const more = h('button', { class: 'btn ghost icon sm', type: 'button', 'aria-label': 'More actions', 'aria-haspopup': 'menu' }, GDS.icon('dots'));
    more.addEventListener('click', () => GDS.menu(more, [
      { label: GDS.t('btn.edit'), icon: 'edit', href: 'editor.html?id=' + encodeURIComponent(m.id) },
      { label: 'Rename', icon: 'type', onClick: () => rename(m) },
      { label: 'Move to folder…', icon: 'folder', onClick: () => moveToFolder(m) },
      { label: GDS.t('btn.duplicate'), icon: 'copy', onClick: async () => { try { await GDS.store.duplicate(m.id); GDS.toast('Duplicated.', 'ok'); } catch (e) { GDS.toast(e.message, 'err'); } } },
      { label: GDS.t('btn.export'), icon: 'download', onClick: () => exportTxt(m) },
      'hr',
      { label: GDS.t('btn.delete'), icon: 'trash', danger: true, onClick: () => del(m) }
    ]));
    const sub = h('span', null, m.words.toLocaleString() + ' words · ≈' + minutes(m.words) + ' min · ' + GDS.fmtDate(m.updated));
    const metaBox = h('a', { class: 'meta', href: 'editor.html?id=' + encodeURIComponent(m.id), style: { textDecoration: 'none', color: 'inherit' } },
      h('b', { 'data-notr': '' }, m.title), sub, h('div', { class: 'row', style: { marginTop: '4px', gap: '6px' } }, m.category ? h('span', { class: 'chip', 'data-notr': '' }, GDS.icon('folder'), m.category) : null, statusChip(m)));
    return h('div', { class: 'script-card' }, metaBox, h('div', { class: 'acts' }, fav, read, more));
  }

  const emptyBox = (txt, withBtn) => h('div', { class: 'empty' }, GDS.icon('file'), h('p', null, txt), withBtn ? h('a', { class: 'btn', href: 'editor.html?new=1' }, GDS.icon('plus'), GDS.t('btn.new')) : null);

  function fill(el, list, emptyTxt, withBtn) {
    el.replaceChildren();
    if (!list.length) { el.append(emptyBox(emptyTxt, withBtn)); return; }
    list.forEach((m) => el.append(card(m)));
  }

  function render() {
    const recent = all.slice(0, 4), favs = all.filter((m) => m.fav).slice(0, 6);
    fill($('#recentList'), recent, GDS.t('dash.empty'), true);
    fill($('#favList'), favs, 'Tap the ★ on a script to keep it here.', false);

    // categories chips
    const cats = GDS.store.categories(all);
    const chips = $('#cats'); chips.replaceChildren();
    const mk = (label, val) => { const c = h('button', Object.assign({ type: 'button', class: 'chip' + (cat === val ? ' active' : '') }, val ? { 'data-notr': '' } : {}), label); c.addEventListener('click', () => { cat = val; render(); }); return c; };
    if (cats.length) { chips.append(mk(GDS.t('dash.allcats'), '')); cats.forEach((c) => chips.append(mk(c, c))); }

    let list = all.slice();
    if (matched) list = list.filter((m) => matched.has(m.id));
    if (cat) list = list.filter((m) => m.category === cat);
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title)); else if (sort === 'words') list.sort((a, b) => b.words - a.words);
    fill($('#allList'), list, query || cat ? 'No script matches.' : GDS.t('dash.empty'), !query && !cat);

    // stats
    $('#stScripts').textContent = all.length; $('#stFavs').textContent = all.filter((m) => m.fav).length;
    $('#stWords').textContent = all.reduce((s, m) => s + m.words, 0).toLocaleString();
    const first = all[0]; const lastId = GDS.ls.get('gds.lastScript', '');
    const target = all.find((m) => m.id === lastId) || first;
    const btn = $('#btnLast'); if (target) { btn.href = 'teleprompter.html?id=' + encodeURIComponent(target.id); btn.classList.remove('hide'); } else btn.classList.add('hide');
  }

  async function refresh() { all = await GDS.store.list(); render(); renderSync(); }

  /* ---------------- actions ---------------- */
  async function rename(m) {
    const v = await GDS.prompt({ title: 'Rename script', value: m.title, confirmText: 'Rename' });
    if (v) await GDS.store.save(m.id, { title: v });
  }
  async function moveToFolder(m) {
    await GDS.modal((box, close) => {
      const sel = h('select', { class: 'select' }, h('option', { value: '' }, 'No folder'));
      GDS.store.categories(all).forEach((c) => sel.append(h('option', { value: c, selected: c === m.category, 'data-notr': '' }, c)));
      sel.append(h('option', { value: '__new' }, '+ New folder…'));
      box.append(h('h2', null, 'Move to folder'), h('div', { class: 'field' }, sel), h('div', { class: 'actions' },
        h('button', { class: 'btn outline', type: 'button', onclick: () => close(null) }, 'Cancel'),
        h('button', { class: 'btn primary-action', type: 'button', onclick: async () => {
          let v = sel.value;
          if (v === '__new') { close(null); const n = await GDS.prompt({ title: 'New folder', label: 'Folder name', max: 30 }); if (!n) return; v = GDS.store.addCategory(n); }
          await GDS.store.save(m.id, { category: v }); close(true);
        } }, 'Move')));
    });
  }
  async function exportTxt(m) { try { const r = await GDS.store.get(m.id); GDS.download(GDS.safeName(r.title) + '.txt', r.body); } catch (e) { GDS.toast(e.message, 'err'); } }
  async function del(m) {
    const r = await GDS.confirm({ title: 'Delete “' + m.title + '”?', message: GDS.store.driveOn() ? 'It will be moved to the bin in your Google Drive (kept 30 days) and removed from this device.' : 'This script will be removed from this device. This cannot be undone.', confirmText: 'Delete', danger: true });
    if (r.ok) { await GDS.store.remove(m.id); GDS.toast('Deleted.'); }
  }

  /* ---------------- filters ---------------- */
  const runSearch = GDS.debounce(async () => {
    query = $('#q').value.trim();
    matched = query.length >= 1 ? new Set(await GDS.store.searchText(query)) : null;
    render();
  }, 180);
  $('#q').addEventListener('input', runSearch);
  $('#sort').addEventListener('change', (e) => { sort = e.target.value; render(); });

  /* ---------------- import ---------------- */
  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    let ok = 0;
    for (const f of files.slice(0, 20)) {
      try { if (f.size > 1.5e6) throw new Error('too big'); await GDS.store.importText(f.name, await GDS.readFileText(f)); ok++; }
      catch (err) { GDS.toast('Could not import “' + f.name + '”: ' + (err.message === 'too big' ? 'file is larger than the limit.' : err.message), 'err'); }
    }
    if (ok) GDS.toast('Imported ' + ok + ' script' + (ok > 1 ? 's' : '') + '.', 'ok');
  });

  /* ---------------- sync / drive status ---------------- */
  async function renderSync() {
    const el = $('#stSync');
    if (prof.guest) { el.textContent = 'Not connected'; return; }
    if (!GDS.store.driveOn()) { el.textContent = 'Not connected'; return; }
    const pend = await GDS.store.pending();
    el.textContent = !navigator.onLine ? 'Offline' : pend ? pend + ' pending' : 'Synced ✓';
  }
  GDS.on('sync', async (s) => {
    const b = $('#syncBanner');
    if (s.state === 'error') {
      b.className = 'banner'; b.replaceChildren(GDS.icon('info'), h('div', { class: 'grow' }, 'Could not sync with Google Drive: ' + s.error), (() => { const r = GDS.btn('Retry', { cls: 'sm outline' }); r.addEventListener('click', () => GDS.store.sync()); return r; })());
    } else b.className = 'banner hide';
    renderSync();
  });
  GDS.on('scripts-changed', refresh);
  GDS.on('online', renderSync); GDS.on('offline', renderSync);

  /* ---------------- install button ---------------- */
  const updInstall = () => {
    const b = $('#btnInstall'), hint = $('#iosHint');
    b.classList.toggle('hide', !GDS.install.available());
    hint.classList.toggle('hide', !GDS.install.iosSafari());
  };
  $('#btnInstall').addEventListener('click', () => GDS.install.prompt());
  GDS.on('install-change', updInstall); updInstall();

  /* ---------------- guest → account migration ---------------- */
  async function offerMigration() {
    if (prof.guest) return;
    const key = 'gds.migrated.' + prof.id;
    if (GDS.ls.get(key, false)) return;
    const n = await GDS.store.count('guest');
    if (!n) return;
    GDS.ls.set(key, true);
    const r = await GDS.confirm({ title: 'Move your guest scripts?', message: 'You have ' + n + ' script' + (n > 1 ? 's' : '') + ' saved from guest mode on this device. Move ' + (n > 1 ? 'them' : 'it') + ' into your account?', confirmText: 'Move to my account', cancelText: 'Not now' });
    if (r.ok) { await GDS.store.migrate('guest', prof.id); GDS.toast('Moved ' + n + ' script' + (n > 1 ? 's' : '') + ' to your account.', 'ok'); await refresh(); if (GDS.store.driveOn()) GDS.store.sync({ noPrefetch: true }); }
  }

  /* ---------------- go ---------------- */
  await refresh();
  GDS.drive.renderBox($('#driveBody'), { compact: true });
  offerMigration();
  if (GDS.store.driveOn()) GDS.store.sync();
  if (location.hash === '#help') $('#help').scrollIntoView();
})();
