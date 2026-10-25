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
// locate: finds the item from words in the middle of an answer, or from its question
{
  const fs = require('fs'), path = require('path');
  const index = require('../www/data/index.json');
  const items = index.chapters.flatMap(c => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'www', c.file))).items);
  const entries = items.map(it => ({ words: M.buildWords(it), prompt: M.promptWords(it.prompt) }));
  const at = id => items.findIndex(it => it.id === id);
  const mid = M.locate(entries, 'زوج من الصفائح الموصلة يفصل بينهما');
  assert.strictEqual(mid && mid.index, at('c1-def-capacitor'));
  assert.ok(mid.start > 0 && mid.pointer > mid.start);
  const asked = M.locate(entries, 'ما المقصود بالليزر');
  assert.strictEqual(asked && asked.index, at('c8-def-laser'));
  assert.strictEqual(asked.pointer, 0);
  assert.strictEqual(M.locate(entries, 'شلونك اليوم شكو ماكو'), null);
}
console.log('match tests passed');
