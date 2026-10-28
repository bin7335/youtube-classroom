// README용 화면 캡처: docs/popup.png, docs/player.png, docs/black.png
// 실행: node tools/screenshots.mjs   (보안 정책으로 Chromium이 막힌 PC는 SMOKE_CHANNEL=msedge)
import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs');
const VIDEO = 'jNQXAC9IVRw';
fs.mkdirSync(OUT, { recursive: true });

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytc-docs-'));
const ctx = await chromium.launchPersistentContext(userDir, {
  channel: process.env.SMOKE_CHANNEL || 'chromium',
  headless: true,
  locale: 'ko-KR',
  deviceScaleFactor: 2,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--autoplay-policy=no-user-gesture-required'],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const id = new URL(sw.url()).host;

  // 1) 팝업
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 600, height: 800 });
  await pop.goto(`chrome-extension://${id}/src/popup/popup.html`);
  await pop.waitForTimeout(800);
  await pop.evaluate(() => {
    document.getElementById('segGroup').hidden = false;
    document.getElementById('segStart').value = '0:02';
    document.getElementById('segEnd').value = '0:12';
    document.getElementById('segLoop').checked = true;
  });
  const box = await pop.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }));
  await pop.screenshot({ path: path.join(OUT, 'popup.png'), clip: { x: 0, y: 0, width: box.w, height: box.h } });
  await pop.close();

  // 2) 플레이어: 구간 버튼이 보이는 상태 (추천·댓글이 사라진 시청 화면 전체)
  await sw.evaluate((key) => chrome.storage.local.set({ [key]: { start: 2, end: 12, loop: true } }), 'seg:' + VIDEO);
  const page = await ctx.newPage();
  await page.goto(`https://www.youtube.com/watch?v=${VIDEO}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.ytc-seg-group', { timeout: 30000 });
  await page.evaluate(() => { const v = document.querySelector('video'); v.muted = true; v.currentTime = 5; v.pause(); });
  await page.waitForTimeout(1500);
  const player = page.locator('#movie_player');
  await player.hover({ position: { x: 300, y: 200 } });
  await page.waitForTimeout(600);
  // 영상 장면(인물)은 빼고 컨트롤 바만 저장한다
  await page.locator('.ytp-chrome-bottom').screenshot({ path: path.join(OUT, 'player.png') });

  // 3) 검은 화면: 구간 끝에서 멈춘 모습
  await sw.evaluate((key) => chrome.storage.local.set({ [key]: { start: 2, end: 4 } }), 'seg:' + VIDEO);
  await page.evaluate(() => { const v = document.querySelector('video'); v.currentTime = 2.5; v.play(); });
  await page.waitForSelector('.ytc-black', { timeout: 15000 });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(800);
  await page.setViewportSize({ width: 900, height: 700 });
  await page.waitForTimeout(800);
  await player.screenshot({ path: path.join(OUT, 'black.png'), scale: 'css' });

  console.log('saved', fs.readdirSync(OUT));
} finally {
  await ctx.close();
  fs.rmSync(userDir, { recursive: true, force: true });
}
