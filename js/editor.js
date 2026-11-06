/** GD SCRIPT – editor.js (editor.html): write / edit / import / export, autosave, bookmarks */
(async function () {
  'use strict';
  const GDS = window.GDS, $ = GDS.$, h = GDS.h;
  await GDS.init({ page: 'editor' });

  const params = new URLSearchParams(location.search);
  let id = params.get('id') || '';
  let rec = null;

  const title = $('#title'), body = $('#body'), cat = $('#cat'), stateChip = $('#saveState');
  const autoSave = GDS.profile.get().prefs.autoSave !== false;

  /* ---------------- load ---------------- */
  if (id) {
    try {
      rec = await GDS.store.get(id);
      if (!rec && GDS.store.driveOn()) { await GDS.store.sync({ noPrefetch: true }); rec = await GDS.store.get(id); }
    } catch (e) { GDS.toast(e.message, 'err', { ms: 8000 }); }
    if (!rec) { GDS.toast('Script not found.', 'err'); setTimeout(() => location.replace('dashboard.html'), 1200); return; }
    title.value = rec.title; body.value = rec.body || ''; $('#btnFav').setAttribute('aria-pressed', String(!!rec.fav)); $('#btnFav').classList.toggle('fav-on', !!rec.fav);
  }
  let fav = !!(rec && rec.fav), category = (rec && rec.category) || '';
  document.title = (rec ? rec.title : 'New script') + ' – ' + GDS.profile.get().brand.appName;

  /* ---------------- helpers ---------------- */
  const setState = (txt, cls) => { stateChip.textContent = txt; stateChip.className = 'chip ' + (cls || ''); };
  function updateCounts() {
    const w = GDS.wordCount(body.value);
    $('#wc').textContent = w.toLocaleString() + ' word' + (w === 1 ? '' : 's') + ' · ' + body.value.length.toLocaleString() + ' characters';
    $('#rt').textContent = '≈ ' + GDS.readMinutes(w) + ' min at 140 wpm';
    $('#btnRead').classList.toggle('is-busy', !body.value.trim());
  }
  function updateDrv() {
    const el = $('#drv'); if (GDS.profile.get().guest) { el.textContent = 'Guest · saved on this device'; return; }
    if (!GDS.store.driveOn()) { el.textContent = 'Saved on this device · connect Drive in Settings to back up'; return; }
    el.textContent = rec && !rec.dirty ? '☁ In your Google Drive' : '☁ Will upload to your Drive';
  }
  function fillCats() {
    cat.replaceChildren(h('option', { value: '' }, 'No folder'));
    GDS.store.list().then((metas) => {
      GDS.store.categories(metas).forEach((c) => cat.append(h('option', { value: c, 'data-notr': '' }, c)));
      cat.append(h('option', { value: '__new' }, '+ New folder…'));
      cat.value = category;
    });
  }
  fillCats(); updateCounts(); updateDrv();
  $('#btnRec').href = 'recording.html' + (id ? '?script=' + encodeURIComponent(id) : '');
  $('#btnRead').href = id ? 'teleprompter.html?id=' + encodeURIComponent(id) : '#';

  /* ---------------- saving ---------------- */
  let dirty = false, saving = Promise.resolve();
  function save() {
    saving = saving.then(async () => {
      if (!dirty && rec) return;
      const patch = { title: title.value.trim() || 'Untitled', body: body.value, category: category, fav: fav };
      try {
        setState('Saving…');
        dirty = false;
        if (!rec) {
          if (!patch.body.trim() && !title.value.trim()) { setState('Saved', 'ok'); return; }
          rec = await GDS.store.create(patch); id = rec.id;
          history.replaceState(null, '', 'editor.html?id=' + encodeURIComponent(id));
          $('#btnRead').href = 'teleprompter.html?id=' + encodeURIComponent(id); $('#btnRec').href = 'recording.html?script=' + encodeURIComponent(id);
        } else { rec = await GDS.store.save(id, patch); }
        setState(GDS.store.driveOn() ? 'Saved · syncing' : 'Saved on device', 'ok'); updateDrv();
      } catch (e) { dirty = true; setState('Not saved', 'err'); GDS.toast(e.message, 'err', { ms: 7000 }); }
    });
    return saving;
  }
  const autosave = GDS.debounce(() => { if (autoSave) save(); }, 1200);
  const touch = () => { dirty = true; setState(autoSave ? 'Unsaved…' : 'Unsaved changes', 'warn'); autosave(); };
  title.addEventListener('input', touch);
  body.addEventListener('input', () => { updateCounts(); touch(); });
  cat.addEventListener('change', async () => {
    if (cat.value === '__new') {
      const n = await GDS.prompt({ title: 'New folder', label: 'Folder name', max: 30 });
      const name = n && GDS.store.addCategory(n); category = name || category; fillCats();
    } else category = cat.value;
    touch();
  });
  $('#btnFav').addEventListener('click', () => { fav = !fav; $('#btnFav').setAttribute('aria-pressed', String(fav)); $('#btnFav').classList.toggle('fav-on', fav); touch(); });
  $('#btnSave').addEventListener('click', async () => { dirty = true; autosave.cancel(); await save(); GDS.toast('Saved.', 'ok', { ms: 1500 }); });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#btnSave').click(); } });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) { autosave.cancel(); save(); } });
  window.addEventListener('pagehide', () => { if (dirty) save(); });
  window.addEventListener('beforeunload', (e) => { if (dirty && !autoSave) { e.preventDefault(); e.returnValue = ''; } });
  GDS.on('sync', (s) => { if (s.state === 'idle' && rec) { GDS.store.get(id).then((r) => { if (r) { rec = r; updateDrv(); if (!dirty) setState('Saved', 'ok'); } }).catch(() => {}); } });

  /* ---------------- toolbar ---------------- */
  const insertAtCursor = (text) => {
    const s = body.selectionStart, e = body.selectionEnd, v = body.value;
    body.value = v.slice(0, s) + text + v.slice(e);
    body.selectionStart = body.selectionEnd = s + text.length; body.focus();
    updateCounts(); touch();
  };
  $('#btnPaste').addEventListener('click', async () => {
    try { const t = await navigator.clipboard.readText(); if (t) insertAtCursor(t); else GDS.toast('Clipboard is empty.'); }
    catch (e) { body.focus(); GDS.toast('Your browser blocked clipboard access. Long-press inside the text box and choose Paste.', '', { ms: 5000 }); }
  });
  $('#btnBm').addEventListener('click', async () => {
    const label = await GDS.prompt({ title: 'Add bookmark', label: 'Section name', placeholder: 'e.g. Intro', max: 50 });
    if (!label) return;
    const v = body.value, pos = body.selectionStart; const ls = v.lastIndexOf('\n', pos - 1) + 1;
    const clean = label.replace(/[\[\]\n]/g, '').trim(); if (!clean) return;
    body.value = v.slice(0, ls) + '[[' + clean + ']]\n' + v.slice(ls);
    body.selectionStart = body.selectionEnd = ls + clean.length + 5; body.focus(); updateCounts(); touch();
    GDS.toast('Bookmark added. Open the bookmark menu in the teleprompter to jump to it.', 'ok', { ms: 4000 });
  });
  $('#btnImportTxt').addEventListener('click', () => $('#fileTxt').click());
  $('#fileTxt').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (f.size > 1.5e6) { GDS.toast('That file is too large (limit about 400,000 characters).', 'err'); return; }
    let text; try { text = await GDS.readFileText(f); } catch (err) { GDS.toast('Could not read that file.', 'err'); return; }
    const apply = (mode) => {
      body.value = mode === 'append' ? body.value.replace(/\s+$/, '') + '\n\n' + text : text;
      if (!title.value.trim()) title.value = f.name.replace(/\.(txt|md|text)$/i, '');
      updateCounts(); touch();
    };
    if (!body.value.trim()) apply('replace');
    else await GDS.modal((m, close) => {
      m.append(h('h2', null, 'Import “' + f.name + '”'), h('p', { class: 'muted' }, 'Your script already has text. What should happen?'),
        h('div', { class: 'actions' }, h('button', { class: 'btn outline', type: 'button', onclick: () => close(null) }, 'Cancel'),
          h('button', { class: 'btn outline', type: 'button', onclick: () => { apply('append'); close(true); } }, 'Add to the end'),
          h('button', { class: 'btn primary-action', type: 'button', onclick: () => { apply('replace'); close(true); } }, 'Replace')));
    });
  });
  const exportTxt = () => GDS.download(GDS.safeName(title.value) + '.txt', body.value);
  $('#btnExport').addEventListener('click', exportTxt);

  $('#btnMore').addEventListener('click', (e) => GDS.menu(e.currentTarget, [
    { label: 'Rename', icon: 'type', onClick: () => { title.focus(); title.select(); } },
    { label: GDS.t('btn.duplicate'), icon: 'copy', onClick: async () => { await save(); if (!rec) return; const c = await GDS.store.duplicate(id); GDS.toast('Duplicated.', 'ok'); location.href = 'editor.html?id=' + encodeURIComponent(c.id); } },
    { label: 'Copy all text', icon: 'file', onClick: async () => { try { await navigator.clipboard.writeText(body.value); GDS.toast('Copied.', 'ok', { ms: 1500 }); } catch (err) { GDS.toast('Could not copy.', 'err'); } } },
    { label: GDS.t('btn.export'), icon: 'download', onClick: exportTxt },
    'hr',
    { label: GDS.t('btn.delete'), icon: 'trash', danger: true, onClick: async () => {
      if (!rec) { location.href = 'dashboard.html'; return; }
      const r = await GDS.confirm({ title: 'Delete this script?', message: 'This cannot be undone' + (GDS.store.driveOn() ? ' from this device. In Google Drive it goes to the bin for 30 days.' : '.'), confirmText: 'Delete', danger: true });
      if (r.ok) { dirty = false; autosave.cancel(); await GDS.store.remove(id); location.href = 'dashboard.html'; }
    } }
  ]));

  // "Read" must save first so the teleprompter always shows the latest text
  $('#btnRead').addEventListener('click', async (e) => {
    e.preventDefault();
    if (!body.value.trim()) { GDS.toast('Write something first.', 'err'); body.focus(); return; }
    dirty = true; autosave.cancel(); await save();
    if (id) location.href = 'teleprompter.html?id=' + encodeURIComponent(id);
  });

  if (!rec) { setState('New script'); (params.get('new') ? title : body).focus(); } else setState('Saved', 'ok');
})();
