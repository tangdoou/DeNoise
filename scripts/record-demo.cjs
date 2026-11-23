#!/usr/bin/env node
/**
 * Records the DeNoise demo GIFs.
 *
 *   node scripts/record-demo.cjs            # all scenes
 *   node scripts/record-demo.cjs popup      # ANC start ritual only
 *   node scripts/record-demo.cjs feed       # local demo feed, before/after
 *   node scripts/record-demo.cjs bilibili   # live bilibili search results
 *
 * Requires Microsoft Edge (Playwright's bundled Chromium crashes when an
 * extension calls chrome.tabs.discard, which standard mode relies on).
 * Raw .webm files land in docs/media/raw/, then run:
 *
 *   scripts/webm-to-gif.sh docs/media/raw/<file>.webm docs/media/demo-feed-denoise.gif
 *
 * Live sites need a login cookie export at /tmp/dn-edge-cookies.json
 * (see scripts/export-edge-cookies.py).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'dist');
const FEED = `file://${path.join(ROOT, 'demo/test-feed.html')}`;
const BILIBILI_SEARCH =
  'https://search.bilibili.com/all?keyword=%E7%BA%BF%E6%80%A7%E4%BB%A3%E6%95%B0';
const EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
const COOKIE_FILE = '/tmp/dn-edge-cookies.json';
const RAW_DIR = path.join(ROOT, 'docs/media/raw');

const VIEWPORT = { width: 1440, height: 820 };
const POPUP_VIEWPORT = { width: 460, height: 820 };
const TASK = '复习高等数学与线性代数特征值';

async function launch(scene, viewport) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const videoDir = path.join(RAW_DIR, scene);
  fs.rmSync(videoDir, { recursive: true, force: true });
  fs.mkdirSync(videoDir, { recursive: true });

  const profileDir = `/tmp/denoise-record-${scene}-${Date.now()}`;
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    executablePath: EDGE,
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-first-run',
      '--lang=zh-CN'
    ],
    viewport,
    recordVideo: { dir: videoDir, size: viewport }
  });

  if (fs.existsSync(COOKIE_FILE)) {
    const now = Date.now() / 1000;
    const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'))
      .filter((c) => c.expires === -1 || c.expires > now);
    await context.addCookies(cookies);
  }

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 25000 });
  return { context, extensionId: new URL(worker.url()).host, videoDir };
}

/**
 * Opens the popup in its own window so the target page keeps rendering.
 * Switching tabs stalls rendering in headless mode and leaves a grey band
 * at the bottom of the recording.
 */
async function openPopupInOwnWindow(context, extensionId) {
  const cdp = await context.newCDPSession(context.pages()[0]);
  await cdp.send('Target.createTarget', {
    url: `chrome-extension://${extensionId}/popup.html`,
    newWindow: true,
    width: POPUP_VIEWPORT.width,
    height: POPUP_VIEWPORT.height,
    left: 40,
    top: 40
  });
  await new Promise((r) => setTimeout(r, 2000));
  const popup = context.pages().find((p) => p.url().includes('popup.html'));
  if (!popup) throw new Error('popup window did not open');
  return popup;
}

async function startFocus(popup, intensityLabel) {
  await popup.waitForTimeout(1200);
  const textarea = popup.locator('textarea').first();
  await textarea.click();
  await popup.waitForTimeout(300);
  await textarea.type(TASK, { delay: 45 });
  await popup.waitForTimeout(800);
  await popup.locator('button', { hasText: new RegExp(intensityLabel) }).first().click();
  await popup.waitForTimeout(600);
  await popup.locator('button', { hasText: /开启 ANC/ }).last().click();
}

async function scenePopup() {
  const { context, extensionId, videoDir } = await launch('popup', POPUP_VIEWPORT);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.waitForTimeout(1400);
  await startFocus(popup, '标准模式');
  await popup.waitForTimeout(5000);
  await context.close();
  return videoDir;
}

async function sceneFeed() {
  const { context, extensionId, videoDir } = await launch('feed', VIEWPORT);
  const page = await context.newPage();
  await page.goto(FEED);
  await page.waitForTimeout(5000);

  const popup = await openPopupInOwnWindow(context, extensionId);
  await startFocus(popup, '温和模式');
  await popup.waitForTimeout(2500);
  await popup.close();

  await page.bringToFront();
  await page.waitForTimeout(6000);
  await page.mouse.move(720, 480);
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 38);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(2500);
  await context.close();
  return videoDir;
}

async function sceneBilibili() {
  const { context, extensionId, videoDir } = await launch('bilibili', VIEWPORT);
  const page = await context.newPage();
  await page.goto(BILIBILI_SEARCH, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000);

  const popup = await openPopupInOwnWindow(context, extensionId);
  await startFocus(popup, '温和模式');
  await popup.waitForTimeout(2500);
  await popup.close();

  await page.bringToFront();
  await page.waitForTimeout(11000);
  await page.mouse.move(720, 480);
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 38);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(2500);
  await context.close();
  return videoDir;
}

const SCENES = { popup: scenePopup, feed: sceneFeed, bilibili: sceneBilibili };

(async () => {
  const requested = process.argv[2];
  const names = requested ? [requested] : Object.keys(SCENES);
  for (const name of names) {
    const run = SCENES[name];
    if (!run) {
      console.error(`Unknown scene "${name}". Choose one of: ${Object.keys(SCENES).join(', ')}`);
      process.exit(1);
    }
    const videoDir = await run();
    const files = fs.readdirSync(videoDir).filter((f) => f.endsWith('.webm'));
    console.log(`\n${name}: ${videoDir}`);
    for (const file of files) {
      const full = path.join(videoDir, file);
      console.log(`  ${file}  ${(fs.statSync(full).size / 1024).toFixed(0)} KB`);
    }
  }
})().catch((err) => {
  console.error('Recording failed:', err.message);
  process.exit(1);
});
