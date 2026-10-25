// Runs the web app against a fake of the Android shell's bridge
// (window.SamaaliNative) to check native-shim.js and the native speech path:
// permission, partial results, and restarting after the recognizer stops.
const assert = require('assert');
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'www');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, (err, buf) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});

// Mirrors MainActivity.Bridge: answers come back asynchronously through window.__samaali.
function fakeBridge() {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  window.__bridge = { starts: [], listening: false, permissionAsked: 0 };
  window.SamaaliNative = {
    available: () => true,
    requestPermission(id) { __bridge.permissionAsked++; setTimeout(() => __samaali.resolve(id, true), 50); },
    start(lang) { __bridge.starts.push(lang); __bridge.listening = true; },
    stop() { __bridge.listening = false; },
    isListening: () => __bridge.listening,
    exitApp() {},
  };
}

(async () => {
  await new Promise(r => server.listen(8766, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  await page.addInitScript(fakeBridge);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8766/');
  await page.waitForFunction(() => window.__bridge.starts.length === 1 && Samaali.state() && Samaali.state().listening);
  assert.strictEqual(await page.evaluate(() => __bridge.permissionAsked), 1);
  assert.strictEqual(await page.evaluate(() => __bridge.starts[0]), 'ar-IQ');

  const emit = text => page.evaluate(t => __samaali.emit('SpeechRecognition', 'partialResults', { matches: [t] }), text);
  await emit('جهاز يتألف من زوج');
  await emit('جهاز يتألف من زوج من الصفائح الموصلة');
  assert.ok((await page.evaluate(() => Samaali.state().pointer)) >= 7);

  // The recognizer stops after a pause; the page starts it again and the next words are a new segment.
  await page.evaluate(() => { __bridge.listening = false; });
  await page.waitForFunction(() => __bridge.starts.length === 2, null, { timeout: 5000 });
  await emit('يفصل بينهما عازل تستعمل لتخزين الشحنات الكهربائية والطاقة الكهربائية');
  assert.strictEqual(await page.evaluate(() => Samaali.state().id), 'c1-def-capacitance');

  assert.deepStrictEqual(errors, []);
  console.log('native shim tests passed');
  await browser.close();
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
