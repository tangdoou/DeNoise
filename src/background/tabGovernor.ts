import { classifyLearningTabCategory } from '../shared/constants';
import { getAppSettings, getSessionState, updateSessionState } from '../shared/storage';
import {
  BlackboxTabItem,
  ClassifiedLearningTab,
  FocusSessionState,
  TabDomSkeleton
} from '../shared/types';
import { judgeBatch } from './judgeEngine';
import { getTabScreenshot } from './screenshotCache';

interface TabWithSkeleton {
  tab: chrome.tabs.Tab;
  skeleton: TabDomSkeleton;
}

interface ReviewOutcome {
  keep: boolean;
  usedVision: boolean;
  score: number;
  reasonTag: string;
}

type ChromeWindow = {
  id?: number;
  tabs?: Array<{
    id?: number;
    active?: boolean;
    pinned?: boolean;
    url?: string;
    title?: string;
    favIconUrl?: string;
    windowId?: number;
  }>;
};

type GetWindow = (options?: { populate?: boolean }) => Promise<ChromeWindow>;

function getBrowserWindow(): { getLastFocused: GetWindow } {
  const runtimeChrome = chrome as unknown as {
    windows?: { getLastFocused?: GetWindow };
  };
  const getLastFocused = runtimeChrome.windows?.getLastFocused;
  if (!getLastFocused) throw new Error('chrome.windows API is unavailable');
  return { getLastFocused };
}

function isManagedUrl(url: string | undefined): url is string {
  return Boolean(
    url &&
    (url.startsWith('http://') || url.startsWith('https://')) &&
    !url.startsWith('chrome://') &&
    !url.startsWith('chrome-extension://')
  );
}

function hostnameMatches(hostname: string, domain: string): boolean {
  const normalizedDomain = domain.replace(/^www\./, '').toLowerCase();
  const normalizedHostname = hostname.replace(/^www\./, '').toLowerCase();
  return normalizedHostname === normalizedDomain || normalizedHostname.endsWith(`.${normalizedDomain}`);
}

function pageIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}

async function isWhitelisted(
  url: string,
  state: FocusSessionState
): Promise<boolean> {
  const settings = await getAppSettings();
  try {
    const hostname = new URL(url).hostname;
    if (settings.globalWhitelistDomains.some((domain) => hostnameMatches(hostname, domain))) {
      return true;
    }
  } catch {
    // Invalid URLs fall through to exact session whitelist matching.
  }
  const identity = pageIdentity(url);
  return state.sessionWhitelistUrls.some((whitelisted) => pageIdentity(whitelisted) === identity);
}

function extractSkeletonInPage(): TabDomSkeleton {
  const limit = (values: string[], count: number) =>
    values.map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, count);

  const headings = limit(
    Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3')).map((element) => element.innerText),
    8
  );
  const metaElement = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  const textHost =
    document.querySelector('article') ??
    document.querySelector('main') ??
    document.body;
  const mainText = (textHost?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const mediaAlts = limit(
    Array.from(document.querySelectorAll<HTMLElement>('img, video, [aria-label]')).map((element) =>
      element instanceof HTMLImageElement
        ? element.alt
        : element.getAttribute('aria-label') ?? element.textContent ?? ''
    ),
    10
  );

  return {
    tabId: 0,
    url: location.href,
    title: document.title,
    metaDescription: metaElement?.content ?? '',
    headings,
    mainTextSnippet: mainText,
    mediaAlts
  };
}

async function extractTabSkeleton(tab: chrome.tabs.Tab): Promise<TabDomSkeleton> {
  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id as number },
      func: extractSkeletonInPage
    });
    const skeleton = execution?.result as TabDomSkeleton | undefined;
    if (skeleton?.url) {
      return {
        ...skeleton,
        tabId: tab.id as number,
        url: tab.url ?? skeleton.url,
        title: tab.title || skeleton.title
      };
    }
  } catch (err) {
    console.debug('[DeNoise] DOM skeleton extraction fallback:', err);
  }
  return {
    tabId: tab.id as number,
    url: tab.url ?? '',
    title: tab.title ?? '',
    metaDescription: '',
    headings: [],
    mainTextSnippet: '',
    mediaAlts: []
  };
}

