// Drives the web build in Chromium: opens a question, "says" the answer in
// pieces through the test hook, and checks hints, progress and the result.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'www');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, (err, buf) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(buf); });
});
(async () => {
  await new Promise(r => server.listen(8765, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:8765/');
  await page.waitForSelector('.q-row');
  const rows = await page.$$eval('.q-row', r => r.length);
  console.log('questions listed:', rows);
  await page.screenshot({ path: process.argv[2] + '/home.png' });

  await page.click('.q-row');
  await page.evaluate(() => Samaali.say('جهاز يتألف من زوج من الصفائح'));
  await page.waitForTimeout(5600); // longer than the default 5 s stall
  const hintVisible = await page.isVisible('#hint');
  console.log('hint after stall:', hintVisible, await page.getAttribute('#hint-img', 'src'));
  await page.screenshot({ path: process.argv[2] + '/recite-hint.png' });

  await page.evaluate(() => Samaali.say('الموصلة يفصل بينهما عازل'));
  console.log('hint hidden after moving to next chunk:', !(await page.isVisible('#hint')));
  await page.evaluate(() => Samaali.say('تستعمل لتخزين الشحنات الكهربائية والطاقه الكهربائيه'));
  await page.waitForSelector('#result:not([hidden])');
  console.log('score:', await page.textContent('#s-score'), '|', await page.textContent('#s-stats'));
  await page.screenshot({ path: process.argv[2] + '/result.png', fullPage: true });

  await page.click('#to-home');
  console.log('best chip:', await page.textContent('.q-row .best'));
  console.log('errors:', errors);
  await browser.close();
  server.close();
})();
