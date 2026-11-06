/**
 * GD SCRIPT – engine.js
 * TeleprompterEngine: smooth scrolling reader used by teleprompter.html and the recording studio.
 *
 * DOM it expects (see teleprompter.html):
 *   viewport  – position:relative; overflow:hidden; touch-action:none
 *     stage   – receives mirror / flip transforms
 *       content – position:absolute; the script is rendered here and moved with translateY
 *       guide   – the reading-line band
 *
 * Scroll speed:  px/second = speed × 1.2 × fontSize / 40   (so speed feels the same at any font size)
 */
(function () {
  'use strict';
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const VM = () => window.GDSVoiceMatch;

  class TeleprompterEngine {
    constructor(o) {
      this.viewport = o.viewport; this.stage = o.stage; this.content = o.content; this.guide = o.guide;
      this.onTick = o.onTick || function () {}; this.onEnd = o.onEnd || function () {};
      this.onCountdown = o.onCountdown || function () {}; this.onTap = o.onTap || function () {}; this.onPlayState = o.onPlayState || function () {};
      this.s = { fontSize: 48, speed: 30, lineHeight: 1.5, paraSpacing: 0.8, textAlign: 'left', width: 92, marginTop: 0, marginBottom: 0, tpFont: 'system', textColor: '#ffffff', tpBg: '#000000', guide: true, guideColor: '#00cfa4', guidePos: 35, mirror: false, flip: false, countdown: 3, showMarkers: false };
      this.pos = 0; this.maxPos = 0; this.playing = false; this.counting = false; this.reverse = false; this.elapsed = 0;
      this.paras = []; this.markers = []; this.wordEls = []; this.scriptWords = []; this.sentenceWords = new Map(); this.totalWords = 0;
      this._raf = 0; this._last = 0; this._anim = null; this._hold = false; this._voiceTarget = null; this._cdTimer = 0; this._wake = null; this._curSentence = -1;
      this._text = ''; this._wordsMode = false; this.voiceMode = false;
      this._bindInput();
      if (window.ResizeObserver) { this._ro = new ResizeObserver(() => this.measure()); this._ro.observe(this.viewport); }
      this._vis = () => { if (document.visibilityState === 'visible' && this.playing) this._wakeLock(true); };
      document.addEventListener('visibilitychange', this._vis);
    }

    destroy() {
      this.pause(); if (this._ro) this._ro.disconnect();
      document.removeEventListener('visibilitychange', this._vis);
      cancelAnimationFrame(this._raf);
    }

    /* ---------------- settings ---------------- */
    apply(patch) {
      Object.assign(this.s, patch || {});
      const s = this.s, v = this.viewport, c = this.content;
      v.style.setProperty('--tp-bg', s.tpBg); v.style.setProperty('--tp-fg', s.textColor); v.style.setProperty('--tp-guide', s.guideColor);
      c.style.fontSize = s.fontSize + 'px'; c.style.lineHeight = String(s.lineHeight);
      c.style.fontFamily = (window.GDS && GDS.FONT_STACKS[s.tpFont]) || ''; c.style.textAlign = (this.rtl && s.textAlign === 'left') ? 'right' : s.textAlign; c.style.width = s.width + '%';   // Urdu / Arabic scripts start at the right edge by default
      c.style.setProperty('--para-gap', s.paraSpacing + 'em');
      c.classList.toggle('show-markers', !!s.showMarkers);
      this.stage.style.transform = 'scale(' + (s.mirror ? -1 : 1) + ',' + (s.flip ? -1 : 1) + ')';
      this.guide.style.display = s.guide ? '' : 'none';
      this.measure();
    }

    get pxPerSec() { return Math.max(1, this.s.speed * 1.2 * this.s.fontSize / 40); }
    get guideY() { return this.viewport.clientHeight * this.s.guidePos / 100; }

    /* ---------------- text ---------------- */
    setText(text, opt) {
      opt = opt || {};
      this._text = String(text || ''); this._wordsMode = !!opt.words;
      const c = this.content;
      const rtlN = (this._text.match(/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g) || []).length, ltrN = (this._text.match(/[A-Za-z\u0900-\u0DFF]/g) || []).length;
      this.rtl = rtlN > ltrN;                                   // mostly Urdu / Arabic / Hebrew text
      c.dir = this.rtl ? 'rtl' : 'ltr';
      c.style.textAlign = (this.rtl && this.s.textAlign === 'left') ? 'right' : this.s.textAlign;
      while (c.firstChild) c.removeChild(c.firstChild);
      this.paras = []; this.markers = []; this.wordEls = []; this.scriptWords = []; this.sentenceWords = new Map(); this._curSentence = -1;
      const frag = document.createDocumentFragment();
      let lines = [], sentence = 0, wordIdx = 0;
      const GD = window.GDS;
      const flush = () => {
        if (!lines.length) return;
        const p = document.createElement('p'); p.className = 'tp-p';
        lines.forEach((ln, li) => {
          if (li) p.appendChild(document.createElement('br'));
          if (!this._wordsMode) { p.appendChild(document.createTextNode(ln)); return; }
          ln.split(/(\s+)/).forEach((tok) => {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { p.appendChild(document.createTextNode(' ')); return; }
            const n = VM().norm(tok);
            if (!n) { p.appendChild(document.createTextNode(tok)); return; }
            const sp = document.createElement('span'); sp.className = 'w'; sp.textContent = tok; sp.dataset.i = String(wordIdx); sp.dataset.s = String(sentence);
            p.appendChild(sp); this.wordEls.push(sp); this.scriptWords.push(n);
            if (!this.sentenceWords.has(sentence)) this.sentenceWords.set(sentence, []);
            this.sentenceWords.get(sentence).push(sp);
            wordIdx++;
            if (/[.!?।॥]["')\]]*$/.test(tok)) sentence++;
          });
        });
        sentence++;
        frag.appendChild(p); this.paras.push(p); lines = [];
      };
      this._text.replace(/\r\n?/g, '\n').split('\n').forEach((line) => {
        const label = GD ? GD.markerLine(line) : null;
        if (label !== null) {
          flush();
          const m = document.createElement('div'); m.className = 'tp-bm'; m.dataset.label = label; m.textContent = label;
          frag.appendChild(m); this.markers.push({ label: label, el: m });
        } else if (!line.trim()) flush();
        else lines.push(line);
      });
      flush();
      if (!this.paras.length && !this.markers.length) {
        const p = document.createElement('p'); p.className = 'tp-p tp-empty'; p.textContent = '…'; frag.appendChild(p);
      }
      c.appendChild(frag);
      this.totalWords = GD ? GD.wordCount(this._text) : 0;
      this.measure();
    }

    /* ---------------- layout ---------------- */
    measure() {
      const H = this.viewport.clientHeight; if (!H) return;
      const s = this.s, gy = H * s.guidePos / 100;
      const bandH = s.fontSize * s.lineHeight;
      this.guide.style.top = gy + 'px'; this.guide.style.height = bandH + 'px';
      this.content.style.paddingTop = (gy + H * s.marginTop / 100) + 'px';
      this.content.style.paddingBottom = (H - gy - bandH + H * s.marginBottom / 100 + bandH * 0.5) + 'px';
      const prevMax = this.maxPos;
      const total = this.content.offsetHeight;
      this.maxPos = Math.max(0, total - H);
      if (prevMax > 0 && this.maxPos > 0 && prevMax !== this.maxPos) this.pos = this.pos * this.maxPos / prevMax;   // keep relative position when layout changes
      this.pos = clamp(this.pos, 0, this.maxPos);
      this._render(); this._emit();
    }

    _render() { this.content.style.transform = 'translate3d(0,' + (-this.pos).toFixed(2) + 'px,0)'; }

    getState() {
      const rate = this.pxPerSec, total = this.maxPos / rate, remaining = Math.max(0, (this.maxPos - this.pos) / rate);
      return {
        pos: this.pos, maxPos: this.maxPos, progress: this.maxPos ? this.pos / this.maxPos : 0, playing: this.playing, counting: this.counting,
        elapsed: this.elapsed, remaining: remaining, total: total, pxPerSec: rate, words: this.totalWords,
        wpm: total > 0 ? Math.round(this.totalWords / (total / 60)) : 0, reverse: this.reverse, voice: this.voiceMode
      };
    }
    _emit() { this.onTick(this.getState()); }

    /** speed (1..100) that makes the whole script last `seconds` at the current font size */
    speedForDuration(seconds) {
      if (!(seconds > 0) || !this.maxPos) return null;
      return Math.max(1, Math.round((this.maxPos / seconds) / (1.2 * this.s.fontSize / 40)));   // caller clamps to 1..100
    }

    /* ---------------- transport ---------------- */
    play(opt) {
      opt = opt || {};
      if (this.playing || this.counting) return;
      if (!this.maxPos) this.measure();
      const atEnd = !this.reverse && this.pos >= this.maxPos - 1, atStart = this.reverse && this.pos <= 1;
      if (atEnd) { this.pos = 0; this.elapsed = 0; } else if (atStart) { this.pos = this.maxPos; }
      const useCd = opt.countdown !== false && this.s.countdown > 0 && this.pos <= 1 && this.elapsed === 0 && !this.reverse;
      if (useCd) { this._countdown(this.s.countdown); return; }
      this._start();
    }
    _countdown(n) {
      this.counting = true; this.onPlayState(this.getState());
      const step = (k) => {
        this.onCountdown(k);
        if (k <= 0) { this.counting = false; this._start(); return; }
        this._cdTimer = setTimeout(() => step(k - 1), 1000);
      };
      step(n);
    }
    _start() {
      this.playing = true; this._wakeLock(true); this.onPlayState(this.getState()); this._ensureLoop();
    }
    pause() {
      const was = this.playing || this.counting;
      clearTimeout(this._cdTimer);
      if (this.counting) { this.counting = false; this.onCountdown(-1); }
      this.playing = false; this._wakeLock(false);
      if (was) this.onPlayState(this.getState());
      this._emit();
    }
    toggle() { (this.playing || this.counting) ? this.pause() : this.play(); }
    stop() { this.pause(); this.elapsed = 0; this.seek(this.reverse ? this.maxPos : 0); this._emit(); }
    restart() { this.pause(); this.elapsed = 0; this.seek(this.reverse ? this.maxPos : 0, true); this.play(); }
    setReverse(on) { this.reverse = !!on; this._emit(); }

    seek(p, instant) {
      this._anim = null;
      this.pos = clamp(p, 0, this.maxPos);
      this._render(); this._emit();
    }
    glideTo(p) {
      p = clamp(p, 0, this.maxPos);
      this._anim = { from: this.pos, to: p, t: 0, dur: 0.28 };
      this._ensureLoop();
    }
    nudge(dy) { this._anim = null; this.pos = clamp(this.pos + dy, 0, this.maxPos); this._render(); this._emit(); }
    goTop() { this.glideTo(0); } goEnd() { this.glideTo(this.maxPos); }
    paraTops() { const gy = this.guideY; return this.content.querySelectorAll('.tp-p, .tp-bm').length ? Array.from(this.content.querySelectorAll('.tp-p, .tp-bm')).map((el) => el.offsetTop - gy) : []; }
    nextPara() { const t = this.paraTops().find((y) => y > this.pos + 4); this.glideTo(t === undefined ? this.maxPos : t); }
    prevPara() { const arr = this.paraTops().filter((y) => y < this.pos - 4); this.glideTo(arr.length ? arr[arr.length - 1] : 0); }
    gotoMarker(i) { const m = this.markers[i]; if (m) this.glideTo(m.el.offsetTop - this.guideY); }

    /* ---------------- loop ---------------- */
    _ensureLoop() {
      if (this._raf) return;
      this._last = performance.now();
      this._raf = requestAnimationFrame((t) => this._frame(t));
    }
    _frame(t) {
      this._raf = 0;
      const dt = Math.min(0.1, Math.max(0, (t - this._last) / 1000)); this._last = t;
      let active = false;
      if (this._anim) {
        const a = this._anim; a.t += dt; const k = Math.min(1, a.t / a.dur), e = 1 - Math.pow(1 - k, 3);
        this.pos = a.from + (a.to - a.from) * e;
        if (k >= 1) this._anim = null; else active = true;
      }
      if (this.playing) {
        active = true;
        if (!this._hold) this.elapsed += dt;
        if (this.voiceMode) {
          if (this._voiceTarget != null) {
            const d = this._voiceTarget - this.pos;
            const step = d * (1 - Math.exp(-dt * 4));
            this.pos += clamp(step, -1500 * dt, 1500 * dt);
          }
        } else if (!this._hold && !this._anim) {
          this.pos += (this.reverse ? -1 : 1) * this.pxPerSec * dt;
          if (!this.reverse && this.pos >= this.maxPos) { this.pos = this.maxPos; this._finish(); }
          else if (this.reverse && this.pos <= 0) { this.pos = 0; this._finish(); }
        }
      }
      this.pos = clamp(this.pos, 0, this.maxPos);
      this._render(); this._emit();
      if (active && (this.playing || this._anim)) this._raf = requestAnimationFrame((x) => this._frame(x));
    }
    _finish() { this.pause(); this.onEnd(this.getState()); }

    /* ---------------- voice follow ---------------- */
    /** Move the reading position to word i (smoothly) and highlight its sentence. */
    followWord(i) {
      const el = this.wordEls[i]; if (!el) return;
      this._voiceTarget = clamp(el.offsetTop - this.guideY, 0, this.maxPos);
      const sIdx = parseInt(el.dataset.s, 10);
      if (sIdx !== this._curSentence) {
        if (this._curSentence >= 0) (this.sentenceWords.get(this._curSentence) || []).forEach((w) => w.classList.remove('cur-s'));
        (this.sentenceWords.get(sIdx) || []).forEach((w) => w.classList.add('cur-s'));
        this._curSentence = sIdx;
      }
      this._ensureLoop();
    }
    setVoiceMode(on) { this.voiceMode = !!on; if (!on) this.clearVoice(); }
    clearVoice() {
      this._voiceTarget = null;
      if (this._curSentence >= 0) (this.sentenceWords.get(this._curSentence) || []).forEach((w) => w.classList.remove('cur-s'));
      this._curSentence = -1;
    }

    /* ---------------- wake lock ---------------- */
    async _wakeLock(on) {
      try {
        if (!on) { if (this._wake) { await this._wake.release(); this._wake = null; } return; }
        if ('wakeLock' in navigator && !this._wake) { this._wake = await navigator.wakeLock.request('screen'); this._wake.addEventListener('release', () => { this._wake = null; }); }
      } catch (e) { /* not supported or denied – harmless */ }
    }

    /* ---------------- touch / mouse / wheel ---------------- */
    _bindInput() {
      const v = this.viewport; let d = null;
      const sign = () => (this.s.flip ? -1 : 1);
      v.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, input, select, a')) return;
        d = { y: e.clientY, pos: this.pos, moved: false, id: e.pointerId, wasPlaying: this.playing };
        try { v.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      });
      v.addEventListener('pointermove', (e) => {
        if (!d || e.pointerId !== d.id) return;
        const dy = e.clientY - d.y;
        if (!d.moved && Math.abs(dy) > 6) { d.moved = true; this._hold = true; this._anim = null; this._voiceTarget = null; }
        if (d.moved) { this.pos = clamp(d.pos - dy * sign(), 0, this.maxPos); this._render(); this._emit(); }
      });
      const end = (e) => {
        if (!d || (e && e.pointerId !== d.id)) return;
        const moved = d.moved; d = null; this._hold = false;
        if (this.playing) this._ensureLoop();
        if (!moved) this.onTap(e);
      };
      v.addEventListener('pointerup', end); v.addEventListener('pointercancel', end);
      v.addEventListener('wheel', (e) => { e.preventDefault(); this._voiceTarget = null; this.nudge(e.deltaY * sign()); }, { passive: false });
    }
  }

  window.TeleprompterEngine = TeleprompterEngine;
})();
