const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, dataPath, fontsDir, outDir, only] = process.argv;
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
// Reads www/fonts/fonts.css and inlines each font file, so the cards render offline.
const css = fs.readFileSync(path.join(fontsDir, 'fonts.css'), 'utf8')
  .replace(/url\('(?:fonts\/)?([^']+)'\)/g, (_, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(fontsDir, f)).toString('base64')})`);
const palette = {
  'تعريف': ['#2457d6', '#6ea0ff'], 'تعليل': ['#d2541c', '#ffa25e'],
  'تطبيقات': ['#13895f', '#5fd6a4'], 'اذكر': ['#7a3fd1', '#b892ff'], 'عوامل': ['#7a3fd1', '#b892ff'],
};
function split(meme) {
  const q = meme.match(/«(.*?)»/);
  if (q) return { scene: meme.slice(0, q.index).replace(/[:،\s]+$/, '').trim(), caption: q[1] + meme.slice(q.index + q[0].length).trim() };
  const i = meme.indexOf(':');
  if (i > -1) return { scene: meme.slice(0, i).trim(), caption: meme.slice(i + 1).trim() };
  return { scene: '', caption: meme };
}
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
  fs.mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const item of data.items) {
    const [c1, c2] = palette[item.type] || palette['تعريف'];
    for (let k = 0; k < item.chunks.length; k++) {
      const name = `${item.id}-${k + 1}.png`;
      if (only && !name.startsWith(only)) continue;
      const ch = item.chunks[k];
      const { scene, caption } = ch.caption ? ch : split(ch.meme);
      const html = `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>${css}
        *{box-sizing:border-box;margin:0}
        body{width:720px;height:720px;overflow:hidden}
        .card{width:720px;height:720px;background:radial-gradient(circle at 50% 42%, ${c2} 0%, ${c1} 62%);
          display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:34px 40px 46px;position:relative}
        .top{display:flex;width:100%;justify-content:space-between;align-items:center;font-family:'IBM Plex Sans Arabic',sans-serif;font-weight:700;color:#fff}
        .pill{background:rgba(0,0,0,.28);border-radius:999px;padding:6px 18px;font-size:24px}
        .scene{font-size:22px;opacity:.9;max-width:62%;text-align:left;line-height:1.35}
        .emo{font-family:'Noto Color Emoji';font-size:${[...ch.emoji].length > 3 ? 170 : 240}px;line-height:1;filter:drop-shadow(0 14px 18px rgba(0,0,0,.28));white-space:nowrap}
        .cap{font-family:'Lalezar','IBM Plex Sans Arabic',sans-serif;color:#fff;text-align:center;line-height:1.25;
          font-size:${caption.length > 40 ? 46 : caption.length > 24 ? 56 : 68}px;
          -webkit-text-stroke:7px #111;paint-order:stroke fill;text-wrap:balance;max-width:100%}
      </style></head><body><div class="card">
        <div class="top"><span class="pill">💡 تلميح</span><span class="scene"><bdi>${esc(scene)}</bdi></span></div>
        <div class="emo">${esc(ch.emoji)}</div>
        <div class="cap" dir="rtl"><bdi>${esc(caption)}</bdi></div>
      </div></body></html>`;
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(outDir, name), type: 'png' });
      ch.image = ch.image || `memes/ch1/${name}`;
      n++;
    }
  }
  if (!only) fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
  await browser.close();
  console.log('rendered', n);
})();
