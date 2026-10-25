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

  await page.click('#chapters button:nth-child(2)');
  await page.waitForFunction(() => document.querySelectorAll('.q-row').length === 46);
  console.log('chapter 2 questions:', await page.$$eval('.q-row', r => r.length));
  await page.screenshot({ path: process.argv[2] + '/home-ch2.png' });
  await page.click('text=لا نشعر بسخونة');
  await page.evaluate(() => Samaali.say('بسبب عدم تولد تيارات دوامه تخترق اليد'));
  await page.waitForSelector('#result:not([hidden])');
  console.log('chapter 2 score:', await page.textContent('#s-score'));

  await page.click('#to-home');
  await page.click('#chapters button:nth-child(3)');
  await page.waitForFunction(() => document.querySelectorAll('.q-row').length === 69);
  console.log('chapter 3 questions:', await page.$$eval('.q-row', r => r.length));
  await page.click('#filters button:has-text("نشاط")');
  console.log('chapter 3 activities:', await page.$$eval('.q-row', r => r.length));
  await page.screenshot({ path: process.argv[2] + '/home-ch3.png' });
  await page.click('#filters button:has-text("الكل")');
  await page.click('text=لكن ينجز شغلاً');
  await page.click('#stuck');
  await page.waitForFunction(() => { const i = document.getElementById('hint-img'); return i.complete && i.naturalWidth > 0; });
  console.log('chapter 3 hint image:', await page.$eval('#hint-img', i => i.getAttribute('src')));
  await page.evaluate(() => Samaali.say('لأن الشغل المنجز لا يعتمد على اتجاه التيار'));
  await page.waitForSelector('#result:not([hidden])');
  console.log('chapter 3 score:', await page.textContent('#s-score'));

  await page.click('#to-home');
  await page.click('#chapters button:nth-child(4)');
  await page.waitForFunction(() => (document.querySelector('.q-row .q-text') || {}).textContent === 'عرّف الموجات الميكانيكية');
  console.log('chapter 4 questions:', await page.$$eval('.q-row', r => r.length));
  await page.click('text=ما المقصود بالرادار؟');
  await page.evaluate(() => Samaali.say('تعني الكشف وتحديد البعد'));
  await page.evaluate(() => Samaali.say('بواسطة الموجات الراديويه'));
  await page.waitForSelector('#result:not([hidden])');
  console.log('chapter 4 score:', await page.textContent('#s-score'));

  await page.click('#to-home');
  await page.click('#chapters button:nth-child(5)');
  await page.waitForFunction(() => (document.querySelector('.q-row .q-text') || {}).textContent === 'ما المقصود بتداخل الضوء؟');
  console.log('chapter 5 questions:', await page.$$eval('.q-row', r => r.length));
  await page.screenshot({ path: process.argv[2] + '/home-ch5.png' });
  await page.click('text=ما سبب زرقة السماء نهاراً؟');
  await page.click('#stuck');
  await page.waitForFunction(() => { const i = document.getElementById('hint-img'); return i.complete && i.naturalWidth > 0; });
  console.log('chapter 5 hint image:', await page.$eval('#hint-img', i => i.getAttribute('src')));
  await page.evaluate(() => Samaali.say('وذلك بسبب زيادة استطارة اللون الازرق'));
  await page.evaluate(() => Samaali.say('وان شدة الاستطارة تتناسب عكسيا مع الاس الرابع للطول الموجي'));
  await page.waitForSelector('#result:not([hidden])');
  console.log('chapter 5 score:', await page.textContent('#s-score'));

  await page.click('#to-home');
  await page.click('#chapters button:nth-child(6)');
  await page.waitForFunction(() => (document.querySelector('.q-row .q-text') || {}).textContent.startsWith('ما النظرية التي فسرت'));
  console.log('chapter 6 questions:', await page.$$eval('.q-row', r => r.length));
  await page.click('text=على ماذا يعتمد جهد الإيقاف (جهد القطع)؟');
  await page.evaluate(() => Samaali.say('تردد الضوء الساقط ونوع مادة سطح المعدن الباعث'));
  await page.waitForSelector('#result:not([hidden])');
  console.log('chapter 6 score:', await page.textContent('#s-score'));
  console.log('errors:', errors);
  await browser.close();
  server.close();
})();
