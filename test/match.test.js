const assert = require('assert');
const M = require('../www/match.js');
const data = require('../www/data/ch1-capacitors.json');
const item = id => data.items.find(i => i.id === id);

// exact recitation of every item completes it with no misses
for (const it of data.items) {
  const words = M.buildWords(it);
  const text = it.chunks.map(c => c.text).join(' ');
  const r = M.align(words, 0, text);
  assert.strictEqual(r.pointer, words.length, it.id);
  assert.ok(!Object.values(r.states).includes('missed'), it.id);
}

// ASR-style variations: no diacritics, hamza dropped, ta marbuta as ha
{
  const words = M.buildWords(item('c1-def-capacitor'));
  const r = M.align(words, 0, 'جهاز يتالف من زوج من الصفائح الموصله يفصل بينهما عازل');
  assert.ok(r.pointer >= 10, 'pointer ' + r.pointer);
  assert.ok(!Object.values(r.states).includes('missed'));
}

// skipping a word marks it missed and keeps going
{
  const words = M.buildWords(item('c1-why-uniform-field'));
  const r = M.align(words, 0, 'لأن البعد بين الصفيحتين صغير جدا');
  const missed = Object.entries(r.states).filter(([, s]) => s === 'missed').map(([k]) => words[k].raw);
  assert.deepStrictEqual(missed, []); // "d" is optional, so nothing required was skipped
  const r2 = M.align(words, 0, 'لأن البعد صغير جدا');
  const missed2 = Object.entries(r2.states).filter(([, s]) => s === 'missed').map(([k]) => words[k].raw);
  assert.deepStrictEqual(missed2, ['بين', 'الصفيحتين']);
}

// unrelated speech does not advance
{
  const words = M.buildWords(item('c1-def-farad'));
  const r = M.align(words, 0, 'شنو هذا ما اعرف');
  assert.strictEqual(r.pointer, 0);
  assert.strictEqual(r.unmatchedRun, 4);
}

// resume from the middle (second speech segment)
{
  const words = M.buildWords(item('c1-def-farad'));
  const first = M.align(words, 0, 'سعة المتسعة التي تختزن شحنة');
  const second = M.align(words, first.pointer, 'مقدارها واحد كولوم عندما يكون');
  assert.ok(second.pointer > first.pointer);
}
console.log('match tests passed');