function buildSkeletonSnippet(skeleton: TabDomSkeleton): string {
  return [
    skeleton.metaDescription,
    ...skeleton.headings,
    skeleton.mainTextSnippet,
    ...skeleton.mediaAlts
  ].filter(Boolean).join('\n').slice(0, 1000);
}

async function deepReview(
  state: FocusSessionState,
  entry: TabWithSkeleton
): Promise<ReviewOutcome> {
  const screenshot = await getTabScreenshot(entry.tab.id as number);
  const result = await judgeBatch({
    taskIntent: state.taskIntent,
    intensity: state.intensity,
    items: [{
      id: `tab-${entry.tab.id}`,
      type: 'tab_vision_review',
      title: entry.skeleton.title,
      url: entry.skeleton.url,
      snippet: buildSkeletonSnippet(entry.skeleton),
      screenshotBase64: screenshot
    }]
  });
  const review = result[0];
  const score = review?.relevanceScore ?? 0;
  return {
    keep: score >= 50,
    usedVision: Boolean(review?.usedVision && screenshot),
    score,
    reasonTag: review?.reasonTag ?? '复核未确定'
  };
}

async function parkTabs(
  state: FocusSessionState,
  entries: TabWithSkeleton[]
): Promise<number[]> {
  if (entries.length === 0) return [];
  const tabIds = entries.map((entry) => entry.tab.id as number);
  try {
    const groupId = await chrome.tabs.group({
      createProperties: { windowId: entries[0].tab.windowId as number },
      tabIds
    });
    await chrome.tabGroups.update(groupId, {
      title: '💤 暂存休息舱',
      color: 'grey',
      collapsed: true
    });
    await Promise.allSettled(entries.map(async (entry) => {
      if (entry.tab.active) return;
      await chrome.tabs.discard(entry.tab.id as number);
    }));
    await updateSessionState((prev) => ({
      ...prev,
      parkedGroupId: groupId,
      parkedTabIds: Array.from(new Set([...prev.parkedTabIds, ...tabIds]))
    }));
    return tabIds;
  } catch (err) {
    console.warn('[DeNoise] Failed to park tabs:', err);
    await updateSessionState((prev) => ({
      ...prev,
      parkedTabIds: Array.from(new Set([...prev.parkedTabIds, ...tabIds]))
    }));
    return [];
  }
}

async function closeTabs(
  state: FocusSessionState,
  entries: TabWithSkeleton[],
  results: Map<number, ReviewOutcome>
): Promise<void> {
  if (entries.length === 0) return;
  const blackboxItems: BlackboxTabItem[] = [];
  for (const entry of entries) {
    const review = results.get(entry.tab.id as number);
    const screenshot = await getTabScreenshot(entry.tab.id as number);
    blackboxItems.push({
      id: `blackbox-${state.sessionId}-${entry.tab.id}`,
      originalTabId: entry.tab.id as number,
      title: entry.skeleton.title || entry.tab.title || entry.skeleton.url,
      url: entry.skeleton.url,
      favicon: entry.tab.favIconUrl,
      screenshotBase64: screenshot,
      reasonTag: review?.reasonTag ?? '确认无关',
      relevanceScore: review?.score ?? 0,
      closedAt: Date.now()
    });
  }
  await updateSessionState((prev) => ({
    ...prev,
    blackboxTabs: [...prev.blackboxTabs, ...blackboxItems],
    stats: {
      ...prev.stats,
      parkedOrClosedTabsCount: prev.stats.parkedOrClosedTabsCount + blackboxItems.length
    }
  }));
  await Promise.allSettled(entries.map((entry) => chrome.tabs.remove(entry.tab.id as number)));
}

