// Renders the launcher icons and splash screens into the Android project.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { execSync } = require('child_process');
const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const fontsDir = path.join(__dirname, '..', 'www', 'fonts');
const lalezar = fs.readFileSync(path.join(fontsDir, 'Lalezar-400-arabic.woff2')).toString('base64');
const BLUE = '#2457d6';
const sizeOf = f => execSync(`file "${f}"`).toString().match(/(\d+) x (\d+)/).slice(1).map(Number);

const mic = (px, bg) => `<div style="width:${px}px;height:${px}px;display:grid;place-items:center;background:${bg};${bg === 'transparent' ? '' : 'border-radius:0'}">
  <div style="width:${px * 0.58}px;height:${px * 0.58}px;border-radius:50%;background:#fff;display:grid;place-items:center;box-shadow:0 ${px * 0.03}px ${px * 0.06}px rgba(0,0,0,.2)">
    <span style="font-family:'Noto Color Emoji';font-size:${px * 0.34}px;line-height:1">🎙️</span></div></div>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (html, w, h, out, transparent) => {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><head><style>@font-face{font-family:Lalezar;src:url(data:font/woff2;base64,${lalezar})}body{margin:0;background:transparent}</style></head><body>${html}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out, omitBackground: Boolean(transparent) });
  };
  for (const dir of fs.readdirSync(res).filter(d => d.startsWith('mipmap-') && !d.includes('anydpi'))) {
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      const f = path.join(res, dir, name);
      if (!fs.existsSync(f)) continue;
      const [w] = sizeOf(f);
      if (name === 'ic_launcher_foreground.png') {
        // Adaptive icon foreground: content inside the central 66% safe zone.
        await shot(`<div style="width:${w}px;height:${w}px;display:grid;place-items:center">${mic(w * 0.62, 'transparent')}</div>`, w, w, f, true);
      } else {
        const radius = name === 'ic_launcher_round.png' ? '50%' : '22%';
        await shot(`<div style="width:${w}px;height:${w}px;border-radius:${radius};overflow:hidden">${mic(w, BLUE)}</div>`, w, w, f, true);
      }
    }
  }
  for (const dir of fs.readdirSync(res).filter(d => d.startsWith('drawable'))) {
    const f = path.join(res, dir, 'splash.png');
    if (!fs.existsSync(f)) continue;
    const [w, h] = sizeOf(f);
    const s = Math.min(w, h);
    await shot(`<div style="width:${w}px;height:${h}px;background:${BLUE};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${s * 0.04}px">
      ${mic(s * 0.32, 'transparent')}
      <div style="font-family:Lalezar;color:#fff;font-size:${s * 0.14}px;line-height:1">سمعلي</div></div>`, w, h, f);
  }
  await browser.close();
  console.log('icons and splash rendered');
})();
