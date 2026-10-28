// 팝업 화면을 실제 크기로 캡처한다 (디자인 확인·웹스토어 스크린샷용).
// 실행: node test/popup-shot.mjs   → test/popup-light.png, test/popup-dark.png
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytc-shot-'));
const ctx = await chromium.launchPersistentContext(userDir, {
  channel: process.env.SMOKE_CHANNEL || 'chromium',
  headless: true,
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
});
try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;
  for (const scheme of ['light', 'dark']) {
    const page = await ctx.newPage();
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto(`chrome-extension://${id}/src/popup/popup.html`);
    await page.waitForTimeout(800);
    // 팝업을 유튜브 영상 탭에서 연 것처럼 구간 영역을 보이게 한다
    await page.evaluate(() => {
      document.getElementById('segGroup').hidden = false;
      document.getElementById('segStart').value = '2:10';
      document.getElementById('segEnd').value = '4:30';
    });
    const box = await page.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }));
    await page.screenshot({ path: path.join(ROOT, 'test', `popup-${scheme}.png`), clip: { x: 0, y: 0, width: box.w, height: box.h } });
    console.log(scheme, box);
  }
} finally {
  await ctx.close();
  fs.rmSync(userDir, { recursive: true, force: true });
}
