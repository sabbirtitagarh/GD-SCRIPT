/**
 * GD SCRIPT – teleprompter.js  (page controller for teleprompter.html)
 * Wires the TeleprompterEngine to the on-screen controls, keyboard / Bluetooth clicker,
 * settings drawer, focus + full-screen modes and Voice Follow (browser speech recognition).
 */
(async function () {
  'use strict';
  const GDS = window.GDS, $ = GDS.$, $$ = GDS.$$, clamp = GDS.clamp;
  await GDS.init({ page: 'teleprompter', shell: false, nav: false, footer: false });
  GDS.applyI18n(document);

  const id = new URLSearchParams(location.search).get('id');
  const content = $('#tpContent');
  const fail = (msg) => { content.textContent = msg; content.style.padding = '40vh 12px 0'; content.style.textAlign = 'center'; };
  if (!id) { location.replace('dashboard.html'); return; }

  // Footer credit (kept inside the control dock, hidden together with it in focus mode)
  const foot = GDS.footer(); foot.className = 'footnote'; foot.querySelector('img').remove();
  $('#tpDock').appendChild(foot);

  /* ---------------- load script ---------------- */
  let rec = null;
  try {
    rec = await GDS.store.get(id);
    if (!rec && GDS.store.driveOn()) { await GDS.store.sync({ noPrefetch: true }); rec = await GDS.store.get(id); }
  } catch (e) { GDS.toast(e.message, 'err', { ms: 8000 }); }
  if (!rec) { fail('Script not found. Go back to your dashboard and open it again.'); return; }
  GDS.ls.set('gds.lastScript', id);
  document.title = rec.title + ' – ' + GDS.profile.get().brand.appName;
  $('#tpTitle').setAttribute('data-notr', ''); $('#tpTitle').firstChild.textContent = rec.title;
  $('#btnEdit').href = 'editor.html?id=' + encodeURIComponent(id);

  /* ---------------- engine ---------------- */
  const P = Object.assign({}, GDS.profile.get().prefs);
  const ENGINE_KEYS = ['fontSize', 'speed', 'lineHeight', 'paraSpacing', 'textAlign', 'width', 'marginTop', 'marginBottom', 'tpFont', 'textColor', 'tpBg', 'guide', 'guideColor', 'guidePos', 'mirror', 'flip', 'countdown', 'showMarkers'];
  const pick = (o) => { const r = {}; ENGINE_KEYS.forEach((k) => { if (o[k] !== undefined) r[k] = o[k]; }); return r; };

  let lastInfo = 0;
  const engine = new TeleprompterEngine({
    viewport: $('#tpViewport'), stage: $('#tpStage'), content: content, guide: $('#tpGuide'),
    onTick: (st) => { const now = performance.now(); if (st.playing && now - lastInfo < 100) return; lastInfo = now; updateInfo(st); },
    onEnd: () => { $('#tpEnd').classList.add('on'); },
    onCountdown: (n) => { const cd = $('#tpCd'); cd.textContent = n > 0 ? n : ''; cd.classList.toggle('on', n > 0); },
    onTap: () => { engine.toggle(); flashMini(); },
    onPlayState: (st) => { updatePlayBtn(st); if (st.playing || st.counting) $('#tpEnd').classList.remove('on'); if (voice.active) voice.listen(st.playing); }
  });
  engine.apply(pick(P));
  engine.setText(rec.body, { words: false });
  engine.setReverse(false);

  /* ---------------- info + play button ---------------- */
  function updateInfo(st) {
    $('#iElapsed').textContent = GDS.fmtClock(st.elapsed);
    $('#iRemain').textContent = st.voice ? '—' : GDS.fmtClock(st.remaining);
    $('#iWords').textContent = st.words.toLocaleString();
    $('#iSpeed').textContent = P.speed + (st.wpm ? ' · ' + st.wpm + ' wpm' : '');
    $('#tpProg').style.width = (st.progress * 100).toFixed(1) + '%';
    const note = $('#targetNote'); if (note) note.textContent = 'At current speed: ' + GDS.fmtClock(st.total);
  }
  function updatePlayBtn(st) {
    const on = st.playing || st.counting;
    [$('#btnPlay'), $('#miniPlay')].forEach((b) => { if (!b) return; b.innerHTML = GDS.iconSvg(on ? 'pause' : 'play'); b.setAttribute('aria-label', on ? GDS.t('tp.pause') : GDS.t('tp.play')); b.title = b.getAttribute('aria-label'); });
  }
  updatePlayBtn(engine.getState()); updateInfo(engine.getState());

  /* ---------------- settings ---------------- */
  const persistKeys = new Set(ENGINE_KEYS.concat(['voiceLang', 'targetMin', 'voiceFollow']));
  function set(patch, opts) {
    opts = opts || {};
    Object.assign(P, patch);
    const ep = pick(patch); if (Object.keys(ep).length) engine.apply(ep);
    const store = {}; Object.keys(patch).forEach((k) => { if (persistKeys.has(k)) store[k] = patch[k]; });
    if (Object.keys(store).length && !opts.noSave) GDS.profile.setPrefs(store);
    syncUI(); updateInfo(engine.getState());
  }

  const FONT_OPTS = Object.keys(GDS.FONT_LABELS);
  const sFont = $('#sFont'); FONT_OPTS.forEach((k) => sFont.appendChild(GDS.h('option', { value: k }, GDS.FONT_LABELS[k])));
  const LANGS = [['en-IN', 'English (India)'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['hi-IN', 'हिन्दी (Hindi)'], ['bn-IN', 'বাংলা (Bengali – India)'], ['bn-BD', 'বাংলা (Bengali – Bangladesh)'], ['ta-IN', 'தமிழ் (Tamil)'], ['te-IN', 'తెలుగు (Telugu)'], ['mr-IN', 'मराठी (Marathi)'], ['gu-IN', 'ગુજરાતી (Gujarati)'], ['kn-IN', 'ಕನ್ನಡ (Kannada)'], ['ml-IN', 'മലയാളം (Malayalam)'], ['pa-IN', 'ਪੰਜਾਬੀ (Punjabi)'], ['ur-PK', 'اردو (Urdu)']];
  const sVL = $('#sVoiceLang'); LANGS.forEach((l) => sVL.appendChild(GDS.h('option', { value: l[0] }, l[1])));

  const bindRange = (id, key, fmt, parse) => {
    const el = $('#' + id), out = $('#' + id + 'Out');
    el.addEventListener('input', () => { const v = parse ? parse(el.value) : Number(el.value); set({ [key]: v }); });
    return () => { el.value = P[key]; if (out) out.textContent = fmt ? fmt(P[key]) : P[key]; };
  };
  const syncers = [
    bindRange('sSize', 'fontSize', (v) => v + 'px'), bindRange('sLine', 'lineHeight', (v) => Number(v).toFixed(2)), bindRange('sPara', 'paraSpacing', (v) => Number(v).toFixed(1) + 'em'),
    bindRange('sWidth', 'width', (v) => v + '%'), bindRange('sMT', 'marginTop', (v) => v + '%'), bindRange('sMB', 'marginBottom', (v) => v + '%'),
    bindRange('sGuidePos', 'guidePos', (v) => v + '%'), bindRange('sCountdown', 'countdown', (v) => (v ? v + 's' : 'off')), bindRange('rngSpeed', 'speed')
  ];
  sFont.addEventListener('change', () => set({ tpFont: sFont.value }));
  $('#sText').addEventListener('input', (e) => set({ textColor: e.target.value }));
  $('#sBg').addEventListener('input', (e) => set({ tpBg: e.target.value }));
  $('#sGuideColor').addEventListener('input', (e) => set({ guideColor: e.target.value }));
  [['sGuide', 'guide'], ['sMirror', 'mirror'], ['sFlip', 'flip'], ['sMarkers', 'showMarkers']].forEach(([i, k]) => $('#' + i).addEventListener('change', (e) => set({ [k]: e.target.checked })));
  $$('#sAlign button').forEach((b) => b.addEventListener('click', () => set({ textAlign: b.dataset.v })));
  $$('.swatch').forEach((b) => b.addEventListener('click', () => set({ textColor: b.dataset.fg, tpBg: b.dataset.bg })));
  sVL.addEventListener('change', () => { set({ voiceLang: sVL.value }); if (voice.active) { voice.listen(false); voice.listen(engine.playing); } });
  $('#btnApplyTarget').addEventListener('click', () => {
    const min = parseFloat($('#sTarget').value);
    if (!(min > 0)) { set({ targetMin: 0 }); GDS.toast('Target time cleared.'); return; }
    const raw = engine.speedForDuration(min * 60);
    if (!raw) { GDS.toast('Script is too short to calculate a speed.', 'err'); return; }
    const sp = clamp(raw, 1, 100);
    set({ speed: sp, targetMin: min });
    if (sp !== raw) GDS.toast('That is faster than the maximum speed at this text size. Speed set to ' + sp + ' (it will take about ' + GDS.fmtClock(engine.getState().total) + '). Use a smaller text size or a longer time.', 'err', { ms: 8000 });
    else GDS.toast('Speed set to ' + sp + ' so the script lasts about ' + GDS.fmtClock(min * 60) + '.', 'ok', { ms: 4200 });
  });

  function syncUI() {
    syncers.forEach((f) => f());
    sFont.value = P.tpFont; $('#sText').value = P.textColor; $('#sBg').value = P.tpBg; $('#sGuideColor').value = P.guideColor;
    $('#sGuide').checked = !!P.guide; $('#sMirror').checked = !!P.mirror; $('#sFlip').checked = !!P.flip; $('#sMarkers').checked = !!P.showMarkers;
    $$('#sAlign button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === P.textAlign)));
    $$('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fg === P.textColor && b.dataset.bg === P.tpBg)));
    sVL.value = P.voiceLang; if ($('#sTarget') !== document.activeElement) $('#sTarget').value = P.targetMin || '';
    $('#tMirror').classList.toggle('on', !!P.mirror); $('#tFlip').classList.toggle('on', !!P.flip); $('#tGuide').classList.toggle('on', !!P.guide);
    $('#tReverse').classList.toggle('on', engine.reverse); $('#tVoice').classList.toggle('on', voice.active);
    $('#tReverse').setAttribute('aria-pressed', String(engine.reverse)); $('#tMirror').setAttribute('aria-pressed', String(!!P.mirror)); $('#tFlip').setAttribute('aria-pressed', String(!!P.flip));
    $('#tGuide').setAttribute('aria-pressed', String(!!P.guide)); $('#tVoice').setAttribute('aria-pressed', String(voice.active));
  }

  /* ---------------- drawer ---------------- */
  const drawer = $('#tpDrawer'), scrim = $('#tpScrim');
  const openDrawer = (on) => { drawer.classList.toggle('open', on); scrim.classList.toggle('on', on); drawer.setAttribute('aria-hidden', String(!on)); if (on) { $('#drawerClose').focus(); } };
  scrim.addEventListener('click', () => openDrawer(false)); $('#drawerClose').addEventListener('click', () => openDrawer(false));
  $('#btnSettings').addEventListener('click', () => openDrawer(true));

  /* ---------------- transport buttons ---------------- */
  const speedStep = (d) => set({ speed: clamp(P.speed + d, 1, 100) });
  const fontStep = (d) => set({ fontSize: clamp(P.fontSize + d, 14, 240) });
  $('#btnPlay').addEventListener('click', () => engine.toggle());
  $('#miniPlay').addEventListener('click', () => { engine.toggle(); flashMini(); });
  $('#miniExit').addEventListener('click', () => setFocus(false));
  $('#btnRestart').addEventListener('click', () => engine.restart());
  $('#btnPrevP').addEventListener('click', () => engine.prevPara());
  $('#btnNextP').addEventListener('click', () => engine.nextPara());
  $('#btnSlower').addEventListener('click', () => speedStep(-1)); $('#btnFaster').addEventListener('click', () => speedStep(1));
  $('#btnFontDown').addEventListener('click', () => fontStep(-4)); $('#btnFontUp').addEventListener('click', () => fontStep(4));
  $('#tMirror').addEventListener('click', () => set({ mirror: !P.mirror })); $('#tFlip').addEventListener('click', () => set({ flip: !P.flip }));
  $('#tGuide').addEventListener('click', () => set({ guide: !P.guide }));
  $('#tReverse').addEventListener('click', () => { engine.setReverse(!engine.reverse); syncUI(); });
  $('#tTop').addEventListener('click', () => engine.goTop()); $('#tEnd').addEventListener('click', () => engine.goEnd());
  $('#endRestart').addEventListener('click', () => { $('#tpEnd').classList.remove('on'); engine.restart(); });
  $('#btnFocus').addEventListener('click', () => setFocus(true));

  $('#btnBookmarks').addEventListener('click', (e) => {
    const items = [{ label: 'Jump to beginning', icon: 'skipUp', onClick: () => engine.goTop() }];
    if (engine.markers.length) { items.push('hr'); engine.markers.slice(0, 40).forEach((m, i) => items.push({ label: m.label, icon: 'bookmark', onClick: () => engine.gotoMarker(i) })); items.push('hr'); }
    items.push({ label: 'Jump to end', icon: 'skipDown', onClick: () => engine.goEnd() });
    if (!engine.markers.length) items.push('hr', { label: 'Tip: add [[Section name]] lines in the editor', icon: 'info', onClick: () => {} });
    GDS.menu(e.currentTarget, items);
  });

  /* ---------------- focus + fullscreen ---------------- */
  let miniTimer = 0;
  function flashMini() { const m = $('#tpMini'); m.classList.add('show'); clearTimeout(miniTimer); miniTimer = setTimeout(() => m.classList.remove('show'), 3200); }
  function setFocus(on) { document.body.classList.toggle('tp-focus', on); $('#btnFocus').setAttribute('aria-pressed', String(on)); if (on) flashMini(); else $('#tpMini').classList.remove('show'); }
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  function toggleFullscreen() {
    const de = document.documentElement;
    if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    const req = de.requestFullscreen || de.webkitRequestFullscreen;
    if (req) { Promise.resolve(req.call(de)).catch(() => {}); setFocus(true); }
    else { setFocus(true); GDS.toast('Full-screen is not supported by this browser – focus mode is on. Add the app to your Home Screen for a full-screen view.', '', { ms: 6000 }); }
  }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => document.addEventListener(ev, () => {
    $('#btnFullscreen').innerHTML = GDS.iconSvg(fsEl() ? 'minimize' : 'fullscreen');
    if (!fsEl()) setFocus(false);
  }));
  $('#btnFullscreen').addEventListener('click', toggleFullscreen);

  /* ---------------- keyboard / Bluetooth clicker ---------------- */
  const SHORTCUTS = [['Space · Enter · K · B · .', 'Play / pause'], ['↑ / ↓', 'Faster / slower'], ['→ · Page Down', 'Next paragraph'], ['← · Page Up', 'Previous paragraph'], ['Home / End', 'Jump to start / end'], ['+ / −', 'Bigger / smaller text'], ['R', 'Restart'], ['M', 'Mirror text'], ['V', 'Flip vertically'], ['G', 'Reading guide'], ['H', 'Focus mode (hide controls)'], ['F', 'Full screen'], ['S', 'Settings'], ['?', 'This help']];
  function showHelp() {
    GDS.modal((m, close) => {
      m.appendChild(GDS.h('h2', null, 'Keyboard & clicker keys'));
      m.appendChild(GDS.h('p', { class: 'muted small' }, 'Works with a keyboard and with most Bluetooth presenter clickers (they send Page Up / Page Down or arrow keys).'));
      SHORTCUTS.forEach((s) => m.appendChild(GDS.h('div', { class: 'row', style: { justifyContent: 'space-between', padding: '4px 0' } }, GDS.h('span', { class: 'kbd' }, s[0]), GDS.h('span', null, s[1]))));
      m.appendChild(GDS.h('div', { class: 'actions' }, GDS.h('button', { class: 'btn primary-action', type: 'button', onclick: () => close(true) }, 'Got it')));
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && e.key !== 'Escape') return;
    if (t && t.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;       // let focused buttons work normally
    if (document.querySelector('.overlay')) return;
    const k = e.key; let used = true;
    if (k === ' ' || k === 'Enter' || k === 'k' || k === 'K' || k === 'b' || k === 'B' || k === '.' || k === 'MediaPlayPause') engine.toggle();
    else if (k === 'ArrowUp') speedStep(e.shiftKey ? 5 : 1);
    else if (k === 'ArrowDown') speedStep(e.shiftKey ? -5 : -1);
    else if (k === 'ArrowRight' || k === 'PageDown') engine.nextPara();
    else if (k === 'ArrowLeft' || k === 'PageUp') engine.prevPara();
    else if (k === 'Home') engine.goTop(); else if (k === 'End') engine.goEnd();
    else if (k === '+' || k === '=') fontStep(4); else if (k === '-' || k === '_') fontStep(-4);
    else if (k === 'r' || k === 'R') engine.restart();
    else if (k === 'm' || k === 'M') set({ mirror: !P.mirror });
    else if (k === 'v' || k === 'V') set({ flip: !P.flip });
    else if (k === 'g' || k === 'G') set({ guide: !P.guide });
    else if (k === 'h' || k === 'H') setFocus(!document.body.classList.contains('tp-focus'));
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === 's' || k === 'S') openDrawer(!drawer.classList.contains('open'));
    else if (k === '?') showHelp();
    else if (k === 'Escape') { if (drawer.classList.contains('open')) openDrawer(false); else if (document.body.classList.contains('tp-focus')) setFocus(false); else used = false; }
    else used = false;
    if (used) e.preventDefault();
  });

  /* ---------------- Voice Follow ---------------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const VM = window.GDSVoiceMatch;
  const chip = $('#tpChip');
  const showChip = (txt, rec) => { chip.classList.toggle('on', !!txt); chip.replaceChildren(); if (txt) { if (rec) chip.appendChild(GDS.h('span', { class: 'dot' })); chip.appendChild(document.createTextNode(txt)); } };
  const voice = {
    active: false, rec: null, cur: -1, listening: false, restarts: [],
    supported: !!SR,
    async start() {
      if (!SR) { GDS.toast('Voice Follow needs Chrome, Edge or Safari. Firefox does not support it.', 'err', { ms: 6000 }); return; }
      if (!window.isSecureContext) { GDS.toast('Voice Follow needs a secure (https) connection.', 'err'); return; }
      if (engine.totalWords > 15000) { GDS.toast('Voice Follow works best with scripts under 15,000 words. Use a shorter script.', 'err', { ms: 6000 }); return; }
      this.active = true; this.cur = -1;
      engine.setText(rec.body, { words: true });
      engine.setVoiceMode(true);
      const gy = engine.guideY; const first = engine.wordEls.findIndex((w) => w.offsetTop >= engine.pos + gy - 4);
      this.cur = (first < 0 ? engine.wordEls.length : first) - 1;
      P.voiceFollow = true; GDS.profile.setPrefs({ voiceFollow: true });
      syncUI();
      engine.play({ countdown: false });
      GDS.toast('Voice Follow is on. Start reading aloud – the script follows your voice.', 'ok', { ms: 4500 });
    },
    stop() {
      this.active = false; this.listen(false); engine.setVoiceMode(false); showChip('');
      engine.setText(rec.body, { words: false });
      P.voiceFollow = false; GDS.profile.setPrefs({ voiceFollow: false });
      syncUI();
    },
    listen(on) {
      if (!SR) return;
      if (!on) { this.listening = false; if (this.rec) { const r = this.rec; this.rec = null; r.onend = null; try { r.stop(); } catch (e) { /* ignore */ } } if (this.active) showChip('Voice paused'); return; }
      if (this.listening) return;
      this.listening = true;
      const r = new SR(); this.rec = r;
      r.lang = P.voiceLang || 'en-IN'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
      r.onstart = () => showChip('Listening… (' + r.lang + ')', true);
      r.onresult = (ev) => {
        let text = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) text += ev.results[i][0].transcript + ' ';
        const words = text.trim().split(/\s+/).filter(Boolean);
        const idx = VM.find(engine.scriptWords, this.cur, words);
        if (idx >= 0 && idx !== this.cur) { this.cur = idx; engine.followWord(idx); }
      };
      r.onerror = (ev) => {
        if (ev.error === 'no-speech' || ev.error === 'aborted') return;
        const msg = { 'not-allowed': 'Microphone permission was denied. Allow the microphone in your browser settings.', 'service-not-allowed': 'Speech recognition is blocked on this device.', network: 'Voice Follow needs an internet connection.', 'language-not-supported': 'This browser does not support speech recognition for the chosen language.', 'audio-capture': 'No microphone was found.' }[ev.error] || 'Voice recognition problem (' + ev.error + ').';
        GDS.toast(msg, 'err', { ms: 7000 });
        if (/not-allowed|service|language|audio/.test(ev.error)) { this.stop(); engine.pause(); }
      };
      r.onend = () => {                                   // engines stop after silence – restart while the user wants it
        this.listening = false;
        if (!this.active || !engine.playing) return;
        const now = Date.now(); this.restarts = this.restarts.filter((t) => now - t < 10000); this.restarts.push(now);
        if (this.restarts.length > 8) { GDS.toast('Voice recognition keeps stopping. Switched off.', 'err'); this.stop(); engine.pause(); return; }
        setTimeout(() => { if (this.active && engine.playing) this.listen(true); }, 250);
      };
      try { r.start(); } catch (e) { this.listening = false; }
    }
  };
  const toggleVoice = () => (voice.active ? voice.stop() : voice.start());
  $('#tVoice').addEventListener('click', toggleVoice);
  $('#sVoice').addEventListener('change', (e) => { if (e.target.checked !== voice.active) toggleVoice(); });
  if (!SR) { $('#voiceNote').textContent = 'Voice Follow is not available in this browser (works in Chrome, Edge and Safari, needs internet and microphone permission).'; $('#tVoice').title = 'Not supported in this browser'; }
  else $('#voiceNote').textContent = 'Reads your voice and moves the script with you. Uses your browser’s speech service (internet needed). Best in quiet rooms, with the language above matching your script. Roman-script Hindi/Bengali may not match – use native script. You can still scroll by hand any time.';
  GDS.on('profile', () => {});

  /* ---------------- start ---------------- */
  syncUI();
  const sp = $('#splash'); if (sp) sp.remove();
  if (new URLSearchParams(location.search).get('focus') === '1') setFocus(true);
  window.addEventListener('pagehide', () => engine.pause());
  window.GDS_TP = { engine: engine, voice: voice, P: P };      // handy for debugging in the console
})();
