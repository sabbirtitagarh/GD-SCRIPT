/**
 * GD SCRIPT – scripts.js
 * Script storage layer used by dashboard / editor / teleprompter / recording.
 *
 *   • Every script lives in IndexedDB on this device (works offline, also for guests).
 *   • If the user connected THEIR OWN Google Drive, changes are pushed to their Drive folder and
 *     remote changes are pulled in. Nothing is ever stored in the platform owner's Drive.
 *   • Conflicts never lose data: the other device's copy is kept as a separate script.
 */
(function () {
  'use strict';
  const GDS = window.GDS;
  const DB_NAME = 'gdscript', DB_VER = 1;

  /* ---------------- low-level storage with in-memory fallback ---------------- */
  let backendP = null;
  const mem = { scripts: new Map(), recordings: new Map() };
  let usingMemory = false;

  function openIdb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('scripts')) d.createObjectStore('scripts', { keyPath: 'key' }).createIndex('ns', 'ns');
        if (!d.objectStoreNames.contains('recordings')) d.createObjectStore('recordings', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
  }
  function backend() {
    if (!backendP) backendP = openIdb().catch((e) => {
      usingMemory = true;
      console.warn('IndexedDB not available, using temporary memory storage:', e && e.message);
      setTimeout(() => GDS.toast('Your browser blocks local storage – scripts will be lost when you close this tab. Connect Google Drive or export a backup.', 'err', { ms: 9000 }), 500);
      return null;
    });
    return backendP;
  }
  const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  async function lowAll(storeName, ns) {
    const d = await backend();
    if (!d) return Array.from(mem[storeName].values()).filter((r) => storeName !== 'scripts' || r.ns === ns);
    const st = d.transaction(storeName, 'readonly').objectStore(storeName);
    return storeName === 'scripts' ? req2p(st.index('ns').getAll(ns)) : req2p(st.getAll());
  }
  async function lowGet(storeName, key) {
    const d = await backend();
    if (!d) return mem[storeName].get(key) || null;
    return (await req2p(d.transaction(storeName, 'readonly').objectStore(storeName).get(key))) || null;
  }
  async function lowPut(storeName, rec) {
    const d = await backend();
    if (!d) { mem[storeName].set(storeName === 'scripts' ? rec.key : rec.id, rec); return; }
    await req2p(d.transaction(storeName, 'readwrite').objectStore(storeName).put(rec));
  }
  async function lowDel(storeName, key) {
    const d = await backend();
    if (!d) { mem[storeName].delete(key); return; }
    await req2p(d.transaction(storeName, 'readwrite').objectStore(storeName).delete(key));
  }

  /* ---------------- helpers ---------------- */
  const nsNow = () => GDS.profile.get().id;
  const keyOf = (ns, id) => ns + ':' + id;
  const driveOn = () => { const p = GDS.profile.get(); return !p.guest && !!(p.drive && p.drive.connected) && GDS.apiConfigured(); };
  const meta = (r) => ({ id: r.id, title: r.title, category: r.category, fav: !!r.fav, words: r.words || 0, created: r.created, updated: r.updated, dirty: !!r.dirty, hasBody: !!r.hasBody, onDrive: !!r.fileId });
  const toScript = (r) => ({ id: r.id, title: r.title, body: r.body || '', category: r.category || '', fav: !!r.fav, bookmarks: GDS.parseMarkers(r.body || '').slice(0, 60), created: r.created, updated: r.updated });
  const MAX_CHARS = 400000;

  function newRecord(ns, p) {
    const now = Date.now();
    const body = String(p.body || '').replace(/\r\n?/g, '\n');
    if (body.length > MAX_CHARS) throw new Error('This script is too long (maximum ' + MAX_CHARS.toLocaleString() + ' characters).');
    return {
      key: keyOf(ns, p.id || GDS.uid()), ns: ns, id: p.id || '', fileId: p.fileId || '', modified: p.modified || '',
      title: String(p.title || 'Untitled').slice(0, 120), body: body, hasBody: p.hasBody !== false,
      category: String(p.category || '').slice(0, 30), fav: !!p.fav, bookmarks: [],
      created: p.created || now, updated: p.updated || now, words: GDS.wordCount(body),
      dirty: p.dirty !== false, deleted: false
    };
  }

  /* ---------------- sync ---------------- */
  let syncing = false, queued = false, lastError = '';
  const status = (state, extra) => GDS.emit('sync', Object.assign({ state: state, pending: 0, error: lastError }, extra || {}));

  async function pendingCount() {
    if (!driveOn()) return 0;
    return (await lowAll('scripts', nsNow())).filter((r) => r.dirty || r.deleted).length;
  }

  async function pushAll(ns) {
    const recs = (await lowAll('scripts', ns)).filter((r) => r.dirty || r.deleted);
    for (const r of recs) {
      if (r.deleted) {
        if (r.fileId) { try { await GDS.api('scripts.delete', { fileId: r.fileId }); } catch (e) { if (e.code !== 'NOT_FOUND') throw e; } }
        await lowDel('scripts', r.key);
        continue;
      }
      try {
        const res = await GDS.api('scripts.save', { fileId: r.fileId || undefined, baseModified: r.fileId ? r.modified : undefined, script: toScript(r) });
        await afterPush(r, res);
      } catch (e) {
        if (e.code === 'CONFLICT') await resolveConflict(ns, r);
        else if (e.code === 'NOT_FOUND' && r.fileId) { r.fileId = ''; r.modified = ''; await lowPut('scripts', r); }   // deleted elsewhere → re-create
        else throw e;
      }
    }
  }
  async function afterPush(r, res) {
    const cur = (await lowGet('scripts', r.key)) || r;
    cur.fileId = res.meta.fileId; cur.modified = res.meta.modified;
    if (cur.updated === r.updated) cur.dirty = false;       // edited again while pushing → stays dirty
    await lowPut('scripts', cur);
  }
  async function resolveConflict(ns, mine) {
    // Keep the other device's version as its own script, then overwrite Drive with mine.
    const remote = await GDS.api('scripts.get', { fileId: mine.fileId });
    const copy = newRecord(ns, { title: (remote.script.title || mine.title) + ' (other device)', body: remote.script.body, category: remote.script.category, fav: remote.script.fav });
    await lowPut('scripts', copy);
    const res = await GDS.api('scripts.save', { fileId: mine.fileId, force: true, script: toScript(mine) });
    await afterPush(mine, res);
    GDS.toast('“' + mine.title + '” was also edited on another device. Both versions are kept.', '', { ms: 6000 });
  }

  async function pullAll(ns) {
    const r = await GDS.api('scripts.list');
    const local = await lowAll('scripts', ns);
    const byId = new Map(local.map((x) => [x.id, x]));
    const remoteIds = new Set();
    for (const m of r.scripts) {
      remoteIds.add(m.id);
      const rec = byId.get(m.id);
      if (!rec) {
        await lowPut('scripts', { key: keyOf(ns, m.id), ns: ns, id: m.id, fileId: m.fileId, modified: m.modified, title: m.title, body: null, hasBody: false, category: m.category, fav: m.fav, bookmarks: [], created: m.created, updated: m.updated, words: m.words, dirty: false, deleted: false });
      } else if (!rec.dirty && !rec.deleted) {
        if (rec.modified !== m.modified) {
          Object.assign(rec, { fileId: m.fileId, modified: m.modified, title: m.title, category: m.category, fav: m.fav, updated: m.updated, words: m.words, body: null, hasBody: false });
          await lowPut('scripts', rec);
        }
      } else if (!rec.fileId) { rec.fileId = m.fileId; rec.modified = rec.modified || m.modified; await lowPut('scripts', rec); }
    }
    for (const rec of local) {
      if (remoteIds.has(rec.id) || !rec.fileId) continue;
      if (rec.dirty && !rec.deleted) { rec.fileId = ''; rec.modified = ''; await lowPut('scripts', rec); }    // removed on Drive but edited here → keep & re-upload
      else await lowDel('scripts', rec.key);                                                                  // removed elsewhere
    }
  }

  async function prefetch(ns) {
    const todo = (await lowAll('scripts', ns)).filter((r) => !r.hasBody && r.fileId).sort((a, b) => b.updated - a.updated).slice(0, 25);
    for (const r of todo) {
      if (!navigator.onLine) return;
      try { await store.get(r.id); } catch (e) { return; }
    }
  }

  const store = {
    usingMemory: () => usingMemory,
    ns: nsNow,
    driveOn: driveOn,
    pending: pendingCount,

    async sync(opts) {
      opts = opts || {};
      if (!driveOn()) { status('local'); return false; }
      if (!navigator.onLine) { status('offline', { pending: await pendingCount() }); return false; }
      if (syncing) { queued = true; return false; }
      syncing = true; status('syncing');
      const ns = nsNow();
      try {
        await pushAll(ns);
        await pullAll(ns);
        lastError = '';
        status('idle', { pending: await pendingCount() });
        GDS.emit('scripts-changed');
        if (!opts.noPrefetch) prefetch(ns).catch(() => {});
        return true;
      } catch (e) {
        lastError = e.message || 'Sync failed';
        if (e.code === 'DRIVE_REVOKED' || e.code === 'DRIVE_NOT_CONNECTED') { GDS.auth.refresh().catch(() => {}); }
        status('error', { pending: await pendingCount(), error: lastError });
        return false;
      } finally {
        syncing = false;
        if (queued) { queued = false; setTimeout(() => store.sync({ noPrefetch: true }), 600); }
      }
    },
    schedulePush: GDS.debounce(() => { store.sync({ noPrefetch: true }); }, 2500),

    /** Metadata of all scripts (no bodies), newest first. */
    async list() {
      const ns = nsNow();
      return (await lowAll('scripts', ns)).filter((r) => !r.deleted).sort((a, b) => b.updated - a.updated).map(meta);
    },

    async get(id) {
      const ns = nsNow();
      const r = await lowGet('scripts', keyOf(ns, id));
      if (!r || r.deleted) return null;
      if (!r.hasBody) {
        if (!r.fileId) { r.body = ''; r.hasBody = true; await lowPut('scripts', r); }
        else {
          if (!navigator.onLine) throw new Error('This script has not been downloaded for offline use yet. Connect to the internet once to open it.');
          const res = await GDS.api('scripts.get', { fileId: r.fileId });
          const cur = (await lowGet('scripts', r.key)) || r;
          if (cur.dirty) return cur;
          Object.assign(cur, { body: res.script.body || '', hasBody: true, title: res.script.title || cur.title, category: res.script.category || '', fav: !!res.script.fav, bookmarks: res.script.bookmarks || [], created: res.script.created || cur.created, modified: res.meta.modified, words: GDS.wordCount(res.script.body) });
          await lowPut('scripts', cur);
          return cur;
        }
      }
      return r;
    },

    async create(p) {
      const rec = newRecord(nsNow(), Object.assign({}, p, { id: GDS.uid() }));
      rec.bookmarks = GDS.parseMarkers(rec.body);
      await lowPut('scripts', rec);
      GDS.emit('scripts-changed');
      if (driveOn()) store.schedulePush();
      return rec;
    },

    async save(id, patch) {
      const ns = nsNow();
      const r = await lowGet('scripts', keyOf(ns, id));
      if (!r || r.deleted) throw new Error('Script not found.');
      if (patch.body !== undefined) {
        const body = String(patch.body).replace(/\r\n?/g, '\n');
        if (body.length > MAX_CHARS) throw new Error('This script is too long (maximum ' + MAX_CHARS.toLocaleString() + ' characters).');
        r.body = body; r.hasBody = true; r.words = GDS.wordCount(body); r.bookmarks = GDS.parseMarkers(body);
      }
      if (patch.title !== undefined) r.title = String(patch.title).trim().slice(0, 120) || 'Untitled';
      if (patch.category !== undefined) r.category = String(patch.category).trim().slice(0, 30);
      if (patch.fav !== undefined) r.fav = !!patch.fav;
      r.updated = Date.now(); r.dirty = true;
      await lowPut('scripts', r);
      GDS.emit('scripts-changed');
      if (driveOn()) store.schedulePush();
      return r;
    },

    async duplicate(id) {
      const src = await store.get(id);
      if (!src) throw new Error('Script not found.');
      return store.create({ title: src.title + ' (copy)', body: src.body, category: src.category });
    },

    async remove(id) {
      const ns = nsNow();
      const r = await lowGet('scripts', keyOf(ns, id));
      if (!r) return;
      if (r.fileId && driveOn()) { r.deleted = true; r.dirty = true; await lowPut('scripts', r); store.schedulePush(); }
      else await lowDel('scripts', r.key);
      GDS.emit('scripts-changed');
    },

    async importText(name, text) {
      const title = String(name || 'Imported script').replace(/\.(txt|md|text)$/i, '').slice(0, 120) || 'Imported script';
      return store.create({ title: title, body: text });
    },

    /** All scripts with bodies, as a backup object (downloads missing bodies from Drive first). */
    async exportAll(onProgress) {
      const metas = await store.list();
      const out = [];
      for (let i = 0; i < metas.length; i++) {
        const r = await store.get(metas[i].id);
        if (r) out.push(toScript(r));
        if (onProgress) onProgress(i + 1, metas.length);
      }
      return { app: 'GD SCRIPT', type: 'backup', version: 1, created: Date.now(), count: out.length, scripts: out };
    },

    /** Merge a backup file. Existing scripts are never overwritten – clashes are imported as new scripts. */
    async importBackup(obj) {
      if (!obj || obj.app !== 'GD SCRIPT' || !Array.isArray(obj.scripts)) throw new Error('This is not a GD SCRIPT backup file.');
      const ns = nsNow();
      const have = new Set((await lowAll('scripts', ns)).map((r) => r.id));
      let added = 0, copies = 0;
      for (const s of obj.scripts.slice(0, 500)) {
        if (!s || typeof s.body !== 'string') continue;
        const clash = !s.id || !/^[a-z0-9]{6,32}$/.test(s.id) || have.has(s.id);
        const rec = newRecord(ns, { id: clash ? GDS.uid() : s.id, title: clash && s.id ? (s.title || 'Imported') + ' (imported)' : s.title, body: s.body, category: s.category, fav: s.fav, created: s.created, updated: s.updated });
        rec.bookmarks = GDS.parseMarkers(rec.body);
        have.add(rec.id);
        await lowPut('scripts', rec);
        clash ? copies++ : added++;
      }
      GDS.emit('scripts-changed');
      if (driveOn()) store.schedulePush();
      return { added: added, copies: copies };
    },

    /** Move scripts between workspaces (e.g. guest → account). Marks them dirty so they upload to Drive. */
    async migrate(fromNs, toNs) {
      const recs = await lowAll('scripts', fromNs);
      for (const r of recs) {
        await lowDel('scripts', r.key);
        await lowPut('scripts', Object.assign({}, r, { key: keyOf(toNs, r.id), ns: toNs, fileId: '', modified: '', dirty: true, deleted: false }));
      }
      return recs.length;
    },
    /** ids of scripts whose title or (locally available) text contains q */
    async searchText(q) {
      q = String(q || '').toLowerCase();
      return (await lowAll('scripts', nsNow())).filter((r) => !r.deleted && ((r.title || '').toLowerCase().indexOf(q) >= 0 || (r.body || '').toLowerCase().indexOf(q) >= 0 || (r.category || '').toLowerCase().indexOf(q) >= 0)).map((r) => r.id);
    },
    async count(ns) { return (await lowAll('scripts', ns)).filter((r) => !r.deleted).length; },
    async wipe(ns) { for (const r of await lowAll('scripts', ns)) await lowDel('scripts', r.key); },

    categories(metas) {
      const set = new Set((GDS.profile.get().prefs.categories || []));
      (metas || []).forEach((m) => { if (m.category) set.add(m.category); });
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    },
    addCategory(name) {
      name = String(name || '').trim().slice(0, 30);
      if (!name) return null;
      const cur = GDS.profile.get().prefs.categories || [];
      if (cur.indexOf(name) < 0) GDS.profile.setPrefs({ categories: cur.concat([name]).slice(0, 40) });
      return name;
    }
  };
  GDS.store = store;

  /* ---------------- recordings (device only) ---------------- */
  GDS.recStore = {
    list: async () => (await lowAll('recordings')).sort((a, b) => b.created - a.created),
    put: (rec) => lowPut('recordings', rec),
    get: (id) => lowGet('recordings', id),
    del: (id) => lowDel('recordings', id)
  };

  window.addEventListener('online', () => { if (driveOn()) store.sync({ noPrefetch: true }); });
})();
