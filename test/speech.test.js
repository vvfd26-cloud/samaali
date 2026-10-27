const assert = require('assert');
const { Speech } = require('../www/speech.js');
const results = (...texts) => texts.map(t => [{ transcript: t }]);

// Chrome: one result per phrase, joined in order.
assert.strictEqual(Speech.joinResults(results('جهاز يتألف', 'من زوج من الصفائح')), 'جهاز يتألف من زوج من الصفائح');

// Safari on the iPhone: each result is the whole transcript so far.
assert.strictEqual(Speech.joinResults(results('جهاز يتألف', 'جهاز يتألف من زوج', 'جهاز يتألف من زوج من الصفائح')),
  'جهاز يتألف من زوج من الصفائح');

// ...sometimes with an early word corrected.
assert.strictEqual(Speech.joinResults(results('جهات يتألف من', 'جهاز يتألف من زوج')), 'جهاز يتألف من زوج');

// One word so far, then the longer transcript.
assert.strictEqual(Speech.joinResults(results('جهاز', 'جهاز يتألف')), 'جهاز يتألف');

// Empty and padded results are skipped.
assert.strictEqual(Speech.joinResults(results(' ', ' جهاز  يتألف ', 'من زوج')), 'جهاز يتألف من زوج');

console.log('speech tests passed');
