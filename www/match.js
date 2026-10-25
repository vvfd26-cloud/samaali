// Arabic answer matching: normalizes what the student said and walks it
// against the expected answer, word by word, tolerating small ASR errors.
(function (root) {
  const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
  const ARABIC_LETTER = /[ء-ي]/;

  function normalize(word) {
    return word
      .replace(DIACRITICS, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/[^ء-يa-zA-Z0-9]/g, '')
      .toLowerCase();
  }

  function tokenize(text) {
    return text.split(/[\s،,.؛:()\[\]«»"!?؟\-–—]+/).filter(Boolean);
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      let diag = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = tmp;
      }
    }
    return prev[b.length];
  }

  // Leading conjunction/preposition letters that speech engines often attach or drop.
  function stripPrefix(w) {
    return w.length > 3 ? w.replace(/^(و|ف|ب|ل)/, '') : w;
  }

  function similar(heard, expected) {
    if (!heard || !expected) return false;
    if (heard === expected) return true;
    const a = stripPrefix(heard), b = stripPrefix(expected);
    if (a === b) return true;
    const len = Math.max(a.length, b.length);
    if (len <= 2) return false;
    const dist = levenshtein(a, b);
    if (len <= 4) return dist <= 1;
    return dist / len <= 0.3;
  }

  // Builds the word list for an item. Tokens with no Arabic letters (symbols
  // like Q, ΔV, E/K) are optional: the student may say them any way or skip them.
  function buildWords(item) {
    const words = [];
    item.chunks.forEach((chunk, ci) => {
      tokenize(chunk.text).forEach(raw => {
        const norm = normalize(raw);
        if (!norm) return;
        words.push({ raw, norm, chunk: ci, optional: !ARABIC_LETTER.test(raw), state: 'pending' });
      });
    });
    return words;
  }

  const LOOKAHEAD = 4;

  // Aligns heard text against words starting at `start`. Returns the new
  // pointer and the per-word states for the range it touched. Does not mutate.
  function align(words, start, heardText) {
    const heard = tokenize(heardText).map(normalize).filter(Boolean);
    const states = {};
    let p = start;
    let unmatchedRun = 0;
    for (const h of heard) {
      let found = -1, required = 0;
      for (let j = p; j < words.length && required < LOOKAHEAD; j++) {
        if (similar(h, words[j].norm)) { found = j; break; }
        if (!words[j].optional) required++;
      }
      if (found === -1) { unmatchedRun++; continue; }
      for (let k = p; k < found; k++) states[k] = words[k].optional ? 'skipped' : 'missed';
      states[found] = 'matched';
      p = found + 1;
      unmatchedRun = 0;
    }
    // Optional tokens right after the last match are passed over too.
    while (p < words.length && words[p].optional) { states[p] = 'skipped'; p++; }
    return { pointer: p, states, unmatchedRun };
  }

  const api = { normalize, tokenize, similar, buildWords, align };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Match = api;
})(this);
