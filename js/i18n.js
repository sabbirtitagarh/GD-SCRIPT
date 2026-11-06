/**
 * GD SCRIPT – i18n.js
 * Interface translation for Hindi, Bengali and Urdu (English is the source language).
 *
 * How it works
 *  • js/lang/<code>.js holds a dictionary  English text -> translation  (placeholders {1}, {2} for dynamic parts).
 *  • This file translates the page after it is built and keeps translating anything the app adds later
 *    (dialogs, toasts, lists, server error messages) with a MutationObserver. Text, placeholder, title,
 *    aria-label and alt attributes are covered.
 *  • User content is never translated: mark an element with data-notr (script titles, bodies, names…).
 *  • Text that has no translation simply stays in English.
 * Changing the language saves the choice and reloads the page.
 */
(function () {
  'use strict';
  var GDS = window.GDS; if (!GDS) return;

  var LANGS = [
    { code: 'en', name: 'English', native: 'English', dir: 'ltr', locale: 'en-IN', speech: 'en-IN' },
    { code: 'hi', name: 'Hindi', native: 'हिन्दी', dir: 'ltr', locale: 'hi-IN', speech: 'hi-IN' },
    { code: 'bn', name: 'Bengali', native: 'বাংলা', dir: 'ltr', locale: 'bn-IN', speech: 'bn-IN' },
    { code: 'ur', name: 'Urdu', native: 'اردو', dir: 'rtl', locale: 'ur-IN', speech: 'ur-PK' }
  ];
  GDS.LANGS = LANGS;
  GDS.langInfo = function (code) { code = code || GDS.lang(); return LANGS.filter(function (l) { return l.code === code; })[0] || LANGS[0]; };
  GDS.isRTL = function () { return GDS.langInfo().dir === 'rtl'; };

  /** Save the language and reload so every screen is rebuilt in it. */
  GDS.setLang = function (code) {
    if (!LANGS.some(function (l) { return l.code === code; })) return;
    if (code === GDS.lang() && window.GDS_BOOT_LANG === code) return;
    GDS.emit && GDS.emit('before-lang-change');
    GDS.ls.set('gds.lang', code);
    if (GDS.profile) GDS.profile.setPrefs({ lang: code });
    setTimeout(function () { location.reload(); }, 350);   // short pause so a pending autosave can finish
  };

  /* ------------------------------------------------------------------ dictionary */
  var boot = window.GDS_BOOT_LANG || 'en';
  var data = (window.GDS_LANGDATA || {})[boot];
  var exact = Object.create(null), patterns = [];
  if (data && data.s) {
    Object.keys(data.s).forEach(function (en) {
      var out = data.s[en];
      if (en.indexOf('{') < 0) { exact[squash(en)] = out; return; }
      var src = squash(en).replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\d)\}/g, '(.+?)');
      var order = [], m, re = /\{(\d)\}/g;
      while ((m = re.exec(en))) order.push(+m[1]);
      patterns.push({ re: new RegExp('^' + src + '$'), out: out, order: order, len: en.length });
    });
    patterns.sort(function (a, b) { return b.len - a.len; });      // most specific first
  }
  function squash(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  var cache = new Map();
  /** Translate one English string; returns null when there is no translation. */
  function tr(raw) {
    var t = squash(raw);
    if (!t || !/[A-Za-z]/.test(t)) return null;
    if (cache.has(t)) return cache.get(t);
    var res = null;
    if (exact[t] !== undefined) res = exact[t];
    else {
      for (var i = 0; i < patterns.length && res === null; i++) {
        var m = patterns[i].re.exec(t);
        if (m) {
          var p = patterns[i];
          res = p.out.replace(/\{(\d)\}/g, function (_, n) { var idx = p.order.indexOf(+n); return idx >= 0 ? m[idx + 1] : ''; });
        }
      }
    }
    if (cache.size > 4000) cache.clear();
    cache.set(t, res);
    return res;
  }
  GDS.tr = function (s) { var r = (boot === 'en') ? null : tr(s); return r === null ? s : r; };

  /* ------------------------------------------------------------------ DOM translation */
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 0, CODE: 1, PRE: 1, SVG: 1, OPTION: 0 };
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  function blocked(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentNode) {
      if (SKIP_TAGS[n.tagName] === 1) return true;
      if (n.hasAttribute && n.hasAttribute('data-notr')) return true;
      if (n.classList && n.classList.contains('tp-content')) return true;
    }
    return false;
  }

  function textNode(node) {
    var parent = node.parentNode;
    if (!parent || node.__gds === node.data) return;
    if (parent.nodeType === 1 && parent.tagName === 'TITLE') { title(node); return; }
    var lead = node.data.match(/^\s*/)[0], trail = node.data.match(/\s*$/)[0];
    var out = tr(node.data);
    if (out === null) return;
    var next = lead + out + trail;
    node.__gds = next;
    if (node.data !== next) node.data = next;
  }
  function title(node) {
    var parts = node.data.split(' – ');
    var first = tr(parts[0]);
    if (first === null) return;
    parts[0] = first;
    var next = parts.join(' – ');
    node.__gds = next; if (node.data !== next) node.data = next;
  }
  function attrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      var cur = el.getAttribute(a);
      if (el.__gdsA && el.__gdsA[a] === cur) continue;
      var out = tr(cur);
      if (out === null) continue;
      (el.__gdsA || (el.__gdsA = {}))[a] = out;
      el.setAttribute(a, out);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1) return;
    if (root.hasAttribute('data-notr') || root.classList.contains('tp-content')) return;
    attrs(root);                                   // placeholders of a textarea are still translated
    if (SKIP_TAGS[root.tagName] === 1) return;     // …but never its content
    for (var c = root.firstChild; c; c = c.nextSibling) walk(c);
  }

  function start() {
    walk(document.documentElement);
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.type === 'childList') {
          for (var j = 0; j < r.addedNodes.length; j++) {
            var n = r.addedNodes[j];
            var host = n.nodeType === 1 ? n : n.parentNode;
            if (host && blocked(host)) continue;
            walk(n);
          }
        } else if (r.type === 'characterData') {
          if (r.target.parentNode && !blocked(r.target.parentNode)) textNode(r.target);
        } else if (r.type === 'attributes') {
          if (!blocked(r.target)) attrs(r.target);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  /** If the account says another language than the one loaded (new device), switch once. */
  GDS.i18nSync = function () {
    var want = GDS.lang();
    if (want !== boot) {
      try { if (sessionStorage.getItem('gds.langsync') === want) return; sessionStorage.setItem('gds.langsync', want); } catch (e) { /* ignore */ }
      GDS.ls.set('gds.lang', want);
      location.reload();
    }
  };

  document.documentElement.lang = boot;
  document.documentElement.dir = GDS.langInfo(boot).dir;
  if (boot !== 'en' && data) {
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }
})();
