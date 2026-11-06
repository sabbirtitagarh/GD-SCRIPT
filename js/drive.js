/**
 * GD SCRIPT – drive.js
 * "Connect My Google Drive": OAuth hand-off, status, sync, backup & restore UI.
 * The browser never sees Google tokens – the backend keeps them. We only open Google's consent page.
 */
(function () {
  'use strict';
  const GDS = window.GDS, h = GDS.h;

  const fmtBytes = (n) => { n = Number(n) || 0; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return (i ? n.toFixed(n >= 10 ? 0 : 1) : n) + ' ' + u[i]; };

  const drive = {
    fmtBytes: fmtBytes,

    async connect(btn) {
      const go = async () => {
        try { const r = await GDS.api('drive.authUrl'); location.href = r.url; }
        catch (e) { GDS.toast(e.message, 'err', { ms: 7000 }); }
      };
      return btn ? GDS.busy(btn, go) : go();
    },

    async disconnect() {
      const r = await GDS.confirm({ title: 'Disconnect Google Drive?', message: 'GD SCRIPT will stop saving to your Drive. Your scripts stay on this device and the files already in your Drive are not deleted. You can reconnect any time.', confirmText: 'Disconnect', danger: true });
      if (!r.ok) return false;
      try { const res = await GDS.api('drive.disconnect'); GDS.auth.updateUser(res.user); GDS.toast('Google Drive disconnected.', 'ok'); return true; }
      catch (e) { GDS.toast(e.message, 'err'); return false; }
    },

    async backupNow(btn) {
      return GDS.busy(btn, async () => {
        try { const r = await GDS.api('backup.create', {}, { timeout: 120000 }); GDS.toast('Backup saved in your Drive (' + r.backup.count + ' scripts).', 'ok', { ms: 5000 }); return r.backup; }
        catch (e) { GDS.toast(e.message, 'err', { ms: 7000 }); }
      });
    },

    async restore(id) {
      const c = await GDS.confirm({ title: 'Restore this backup?', message: 'Scripts that are missing will be added back. Scripts you already have are not changed.', confirmText: 'Restore' });
      if (!c.ok) return;
      const t = GDS.toast('Restoring…', '', { sticky: true });
      let offset = 0, restored = 0, skipped = 0;
      try {
        for (let guard = 0; guard < 60; guard++) {
          const r = await GDS.api('backup.restore', { id: id, offset: offset }, { timeout: 180000 });
          restored += r.restored; skipped += r.skipped;
          if (r.next == null) break;
          offset = r.next; t.firstChild.textContent = 'Restoring… ' + offset + ' / ' + r.total;
        }
        t.remove(); GDS.toast('Restored ' + restored + ' script(s)' + (skipped ? ', ' + skipped + ' already existed' : '') + '.', 'ok', { ms: 5000 });
        await GDS.store.sync({ noPrefetch: true });
      } catch (e) { t.remove(); GDS.toast(e.message, 'err', { ms: 7000 }); }
    },

    /** Renders the Drive panel into `el`. opts.compact = dashboard card. */
    async renderBox(el, opts) {
      opts = opts || {};
      const p = GDS.profile.get();
      el.replaceChildren();
      if (p.guest) {
        el.append(h('p', { class: 'muted' }, 'Create a free account to save your scripts in your own Google Drive and use them on every device.'), h('a', { class: 'btn', href: 'register.html' }, 'Create free account'));
        return;
      }
      if (!GDS.apiConfigured()) { el.append(h('p', { class: 'muted' }, 'The server is not configured yet (API_URL missing).')); return; }
      if (!p.drive.connected) {
        el.append(
          h('p', null, 'Save your scripts in a private “GD SCRIPT” folder in ', h('b', null, 'your own'), ' Google Drive.'),
          h('ul', { class: 'small muted', style: { paddingLeft: '18px', margin: '0 0 14px' } },
            h('li', null, 'Google asks for your permission first.'),
            h('li', null, 'GD SCRIPT can only see files it creates – not the rest of your Drive.'),
            h('li', null, 'You can disconnect at any time.')),
          h('p', { class: 'small muted' }, 'Without Drive, scripts stay only in this browser (temporary storage – clearing browser data deletes them).'));
        const b = GDS.btn('Connect My Google Drive', { icon: 'cloud', cls: 'secondary block lg' });
        b.addEventListener('click', () => drive.connect(b));
        el.append(b);
        return;
      }
      el.append(h('div', { class: 'row' }, h('span', { class: 'chip ok' }, GDS.icon('check'), 'Connected'), h('span', { class: 'small muted' }, p.drive.email || 'Google account')));
      const info = h('div', { class: 'small muted mt', id: 'driveInfo' }, 'Checking storage…');
      el.append(info);
      const pend = await GDS.store.pending();
      el.append(h('p', { class: 'small', id: 'drivePending' }, pend ? pend + ' change(s) waiting to upload.' : 'All scripts are in sync.'));
      const row = h('div', { class: 'row' });
      const syncB = GDS.btn('Sync now', { icon: 'refresh', cls: 'outline sm' }); syncB.addEventListener('click', () => GDS.busy(syncB, async () => { const ok = await GDS.store.sync(); GDS.toast(ok ? 'Synced with Google Drive.' : 'Could not sync right now.', ok ? 'ok' : 'err'); drive.renderBox(el, opts); }));
      row.append(syncB);
      if (!opts.compact) {
        const bk = GDS.btn('Create backup now', { icon: 'download', cls: 'outline sm' }); bk.addEventListener('click', async () => { await drive.backupNow(bk); drive.renderBox(el, opts); });
        const dc = GDS.btn('Disconnect', { cls: 'danger outline sm' }); dc.addEventListener('click', async () => { if (await drive.disconnect()) drive.renderBox(el, opts); });
        row.append(bk, dc);
      } else row.append(h('a', { class: 'btn outline sm', href: 'settings.html#drive' }, 'Manage'));
      el.append(row);

      if (!opts.compact) {
        const list = h('div', { class: 'mt', id: 'backupList' }, h('p', { class: 'small muted' }, 'Loading backups…'));
        el.append(h('h3', { class: 'mt' }, 'Backups in your Drive'), list);
        GDS.api('backup.list').then((r) => {
          list.replaceChildren();
          if (!r.backups.length) { list.append(h('p', { class: 'small muted' }, 'No backups yet.')); return; }
          r.backups.forEach((b) => {
            const rb = GDS.btn('Restore', { cls: 'outline sm' }); rb.addEventListener('click', () => drive.restore(b.id));
            list.append(h('div', { class: 'rec-item' }, h('div', { class: 'meta' }, h('b', null, b.name), h('span', { class: 'small muted' }, GDS.fmtDate(b.created) + ' · ' + fmtBytes(b.size))), rb));
          });
        }).catch((e) => { list.replaceChildren(h('p', { class: 'small muted' }, e.message)); });
      }

      GDS.api('drive.status').then((s) => {
        if (!s.connected) { GDS.auth.refresh().then(() => drive.renderBox(el, opts)).catch(() => {}); return; }
        const q = s.storage;
        info.replaceChildren();
        if (q && q.limit) {
          const pct = Math.min(100, (Number(q.usage) / Number(q.limit)) * 100);
          info.append(h('div', null, 'Google storage: ' + fmtBytes(q.usage) + ' used of ' + fmtBytes(q.limit)), h('div', { class: 'progress', style: { marginTop: '6px' } }, h('i', { style: { width: pct.toFixed(1) + '%' } })));
        } else if (q) info.append('Google storage used: ' + fmtBytes(q.usage) + ' (no limit shown)');
        else info.append('Folder: GD SCRIPT (in your Drive)');
      }).catch((e) => { info.textContent = e.code === 'NETWORK' ? 'Offline – storage info unavailable.' : e.message; });
    }
  };
  GDS.drive = drive;
})();
