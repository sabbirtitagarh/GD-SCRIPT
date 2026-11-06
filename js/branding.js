/**
 * GD SCRIPT – branding.js
 * "My Brand Settings" (white-label): app name, brand name, logo, colours, font, theme, welcome text.
 * Each user's branding is stored on their own account (or on this device for guests).
 * It never changes the platform footer credit or another user's workspace.
 */
(function () {
  'use strict';
  const GDS = window.GDS, $ = GDS.$;
  const MAX_LOGO_CHARS = 38000;               // server limit is 42000 characters

  function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image could not be opened.')); i.src = url; }); }

  /** Resize + compress an uploaded logo into a small data URL (PNG/WebP/JPEG). */
  async function shrinkLogo(file) {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Please choose a PNG, JPG or WebP image.');
    if (file.size > 10 * 1024 * 1024) throw new Error('That image is too large (max 10 MB).');
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const w = img.naturalWidth, hgt = img.naturalHeight;
      if (!w || !hgt) throw new Error('That image could not be read.');
      for (const size of [256, 200, 160, 128, 96, 64]) {
        const k = Math.min(1, size / Math.max(w, hgt));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hgt * k));
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
        for (const t of [['image/webp', 0.9], ['image/webp', 0.7], ['image/png'], ['image/jpeg', 0.85], ['image/jpeg', 0.6]]) {
          let src = c;
          if (t[0] === 'image/jpeg') { src = document.createElement('canvas'); src.width = c.width; src.height = c.height; const g = src.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(c, 0, 0); }
          const u = src.toDataURL(t[0], t[1]);
          if (u.indexOf('data:' + t[0]) === 0 && u.length <= MAX_LOGO_CHARS) return u;
        }
      }
      throw new Error('This logo is too detailed to store. Please use a simpler or smaller image.');
    } finally { URL.revokeObjectURL(url); }
  }

  const branding = {
    init() {
      const p = GDS.profile.get();
      let logo;                                   // undefined = unchanged, '' = default, data URL = new
      let shownLogo = p.logo || '';
      const F = { app: $('#bAppName'), brand: $('#bBrandName'), welcome: $('#bWelcome'), pri: $('#bPrimary'), sec: $('#bSecondary'), bg: $('#bBg'), font: $('#bFont'), theme: $('#bTheme') };

      Object.keys(GDS.FONT_LABELS).forEach((k) => F.font.appendChild(GDS.h('option', { value: k }, GDS.FONT_LABELS[k])));
      const read = () => ({ appName: F.app.value.trim() || 'GD SCRIPT', brandName: F.brand.value.trim(), welcome: F.welcome.value.trim(), primary: F.pri.value, secondary: F.sec.value, background: F.bg.value, font: F.font.value, theme: F.theme.value });
      const write = (b) => { F.app.value = b.appName; F.brand.value = b.brandName; F.welcome.value = b.welcome; F.pri.value = b.primary; F.sec.value = b.secondary; F.bg.value = b.background; F.font.value = b.font; F.theme.value = b.theme; };

      const preview = () => {
        const b = read(), v = GDS.themeVars(b), box = $('#brandPreview');
        box.dataset.theme = v.mode;
        Object.keys(v).forEach((k) => { if (k.slice(0, 2) === '--') box.style.setProperty(k, v[k]); });
        box.style.fontFamily = v['--font']; box.style.background = 'var(--bg)'; box.style.color = 'var(--text)';
        $('#bpName').textContent = b.appName; $('#bpSub').textContent = b.brandName || 'Smart Mobile Teleprompter';
        $('#bpWelcome').textContent = b.welcome || 'Welcome! Write, read and record – all in one place.';
        $('#bpLogo').src = shownLogo || 'assets/logo.png';
      };
      write(p.brand); preview();
      Object.values(F).forEach((el) => { el.addEventListener('input', preview); el.addEventListener('change', preview); });

      $('#btnLogo').addEventListener('click', () => $('#fileLogo').click());
      $('#fileLogo').addEventListener('change', async (e) => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        try { const u = await shrinkLogo(f); logo = u; shownLogo = u; preview(); GDS.toast('Logo ready – press “Save branding” to keep it.', 'ok'); }
        catch (err) { GDS.toast(err.message, 'err', { ms: 6000 }); }
      });
      $('#btnLogoDefault').addEventListener('click', () => { logo = ''; shownLogo = ''; preview(); GDS.toast('Using the GD TECH ACADEMY logo. Press “Save branding” to keep it.'); });

      $('#btnBrandSave').addEventListener('click', (e) => GDS.busy(e.currentTarget, async () => {
        try { await GDS.profile.saveBrand(read(), logo); logo = undefined; shownLogo = GDS.profile.get().logo; GDS.toast('Branding saved.', 'ok'); }
        catch (err) { GDS.toast(err.message, 'err', { ms: 7000 }); }
      }));
      $('#btnBrandReset').addEventListener('click', async () => {
        const r = await GDS.confirm({ title: 'Restore default branding?', message: 'Your app name, logo, colours and welcome message go back to the GD SCRIPT defaults.', confirmText: 'Restore' });
        if (!r.ok) return;
        try { await GDS.profile.resetBrand(); logo = undefined; shownLogo = ''; write(GDS.profile.get().brand); preview(); GDS.toast('Default branding restored.', 'ok'); }
        catch (err) { GDS.toast(err.message, 'err'); }
      });
    },
    shrinkLogo: shrinkLogo
  };
  GDS.branding = branding;
})();
