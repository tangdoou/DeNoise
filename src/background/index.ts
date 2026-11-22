import { INITIAL_SESSION_STATE, calculateSnrPercent } from '../shared/constants';
import {
  appendFocusHistoryRecord,
  appendSessionTimelineEvent,
  computeFocusPeriodSummary,
  getFocusHistoryRecords,
  getSessionState,
  saveSessionState,
  updateSessionState
} from '../shared/storage';
import {
  ExtensionMessage,
  FocusAiRetrospective,
  FocusHistoryRecord,
  FocusSessionState,
  JudgeItemInput,
  ProviderConfig,
  TabDomSkeleton
} from '../shared/types';
import {
  extractTaskFromText,
  fetchProviderModels,
  generateFocusRetrospective,
  judgeBatch,
  testProviderConnection
} from './judgeEngine';
import {
  governTabsOnSessionStart,
  parkSingleTabAndSwitch,
  removeClosedTabFromSession,
  restoreAllTabs,
  restoreBlackboxTab,
  upsertLearningTab
} from './tabGovernor';
import { initScreenshotCache } from './screenshotCache';

const MINUTELY_ALARM = 'denoise-minutely-tick';
const NOISE_TIMELINE_THROTTLE_MS = 30_000;
let initialized = false;
const noiseTimelineLastReportedAt = new Map<string, number>();

interface ExtensionResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

function success(data?: unknown): ExtensionResponse {
  return { ok: true, data };
}

function failure(message: string): ExtensionResponse {
  return { ok: false, error: message };
}

function resolvePageLabel(title: string | undefined, url: string | undefined): string {
  const trimmedTitle = (title ?? '').trim();
  if (trimmedTitle) return trimmedTitle;
  try {
    if (url) return new URL(url).hostname;
  } catch {
    // Fall through to the raw URL or generic label.
  }
  return url || '当前页面';
}

function computeGrade(snr: number, driftNudges: number): string {
  if (snr >= 95 && driftNudges <= 1) return 'S';
  if (snr >= 93 && driftNudges <= 2) return 'A+';
  if (snr >= 90) return 'A';
  return 'B+';
}

async function broadcastSessionState(state: FocusSessionState): Promise<void> {
  const message: ExtensionMessage = {
    type: 'SESSION_STATE_UPDATED',
    payload: { state }
  };
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map((tab) => {
    if (tab.id === undefined) return Promise.resolve();
    return chrome.tabs.sendMessage(tab.id, message).catch(() => undefined);
  }));
}

async function startFocusSession(
  taskIntent: string,
  durationMinutes: number,
  intensity: FocusSessionState['intensity']
): Promise<FocusSessionState> {
  const startTime = Date.now();
  const sessionId = `session-${startTime}-${Math.random().toString(36).slice(2, 8)}`;
  const state: FocusSessionState = {
    ...INITIAL_SESSION_STATE,
    sessionId,
    isActive: true,
    taskIntent: taskIntent.trim(),
    intensity,
    startTime,
    durationMinutes,
    endTime: startTime + durationMinutes * 60_000,
    showReceiptModal: false,
    timeline: [
      {
        id: `evt-${startTime}-start`,
        timestamp: startTime,
        type: 'session_start',
        label: taskIntent.trim() || '未命名任务',
        detail: `计划 ${durationMinutes} 分钟 · ${
          intensity === 'strict' ? '强力降噪' : intensity === 'gentle' ? '温和降噪' : '标准降噪'
        }`
      }
    ]
  };
  await saveSessionState(state);
  await governTabsOnSessionStart(state);
  return getSessionState();
}

