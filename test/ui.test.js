// Drives the web build in Chromium with a fake speech recognizer: the screen
// shows only the question, hints pop up on silence and grow, finished items cheer and move
// on, and the app finds what the student is reciting from anywhere in the booklet.
const assert = require('assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'www');
const shots = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, (err, buf) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});

// Stands in for Chrome's recognizer; the test feeds it results through window.__rec.
function fakeRecognizer() {
  window.SpeechRecognition = window.webkitSpeechRecognition = class {
    start() { window.__rec = this; }
    stop() {}
  };
}

(async () => {
  await new Promise(r => server.listen(8765, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  await page.addInitScript(fakeRecognizer);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const state = () => page.evaluate(() => Samaali.state());
  const visible = sel => page.isVisible(sel);
  const shot = name => shots && page.screenshot({ path: path.join(shots, name + '.png') });
  const imageLoaded = () => page.waitForFunction(() => { const i = document.getElementById('hint-img'); return i.complete && i.naturalWidth > 0; });

  await page.goto('http://localhost:8765/');
  await page.waitForFunction(() => window.Samaali && Samaali.state() && Samaali.state().listening);
  await page.evaluate(() => { Samaali.timing.stall = 700; Samaali.timing.nudge = 600; Samaali.timing.stage = 900; });

  // Only the question: no hint until the student goes quiet.
  assert.strictEqual((await state()).id, 'c1-def-capacitor');
  assert.strictEqual(await page.textContent('#question'), 'عرّف المتسعة');
  assert.ok(await visible('#question'));
  assert.ok(!(await visible('#hint')) && !(await visible('#notice')), 'no hint before the silence');
  assert.strictEqual(await page.textContent('#where'), 'المتسعات — ١ من ٢٧ ▾');
  assert.ok(await visible('#tip'), 'swipe tip until the first swipe');
  await shot('question');

  // Talking holds the hints back, even when the words don't fit the answer.
  for (let k = 1; k <= 8; k++) {
    await page.evaluate(k => Samaali.say(Array(k).fill('امم').join(' '), 500), k);
    await page.waitForTimeout(200);
  }
  assert.ok(!(await visible('#nudge')) && !(await visible('#hint')), 'no hints while they are talking');
  assert.strictEqual((await state()).id, 'c1-def-capacitor');

  // So does a voice the recognizer has no words for yet.
  await page.evaluate(() => { window.__rec.onspeechstart(); });
  await page.waitForTimeout(500);
  assert.ok(!(await visible('#nudge')), 'a voice counts as talking');

  // Quiet before starting: first encouragement with the opening letter, then the meme card under the question.
  await page.waitForSelector('#nudge:not([hidden])');
  assert.ok(!(await visible('#hint')), 'encouragement comes before the card');
  assert.strictEqual(await page.textContent('#nudge-clue'), 'أول كلمة تبدي بـ «جـ»');
  await page.waitForSelector('#hint:not([hidden])');
  assert.ok(!(await visible('#nudge')), 'the card replaces the encouragement');
  await imageLoaded();
  assert.ok(await visible('#question'));
  assert.ok((await page.getAttribute('#hint-img', 'src')).endsWith('c1-def-capacitor-1.webp'));
  await shot('hint-start');

  // Reciting the first chunk moves on and clears the card.
  await page.evaluate(() => Samaali.say('جهاز يتألف من زوج من الصفائح الموصلة'));
  assert.ok(!(await visible('#hint')), 'hint clears when the chunk changes');
  assert.ok(await visible('#question'), 'the question stays');

  // Quiet mid-answer: a push to keep going with the next word's letter, then the card, words, and the whole chunk.
  await page.waitForSelector('#nudge:not([hidden])');
  assert.strictEqual(await page.textContent('#nudge-clue'), 'الكلمة الجاية تبدي بـ «يـ»');
  await page.waitForSelector('#hint:not([hidden])');
  assert.ok((await page.getAttribute('#hint-img', 'src')).endsWith('c1-def-capacitor-2.webp'));
  await page.waitForSelector('#hint-words:not([hidden])');
  assert.strictEqual(await page.textContent('#hint-words'), 'يفصل بينهما ...');
  await page.waitForFunction(() => document.getElementById('hint-words').textContent === 'يفصل بينهما عازل');
  await imageLoaded();
  await shot('hint-words');

  // Finishing the item cheers and moves to the next one.
  await page.evaluate(() => Samaali.say('يفصل بينهما عازل تستعمل لتخزين الشحنات الكهربائية والطاقة الكهربائية'));
  assert.ok(await visible('#cheer'), 'cheer after finishing');
  assert.ok(!(await visible('#question')), 'the cheer has the screen to itself');
  await shot('cheer');
  assert.strictEqual((await state()).id, 'c1-def-capacitance');
  assert.ok(!(await visible('#hint')));
  await page.waitForSelector('#cheer', { state: 'hidden' });
  assert.strictEqual(await page.textContent('#question'), 'ما المقصود بالسعة؟ وبأي وحدة تقاس؟');
  assert.ok(!(await visible('#hint')), 'next question shows without a hint');

  // Jumping to an answer in another chapter, mid-sentence.
  await page.evaluate(() => Samaali.say('هو جسيم له صفات الالكترون ولكن شحنته موجبة'));
  let s = await state();
  assert.strictEqual(s.id, 'c9-def-positron');
  assert.ok(s.pointer > 5, 'follows from where they were: ' + s.pointer);
  assert.strictEqual(await page.textContent('#question'), 'ما المقصود بالبوزترون؟', 'the question follows the jump');

  // Saying a question, then its answer growing through partial results of one segment.
  await page.evaluate(() => Samaali.say('ما المقصود بالليزر', 900));
  assert.strictEqual((await state()).id, 'c8-def-laser');
  await page.evaluate(() => Samaali.say('ما المقصود بالليزر تضخيم الضوء', 900));
  assert.strictEqual((await state()).pointer, 2);
  await page.evaluate(() => Samaali.say('ما المقصود بالليزر تضخيم الضوء بالانبعاث المحفز للاشعاع', 900));
  s = await state();
  assert.notStrictEqual(s.id, 'c8-def-laser', 'laser item finished');

  // The real speech path: results from the recognizer, then a restart after a pause.
  await page.evaluate(() => Samaali.say('هو جسيم له صفات الالكترون ولكن شحنته موجبة'));
  await page.evaluate(() => {
    const result = t => ({ results: [Object.assign([{ transcript: t }], { isFinal: false })] });
    window.__rec.onresult(result('ويدعى مضاد'));
    window.__rec.onresult(result('ويدعى مضاد الالكترون'));
  });
  assert.ok(await visible('#cheer'), 'finished through recognizer results');

  // Coming back later resumes at the same item.
  const before = (await state()).id;
  await page.reload();
  await page.waitForFunction(() => window.Samaali && Samaali.state());
  assert.strictEqual((await state()).id, before);

  // Swiping: right or up for the next question, left for the previous one; a swipe is not a tap.
  const swipe = async (dx, dy) => {
    await page.mouse.move(200, 430);
    await page.mouse.down();
    await page.mouse.move(200 + dx, 430 + dy, { steps: 5 });
    await page.mouse.up();
  };
  const at = (await state()).index;
  await swipe(120, 0);
  assert.strictEqual((await state()).index, at + 1);
  await swipe(0, -120);
  assert.strictEqual((await state()).index, at + 2);
  await swipe(-120, 0);
  s = await state();
  assert.strictEqual(s.index, at + 1);
  assert.strictEqual(s.hint, 0, 'a swipe does not ask for a hint');
  assert.ok(!(await visible('#tip')), 'tip gone after the first swipe');

  // The chapter label opens the chapters; picking one starts at its first question not memorised yet.
  await page.click('#where');
  assert.ok(await visible('#sheet'));
  assert.strictEqual(await page.locator('.chapter').count(), 9);
  assert.ok((await page.textContent('.chapter.on')).includes('الفصل التاسع'));
  assert.ok((await page.textContent('.chapter >> nth=0')).includes('حافظ ١ من ٢٧'), 'the capacitor definition counts as memorised');
  if (shots) await page.waitForTimeout(400); // let the sheet finish rising
  await shot('chapters');
  await page.click('.chapter >> nth=0');
  assert.ok(!(await visible('#sheet')));
  s = await state();
  assert.strictEqual(s.id, 'c1-def-capacitance', 'skips the memorised first question');
  assert.strictEqual(s.hint, 0);
  assert.strictEqual(await page.textContent('#where'), 'المتسعات — ٢ من ٢٧ ▾');
  await page.click('#where');
  await page.click('.chapter >> nth=2');
  assert.ok((await state()).id.startsWith('c3-'));
  assert.ok((await page.textContent('#where')).startsWith('التيار المتناوب — ١ من'));

  // Safari on the iPhone: no start without a tap, and no Iraqi Arabic.
  await page.close();
  const safari = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await safari.addInitScript(() => {
    // Counts real taps itself: Chromium's own user-activation flag is sometimes already set on a new page.
    document.addEventListener('pointerdown', () => { window.__tapped = true; }, true);
    window.SpeechRecognition = window.webkitSpeechRecognition = class {
      start() {
        const fail = error => setTimeout(() => { this.onerror({ error }); this.onend(); });
        if (!window.__tapped) return fail('not-allowed');
        if (this.lang === 'ar-IQ') return fail('language-not-supported');
        window.__rec = this;
      }
      stop() {}
    };
  });
  safari.on('pageerror', e => errors.push(e.message));
  await safari.goto('http://localhost:8765/');
  await safari.waitForFunction(() => document.getElementById('notice').textContent.includes('دوس على الشاشة'));
  assert.ok(await safari.isVisible('#notice'));
  await safari.click('#stage');
  await safari.waitForFunction(() => window.__rec && window.__rec.lang === 'ar-SA');
  assert.ok(!(await safari.isVisible('#notice')), 'notice clears once listening');
  assert.ok((await safari.evaluate(() => Samaali.state().listening)));

  console.log('errors:', errors);
  assert.deepStrictEqual(errors, []);
  console.log('ui tests passed');
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
