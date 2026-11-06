/**
 * GD SCRIPT – auth.js
 * Login, registration, forgot / reset password pages (login.html, register.html).
 * Passwords are only ever sent to the backend over HTTPS; the server stores a salted hash.
 */
(async function () {
  'use strict';
  const GDS = window.GDS, $ = GDS.$, $$ = GDS.$$;
  await GDS.init({ page: 'auth', auth: 'none', nav: false });

  const params = new URLSearchParams(location.search);
  const rawNext = params.get('next') || '';
  const next = /^[a-z-]+\.html(\?[\w=&%.\-]*)?$/i.test(rawNext) ? rawNext : 'dashboard.html';

  if (GDS.auth.isUser()) { location.replace(next); return; }
  if (!GDS.apiConfigured()) $('#cfgBanner').classList.remove('hide');

  const guestBtn = $('#btnGuest');
  if (guestBtn) guestBtn.addEventListener('click', () => { GDS.auth.guest(); location.href = 'dashboard.html'; });

  // show / hide password
  $$('[data-toggle-pw]').forEach((b) => b.addEventListener('click', () => {
    const inp = $('#' + b.dataset.togglePw); const show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.replaceChildren(GDS.icon(show ? 'eyeoff' : 'eye')); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));

  const setErr = (el, msg) => { el.textContent = msg || ''; };
  const friendly = (e) => (e && e.message) || 'Something went wrong. Please try again.';
  const pwProblem = (p) => {
    if (p.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Password must contain at least one letter and one number.';
    return '';
  };

  /* ---------------- login page ---------------- */
  const loginForm = $('#loginForm');
  if (loginForm) {
    const tabs = { login: $('#tabLogin'), forgot: $('#tabForgot') };
    const show = (which) => {
      Object.keys(tabs).forEach((k) => tabs[k].setAttribute('aria-selected', String(k === which)));
      loginForm.classList.toggle('hide', which !== 'login'); $('#forgotBox').classList.toggle('hide', which !== 'forgot');
    };
    tabs.login.addEventListener('click', () => show('login')); tabs.forgot.addEventListener('click', () => show('forgot'));
    if (params.get('reset')) show('forgot');

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault(); setErr($('#lErr'));
      const u = $('#lUser').value.trim(), p = $('#lPass').value;
      if (!u || !p) { setErr($('#lErr'), 'Please enter your username and password.'); return; }
      await GDS.busy($('#lBtn'), async () => {
        try { await GDS.auth.login(u, p, $('#lRemember').checked); location.replace(next); }
        catch (err) { setErr($('#lErr'), friendly(err)); }
      });
    });

    $('#forgotForm').addEventListener('submit', async (e) => {
      e.preventDefault(); setErr($('#fErr'));
      const id = $('#fIdent').value.trim();
      if (!id) { setErr($('#fErr'), 'Enter your username or email.'); return; }
      await GDS.busy($('#fBtn'), async () => {
        try { const r = await GDS.api('auth.forgot', { identifier: id }, { auth: false }); GDS.toast(r.message || 'If an account matches, a code was emailed.', 'ok', { ms: 7000 }); $('#rCode').focus(); }
        catch (err) { setErr($('#fErr'), friendly(err)); }
      });
    });

    $('#resetForm').addEventListener('submit', async (e) => {
      e.preventDefault(); setErr($('#rErr'));
      const id = $('#fIdent').value.trim(), code = $('#rCode').value.trim(), pw = $('#rPass').value;
      if (!id) { setErr($('#rErr'), 'Enter your username or email in the box above.'); $('#fIdent').focus(); return; }
      if (code.length < 8) { setErr($('#rErr'), 'Enter the 8-character code from the email.'); return; }
      const bad = pwProblem(pw); if (bad) { setErr($('#rErr'), bad); return; }
      await GDS.busy($('#rBtn'), async () => {
        try { await GDS.api('auth.reset', { identifier: id, code: code, password: pw }, { auth: false }); GDS.toast('Password changed. Please log in.', 'ok'); show('login'); $('#lUser').value = id; $('#lPass').focus(); }
        catch (err) { setErr($('#rErr'), friendly(err)); }
      });
    });
  }

  /* ---------------- register page ---------------- */
  const regForm = $('#regForm');
  if (regForm) {
    const bar = $('#pwBar'), hint = $('#pwHint');
    $('#gPass').addEventListener('input', (e) => {
      const p = e.target.value; let s = 0;
      if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/[0-9]/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++;
      bar.style.width = (s * 20) + '%'; bar.style.background = s <= 2 ? 'var(--danger)' : s <= 3 ? 'var(--warn)' : 'var(--ok)';
      hint.textContent = !p ? 'At least 8 characters with a letter and a number.' : (pwProblem(p) || (s >= 4 ? 'Strong password' : 'OK – add more characters or symbols to make it stronger'));
    });
    regForm.addEventListener('submit', async (e) => {
      e.preventDefault(); setErr($('#gErr'));
      const username = $('#gUser').value.trim().toLowerCase(), email = $('#gMail').value.trim(), pw = $('#gPass').value;
      if (!/^[a-z0-9][a-z0-9_.-]{2,29}$/.test(username)) { setErr($('#gErr'), 'Username must be 3–30 characters: letters, numbers, dot, dash or underscore.'); $('#gUser').focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setErr($('#gErr'), 'Please enter a valid email address.'); $('#gMail').focus(); return; }
      const bad = pwProblem(pw); if (bad) { setErr($('#gErr'), bad); $('#gPass').focus(); return; }
      if (pw !== $('#gPass2').value) { setErr($('#gErr'), 'The two passwords do not match.'); $('#gPass2').focus(); return; }
      await GDS.busy($('#gBtn'), async () => {
        try { await GDS.auth.register({ username: username, email: email, password: pw }, $('#gRemember').checked); location.replace('dashboard.html'); }
        catch (err) { setErr($('#gErr'), friendly(err)); }
      });
    });
  }
})();