async function stopFocusSession(showReceipt: boolean): Promise<FocusSessionState> {
  const current = await getSessionState();
  const endTime = Date.now();
  const durationMinutes = Math.max(
    0,
    Math.round((endTime - Math.min(current.startTime, endTime)) / 60_000)
  );
  const timeline = [
    ...(current.timeline ?? []),
    {
      id: `evt-${endTime}-end`,
      timestamp: endTime,
      type: 'session_end' as const,
      label: '专注结束',
      detail: `实际 ${durationMinutes} 分钟`
    }
  ].slice(-30);

  const state = await updateSessionState((prev) => ({
    ...prev,
    isActive: false,
    showReceiptModal: showReceipt,
    lastCompletedSession: {
      taskIntent: prev.taskIntent,
      intensity: prev.intensity,
      startTime: prev.startTime,
      endTime,
      durationMinutes,
      stats: prev.stats,
      blackboxCount: prev.blackboxTabs.length,
      parkedCount: prev.parkedTabIds.length,
      timeline
    }
  }));
  await broadcastSessionState(state);

  void finalizeSessionRetrospective(state, durationMinutes).catch((err) => {
    console.warn('[DeNoise] Failed to finalize session retrospective:', err);
  });
  return state;
}

async function finalizeSessionRetrospective(
  state: FocusSessionState,
  durationMinutes: number
): Promise<void> {
  const summary = state.lastCompletedSession;
  if (!summary) return;

  const snrPercent = calculateSnrPercent(summary.stats);
  const recordId = state.sessionId || `session-${summary.startTime}`;
  const baseRecord: FocusHistoryRecord = {
    id: recordId,
    taskIntent: summary.taskIntent,
    intensity: summary.intensity,
    startTime: summary.startTime,
    endTime: summary.endTime,
    durationMinutes,
    snrPercent,
    grade: computeGrade(snrPercent, summary.stats.driftNudgesCount),
    blurredCount: summary.stats.blurredCardsCount,
    parkedCount: summary.stats.parkedOrClosedTabsCount,
    driftCount: summary.stats.driftNudgesCount
  };
  await appendFocusHistoryRecord(baseRecord);

  const ai: FocusAiRetrospective = {
    status: 'pending',
    badge: '复盘中',
    summary: '',
    highlights: [],
    modelUsed: '',
    generatedAt: Date.now()
  };
  await updateSessionState((prev) =>
    prev.lastCompletedSession
      ? {
          ...prev,
          lastCompletedSession: { ...prev.lastCompletedSession, aiRetrospective: ai }
        }
      : prev
  );

  const output = await generateFocusRetrospective({
    taskIntent: summary.taskIntent,
    intensity: summary.intensity,
    durationMinutes,
    blurredCount: summary.stats.blurredCardsCount,
    parkedCount: summary.stats.parkedOrClosedTabsCount,
    driftCount: summary.stats.driftNudgesCount,
    visionProtected: summary.stats.visionProtectedTabsCount,
    learningTitles: state.learningTabs.map((tab) => tab.title),
    timeline: (summary.timeline ?? []).map((event) => ({
      label: event.label,
      type: event.type
    }))
  });

  const ready: FocusAiRetrospective = {
    status: output.modelUsed === 'local-heuristic' ? 'fallback' : 'ready',
    badge: output.badge,
    summary: output.summary,
    highlights: output.highlights,
    modelUsed: output.modelUsed,
    generatedAt: Date.now()
  };
  const next = await updateSessionState((prev) =>
    prev.lastCompletedSession && prev.lastCompletedSession.startTime === summary.startTime
      ? {
          ...prev,
          lastCompletedSession: { ...prev.lastCompletedSession, aiRetrospective: ready }
        }
      : prev
  );
  await appendFocusHistoryRecord({
    ...baseRecord,
    aiBadge: ready.badge,
    aiSummary: ready.summary
  });
  await broadcastSessionState(next);
}

async function completeExpiredSession(): Promise<void> {
  const current = await getSessionState();
  if (!current.isActive || Date.now() < current.endTime) return;
  await stopFocusSession(true);
}

