/**
 * GD SCRIPT – recording.js (recording.html)
 * Camera + microphone preview, optional scrolling script overlay, MediaRecorder capture,
 * download / keep on this device. Recordings are NOT uploaded anywhere.
 */
(async function () {
  'use strict';
  const GDS = window.GDS, $ = GDS.$, h = GDS.h;
  await GDS.init({ page: 'recording' });

  const video = $('#recVideo'), stage = $('#recStage');
  const MAX_MIN = 30;                                  // safety cap – recordings are kept in memory until saved
  let stream = null, recorder = null, chunks = [], recBytes = 0;
  let recStart = 0, pausedAt = 0, pausedTotal = 0, timer = 0, lastBlob = null, lastMime = '', lastDur = 0, lastUrl = '', lastTitle = '';
  let engine = null, script = null;

  /* ---------------- support check ---------------- */
  const problems = [];
  if (!window.isSecureContext) problems.push('The camera only works on a secure (https) page.');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) problems.push('This browser cannot access the camera.');
  if (!window.MediaRecorder) problems.push('This browser cannot record video (MediaRecorder is missing). Try the latest Chrome, Edge, Firefox or Safari 14.1+.');
  if (problems.length) { const b = $('#recSupport'); b.textContent = problems.join(' '); b.classList.remove('hide'); $('#btnCam').disabled = true; }

  const pickMime = () => {
    const c = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    return window.MediaRecorder ? (c.find((m) => MediaRecorder.isTypeSupported(m)) || '') : '';
  };
  const status = (t) => { $('#recStatus').textContent = t; };

  /* ---------------- scripts + overlay ---------------- */
  const sel = $('#rScript');
  const metas = await GDS.store.list();
  metas.forEach((m) => sel.append(h('option', { value: m.id, 'data-notr': '' }, m.title)));
  const wanted = new URLSearchParams(location.search).get('script') || GDS.ls.get('gds.lastScript', '');
  if (wanted && metas.some((m) => m.id === wanted)) sel.value = wanted;

  const prefs = GDS.profile.get().prefs;
  engine = new TeleprompterEngine({
    viewport: $('#tpViewport'), stage: $('#tpStage'), content: $('#tpContent'), guide: $('#tpGuide'),
    onCountdown: (n) => { const cd = $('#tpCd'); cd.textContent = n > 0 ? n : ''; cd.classList.toggle('on', n > 0); },
    onTap: () => { if (script) engine.toggle(); }
  });
  const fit = () => {
    const w = stage.clientWidth || 360;
    engine.apply({ fontSize: GDS.clamp(Math.round(w / 12), 18, 52), speed: prefs.speed, lineHeight: 1.4, paraSpacing: 0.6, textAlign: 'center', width: 94, textColor: '#ffffff', tpBg: 'transparent', guide: true, guideColor: prefs.guideColor || '#00cfa4', guidePos: 30, mirror: false, flip: false, countdown: 0, tpFont: prefs.tpFont });
  };
  async function loadScript() {
    script = null;
    if (sel.value) { try { script = await GDS.store.get(sel.value); } catch (e) { GDS.toast(e.message, 'err'); } }
    engine.pause(); engine.setText(script ? script.body : '', { words: false }); fit(); engine.seek(0);
    lastTitle = script ? script.title : 'recording';
    syncOverlay();
  }
  function syncOverlay() { const on = !!script && $('#rOverlay').checked; $('#tpViewport').classList.toggle('hidden', !on); stage.classList.toggle('has-script', on); engine.measure(); }
  sel.addEventListener('change', loadScript); $('#rOverlay').addEventListener('change', syncOverlay);
  window.addEventListener('resize', GDS.debounce(() => { fit(); }, 200));
  await loadScript();

  /* ---------------- camera ---------------- */
  const friendlyCamError = (e) => ({
    NotAllowedError: 'Permission was denied. Allow camera and microphone for this site in your browser settings, then press “Start camera” again.',
    PermissionDeniedError: 'Permission was denied. Allow camera and microphone for this site in your browser settings.',
    NotFoundError: 'No camera or microphone was found on this device.',
    NotReadableError: 'The camera is being used by another app. Close that app and try again.',
    OverconstrainedError: 'This camera cannot do the chosen quality. Pick a lower quality.',
    SecurityError: 'The browser blocked the camera on this page.'
  }[e && e.name] || ('Could not start the camera' + (e && e.message ? ': ' + e.message : '.')));

  function constraints() {
    const q = Number($('#rRes').value), portrait = $('#rOrient').value === 'portrait';
    const dims = { 480: [854, 480], 720: [1280, 720], 1080: [1920, 1080] }[q];
    const mic = $('#rMic').value;
    return {
      video: { facingMode: { ideal: $('#rCam').value }, width: { ideal: portrait ? dims[1] : dims[0] }, height: { ideal: portrait ? dims[0] : dims[1] } },
      audio: Object.assign({ echoCancellation: true, noiseSuppression: true }, mic ? { deviceId: { exact: mic } } : {})
    };
  }

  async function startCamera() {
    stopCamera();
    try {
      status('Starting camera…');
      stream = await navigator.mediaDevices.getUserMedia(constraints());
    } catch (e) {
      // retry without exact mic (device may have been unplugged)
      if (e && e.name === 'OverconstrainedError' && $('#rMic').value) { $('#rMic').value = ''; return startCamera(); }
      status(friendlyCamError(e)); GDS.toast(friendlyCamError(e), 'err', { ms: 8000 }); return false;
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    const t = stream.getVideoTracks()[0], s = t ? t.getSettings() : {};
    if (s.width && s.height) { stage.style.aspectRatio = s.width + ' / ' + s.height; stage.classList.toggle('landscape', s.width > s.height); }
    const front = (s.facingMode || $('#rCam').value) === 'user';
    video.classList.toggle('mirrored', front && $('#rMirror').checked);
    $('#btnCam').replaceChildren(GDS.icon('camera'), 'Restart camera'); $('#btnFlip').classList.remove('hide');
    $('#btnRec').disabled = false; $('#btnScrollOnly').disabled = !script;
    status('Camera ready' + (s.width ? ' · ' + s.width + '×' + s.height : '') + '. Press the red button to record.');
    fit(); engine.measure();
    // microphone list (labels are only available after permission is granted)
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
      const cur = $('#rMic').value; const m = $('#rMic'); m.replaceChildren(h('option', { value: '' }, 'Default microphone'));
      devs.forEach((d, i) => m.append(h('option', { value: d.deviceId }, d.label || 'Microphone ' + (i + 1))));
      m.value = cur;
    } catch (e) { /* ignore */ }
    return true;
  }
  function stopCamera() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } video.srcObject = null; }

  $('#btnCam').addEventListener('click', startCamera);
  $('#btnFlip').addEventListener('click', () => { if (recorder) return; $('#rCam').value = $('#rCam').value === 'user' ? 'environment' : 'user'; startCamera(); });
  ['rCam', 'rMic', 'rRes', 'rOrient'].forEach((i) => $('#' + i).addEventListener('change', () => { if (stream && !recorder) startCamera(); else if (recorder) GDS.toast('Changes apply after you stop recording.'); }));
  $('#rMirror').addEventListener('change', () => { const s = stream && stream.getVideoTracks()[0] ? stream.getVideoTracks()[0].getSettings() : {}; video.classList.toggle('mirrored', (s.facingMode || $('#rCam').value) === 'user' && $('#rMirror').checked); });

  /* ---------------- recording ---------------- */
  const badge = $('#recBadge'), tEl = $('#recTime'), sizeEl = $('#recSize');
  const elapsed = () => ((pausedAt || Date.now()) - recStart - pausedTotal) / 1000;
  const tick = () => {
    const s = elapsed(); tEl.textContent = GDS.fmtClock(s); sizeEl.textContent = GDS.drive ? GDS.drive.fmtBytes(recBytes) : '';
    if (s >= MAX_MIN * 60) { GDS.toast('Reached the ' + MAX_MIN + ' minute limit – recording stopped.', '', { ms: 6000 }); stopRec(); }
  };

  async function countdown(n) {
    const cd = $('#tpCd');
    for (let k = n; k > 0; k--) { cd.textContent = k; cd.classList.add('on'); await GDS.sleep(1000); if (!armed) break; }
    cd.classList.remove('on'); cd.textContent = '';
  }
  let armed = false;
  async function startRec() {
    if (!stream) { if (!(await startCamera())) return; }
    const n = Number($('#rCount').value);
    armed = true; $('#btnRec').disabled = true; status('Get ready…');
    if (n) await countdown(n);
    if (!armed) { $('#btnRec').disabled = false; return; }
    armed = false;
    const mime = pickMime(), q = Number($('#rRes').value);
    const opts = { videoBitsPerSecond: { 480: 2500000, 720: 5000000, 1080: 8000000 }[q] };
    if (mime) opts.mimeType = mime;
    try { recorder = new MediaRecorder(stream, opts); }
    catch (e) { try { recorder = new MediaRecorder(stream); } catch (e2) { GDS.toast('Could not start recording: ' + e2.message, 'err', { ms: 7000 }); $('#btnRec').disabled = false; return; } }
    chunks = []; recBytes = 0; pausedTotal = 0; pausedAt = 0;
    recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) { chunks.push(ev.data); recBytes += ev.data.size; } };
    recorder.onstop = finishRec;
    recorder.onerror = (ev) => { GDS.toast('Recording error: ' + ((ev.error && ev.error.message) || 'unknown'), 'err'); };
    recorder.start(1000);
    recStart = Date.now();
    badge.classList.remove('hide', 'paused'); sizeEl.classList.remove('hide');
    $('#btnRec').classList.add('on'); $('#btnRec').disabled = false; $('#btnRec').setAttribute('aria-label', 'Stop recording');
    $('#btnPauseRec').disabled = false; $('#btnScrollOnly').disabled = true;
    ['rCam', 'rMic', 'rRes', 'rOrient', 'rScript'].forEach((i) => { $('#' + i).disabled = true; });
    status('Recording…'); timer = setInterval(tick, 500); tick();
    if (script && $('#rOverlay').checked) { engine.seek(0); engine.play({ countdown: false }); }
  }
  function pauseRec() {
    if (!recorder) return;
    if (recorder.state === 'recording') { recorder.pause(); pausedAt = Date.now(); engine.pause(); badge.classList.add('paused'); $('#btnPauseRec').replaceChildren(GDS.icon('play')); $('#btnPauseRec').setAttribute('aria-label', 'Resume recording'); status('Paused'); }
    else if (recorder.state === 'paused') { recorder.resume(); pausedTotal += Date.now() - pausedAt; pausedAt = 0; badge.classList.remove('paused'); if (script && $('#rOverlay').checked) engine.play({ countdown: false }); $('#btnPauseRec').replaceChildren(GDS.icon('pause')); $('#btnPauseRec').setAttribute('aria-label', 'Pause recording'); status('Recording…'); }
  }
  function stopRec() {
    armed = false;
    if (!recorder || recorder.state === 'inactive') return;
    lastDur = elapsed(); clearInterval(timer); engine.pause();
    try { recorder.stop(); } catch (e) { finishRec(); }
  }
  function finishRec() {
    const mime = (recorder && recorder.mimeType) || pickMime() || 'video/webm';
    recorder = null; clearInterval(timer);
    badge.classList.add('hide'); sizeEl.classList.add('hide');
    $('#btnRec').classList.remove('on'); $('#btnRec').setAttribute('aria-label', 'Start recording'); $('#btnPauseRec').disabled = true; $('#btnPauseRec').replaceChildren(GDS.icon('pause'));
    ['rCam', 'rMic', 'rRes', 'rOrient', 'rScript'].forEach((i) => { $('#' + i).disabled = false; });
    $('#btnScrollOnly').disabled = !script;
    if (!chunks.length) { status('Nothing was recorded.'); return; }
    lastMime = mime.split(';')[0]; lastBlob = new Blob(chunks, { type: lastMime }); chunks = [];
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(lastBlob);
    $('#lastVideo').src = lastUrl; $('#lastCard').hidden = false;
    $('#lastInfo').textContent = GDS.fmtClock(lastDur) + ' · ' + GDS.drive.fmtBytes(lastBlob.size) + ' · ' + (lastMime.indexOf('mp4') >= 0 ? 'MP4' : 'WebM') + ' – the file is only on this device until you download it.';
    status('Recording finished. Download it below.');
    $('#lastCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('#btnRec').addEventListener('click', () => { if (armed) { armed = false; return; } recorder ? stopRec() : startRec(); });
  $('#btnPauseRec').addEventListener('click', pauseRec);
  $('#btnScrollOnly').addEventListener('click', () => { if (script) engine.toggle(); });

  /* ---------------- result actions ---------------- */
  const ext = () => (lastMime.indexOf('mp4') >= 0 ? 'mp4' : 'webm');
  const fname = () => 'GD-SCRIPT-' + GDS.safeName(lastTitle) + '-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.' + ext();
  $('#btnDl').addEventListener('click', () => { if (lastBlob) GDS.download(fname(), lastBlob); });
  $('#btnSaveLocal').addEventListener('click', async () => {
    if (!lastBlob) return;
    try { await GDS.recStore.put({ id: GDS.uid(), name: fname(), created: Date.now(), duration: lastDur, type: lastMime, size: lastBlob.size, blob: lastBlob }); GDS.toast('Kept on this device.', 'ok'); loadSaved(); }
    catch (e) { GDS.toast('Could not save on this device (storage full or blocked). Please download it instead.', 'err', { ms: 7000 }); }
  });
  $('#btnDiscard').addEventListener('click', async () => {
    const r = await GDS.confirm({ title: 'Discard this recording?', message: 'It has not been downloaded or saved yet.', confirmText: 'Discard', danger: true });
    if (r.ok) { lastBlob = null; $('#lastVideo').removeAttribute('src'); $('#lastCard').hidden = true; if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = ''; } }
  });

  async function loadSaved() {
    const box = $('#savedList'); const list = await GDS.recStore.list();
    box.replaceChildren();
    if (!list.length) { box.append(h('p', { class: 'muted small' }, 'Nothing saved yet.')); return; }
    list.forEach((r) => {
      const play = GDS.btn('Play', { icon: 'play', cls: 'outline sm', iconOnly: true }); play.addEventListener('click', () => { if (lastUrl) URL.revokeObjectURL(lastUrl); lastBlob = r.blob; lastMime = r.type; lastDur = r.duration; lastUrl = URL.createObjectURL(r.blob); $('#lastVideo').src = lastUrl; $('#lastCard').hidden = false; $('#lastInfo').textContent = r.name; $('#lastCard').scrollIntoView({ behavior: 'smooth' }); });
      const dl = GDS.btn('Download', { icon: 'download', cls: 'outline sm', iconOnly: true }); dl.addEventListener('click', () => GDS.download(r.name, r.blob));
      const rm = GDS.btn('Delete', { icon: 'trash', cls: 'danger outline sm', iconOnly: true }); rm.addEventListener('click', async () => { const c = await GDS.confirm({ title: 'Delete this recording?', confirmText: 'Delete', danger: true }); if (c.ok) { await GDS.recStore.del(r.id); loadSaved(); } });
      box.append(h('div', { class: 'rec-item' }, h('div', { class: 'meta' }, h('b', null, r.name), h('span', { class: 'small muted' }, GDS.fmtDate(r.created) + ' · ' + GDS.fmtClock(r.duration) + ' · ' + GDS.drive.fmtBytes(r.size))), play, dl, rm));
    });
  }
  loadSaved();

  window.addEventListener('beforeunload', (e) => { if (recorder) { e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('pagehide', () => { if (!recorder) stopCamera(); });
})();