function buildClassifiedLearningTab(
  tab: { id?: number; title?: string; url?: string; favIconUrl?: string },
  relevanceScore: number,
  reasonTag: string,
  snippet = ''
): ClassifiedLearningTab | null {
  if (tab.id === undefined || !tab.url) return null;
  const title = tab.title || tab.url;
  const { category, categoryLabel } = classifyLearningTabCategory(tab.url, title, snippet);
  return {
    tabId: tab.id,
    title,
    url: tab.url,
    favicon: tab.favIconUrl,
    category,
    categoryLabel,
    relevanceScore: Math.round(relevanceScore),
    reasonTag: reasonTag || '学习资料',
    updatedAt: Date.now()
  };
}

export async function upsertLearningTab(
  tab: { id?: number; title?: string; url?: string; favIconUrl?: string },
  relevanceScore = 88,
  reasonTag = '任务相关',
  snippet = ''
): Promise<ClassifiedLearningTab | null> {
  const classified = buildClassifiedLearningTab(tab, relevanceScore, reasonTag, snippet);
  if (!classified) return null;
  await updateSessionState((prev) => {
    if (!prev.isActive) return prev;
    const filtered = (prev.learningTabs || []).filter((item) => item.tabId !== classified.tabId);
    return {
      ...prev,
      lastActiveLearningTabId: classified.tabId,
      learningTabs: [classified, ...filtered].slice(0, 30)
    };
  });
  return classified;
}

export async function removeClosedTabFromSession(tabId: number): Promise<void> {
  await updateSessionState((prev) => {
    if (!prev.isActive) return prev;
    const nextLearning = (prev.learningTabs || []).filter((item) => item.tabId !== tabId);
    const nextParked = (prev.parkedTabIds || []).filter((id) => id !== tabId);
    const nextLastLearning =
      prev.lastActiveLearningTabId === tabId
        ? nextLearning[0]?.tabId
        : prev.lastActiveLearningTabId;
    return {
      ...prev,
      learningTabs: nextLearning,
      parkedTabIds: nextParked,
      lastActiveLearningTabId: nextLastLearning
    };
  });
}

