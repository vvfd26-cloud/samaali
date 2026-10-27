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

  // Question words shared by many prompts, so they say nothing about which one it is.
  const PROMPT_STOP = new Set(['ما', 'ماذا', 'المقصود', 'عرف', 'علل', 'اذكر', 'لماذا', 'علي', 'يعتمد', 'تعتمد',
    'هو', 'هي', 'في', 'من', 'الي', 'عن', 'او', 'اهم', 'كيف', 'متي', 'هل', 'الذي', 'التي', 'اي', 'وضح', 'مع', 'كل']);

  const QUESTION_START = new Set(['ما', 'ماذا', 'ماهي', 'ماهو', 'عرف', 'علل', 'اذكر', 'لماذا', 'علي', 'متي', 'كيف', 'هل', 'وضح',
    'اين', 'اي', 'ايهما', 'قارن', 'اشرح']);

  // The prompt as a word list; only its distinctive words count when matching.
  function promptWords(prompt) {
    return tokenize(prompt).map(raw => {
      const norm = normalize(raw);
      return { raw, norm, optional: !ARABIC_LETTER.test(raw) || PROMPT_STOP.has(norm) };
    }).filter(w => w.norm);
  }

  // Matched required words; with `heard`, each word heard exactly (not just
  // close) adds a sliver, so "الليزر" beats "الميزر" when both are close.
  function matchedRequired(words, states, heard) {
    let n = 0;
    for (const k in states) {
      if (states[k] !== 'matched' || words[k].optional) continue;
      n++;
      if (heard && (heard.has(words[k].norm) || heard.has(stripPrefix(words[k].norm)))) n += 0.01;
    }
    return n;
  }

  // Works out which item the student is reciting, so they can start anything
  // without choosing it first. `entries` are {words, prompt} built with
  // buildWords and promptWords. Tries every place in each answer where the
  // first heard words could begin, and the prompt in case they said the
  // question. Returns {index, start, pointer, score} for a clear winner, or
  // null; on a tie the entry at `prefer` wins.
  function locate(entries, heardText, prefer = -1, minScore = 3) {
    const heard = tokenize(heardText).map(normalize).filter(Boolean);
    if (heard.length < 2) return null;
    const head = heard.slice(0, 3);
    const exact = new Set(heard.flatMap(h => [h, stripPrefix(h)]));
    const asked = QUESTION_START.has(heard[0]);
    let best = null, runnerUp = 0;
    entries.forEach((e, index) => {
      let top = null;
      e.words.forEach((w, j) => {
        if (w.optional || !head.some(h => similar(h, w.norm))) return;
        const r = align(e.words, j, heardText);
        const score = matchedRequired(e.words, r.states, exact);
        if (!top || score > top.score) top = { index, start: j, pointer: r.pointer, score };
      });
      // A prompt counts when the student opened with a question word, said all its
      // distinctive words, and those make up most of what they said at that point.
      const distinct = e.prompt.filter(w => !w.optional).length;
      if (asked && distinct) {
        const opening = heard.slice(0, e.prompt.length + 2);
        const said = opening.filter(h => !PROMPT_STOP.has(h)).length;
        const got = matchedRequired(e.prompt, align(e.prompt, 0, opening.join(' ')).states, exact);
        if (Math.floor(got) === distinct && distinct / said >= 0.6) {
          const score = minScore + got;
          if (!top || score > top.score) top = { index, start: 0, pointer: 0, score };
        }
      }
      if (!top) return;
      if (!best || top.score > best.score || (top.score === best.score && index === prefer)) {
        if (best && best.score > runnerUp && best.index !== index) runnerUp = best.score;
        best = top;
      } else if (top.score > runnerUp) runnerUp = top.score;
    });
    if (!best || best.score < minScore) return null;
    if (best.score === runnerUp && best.index !== prefer) return null;
    return best;
  }

  const api = { normalize, tokenize, similar, buildWords, align, promptWords, locate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Match = api;
})(this);
