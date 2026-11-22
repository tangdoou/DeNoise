import { STORAGE_KEYS } from '../shared/constants';

interface TabScreenshot {
  dataUrl: string;
  timestamp: number;
  url: string;
}

const MAX_SCREENSHOTS = 30;
const CAPTURE_DELAY_MS = 1500;

const memoryCache = new Map<number, TabScreenshot>();
const pendingCaptures = new Map<number, ReturnType<typeof setTimeout>>();
const expectedUrls = new Map<number, string>();
let initialized = false;

function isHttpUrl(url: string | undefined): url is string {
  return Boolean(url && (url.startsWith('http://') || url.startsWith('https://')));
}

async function persistCache(): Promise<void> {
  try {
    if (chrome.storage?.session) {
      await chrome.storage.session.set({
        [STORAGE_KEYS.SCREENSHOT_CACHE]: Object.fromEntries(memoryCache)
      });
    }
  } catch (err) {
    console.warn('[DeNoise] Failed to persist screenshot cache:', err);
  }
}

async function hydrateFromSessionStorage(): Promise<void> {
  if (!chrome.storage?.session || memoryCache.size > 0) {
    return;
  }
  try {
    const stored = await chrome.storage.session.get(STORAGE_KEYS.SCREENSHOT_CACHE);
    const cached = stored[STORAGE_KEYS.SCREENSHOT_CACHE] as
      | Record<number, TabScreenshot>
      | undefined;
    if (!cached) {
      return;
    }
    const entries = Object.entries(cached)
      .map(([tabId, value]) => [Number(tabId), value] as const)
      .filter(([tabId, value]) => Number.isFinite(tabId) && Boolean(value?.dataUrl));
    for (const [tabId, value] of entries) {
      memoryCache.set(tabId, value);
    }
  } catch (err) {
    console.warn('[DeNoise] Failed to restore screenshot cache:', err);
  }
}

function trimCache(): void {
  while (memoryCache.size > MAX_SCREENSHOTS) {
    let oldestTabId: number | undefined;
    let oldestTimestamp = Number.POSITIVE_INFINITY;
    for (const [tabId, screenshot] of memoryCache) {
      if (screenshot.timestamp < oldestTimestamp) {
        oldestTimestamp = screenshot.timestamp;
        oldestTabId = tabId;
      }
    }
    if (oldestTabId === undefined) {
      break;
    }
    memoryCache.delete(oldestTabId);
  }
}

function clearPendingCapture(tabId: number): void {
  const timer = pendingCaptures.get(tabId);
  if (timer !== undefined) {
    clearTimeout(timer);
    pendingCaptures.delete(tabId);
  }
}

function scheduleCapture(tabId: number, windowId: number, url: string): void {
  clearPendingCapture(tabId);
  expectedUrls.set(tabId, url);
  const timer = setTimeout(() => {
    pendingCaptures.delete(tabId);
    void (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, windowId });
        const currentUrl = expectedUrls.get(tabId);
        if (!tab || tab.id !== tabId || tab.windowId !== windowId || !isHttpUrl(tab.url)) {
          return;
        }
        if (currentUrl && tab.url && new URL(tab.url).href !== currentUrl) {
          return;
        }
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
          format: 'jpeg',
          quality: 35
        });
        memoryCache.set(tabId, {
          dataUrl,
          timestamp: Date.now(),
          url: tab.url ?? ''
        });
        trimCache();
        await persistCache();
      } catch (err) {
        console.debug('[DeNoise] Visible tab capture unavailable:', err);
      }
    })();
  }, CAPTURE_DELAY_MS);
  pendingCaptures.set(tabId, timer);
}

export function initScreenshotCache(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    void (async () => {
      const tab = await chrome.tabs.get(tabId as number);
      if (isHttpUrl(tab.url)) {
        scheduleCapture(tabId, windowId, tab.url);
      } else {
        clearPendingCapture(tabId);
      }
    })().catch(() => clearPendingCapture(tabId));
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!isHttpUrl(tab.url)) {
      clearPendingCapture(tabId);
      return;
    }
    if (changeInfo.status === 'complete' || changeInfo.url || changeInfo.title) {
      if (tab.active) {
        if (tab.windowId !== undefined) {
          scheduleCapture(tabId, tab.windowId, tab.url);
        }
      } else {
        expectedUrls.delete(tabId);
      }
    }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    clearPendingCapture(tabId);
    expectedUrls.delete(tabId);
    if (memoryCache.delete(tabId)) {
      void persistCache();
    }
  });

  void hydrateFromSessionStorage();
}

export async function getTabScreenshot(tabId: number): Promise<string | undefined> {
  await hydrateFromSessionStorage();
  return memoryCache.get(tabId)?.dataUrl;
}

export function removeTabScreenshot(tabId: number): void {
  clearPendingCapture(tabId);
  expectedUrls.delete(tabId);
  if (memoryCache.delete(tabId)) {
    void persistCache();
  }
}
