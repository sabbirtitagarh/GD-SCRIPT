/**
 * GD SCRIPT – voice-match.js
 * Pure helper used by "Voice Follow": finds where the speaker is inside the script.
 * Works for any language written in Unicode letters (English, Hindi, Bengali, ...).
 * It is deliberately forgiving: speech engines mis-hear words, so near-matches are accepted.
 */
(function (root) {
  'use strict';

  /** lower-case, NFC, keep only letters / combining marks / digits */
  function norm(w) {
    return String(w == null ? '' : w).toLowerCase().normalize('NFC')
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')                      // Arabic / Urdu diacritics and tatweel
      .replace(/[\u064A\u0649\u06CC\u06D2]/g, '\u06CC').replace(/\u0643/g, '\u06A9').replace(/[\u0647\u06C1\u06BE]/g, '\u06C1')   // ye / kaf / he variants
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
  }

  /** words of a text, normalised, empty tokens dropped */
  function tokenize(text) {
    return String(text || '').split(/\s+/).map(norm).filter(Boolean);
  }

  /** true when the edit distance of a and b is at most 1 */
  function withinOne(a, b) {
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
    }
    return edits + (la - i) + (lb - j) <= 1;
  }

  function same(a, b) {
    return a === b || (a.length >= 5 && b.length >= 5 && withinOne(a, b));
  }

  /**
   * @param {string[]} script  normalised script words
   * @param {number}   cur     index of the last word already read
   * @param {string[]} spoken  words heard so far (raw or normalised, most recent last)
   * @param {{back?:number, ahead?:number}} [opt] search window
   * @returns {number} index of the word the speaker just finished, or -1 when not found
   */
  function find(script, cur, spoken, opt) {
    opt = opt || {};
    const back = opt.back == null ? 3 : opt.back;
    const ahead = opt.ahead == null ? 60 : opt.ahead;
    const sp = (spoken || []).map(norm).filter(Boolean).slice(-8);
    if (!sp.length || !script.length) return -1;
    const lo = Math.max(0, cur - back);
    const hi = Math.min(script.length - 1, cur + ahead);
    for (let k = Math.min(4, sp.length); k >= 1; k--) {
      const tail = sp.slice(-k);
      let best = -1, bestD = Infinity;
      for (let i = lo; i + k - 1 <= hi; i++) {
        let ok = true;
        for (let j = 0; j < k; j++) { if (!same(script[i + j], tail[j])) { ok = false; break; } }
        if (!ok) continue;
        const end = i + k - 1;
        const d = end >= cur ? end - cur : (cur - end) * 3;      // prefer moving forward
        if (d < bestD) { bestD = d; best = end; }
      }
      if (best >= 0) {
        if (k === 1 && tail[0].length < 4 && bestD > 6) continue;   // short filler words only count when very close
        return best;
      }
    }
    return -1;
  }

  const api = { norm: norm, tokenize: tokenize, find: find, withinOne: withinOne };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GDSVoiceMatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
