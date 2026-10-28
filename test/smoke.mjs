// 실제 유튜브에 확장을 로드해서 핵심 동작을 확인하는 스모크 테스트.
// 실행: npm run smoke   (인터넷 필요, 유튜브 구조 변경 시 실패할 수 있음)
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO = 'jNQXAC9IVRw'; // "Me at the zoo" 19초, 댓글·추천 있음
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

// 임베드 테스트용 로컬 페이지 (패들렛 같은 외부 사이트 역할)
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><title>embed</title>
    <iframe id="yt" width="640" height="360" referrerpolicy="strict-origin-when-cross-origin"
      src="https://www.youtube.com/embed/${VIDEO}" allow="autoplay; encrypted-media"></iframe>`);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytc-smoke-'));
const ctx = await chromium.launchPersistentContext(userDir, {
  // 기본은 Playwright Chromium. 보안 정책으로 막힌 PC는 SMOKE_CHANNEL=msedge 로 설치된 Edge를 쓴다.
  channel: process.env.SMOKE_CHANNEL || 'chromium',
  headless: true,
  locale: 'ko-KR',
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--autoplay-policy=no-user-gesture-required'],
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  check('확장 서비스워커 로드', !!sw);

  const page = await ctx.newPage();
  await page.goto(`https://www.youtube.com/watch?v=${VIDEO}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('video', { timeout: 30000 });
  await page.waitForTimeout(4000);

  const cls = await page.evaluate(() => document.documentElement.className);
  check('수업 모드 클래스 적용', cls.includes('ytc-on') && cls.includes('ytc-hide-sidebar'), cls.match(/ytc-\S+/g)?.join(' '));

  const hidden = await page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return 'absent';
      return getComputedStyle(el).display === 'none' || !el.offsetParent ? 'hidden' : 'visible';
    };
    return { related: vis('ytd-watch-flexy #related'), comments: vis('ytd-comments'), avatar: vis('#avatar-btn') };
  });
  check('오른쪽 추천 숨김', hidden.related !== 'visible', hidden.related);
  check('댓글 숨김', hidden.comments !== 'visible', hidden.comments);

  const segBtns = await page.locator('.ytc-seg-group .ytc-seg-btn').count();
  check('플레이어에 구간 버튼 추가', segBtns === 4, `${segBtns}개`);

  // 구간: 0:02 ~ 0:05 저장 → 5초 근처에서 멈추고 검은 화면
  await sw.evaluate((key) => chrome.storage.local.set({ [key]: { start: 2, end: 5 } }), 'seg:' + VIDEO);
  await page.evaluate(() => { const v = document.querySelector('video'); v.muted = true; v.currentTime = 0; v.play(); });
  const black = await page.waitForSelector('.ytc-black', { timeout: 20000 }).then(() => true).catch(() => false);
  const t = await page.evaluate(() => document.querySelector('video').currentTime);
  check('구간 끝에서 정지 + 검은 화면', black && t >= 4.5 && t < 7, `t=${t.toFixed(1)}s`);

  // 다시 보기 → 시작 지점(2초)부터 재생
  await page.click('.ytc-black-replay');
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ t: document.querySelector('video').currentTime, black: !!document.querySelector('.ytc-black') }));
  check('다시 보기 → 시작 지점부터', !after.black && after.t >= 2 && after.t < 4.5, `t=${after.t.toFixed(1)}s`);

  // 반복: 0:02 ~ 0:04 반복 → 7초 동안 검은 화면 없이 2-4초 사이를 계속 재생
  await sw.evaluate((key) => chrome.storage.local.set({ [key]: { start: 2, end: 4, loop: true } }), 'seg:' + VIDEO);
  await page.evaluate(() => { const v = document.querySelector('video'); v.currentTime = 2; v.play(); });
  const samples = [];
  for (let i = 0; i < 7; i++) {
    await page.waitForTimeout(1000);
    samples.push(await page.evaluate(() => {
      const v = document.querySelector('video');
      return { t: v.currentTime, paused: v.paused, black: !!document.querySelector('.ytc-black') };
    }));
  }
  const loopOk = samples.every((s) => !s.paused && !s.black && s.t >= 1.9 && s.t < 4.6);
  check('구간 반복 재생', loopOk, samples.map((s) => s.t.toFixed(1)).join(','));
  const loopSet = await page.locator('.ytc-seg-btn[data-part="loop"]').getAttribute('data-set');
  check('반복 버튼 켜짐 표시', loopSet === '1', `data-set=${loopSet}`);

  // 수업 모드 끄기 → 새로고침 없이 클래스 제거
  await sw.evaluate(async () => {
    const r = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...(r.settings || {}), enabled: false } });
  });
  await page.waitForTimeout(800);
  const offCls = await page.evaluate(() => document.documentElement.className);
  check('끄면 즉시 원래대로', !/ytc-on/.test(offCls));
  await sw.evaluate(async () => {
    const r = await chrome.storage.sync.get('settings');
    await chrome.storage.sync.set({ settings: { ...(r.settings || {}), enabled: true } });
  });

  // 임베드
  const ep = await ctx.newPage();
  await ep.goto(`http://127.0.0.1:${port}/`);
  const frame = await (await ep.waitForSelector('#yt')).contentFrame();
  await frame.waitForSelector('.html5-video-player', { timeout: 30000 });
  await ep.waitForTimeout(2000);
  const ecls = await frame.evaluate(() => document.documentElement.className);
  check('임베드에도 적용', ecls.includes('ytc-embed') && ecls.includes('ytc-hide-embed'), ecls.match(/ytc-\S+/g)?.join(' '));
  const titleClick = await frame.evaluate(() => {
    const a = document.querySelector('.ytp-title-link');
    return a ? getComputedStyle(a).pointerEvents : 'absent';
  });
  check('임베드 제목 클릭 차단', titleClick === 'none' || titleClick === 'absent', titleClick);

  await page.screenshot({ path: path.join(ROOT, 'test', 'smoke-watch.png') });
} catch (e) {
  check('예외 없이 완료', false, e.message.split('\n')[0]);
} finally {
  await ctx.close();
  server.close();
  fs.rmSync(userDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 통과`);
process.exit(failed ? 1 : 0);
