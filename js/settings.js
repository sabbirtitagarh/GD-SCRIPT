/** GD SCRIPT – settings.js (settings.html): account, branding, Drive, teleprompter defaults, language, data, deletion */
(async function () {
  'use strict';
  const GDS = window.GDS, $ = GDS.$, h = GDS.h;
  await GDS.init({ page: 'settings' });

  const p = GDS.profile.get();
  $('#verLine').textContent = 'GD SCRIPT version ' + (GDS.config.VERSION || '1.1.0') + ' · Powered by ' + (GDS.config.OWNER_NAME || 'GD TECH ACADEMY');

  /* ---------------- account ---------------- */
  if (p.guest) { $('#guestBanner').classList.remove('hide'); $('#accountGuest').classList.remove('hide'); $('#danger').classList.add('hide'); }
  else {
    $('#accountUser').classList.remove('hide');
    $('#acUser').textContent = '@' + p.username; $('#acMail').value = p.email;
    $('#btnMail').addEventListener('click', (e) => GDS.busy(e.currentTarget, async () => {
      try { const r = await GDS.api('profile.update', { email: $('#acMail').value.trim() }); GDS.auth.updateUser(r.user); GDS.toast('Email updated.', 'ok'); } catch (err) { GDS.toast(err.message, 'err'); }
    }));
    $('#btnPw').addEventListener('click', (e) => GDS.busy(e.currentTarget, async () => {
      const oldPassword = $('#pwOld').value, newPassword = $('#pwNew').value;
      if (!oldPassword || !newPassword) { GDS.toast('Enter your current and new password.', 'err'); return; }
      try { await GDS.api('auth.password', { oldPassword: oldPassword, newPassword: newPassword }); $('#pwOld').value = ''; $('#pwNew').value = ''; GDS.toast('Password changed. Other devices were logged out.', 'ok', { ms: 5000 }); }
      catch (err) { GDS.toast(err.message, 'err', { ms: 6000 }); }
    }));
    $('#btnLogout').addEventListener('click', () => GDS.logoutFlow());
    $('#btnLogoutAll').addEventListener('click', async () => {
      const r = await GDS.confirm({ title: 'Log out everywhere?', message: 'Every device, including this one, will need to log in again.', confirmText: 'Log out everywhere' });
      if (!r.ok) return;
      try { await GDS.api('auth.logoutAll'); } catch (err) { /* ignore */ }
      GDS.auth.clear(); location.href = 'login.html';
    });
    $('#btnDelete').addEventListener('click', async () => {
      const pw = await GDS.prompt({ title: 'Delete your account?', message: 'This removes your login, branding and settings from the server. Scripts already in your Google Drive stay there. Type your password to confirm.', password: true, label: 'Password', confirmText: 'Delete my account', danger: true });
      if (!pw) return;
      const sure = await GDS.confirm({ title: 'Last check', message: 'Delete the account @' + p.username + ' permanently?', confirmText: 'Yes, delete', danger: true, checkbox: 'Also remove my scripts from this device' });
      if (!sure.ok) return;
      try { await GDS.api('auth.deleteAccount', { password: pw }); if (sure.checked) await GDS.store.wipe(p.id); GDS.auth.clear(); GDS.toast('Account deleted.', 'ok'); setTimeout(() => { location.href = 'index.html'; }, 900); }
      catch (err) { GDS.toast(err.message, 'err', { ms: 6000 }); }
    });
  }

  /* ---------------- branding + drive ---------------- */
  GDS.branding.init();
  const renderDrive = () => GDS.drive.renderBox($('#driveBox'), {});
  renderDrive();
  const qp = new URLSearchParams(location.search);
  if (qp.get('drive')) {
    history.replaceState(null, '', 'settings.html#drive');
    if (qp.get('drive') === 'connected') {
      try { await GDS.auth.refresh(); } catch (e) { /* offline */ }
      GDS.toast('Google Drive connected. Syncing your scripts…', 'ok', { ms: 5000 });
      renderDrive();
      GDS.store.sync().then(renderDrive);
    } else GDS.toast('Google Drive was not connected. Please try again.', 'err', { ms: 6000 });
  }
  GDS.on('profile', () => { /* keep box fresh after disconnect/refresh */ });

  /* ---------------- teleprompter defaults ---------------- */
  const THEMES = [['w-b', 'White on black', '#ffffff', '#000000'], ['b-w', 'Black on white', '#000000', '#ffffff'], ['y-b', 'Yellow on black', '#ffe600', '#000000'], ['g-b', 'Green on black', '#39ff88', '#000000'], ['c-n', 'Cream on navy', '#fff7d6', '#051b62']];
  const dTheme = $('#dTheme'); THEMES.forEach((t) => dTheme.append(h('option', { value: t[0] }, t[1])));
  const dFam = $('#dFam'); Object.keys(GDS.FONT_LABELS).forEach((k) => dFam.append(h('option', { value: k }, GDS.FONT_LABELS[k])));
  function loadDefaults() {
    const P = GDS.profile.get().prefs;
    $('#dFont').value = P.fontSize; $('#dFontO').textContent = P.fontSize + 'px';
    $('#dSpeed').value = P.speed; $('#dSpeedO').textContent = P.speed;
    $('#dCount').value = P.countdown; $('#dCountO').textContent = P.countdown ? P.countdown + 's' : 'off';
    const t = THEMES.find((x) => x[2] === P.textColor && x[3] === P.tpBg); dTheme.value = t ? t[0] : 'w-b';
    dFam.value = P.tpFont; $('#dGuide').checked = !!P.guide; $('#dMirror').checked = !!P.mirror; $('#dLang').value = GDS.lang();
  }
  loadDefaults();
  $('#dFont').addEventListener('input', (e) => { $('#dFontO').textContent = e.target.value + 'px'; GDS.profile.setPrefs({ fontSize: Number(e.target.value) }); });
  $('#dSpeed').addEventListener('input', (e) => { $('#dSpeedO').textContent = e.target.value; GDS.profile.setPrefs({ speed: Number(e.target.value) }); });
  $('#dCount').addEventListener('input', (e) => { const v = Number(e.target.value); $('#dCountO').textContent = v ? v + 's' : 'off'; GDS.profile.setPrefs({ countdown: v }); });
  dTheme.addEventListener('change', () => { const t = THEMES.find((x) => x[0] === dTheme.value); GDS.profile.setPrefs({ textColor: t[2], tpBg: t[3] }); });
  dFam.addEventListener('change', () => GDS.profile.setPrefs({ tpFont: dFam.value }));
  $('#dGuide').addEventListener('change', (e) => GDS.profile.setPrefs({ guide: e.target.checked }));
  $('#dMirror').addEventListener('change', (e) => GDS.profile.setPrefs({ mirror: e.target.checked }));
  $('#dLang').addEventListener('change', (e) => { GDS.toast('Language changed.', 'ok', { ms: 1800 }); GDS.setLang(e.target.value); });

  /* ---------------- data export / import ---------------- */
  const prog = $('#exportProg');
  $('#btnExportAll').addEventListener('click', (e) => GDS.busy(e.currentTarget, async () => {
    try {
      prog.classList.remove('hide');
      const data = await GDS.store.exportAll((i, n) => { prog.firstChild.style.width = Math.round(i / n * 100) + '%'; });
      GDS.download('GD-SCRIPT-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(data, null, 2), 'application/json');
      GDS.toast('Exported ' + data.count + ' script(s).', 'ok');
    } catch (err) { GDS.toast(err.message, 'err', { ms: 7000 }); } finally { prog.classList.add('hide'); }
  }));
  $('#btnImportAll').addEventListener('click', () => $('#fileBackup').click());
  $('#fileBackup').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      if (f.size > 25e6) throw new Error('That file is too large.');
      const obj = JSON.parse(await GDS.readFileText(f));
      const r = await GDS.store.importBackup(obj);
      GDS.toast('Imported ' + (r.added + r.copies) + ' script(s)' + (r.copies ? ' (' + r.copies + ' as copies because they already existed)' : '') + '.', 'ok', { ms: 6000 });
    } catch (err) { GDS.toast(err.message || 'That file could not be imported.', 'err', { ms: 6000 }); }
  });
  $('#btnWipeLocal').addEventListener('click', async () => {
    const synced = GDS.store.driveOn();
    const r = await GDS.confirm({ title: 'Remove scripts from this device?', message: synced ? 'Your scripts stay in your Google Drive and come back at the next sync. Anything not yet uploaded will be lost.' : 'You are not using Google Drive, so these scripts will be deleted for good. Export a backup first if you want to keep them.', confirmText: 'Remove', danger: true });
    if (r.ok) { await GDS.store.wipe(GDS.store.ns()); GDS.emit('scripts-changed'); GDS.toast('Removed from this device.', 'ok'); }
  });

  /* ---------------- install ---------------- */
  const updInstall = () => { $('#btnInstall').classList.toggle('hide', !GDS.install.available()); $('#iosHint').classList.toggle('hide', !GDS.install.iosSafari()); };
  $('#btnInstall').addEventListener('click', () => GDS.install.prompt());
  GDS.on('install-change', updInstall); updInstall();

  if (location.hash) { const t = document.querySelector(location.hash); if (t) setTimeout(() => t.scrollIntoView({ behavior: 'smooth' }), 150); }
})();