export async function governTabsOnSessionStart(
  state: FocusSessionState
): Promise<void> {
  const currentWindow = await getBrowserWindow().getLastFocused({ populate: true });
  const tabs = (currentWindow.tabs ?? []).filter((tab) =>
    tab.id !== undefined &&
    !tab.pinned &&
    isManagedUrl(tab.url)
  );
  const managed: TabWithSkeleton[] = [];
  const classifiedLearningList: ClassifiedLearningTab[] = [];
  let whitelistLearningTabId: number | undefined;

  for (const tab of tabs) {
    if (!tab.url || !(await isWhitelisted(tab.url, state))) {
      managed.push({ tab, skeleton: await extractTabSkeleton(tab) });
    } else {
      whitelistLearningTabId = tab.id;
      const classified = buildClassifiedLearningTab(tab, 96, '白名单资料');
      if (classified) {
        classifiedLearningList.push(classified);
      }
    }
  }

  if (managed.length === 0) {
    if (classifiedLearningList.length > 0) {
      await updateSessionState((prev) => ({
        ...prev,
        learningTabs: classifiedLearningList,
        lastActiveLearningTabId: whitelistLearningTabId ?? prev.lastActiveLearningTabId
      }));
    }
    return;
  }
  const initialResults = await judgeBatch({
    taskIntent: state.taskIntent,
    intensity: state.intensity,
    items: managed.map(({ skeleton }) => ({
      id: `tab-${skeleton.tabId}`,
      type: 'tab_initial' as const,
      title: skeleton.title,
      url: skeleton.url,
      snippet: buildSkeletonSnippet(skeleton)
    }))
  });
  const resultMap = new Map(initialResults.map((result) => [result.id, result]));
  const keep: TabWithSkeleton[] = [];
  const park: TabWithSkeleton[] = [];
  const close: TabWithSkeleton[] = [];
  const reviewOutcomes = new Map<number, ReviewOutcome>();
  let visionProtectedCount = 0;

  for (const entry of managed) {
    const tabId = entry.tab.id as number;
    const result = resultMap.get(`tab-${tabId}`);
    const score = result?.relevanceScore ?? 0;
    if (score >= 52 || state.intensity === 'gentle') {
      keep.push(entry);
      const classified = buildClassifiedLearningTab(
        {
          id: tabId,
          title: entry.skeleton.title || entry.tab.title,
          url: entry.skeleton.url || entry.tab.url,
          favIconUrl: entry.tab.favIconUrl
        },
        score,
        result?.reasonTag ?? '任务相关',
        buildSkeletonSnippet(entry.skeleton)
      );
      if (classified && score >= 45) {
        classifiedLearningList.push(classified);
      }
      continue;
    }

    if (state.intensity === 'standard' || score < 15) {
      if (state.intensity === 'standard') {
        park.push(entry);
        reviewOutcomes.set(tabId, {
          keep: false,
          usedVision: false,
          score,
          reasonTag: result?.reasonTag ?? '标签页降噪'
        });
      } else {
        close.push(entry);
        reviewOutcomes.set(tabId, {
          keep: false,
          usedVision: false,
          score,
          reasonTag: result?.reasonTag ?? '明确无关'
        });
      }
      continue;
    }

    const review = await deepReview(state, entry);
    reviewOutcomes.set(tabId, review);
    if (review.keep) {
      keep.push(entry);
      const classified = buildClassifiedLearningTab(
        {
          id: tabId,
          title: entry.skeleton.title || entry.tab.title,
          url: entry.skeleton.url || entry.tab.url,
          favIconUrl: entry.tab.favIconUrl
        },
        review.score,
        review.reasonTag,
        buildSkeletonSnippet(entry.skeleton)
      );
      if (classified) {
        classifiedLearningList.push(classified);
      }
      if (review.usedVision) visionProtectedCount += 1;
    } else if (review.score >= 30) {
      park.push(entry);
    } else {
      close.push(entry);
    }
  }

  const parkedIds = await parkTabs(state, park);
  if (parkedIds.length > 0) {
    await updateSessionState((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        parkedOrClosedTabsCount: prev.stats.parkedOrClosedTabsCount + parkedIds.length
      }
    }));
  }
  if (visionProtectedCount > 0) {
    await updateSessionState((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        visionProtectedTabsCount: prev.stats.visionProtectedTabsCount + visionProtectedCount
      }
    }));
  }
  await closeTabs(state, close, reviewOutcomes);

  const learningCandidate = whitelistLearningTabId ?? keep.at(-1)?.tab.id;
  await updateSessionState((prev) => ({
    ...prev,
    learningTabs: classifiedLearningList,
    lastActiveLearningTabId: learningCandidate ?? prev.lastActiveLearningTabId
  }));
}