async function extractActiveTabTask(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || (!tab.url?.startsWith('http') && !tab.url?.startsWith('file://'))) {
    throw new Error('当前活动页不是普通网页');
  }
  const headings: string[] = [];
  let description = '';
  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const hList = Array.from(
          document.querySelectorAll('h1.video-title, .video-title, h1, h2, h3')
        )
          .map((element) => element.textContent?.trim() ?? '')
          .filter(Boolean)
          .slice(0, 8);
        const desc =
          document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content?.trim() ??
          document.querySelector<HTMLElement>('.desc-info-text, #v_desc')?.innerText?.trim() ??
          '';
        return { headings: hList, description: desc.slice(0, 200) };
      }
    });
    const result = execution?.result as { headings?: unknown[]; description?: unknown } | undefined;
    if (result && Array.isArray(result.headings)) {
      headings.push(...result.headings.filter((value): value is string => typeof value === 'string'));
    }
    if (result && typeof result.description === 'string') {
      description = result.description;
    }
  } catch (err) {
    console.debug('[DeNoise] Active tab heading extraction fallback:', err);
  }
  return extractTaskFromText(tab.title ?? '', headings, tab.url, description);
}

async function extractActiveTabSkeleton(): Promise<TabDomSkeleton> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw new Error('未找到当前标签页');
  }
  let skeleton: TabDomSkeleton = {
    tabId: tab.id,
    url: tab.url,
    title: tab.title ?? '',
    metaDescription: '',
    headings: [],
    mainTextSnippet: '',
    mediaAlts: []
  };
  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const compact = (values: string[], count: number) =>
          values.map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, count);
        return {
          url: location.href,
          title: document.title,
          metaDescription: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '',
          headings: compact(
            Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3')).map((element) => element.innerText),
            8
          ),
          mainTextSnippet: (document.querySelector('article')?.innerText ??
            document.querySelector('main')?.innerText ??
            document.body?.innerText ??
            '').replace(/\s+/g, ' ').trim().slice(0, 300),
          mediaAlts: compact(
            Array.from(document.querySelectorAll<HTMLElement>('img, video, [aria-label]')).map((element) =>
              element instanceof HTMLImageElement
                ? element.alt
                : element.getAttribute('aria-label') ?? element.textContent ?? ''
            ),
            10
          )
        };
      }
    });
    const result = execution?.result as Partial<TabDomSkeleton> | undefined;
    if (result) {
      skeleton = {
        ...skeleton,
        ...result,
        tabId: tab.id,
        url: tab.url,
        title: tab.title || result.title || skeleton.title
      };
    }
  } catch (err) {
    console.debug('[DeNoise] DOM skeleton extraction fallback:', err);
  }
  return skeleton;
}

async function switchToLearningTab(): Promise<void> {
  const state = await getSessionState();
  if (state.lastActiveLearningTabId === undefined) {
    throw new Error('没有可切换的学习标签页');
  }
  await chrome.tabs.update(state.lastActiveLearningTabId, { active: true });
  const tab = await chrome.tabs.get(state.lastActiveLearningTabId);
  if (tab.windowId !== undefined) {
    const runtimeChrome = chrome as unknown as {
      windows?: { update?: (windowId: number, options: { focused?: boolean }) => Promise<unknown> };
    };
    await runtimeChrome.windows?.update?.(tab.windowId, { focused: true });
  }
}

async function activateSpecificTab(tabId: number): Promise<void> {
  await chrome.tabs.update(tabId, { active: true });
  const tab = await chrome.tabs.get(tabId);
  if (tab.windowId !== undefined) {
    const runtimeChrome = chrome as unknown as {
      windows?: { update?: (windowId: number, options: { focused?: boolean }) => Promise<unknown> };
    };
    await runtimeChrome.windows?.update?.(tab.windowId, { focused: true });
  }
}

