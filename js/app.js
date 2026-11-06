/**
 * GD SCRIPT – app.js
 * Shared core used by every page: utilities, i18n, icons, dialogs, API client, session,
 * profile/branding/theme, header + footer shell, PWA registration.
 * No third-party libraries. No secrets.
 */
(function () {
  'use strict';
  const CONF = window.GDS_CONFIG || {};
  const GDS = (window.GDS = window.GDS || {});
  GDS.config = CONF;

  /* ============================== utilities ============================== */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  GDS.$ = $; GDS.$$ = $$;

  GDS.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Tiny DOM builder: h('div', {class:'x', onclick:fn}, 'text', childNode) – text is always escaped. */
  GDS.h = function (tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') throw new Error('html attr not allowed');
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  };
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach((x) => append(el, x));
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  const h = GDS.h;

  GDS.uid = () => {
    const a = new Uint8Array(9);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a, (b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-3);
  };
  GDS.debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); fn(...a); }; d.cancel = () => clearTimeout(t); return d; };
  GDS.clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  GDS.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  GDS.fmtClock = (sec) => {
    sec = Math.max(0, Math.round(sec || 0));
    const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    const p = (n) => String(n).padStart(2, '0');
    return hh ? hh + ':' + p(mm) + ':' + p(ss) : p(mm) + ':' + p(ss);
  };
  GDS.wordCount = (text) => { const t = GDS.stripMarkers(text).trim(); return t ? t.split(/\s+/).length : 0; };
  GDS.readMinutes = (words, wpm) => Math.max(words ? 1 : 0, Math.round(words / (wpm || 140)));

  // Section bookmarks are plain lines like  [[Intro]]  – they survive TXT export and edits.
  const MARK_RE = /^[ \t]*\[\[([^\]\n]{1,60})\]\][ \t]*$/;
  GDS.markerLine = (line) => { const m = MARK_RE.exec(line); return m ? m[1].trim() : null; };
  GDS.stripMarkers = (text) => String(text || '').split('\n').filter((l) => !MARK_RE.test(l)).join('\n');
  GDS.parseMarkers = (text) => {
    const out = []; let pos = 0;
    String(text || '').split('\n').forEach((l) => { const m = MARK_RE.exec(l); if (m) out.push({ pos: pos, label: m[1].trim() }); pos += l.length + 1; });
    return out;
  };

  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  GDS.ls = ls;

  GDS.download = (filename, data, type) => {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  GDS.readFileText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = () => rej(r.error); r.readAsText(file, 'utf-8'); });
  GDS.safeName = (s) => String(s || 'script').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim().slice(0, 60) || 'script';

  /* ============================== events ============================== */
  const bus = {};
  GDS.on = (ev, fn) => { (bus[ev] = bus[ev] || []).push(fn); };
  GDS.emit = (ev, d) => (bus[ev] || []).forEach((fn) => { try { fn(d); } catch (e) { console.error(e); } });

  /* ============================== icons ============================== */
  const ICONS = {
    play: '<polygon points="7 4 20 12 7 20 7 4" fill="currentColor"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>',
    restart: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
    mirror: '<path d="M12 3v18" stroke-dasharray="2 3"/><path d="M8 7 3 12l5 5V7z"/><path d="M16 7l5 5-5 5V7z"/>',
    flip: '<path d="M3 12h18" stroke-dasharray="2 3"/><path d="M7 8l5-5 5 5H7z"/><path d="M7 16l5 5 5-5H7z"/>',
    fullscreen: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
    eyeoff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3 8 10 8a10 10 0 0 0 5.4-1.6"/><path d="M2 2l20 20"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    plusCircle: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    star: '<polygon points="12 2 15.1 8.6 22 9.6 17 14.5 18.2 21.5 12 18.2 5.8 21.5 7 14.5 2 9.6 8.9 8.6 12 2"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    upload: '<path d="M12 15V3M7 8l5-5 5 5M4 21h16"/>',
    cloud: '<path d="M18 10a6 6 0 0 0-11.7-1.5A4.5 4.5 0 0 0 7 18h11a4 4 0 0 0 0-8z"/>',
    cloudoff: '<path d="M18 10a6 6 0 0 0-9.5-3.9M5 9a4.5 4.5 0 0 0 2 9h11M2 2l20 20"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
    micoff: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M2 2l20 20"/>',
    video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M22 8l-6 4 6 4z"/>',
    camera: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    palette: '<path d="M12 22a10 10 0 1 1 10-10c0 3-2 4-4 4h-2a2 2 0 0 0-1 3.7c.7.5.3 2.3-3 2.3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16.5" cy="11" r="1"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    check: '<path d="M5 12l5 5 9-10"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    chevUp: '<path d="M6 15l6-6 6 6"/>', chevDown: '<path d="M6 9l6 6 6-6"/>',
    arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>', arrowDown: '<path d="M12 5v14M5 12l7 7 7-7"/>',
    skipUp: '<path d="M6 5h12M12 19V9M7 14l5-5 5 5"/>', skipDown: '<path d="M6 19h12M12 5v10M7 10l5 5 5-5"/>',
    type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    refresh: '<path d="M21 12a9 9 0 0 0-15-6.7L3 8M3 3v5h5M3 12a9 9 0 0 0 15 6.7L21 16M21 21v-5h-5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10z"/>',
    wifioff: '<path d="M5 13a10 10 0 0 1 5-2.7M19 13a10 10 0 0 0-2.4-2.5M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M2 2l20 20"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    reverse: '<path d="M7 20V4M7 20l-4-4M7 20l4-4M17 4v16M17 4l-4 4M17 4l4 4"/>',
    dots: '<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    record: '<circle cx="12" cy="12" r="8" fill="currentColor"/>',
    layers: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 12l10 5 10-5M2 17l10 5 10-5"/>',
    wand: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5"/>'
  };
  GDS.icon = (name, cls) => {
    const span = document.createElement('span');
    span.className = 'ic' + (cls ? ' ' + cls : '');
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
    return span;
  };
  GDS.iconSvg = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  /** Elements with data-ic="name" get that icon prepended (keeps static HTML small). */
  GDS.hydrateIcons = (root) => {
    Array.from((root || document).querySelectorAll('[data-ic]')).forEach((el) => {
      if (el.dataset.icDone) return; el.dataset.icDone = '1';
      el.insertBefore(GDS.icon(el.dataset.ic), el.firstChild);
    });
  };
  GDS.btn = (label, o) => {
    o = o || {};
    const b = h('button', { type: o.type || 'button', class: 'btn ' + (o.cls || ''), onclick: o.onclick, title: o.title || (o.iconOnly ? label : null), 'aria-label': o.iconOnly ? label : null });
    if (o.icon) b.appendChild(GDS.icon(o.icon));
    if (!o.iconOnly) b.appendChild(document.createTextNode(label));
    return b;
  };

  /* ============================== i18n ============================== */
  const I18N = {
    en: {
      'nav.dashboard': 'Dashboard', 'nav.studio': 'Studio', 'nav.settings': 'Settings', 'nav.new': 'New', 'nav.logout': 'Log out', 'nav.signin': 'Sign in', 'nav.help': 'Help & Support',
      'btn.new': 'New script', 'btn.read': 'Read', 'btn.edit': 'Edit', 'btn.save': 'Save', 'btn.cancel': 'Cancel', 'btn.delete': 'Delete', 'btn.duplicate': 'Duplicate', 'btn.export': 'Export TXT', 'btn.import': 'Import TXT',
      'dash.welcome': 'Welcome', 'dash.recent': 'Recent scripts', 'dash.fav': 'Favourite scripts', 'dash.all': 'My scripts', 'dash.empty': 'No scripts yet. Create your first one!', 'dash.search': 'Search scripts…', 'dash.allcats': 'All',
      'dash.studio': 'Recording Studio', 'dash.brand': 'My Brand Settings', 'dash.storage': 'Storage', 'dash.drive': 'Google Drive', 'dash.help': 'Help & Support', 'dash.scripts': 'Scripts', 'dash.favs': 'Favourites',
      'tp.play': 'Play', 'tp.pause': 'Pause', 'tp.restart': 'Restart', 'tp.stop': 'Stop', 'tp.faster': 'Faster', 'tp.slower': 'Slower', 'tp.elapsed': 'Elapsed', 'tp.remaining': 'Remaining', 'tp.words': 'Words', 'tp.speed': 'Speed',
      'set.account': 'Account', 'set.brand': 'My Brand Settings', 'set.drive': 'Google Drive', 'set.tp': 'Teleprompter Settings', 'set.lang': 'Language', 'set.data': 'Data export', 'set.danger': 'Danger zone',
      'misc.loading': 'Loading…', 'misc.offline': 'You are offline – changes are saved on this device.', 'misc.login': 'Log in', 'misc.register': 'Create account'
    }
  };
  const LANG_CODES = ['en', 'hi', 'bn', 'ur'];
  /** Interface language: this device's choice first, then the account setting. */
  GDS.lang = () => {
    const d = ls.get('gds.lang', null);
    if (LANG_CODES.indexOf(d) >= 0) return d;
    const p = GDS.profile && GDS.profile.get().prefs.lang;
    return LANG_CODES.indexOf(p) >= 0 ? p : 'en';
  };
  /** English source text for a key. Hindi / Bengali / Urdu are applied by the translator (js/i18n.js). */
  GDS.t = (key) => I18N.en[key] || key;
  GDS.applyI18n = (root) => {
    $$('[data-i18n]', root).forEach((el) => { el.textContent = GDS.t(el.dataset.i18n); });
    $$('[data-i18n-ph]', root).forEach((el) => { el.setAttribute('placeholder', GDS.t(el.dataset.i18nPh)); });
    $$('[data-i18n-title]', root).forEach((el) => { const v = GDS.t(el.dataset.i18nTitle); el.setAttribute('title', v); el.setAttribute('aria-label', v); });
  };
  GDS.fmtDate = (ts) => {
    if (!ts) return '';
    const loc = { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', ur: 'ur-IN' }[GDS.lang()] || 'en-IN';
    try { return new Date(ts).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return new Date(ts).toDateString(); }
  };

  /* ============================== toast / dialogs / menu ============================== */
  let toastBox;
  GDS.toast = (msg, type, opts) => {
    opts = opts || {};
    if (!toastBox) { toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastBox); }
    const t = h('div', { class: 'toast ' + (type || '') }, h('span', null, msg));
    if (opts.action) t.appendChild(h('button', { type: 'button', onclick: () => { t.remove(); opts.action.fn(); } }, opts.action.label));
    toastBox.appendChild(t);
    if (opts.sticky) return t;
    setTimeout(() => t.remove(), opts.ms || (type === 'err' ? 6000 : 3200));
    return t;
  };

  function openModal(build) {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      const overlay = h('div', { class: 'overlay' });
      const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
      overlay.appendChild(modal);
      const close = (v) => { document.removeEventListener('keydown', onKey, true); overlay.remove(); if (prev && prev.focus) prev.focus(); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } };
      document.addEventListener('keydown', onKey, true);
      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
      build(modal, close);
      document.body.appendChild(overlay);
      const f = $('[autofocus]', modal) || $('input,textarea,select', modal) || $('button.primary-action', modal) || $('button', modal);
      if (f) setTimeout(() => f.focus(), 30);
    });
  }
  GDS.modal = openModal;

  /** confirm → resolves {ok, checked} */
  GDS.confirm = (o) => openModal((m, close) => {
    const cb = o.checkbox ? h('input', { type: 'checkbox' }) : null;
    m.appendChild(h('h2', null, o.title || 'Are you sure?'));
    if (o.message) m.appendChild(h('p', { class: 'muted' }, o.message));
    if (cb) m.appendChild(h('label', { class: 'switch' }, cb, h('span', null, o.checkbox)));
    m.appendChild(h('div', { class: 'actions' },
      h('button', { class: 'btn outline', type: 'button', onclick: () => close({ ok: false }) }, o.cancelText || 'Cancel'),
      h('button', { class: 'btn primary-action ' + (o.danger ? 'danger' : ''), type: 'button', onclick: () => close({ ok: true, checked: cb ? cb.checked : false }) }, o.confirmText || 'OK')));
  }).then((r) => r || { ok: false });

  /** prompt → resolves string or null. o.password for hidden. */
  GDS.prompt = (o) => openModal((m, close) => {
    const input = h('input', { class: 'input', type: o.password ? 'password' : 'text', value: o.value || '', maxlength: o.max || 120, autocomplete: o.password ? 'current-password' : 'off', autofocus: true, placeholder: o.placeholder || '' });
    const submit = () => { const v = input.value.trim(); if (o.required !== false && !v) { input.focus(); return; } close(v); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    m.appendChild(h('h2', null, o.title || ''));
    if (o.message) m.appendChild(h('p', { class: 'muted' }, o.message));
    m.appendChild(h('div', { class: 'field' }, o.label ? h('label', null, o.label) : null, input));
    m.appendChild(h('div', { class: 'actions' },
      h('button', { class: 'btn outline', type: 'button', onclick: () => close(null) }, 'Cancel'),
      h('button', { class: 'btn primary-action ' + (o.danger ? 'danger' : ''), type: 'button', onclick: submit }, o.confirmText || 'OK')));
  });

  /** Popup menu anchored below an element. items: [{label, icon, onClick, danger, href} | 'hr'] */
  GDS.menu = (anchor, items) => {
    $$('.menu').forEach((x) => x.remove());
    const menu = h('div', { class: 'menu', role: 'menu' });
    const dismiss = () => { menu.remove(); document.removeEventListener('mousedown', away, true); document.removeEventListener('keydown', esc, true); };
    const away = (e) => { if (!menu.contains(e.target) && e.target !== anchor) dismiss(); };
    const esc = (e) => { if (e.key === 'Escape') dismiss(); };
    items.forEach((it) => {
      if (it === 'hr') { menu.appendChild(h('hr')); return; }
      const el = it.href ? h('a', { href: it.href, role: 'menuitem' }) : h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '' });
      if (it.icon) el.appendChild(GDS.icon(it.icon));
      el.appendChild(document.createTextNode(it.label));
      if (it.onClick) el.addEventListener('click', () => { dismiss(); it.onClick(); });
      menu.appendChild(el);
    });
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    let left = Math.min(window.innerWidth - mw - 8, Math.max(8, r.right - mw));
    let top = r.bottom + 6 + window.scrollY;
    if (r.bottom + mh + 12 > window.innerHeight && r.top > mh + 12) top = r.top - mh - 6 + window.scrollY;
    menu.style.left = left + window.scrollX + 'px'; menu.style.top = top + 'px';
    setTimeout(() => { document.addEventListener('mousedown', away, true); document.addEventListener('keydown', esc, true); }, 0);
    const first = $('button,a', menu); if (first) first.focus();
    return dismiss;
  };

  /** Run async fn with a button showing a spinner. */
  GDS.busy = async (btn, fn) => {
    if (btn.classList.contains('is-busy')) return;
    btn.classList.add('is-busy');
    const old = btn.innerHTML;
    btn.insertAdjacentHTML('afterbegin', '<span class="spin"></span>');
    try { return await fn(); } finally { btn.classList.remove('is-busy'); btn.innerHTML = old; }
  };

  /* ============================== colour helpers ============================== */
  const hex2rgb = (x) => { x = x.replace('#', ''); return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; };
  const rgb2hex = (r) => '#' + r.map((v) => Math.round(GDS.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const lum = (x) => { const c = hex2rgb(x).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const mix = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const readable = (bg) => (contrast(bg, '#ffffff') >= contrast(bg, '#06122e') ? '#ffffff' : '#06122e');
  function ensureContrast(fg, bg, min, towards) {
    let c = fg, t = 0;
    while (contrast(c, bg) < min && t < 1) { t += 0.07; c = mix(fg, towards, t); }
    return c;
  }
  GDS.color = { contrast, mix, readable, lum };

  /* ============================== defaults ============================== */
  const DEFAULT_BRAND = { appName: 'GD SCRIPT', brandName: '', primary: '#051b62', secondary: '#00cfa4', background: '#f4f6fa', font: 'system', theme: 'auto', welcome: '' };
  const DEFAULT_PREFS = {
    fontSize: 48, speed: 30, lineHeight: 1.5, paraSpacing: 0.8, textAlign: 'left', width: 92, marginTop: 0, marginBottom: 0,
    tpFont: 'system', textColor: '#ffffff', tpBg: '#000000', guide: true, guideColor: '#00cfa4', guidePos: 35, mirror: false, flip: false,
    countdown: 3, voiceLang: 'en-IN', voiceFollow: false, autoSave: true, targetMin: 0, showMarkers: false, lang: 'en', categories: []
  };
  GDS.defaults = { brand: DEFAULT_BRAND, prefs: DEFAULT_PREFS };
  const FONT_STACKS = {
    system: 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Bengali", "Noto Sans Devanagari", "Noto Naskh Arabic", "Noto Sans Arabic", "Nirmala UI", Tahoma, sans-serif',
    serif: 'Georgia, "Noto Serif", "Noto Serif Bengali", "Noto Serif Devanagari", "Noto Naskh Arabic", "Times New Roman", serif',
    mono: 'ui-monospace, Menlo, Consolas, "Courier New", monospace',
    rounded: '"Trebuchet MS", "Segoe UI", "Nirmala UI", system-ui, sans-serif',
    arial: 'Arial, Helvetica, "Nirmala UI", sans-serif',
    georgia: 'Georgia, "Times New Roman", "Nirmala UI", serif',
    verdana: 'Verdana, Geneva, "Nirmala UI", sans-serif',
    trebuchet: '"Trebuchet MS", Helvetica, "Nirmala UI", sans-serif',
    'noto-sans-bengali': '"Noto Sans Bengali", "Hind Siliguri", "Vrinda", "Nirmala UI", system-ui, sans-serif',
    'noto-sans-devanagari': '"Noto Sans Devanagari", "Mangal", "Nirmala UI", system-ui, sans-serif',
    'noto-naskh-urdu': '"Noto Naskh Arabic", "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Geeza Pro", "Segoe UI", Tahoma, system-ui, sans-serif'
  };
  GDS.FONT_STACKS = FONT_STACKS;
  GDS.FONT_LABELS = { system: 'System default', serif: 'Serif', mono: 'Monospace', rounded: 'Rounded', arial: 'Arial', georgia: 'Georgia', verdana: 'Verdana', trebuchet: 'Trebuchet', 'noto-sans-bengali': 'Bengali (Noto Sans)', 'noto-sans-devanagari': 'Hindi / Devanagari (Noto Sans)', 'noto-naskh-urdu': 'Urdu / Arabic (Noto Naskh)' };

  /* ============================== API client ============================== */
  class ApiError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
  GDS.ApiError = ApiError;
  GDS.apiConfigured = () => !!(CONF.API_URL && /^https:\/\//.test(CONF.API_URL));

  GDS.api = async (action, data, o) => {
    o = o || {};
    if (!GDS.apiConfigured()) throw new ApiError('NOT_CONFIGURED', 'The server address is not set yet. The owner must set API_URL in js/config.js.');
    if (!navigator.onLine) throw new ApiError('NETWORK', 'You are offline.');
    const sess = GDS.auth.session();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), o.timeout || 45000);
    let res;
    try {
      res = await fetch(CONF.API_URL, {
        method: 'POST', redirect: 'follow', signal: ctl.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },        // avoids CORS pre-flight on Apps Script
        body: JSON.stringify({ action: action, data: data || {}, token: o.auth === false ? undefined : (sess && sess.token), ua: navigator.userAgent.slice(0, 60) })
      });
    } catch (e) {
      throw new ApiError('NETWORK', e.name === 'AbortError' ? 'The server took too long to answer. Please try again.' : 'Could not reach the server. Check your internet connection.');
    } finally { clearTimeout(timer); }
    let j;
    try { j = await res.json(); } catch (e) { throw new ApiError('BAD_RESPONSE', 'The server sent an unexpected answer. Check that API_URL is the correct Web App /exec link.'); }
    if (!j.ok) {
      if (j.code === 'AUTH_REQUIRED' && o.auth !== false && sess) { GDS.auth.clear(); GDS.emit('session-expired'); }
      throw new ApiError(j.code || 'ERROR', j.error || 'Something went wrong.');
    }
    return j;
  };

  /* ============================== session ============================== */
  const SKEY = 'gds.session', UKEY = 'gds.user', GKEY = 'gds.guest';
  GDS.auth = {
    session() {
      try {
        const raw = localStorage.getItem(SKEY) || sessionStorage.getItem(SKEY);
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (!s || !s.token || !(s.exp > Date.now())) return null;
        return s;
      } catch (e) { return null; }
    },
    isUser() { return !!this.session(); },
    isGuest() { return !this.session() && ls.get(GKEY, false) === true; },
    user() { return this.session() ? ls.get(UKEY, null) : null; },
    set(res, remember) {
      const s = { token: res.token, exp: res.exp };
      try { localStorage.removeItem(SKEY); sessionStorage.removeItem(SKEY); (remember === false ? sessionStorage : localStorage).setItem(SKEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
      ls.set(UKEY, res.user);
      GDS.emit('profile', res.user);
    },
    updateUser(u) { if (u && this.session()) { ls.set(UKEY, u); GDS.emit('profile', u); } },
    clear() { try { localStorage.removeItem(SKEY); sessionStorage.removeItem(SKEY); } catch (e) { /* ignore */ } ls.del(UKEY); },
    guest() { ls.set(GKEY, true); },
    async login(username, password, remember) { const r = await GDS.api('auth.login', { username, password, remember: !!remember }, { auth: false }); this.set(r, remember); return r.user; },
    async register(d, remember) { const r = await GDS.api('auth.register', Object.assign({ remember: !!remember }, d), { auth: false }); this.set(r, remember); return r.user; },
    async logout(wipeLocal) {
      const ns = this.user() && this.user().id;
      try { if (this.session() && navigator.onLine && GDS.apiConfigured()) await GDS.api('auth.logout', {}, { timeout: 8000 }); } catch (e) { /* token may already be dead */ }
      this.clear();
      if (wipeLocal && ns && GDS.store) { try { await GDS.store.wipe(ns); } catch (e) { /* ignore */ } }
      location.href = 'login.html';
    },
    async refresh() { const r = await GDS.api('auth.me'); this.updateUser(r.user); return r.user; }
  };

  /* ============================== profile (brand + prefs) ============================== */
  const GP = 'gds.guestprofile';
  function readProfile() {
    const u = GDS.auth.user();
    const src = u || ls.get(GP, {}) || {};
    return {
      username: u ? u.username : 'Guest',
      email: u ? u.email : '',
      id: u ? u.id : 'guest',
      brand: Object.assign({}, DEFAULT_BRAND, src.brand || {}),
      prefs: Object.assign({}, DEFAULT_PREFS, src.prefs || {}),
      logo: src.logo || '',
      drive: (u && u.drive) || { connected: false },
      guest: !u
    };
  }
  let remotePrefs = {};
  const flushPrefs = GDS.debounce(async () => {
    if (!GDS.auth.isUser() || !GDS.apiConfigured() || !navigator.onLine) return;
    const patch = remotePrefs; remotePrefs = {};
    try { const r = await GDS.api('prefs.save', { prefs: patch }); const u = GDS.auth.user(); if (u) { u.prefs = Object.assign({}, u.prefs, r.user.prefs); ls.set(UKEY, u); } }
    catch (e) { remotePrefs = Object.assign(patch, remotePrefs); }
  }, 1500);
  GDS.profile = {
    get: readProfile,
    /** Save teleprompter/UI preferences. Applied locally at once; synced to the account in the background. */
    setPrefs(patch) {
      const u = GDS.auth.user();
      if (u) { u.prefs = Object.assign({}, u.prefs || {}, patch); ls.set(UKEY, u); Object.assign(remotePrefs, patch); flushPrefs(); }
      else { const g = ls.get(GP, {}) || {}; g.prefs = Object.assign({}, g.prefs || {}, patch); ls.set(GP, g); }
      if (patch.lang) ls.set('gds.lang', patch.lang);
      GDS.emit('profile', readProfile());
    },
    async saveBrand(brand, logo) {
      if (GDS.auth.isUser()) {
        const payload = { brand: brand }; if (logo !== undefined) payload.logo = logo;
        const r = await GDS.api('brand.save', payload); GDS.auth.updateUser(r.user);
      } else {
        const g = ls.get(GP, {}) || {}; g.brand = brand; if (logo !== undefined) g.logo = logo; ls.set(GP, g);
      }
      applyBrand(); GDS.emit('profile', readProfile());
    },
    async resetBrand() {
      if (GDS.auth.isUser()) { const r = await GDS.api('brand.reset'); GDS.auth.updateUser(r.user); }
      else { const g = ls.get(GP, {}) || {}; delete g.brand; delete g.logo; ls.set(GP, g); }
      applyBrand(); GDS.emit('profile', readProfile());
    }
  };

  /* ============================== branding / theme ============================== */
  GDS.logoSrc = () => readProfile().logo || 'assets/logo.png';
  function resolvedMode(brand) {
    if (brand.theme === 'dark') return 'dark';
    if (brand.theme === 'light') return 'light';
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  /** Compute the full CSS variable set for a brand (also used for live preview). */
  GDS.themeVars = (brand, modeOverride) => {
    const b = Object.assign({}, DEFAULT_BRAND, brand || {});
    const mode = modeOverride || resolvedMode(b);
    const dark = mode === 'dark';
    const surface = dark ? '#0e1630' : '#ffffff';
    const bg = dark ? '#060b1a' : (lum(b.background) > 0.6 ? b.background : DEFAULT_BRAND.background);
    let primary = b.primary, secondary = b.secondary;
    if (dark) { primary = ensureContrast(primary, surface, 3, '#ffffff'); secondary = ensureContrast(secondary, surface, 3, '#ffffff'); }
    const accent = ensureContrast(b.primary, surface, 4.5, dark ? '#ffffff' : '#000000');
    return {
      mode: mode, '--primary': primary, '--secondary': secondary, '--bg': bg, '--on-primary': readable(primary), '--on-secondary': readable(secondary),
      '--accent': dark ? ensureContrast(b.primary, surface, 4.5, '#ffffff') : accent,
      '--primary-soft': mix(surface, primary, 0.12), '--font': FONT_STACKS[b.font] || FONT_STACKS.system
    };
  };
  function applyBrand() {
    const p = readProfile(), root = document.documentElement;
    const v = GDS.themeVars(p.brand);
    root.dataset.theme = v.mode;
    Object.keys(v).forEach((k) => { if (k.slice(0, 2) === '--') root.style.setProperty(k, v[k]); });
    let meta = $('meta[name="theme-color"]');
    if (!meta) { meta = h('meta', { name: 'theme-color' }); document.head.appendChild(meta); }
    meta.setAttribute('content', v.mode === 'dark' ? '#060b1a' : p.brand.primary);
    $$('[data-brand-logo]').forEach((img) => { img.src = GDS.logoSrc(); });
    $$('[data-brand-name]').forEach((el) => { el.textContent = p.brand.appName; });
    if (p.brand.appName && document.title.indexOf('GD SCRIPT') >= 0 && p.brand.appName !== 'GD SCRIPT') document.title = document.title.replace('GD SCRIPT', p.brand.appName);
  }
  GDS.applyBrand = applyBrand;
  if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyBrand); } catch (e) { /* old Safari */ } }

  /* ============================== shell: header / footer ============================== */
  function buildFooter() {
    return h('footer', { class: 'app-footer', id: 'platformFooter' },
      h('div', { class: 'credit' },
        h('img', { src: 'assets/icons/icon-96.png', alt: '', width: 20, height: 20 }),
        h('span', null, 'Powered by ', h('b', null, CONF.OWNER_NAME || 'GD TECH ACADEMY'))),
      h('div', { class: 'small' }, 'Website: ',
        h('a', { href: CONF.HUB_URL || 'https://sabbirtitagarh.github.io/hub/', target: '_blank', rel: 'noopener' }, CONF.HUB_URL || 'https://sabbirtitagarh.github.io/hub/')),
      langPicker());
  }
  /** Small language switcher (English / हिन्दी / বাংলা / اردو) – shown in the footer of every page, also before login. */
  function langPicker() {
    const list = GDS.LANGS || [{ code: 'en', native: 'English' }];
    const sel = h('select', { class: 'lang-select', id: 'langPick', 'aria-label': (GDS.tr ? GDS.tr('Language') : 'Language'), 'data-notr': '', onchange: (e) => GDS.setLang(e.target.value) },
      list.map((l) => h('option', { value: l.code }, l.native)));
    sel.value = GDS.lang();
    return h('div', { class: 'lang-pick', 'data-notr': '' }, GDS.icon('globe'), sel);
  }
  GDS.footer = buildFooter;

  function navItems() {
    return [
      { id: 'dashboard', href: 'dashboard.html', icon: 'home', key: 'nav.dashboard' },
      { id: 'editor', href: 'editor.html?new=1', icon: 'plus', key: 'nav.new', fab: true },
      { id: 'recording', href: 'recording.html', icon: 'video', key: 'nav.studio' },
      { id: 'settings', href: 'settings.html', icon: 'settings', key: 'nav.settings' }
    ];
  }

  function mountShell(o) {
    const p = readProfile();
    if (o.shell === false) { appendPill(o); return; }
    const header = h('header', { class: 'app-header' });
    const wrap = h('div', { class: 'container' });
    const brand = h('a', { class: 'brand', href: GDS.auth.isUser() || GDS.auth.isGuest() ? 'dashboard.html' : 'index.html' },
      h('img', { src: GDS.logoSrc(), alt: 'Logo', 'data-brand-logo': '' }),
      h('span', { class: 'names' }, h('b', { 'data-brand-name': '' }, p.brand.appName), h('small', { 'data-brand-sub': '' }, p.brand.brandName || 'Smart Mobile Teleprompter')));
    wrap.appendChild(brand);
    if (o.nav) {
      const nav = h('nav', { class: 'topnav', 'aria-label': 'Main' });
      navItems().filter((n) => !n.fab).forEach((n) => nav.appendChild(h('a', { href: n.href, 'aria-current': o.page === n.id ? 'page' : null }, GDS.icon(n.icon), h('span', { 'data-i18n': n.key }, GDS.t(n.key)))));
      wrap.appendChild(nav);
    }
    wrap.appendChild(h('span', { class: 'spacer' }));
    if (o.nav) {
      wrap.appendChild(h('a', { class: 'btn sm secondary hide-mobile', href: 'editor.html?new=1' }, GDS.icon('plus'), h('span', { 'data-i18n': 'btn.new' }, GDS.t('btn.new'))));
      if (GDS.auth.isUser() || GDS.auth.isGuest()) {
        const av = h('button', { class: 'avatar', type: 'button', 'aria-label': 'Account menu', 'aria-haspopup': 'menu' }, (p.username || 'G').charAt(0));
        av.addEventListener('click', () => {
          const items = [{ label: p.guest ? 'Guest (this device only)' : '@' + p.username, icon: 'user', href: 'settings.html' }, 'hr',
            { label: GDS.t('nav.settings'), icon: 'settings', href: 'settings.html' },
            { label: GDS.t('nav.help'), icon: 'help', href: 'dashboard.html#help' }, 'hr'];
          if (p.guest) items.push({ label: GDS.t('misc.register'), icon: 'user', href: 'register.html' }, { label: GDS.t('nav.signin'), icon: 'logout', href: 'login.html' });
          else items.push({ label: GDS.t('nav.logout'), icon: 'logout', danger: true, onClick: () => GDS.logoutFlow() });
          GDS.menu(av, items);
        });
        wrap.appendChild(av);
      }
    } else if (o.authLinks !== false) {
      wrap.appendChild(h('a', { class: 'btn sm outline', href: 'login.html' }, GDS.t('misc.login')));
    }
    header.appendChild(wrap);
    document.body.insertBefore(header, document.body.firstChild);
    if (o.nav) {
      const bn = h('nav', { class: 'bottomnav', 'aria-label': 'Main' });
      navItems().forEach((n) => bn.appendChild(h('a', { href: n.href, class: n.fab ? 'fab' : '', 'aria-current': o.page === n.id ? 'page' : null }, GDS.icon(n.icon), h('span', { 'data-i18n': n.key }, GDS.t(n.key)))));
      document.body.appendChild(bn);
      document.body.classList.add('has-bottomnav');
    }
    if (o.footer !== false) document.body.appendChild(buildFooter());
    appendPill(o);
  }
  function appendPill(o) {
    const pill = h('div', { class: 'net-pill hide', id: 'netPill' }, GDS.icon('wifioff'), ' ', h('span', { 'data-i18n': 'misc.offline' }, GDS.t('misc.offline')));
    pill.style.display = 'none';
    if (o && o.shell === false) pill.style.top = '8px';
    document.body.appendChild(pill);
  }

  GDS.logoutFlow = async () => {
    const r = await GDS.confirm({ title: 'Log out?', message: 'You will need your password to sign in again.', confirmText: 'Log out', checkbox: 'Also remove my scripts from this device (they stay in your Google Drive).' });
    if (r.ok) await GDS.auth.logout(r.checked);
  };

  /* ============================== network + PWA ============================== */
  function netWatch() {
    const pill = $('#netPill'); if (!pill) return;
    const upd = () => { pill.style.display = navigator.onLine ? 'none' : ''; pill.classList.remove('hide'); GDS.emit(navigator.onLine ? 'online' : 'offline'); };
    window.addEventListener('online', upd); window.addEventListener('offline', upd); upd();
  }

  GDS.install = { deferred: null, available() { return !!this.deferred; }, async prompt() { if (!this.deferred) return false; this.deferred.prompt(); const c = await this.deferred.userChoice; this.deferred = null; GDS.emit('install-change'); return c.outcome === 'accepted'; },
    standalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; },
    iosSafari() { return /iphone|ipad|ipod/i.test(navigator.userAgent) && !this.standalone(); } };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); GDS.install.deferred = e; GDS.emit('install-change'); });
  window.addEventListener('appinstalled', () => { GDS.install.deferred = null; GDS.toast('GD SCRIPT installed 🎉', 'ok'); GDS.emit('install-change'); });

  let reloadWanted = false;
  function registerSW() {
    const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!('serviceWorker' in navigator) || !secure) return;
    navigator.serviceWorker.register('service-worker.js').then((reg) => {
      const announce = (w) => GDS.toast('A new version of the app is ready.', '', { sticky: true, action: { label: 'Reload', fn: () => { reloadWanted = true; w.postMessage({ type: 'SKIP_WAITING' }); } } });
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) announce(w); });
      });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch((e) => console.warn('Service worker not registered:', e && e.message));
    // Reload ONLY when the user pressed "Reload" on the update notice – never on first install
    // (otherwise a first-time visitor would lose what they were typing).
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !reloadWanted) return; reloading = true; location.reload(); });
  }

  /* ============================== init ============================== */
  /**
   * GDS.init({ page, auth: 'required'|'none'|'optional', nav: bool, footer: bool })
   * Resolves once the shell is mounted and (for protected pages) the visitor is known.
   */
  GDS.init = async (o) => {
    o = Object.assign({ auth: 'required', nav: true, footer: true }, o || {});
    const loggedIn = GDS.auth.isUser(), guest = GDS.auth.isGuest();
    if (o.auth === 'required' && !loggedIn && !guest) {
      location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search));
      return new Promise(() => {});
    }
    applyBrand();
    mountShell(o);
    applyBrand();
    GDS.applyI18n(document);
    GDS.hydrateIcons(document);
    netWatch();
    registerSW();
    GDS.on('session-expired', () => { GDS.toast('Your session has ended. Please log in again.', 'err'); setTimeout(() => { location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); }, 1200); });
    if (loggedIn && GDS.apiConfigured() && navigator.onLine) {
      // refresh profile in the background; never block rendering (works offline from cache)
      GDS.auth.refresh().then(() => { applyBrand(); GDS.applyI18n(document); if (GDS.i18nSync) GDS.i18nSync(); }).catch(() => {});
    }
    const splash = $('#splash'); if (splash) { splash.style.opacity = 0; setTimeout(() => splash.remove(), 300); }
    return readProfile();
  };

  setTimeout(() => { const sp = $('#splash'); if (sp) sp.remove(); }, 6000);   // never leave the splash stuck

  // Dark/light flash prevention: apply cached brand immediately when script loads.
  try { applyBrand(); } catch (e) { /* DOM not ready yet; init() will apply */ }
  document.addEventListener('DOMContentLoaded', () => { try { applyBrand(); } catch (e) { /* ignore */ } });
})();