export async function parkSingleTabAndSwitch(targetTabId?: number): Promise<void> {
  const state = await getSessionState();
  let tabToPark: chrome.tabs.Tab | undefined;
  if (targetTabId !== undefined) {
    try {
      tabToPark = await chrome.tabs.get(targetTabId);
    } catch {
      tabToPark = undefined;
    }
  }
  if (!tabToPark) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabToPark = activeTab;
  }
  if (!tabToPark || tabToPark.id === undefined) {
    return;
  }
  const parkId = tabToPark.id;

  // First find a learning tab to switch focus to so the parked tab group can collapse cleanly
  let fallbackLearningId: number | undefined =
    state.lastActiveLearningTabId !== undefined && state.lastActiveLearningTabId !== parkId
      ? state.lastActiveLearningTabId
      : state.learningTabs.find((t) => t.tabId !== parkId)?.tabId;

  if (fallbackLearningId !== undefined) {
    try {
      await chrome.tabs.get(fallbackLearningId);
    } catch {
      fallbackLearningId = undefined;
    }
  }

  if (fallbackLearningId === undefined) {
    const windowTabs = await chrome.tabs.query({ currentWindow: true });
    const candidate = windowTabs.find(
      (t) =>
        t.id !== undefined &&
        t.id !== parkId &&
        !state.parkedTabIds.includes(t.id)
    );
    fallbackLearningId = candidate?.id;
  }

  if (fallbackLearningId !== undefined) {
    await chrome.tabs.update(fallbackLearningId, { active: true }).catch(() => undefined);
  }

  // Now fold parkId into existing or new 💤 暂存休息舱 tab group
  let resolvedGroupId = state.parkedGroupId;
  let groupedOk = false;
  if (resolvedGroupId !== undefined) {
    try {
      resolvedGroupId = await chrome.tabs.group({
        groupId: resolvedGroupId,
        tabIds: [parkId]
      });
      groupedOk = true;
    } catch {
      groupedOk = false;
    }
  }
  if (!groupedOk) {
    try {
      resolvedGroupId = await chrome.tabs.group({
        createProperties:
          tabToPark.windowId !== undefined ? { windowId: tabToPark.windowId } : undefined,
        tabIds: [parkId]
      });
      groupedOk = true;
    } catch (err) {
      console.warn('[DeNoise] Failed to create parked group for single tab:', err);
    }
  }

  if (groupedOk && resolvedGroupId !== undefined) {
    await chrome.tabGroups
      .update(resolvedGroupId, {
        title: '💤 暂存休息舱',
        color: 'grey',
        collapsed: fallbackLearningId !== undefined
      })
      .catch(() => undefined);
  }

  await updateSessionState((prev) => {
    const alreadyParked = prev.parkedTabIds.includes(parkId);
    return {
      ...prev,
      parkedGroupId: resolvedGroupId ?? prev.parkedGroupId,
      parkedTabIds: Array.from(new Set([...prev.parkedTabIds, parkId])),
      learningTabs: (prev.learningTabs || []).filter((item) => item.tabId !== parkId),
      lastActiveLearningTabId: fallbackLearningId ?? prev.lastActiveLearningTabId,
      stats: {
        ...prev.stats,
        parkedOrClosedTabsCount: alreadyParked
          ? prev.stats.parkedOrClosedTabsCount
          : prev.stats.parkedOrClosedTabsCount + 1
      }
    };
  });
}

export async function restoreBlackboxTab(blackboxItemId: string): Promise<void> {
  const current = await getSessionState();
  const item = current.blackboxTabs.find((candidate) => candidate.id === blackboxItemId);
  if (!item) return;
  await updateSessionState((prev) => ({
    ...prev,
    sessionWhitelistUrls: Array.from(new Set([...prev.sessionWhitelistUrls, item.url])),
    blackboxTabs: prev.blackboxTabs.filter((candidate) => candidate.id !== blackboxItemId)
  }));
  await chrome.tabs.create({ url: item.url, active: true });
}

export async function restoreAllTabs(): Promise<void> {
  const current = await getSessionState();
  const parkedTabIds = [...current.parkedTabIds];
  const blackboxTabs = [...current.blackboxTabs];
  await updateSessionState((prev) => ({
    ...prev,
    parkedTabIds: [],
    blackboxTabs: [],
    stats: {
      ...prev.stats,
      parkedOrClosedTabsCount: Math.max(0, prev.stats.parkedOrClosedTabsCount - blackboxTabs.length)
    }
  }));

  if (parkedTabIds.length > 0) {
    await chrome.tabs.ungroup(parkedTabIds).catch((err: unknown) => {
      console.warn('[DeNoise] Failed to ungroup tabs:', err);
    });
  }
  for (const item of blackboxTabs) {
    await chrome.tabs.create({ url: item.url, active: false }).catch((err: unknown) => {
      console.warn('[DeNoise] Failed to restore blackbox tab:', err);
    });
  }
}