async function handleMessage(
  message: ExtensionMessage,
  sender?: chrome.runtime.MessageSender
): Promise<ExtensionResponse> {
  switch (message.type) {
    case 'START_FOCUS_SESSION': {
      const state = await startFocusSession(
        message.payload.taskIntent,
        message.payload.durationMinutes,
        message.payload.intensity
      );
      await broadcastSessionState(state);
      return success(state);
    }
    case 'STOP_FOCUS_SESSION': {
      const state = await stopFocusSession(message.payload.showReceipt);
      return success(state);
    }
    case 'DISMISS_RECEIPT_MODAL': {
      const state = await updateSessionState((prev) => ({
        ...prev,
        showReceiptModal: false
      }));
      await broadcastSessionState(state);
      return success(state);
    }
    case 'GET_SESSION_STATE':
      return success(await getSessionState());
    case 'JUDGE_FEED_CARDS_BATCH': {
      const items: JudgeItemInput[] = message.payload.items.map((item) => ({
        ...item,
        type: 'feed_card'
      }));
      const state = await getSessionState();
      const results = await judgeBatch({
        taskIntent: state.taskIntent,
        intensity: state.intensity,
        items
      });
      await updateSessionState((prev) => ({
        ...prev,
        stats: {
          ...prev.stats,
          totalScannedItems: prev.stats.totalScannedItems + results.length,
          relevantKeptItems:
            prev.stats.relevantKeptItems + results.filter((result) => result.decision === 'keep').length
        }
      }));
      return success(results);
    }
    case 'JUDGE_CURRENT_PAGE_DRIFT': {
      const state = await getSessionState();
      const [result] = await judgeBatch({
        taskIntent: state.taskIntent,
        intensity: state.intensity,
        items: [{
          id: `drift-${Date.now()}`,
          type: 'feed_card',
          ...message.payload
        }]
      });
      await updateSessionState((prev) => ({
        ...prev,
        stats: {
          ...prev.stats,
          totalScannedItems: prev.stats.totalScannedItems + 1,
          relevantKeptItems:
            prev.stats.relevantKeptItems + (result?.decision === 'keep' ? 1 : 0)
        }
      }));
      if (result?.decision === 'keep' && sender?.tab?.id !== undefined) {
        await upsertLearningTab(
          {
            id: sender.tab.id,
            title: message.payload.title || sender.tab.title,
            url: message.payload.url || sender.tab.url,
            favIconUrl: sender.tab.favIconUrl
          },
          result.relevanceScore,
          result.reasonTag,
          message.payload.snippet
        );
        await broadcastSessionState(await getSessionState());
      }
      return success(result);
    }
    case 'PARK_CURRENT_TAB_AND_SWITCH': {
      await parkSingleTabAndSwitch(sender?.tab?.id);
      const nextState = await getSessionState();
      await broadcastSessionState(nextState);
      return success(nextState);
    }
    case 'ACTIVATE_SPECIFIC_TAB': {
      await activateSpecificTab(message.payload.tabId);
      return success();
    }
    case 'REPORT_NOISE_WIDGET_REMOVED': {
      await updateSessionState((prev) => ({
        ...prev,
        stats: {
          ...prev.stats,
          removedNoiseWidgetsCount: prev.stats.removedNoiseWidgetsCount + message.payload.count
        }
      }));
      const pageKey = `${sender?.tab?.id ?? 'unknown'}::${sender?.tab?.url ?? ''}`;
      const now = Date.now();
      const lastReportedAt = noiseTimelineLastReportedAt.get(pageKey) ?? 0;
      if (now - lastReportedAt >= NOISE_TIMELINE_THROTTLE_MS) {
        noiseTimelineLastReportedAt.set(pageKey, now);
        await appendSessionTimelineEvent({
          type: 'noise_purified',
          label: `净化推荐流 ${message.payload.count} 处`
        });
      }
      const state = await getSessionState();
      return success(state);
    }
    case 'REPORT_DRIFT_NUDGE_SHOWN': {
      await updateSessionState((prev) => ({
        ...prev,
        stats: {
          ...prev.stats,
          driftNudgesCount: prev.stats.driftNudgesCount + 1
        }
      }));
      await appendSessionTimelineEvent({
        type: 'drift_warned',
        label: resolvePageLabel(message.payload.title, sender?.tab?.url),
        detail: message.payload.reasonTag || '与专注任务无关'
      });
      const state = await getSessionState();
      return success(state);
    }
    case 'REPORT_DRIFT_RECOVERED': {
      await appendSessionTimelineEvent({
        type: 'drift_recovered',
        label: resolvePageLabel(message.payload.title, sender?.tab?.url),
        detail:
          message.payload.action === 'parked'
            ? '确认偏离，收进无关标签组并切回学习页'
            : '切回学习页'
      });
      const state = await getSessionState();
      return success(state);
    }
    case 'WHITELIST_CURRENT_URL': {
      const url = message.payload.url;
      const state = await updateSessionState((prev) => ({
        ...prev,
        sessionWhitelistUrls: Array.from(new Set([...prev.sessionWhitelistUrls, url]))
      }));
      const targetTab =
        sender?.tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      if (targetTab?.id !== undefined) {
        await upsertLearningTab(
          {
            id: targetTab.id,
            title: targetTab.title,
            url: url || targetTab.url,
            favIconUrl: targetTab.favIconUrl
          },
          96,
          '手动标记资料'
        );
      }
      const latestState = await getSessionState();
      await broadcastSessionState(latestState);
      return success(latestState);
    }
    case 'SWITCH_TO_LEARNING_TAB':
      await switchToLearningTab();
      return success();
    case 'RESTORE_BLACKBOX_TAB':
      await restoreBlackboxTab(message.payload.blackboxItemId);
      await broadcastSessionState(await getSessionState());
      return success(await getSessionState());
    case 'RESTORE_ALL_TABS':
      await restoreAllTabs();
      await broadcastSessionState(await getSessionState());
      return success(await getSessionState());
    case 'EXTRACT_TASK_FROM_ACTIVE_TAB':
      return success(await extractActiveTabTask());
    case 'TEST_PROVIDER_CONNECTION': {
      const providerConfig = message.payload.providerConfig as ProviderConfig;
      return success(await testProviderConnection(providerConfig));
    }
    case 'FETCH_PROVIDER_MODELS': {
      const providerConfig = message.payload.providerConfig as ProviderConfig;
      return success(await fetchProviderModels(providerConfig));
    }
    case 'GET_FOCUS_STATS': {
      const records = await getFocusHistoryRecords();
      return success({
        summary: computeFocusPeriodSummary(records),
        records: records.slice(0, 20)
      });
    }
    case 'EXTRACT_TAB_DOM_SKELETON':
      return success(await extractActiveTabSkeleton());
    case 'SESSION_STATE_UPDATED':
      return success();
  }
}

function init(): void {
  if (initialized) return;
  initialized = true;
  initScreenshotCache();

  chrome.runtime.onInstalled.addListener(() => {
    void chrome.alarms.create(MINUTELY_ALARM, { periodInMinutes: 1 });
  });
  void chrome.alarms.create(MINUTELY_ALARM, { periodInMinutes: 1 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === MINUTELY_ALARM) {
      void completeExpiredSession().catch(console.warn);
    }
  });
  setInterval(() => {
    void completeExpiredSession().catch(console.warn);
  }, 1000);

  chrome.tabs.onRemoved.addListener((tabId) => {
    void removeClosedTabFromSession(tabId).catch(console.warn);
  });

  chrome.runtime.onMessage.addListener((
    message: ExtensionMessage,
    sender,
    sendResponse: (response: ExtensionResponse) => void
  ) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((err: unknown) => {
        sendResponse(failure(err instanceof Error ? err.message : '后台处理失败'));
      });
    return true;
  });
}

init();
