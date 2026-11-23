import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  EyeOff,
  FolderArchive,
  Globe,
  Loader2,
  Pin,
  RotateCcw,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Square
} from 'lucide-react';
import {
  INITIAL_SESSION_STATE,
  QUICK_TASK_PRESETS,
  STORAGE_KEYS,
  calculateSnrPercent
} from '../shared/constants';
import {
  computeFocusPeriodSummary,
  getAppSettings,
  getFocusHistoryRecords,
  getSessionState
} from '../shared/storage';
import { DeNoiseLogo } from '../shared/DeNoiseLogo';
import {
  BlackboxTabItem,
  ExtensionMessage,
  FocusIntensity,
  FocusPeriodSummary,
  FocusSessionState,
  PeriodFocusReview
} from '../shared/types';
import { AncWaveform, AncWaveformMode } from './AncWaveform';

const PRESET_DURATIONS = [25, 45, 60] as const;

const INTENSITY_OPTIONS: {
  id: FocusIntensity;
  emoji: string;
  title: string;
  badge?: string;
  description: string;
}[] = [
  {
    id: 'gentle',
    emoji: '🌱',
    title: '温和模式',
    description: '仅网页毛玻璃降噪，保留全部标签页'
  },
  {
    id: 'standard',
    emoji: '⚖️',
    title: '标准模式',
    badge: '推荐',
    description: '网页降噪 + 相关资料智能语义编组 + 无关页折入 💤 休息舱'
  },
  {
    id: 'strict',
    emoji: '🔥',
    title: '强力模式',
    description: '相关页语义编组 + 看图确认无关才关闭（存疑只折叠）+ 黑匣子可恢复'
  }
];

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function sendExtensionMessage<T = any>(message: ExtensionMessage): Promise<T | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return null;
  }
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    console.warn('[DeNoise Popup] sendMessage failed:', message.type, err);
    return null;
  }
}

interface BackgroundEnvelope<T = unknown> {
  ok?: boolean;
  data?: T;
  state?: FocusSessionState;
  error?: string;
}

function unwrapSessionState(response: unknown): FocusSessionState | null {
  if (!response || typeof response !== 'object') {
    return null;
  }
  const record = response as BackgroundEnvelope<FocusSessionState>;
  if (record.data && typeof record.data === 'object' && 'isActive' in record.data) {
    return record.data;
  }
  if (record.state && typeof record.state === 'object' && 'isActive' in record.state) {
    return record.state;
  }
  if ('isActive' in record) {
    return record as unknown as FocusSessionState;
  }
  return null;
}

async function queryActiveTab(): Promise<{ url?: string; title?: string } | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) {
    return null;
  }
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] ?? null;
  } catch {
    return null;
  }
}

export const PopupApp: React.FC = () => {
  const [session, setSession] = useState<FocusSessionState>(INITIAL_SESSION_STATE);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasConfiguredProvider, setHasConfiguredProvider] = useState<boolean>(true);

  const [taskIntent, setTaskIntent] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(25);
  const [isCustomDuration, setIsCustomDuration] = useState<boolean>(false);
  const [customDurationInput, setCustomDurationInput] = useState<string>('90');
  const [intensity, setIntensity] = useState<FocusIntensity>('standard');

  const [isExtractingTask, setIsExtractingTask] = useState<boolean>(false);
  const [extractFeedback, setExtractFeedback] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');

  const [isDamping, setIsDamping] = useState<boolean>(false);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  const [blackboxExpanded, setBlackboxExpanded] = useState<boolean>(false);
  const [restoringIds, setRestoringIds] = useState<Record<string, boolean>>({});
  const [activeTabUrl, setActiveTabUrl] = useState<string>('');
  const [whitelistingState, setWhitelistingState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [isRestoringAll, setIsRestoringAll] = useState<boolean>(false);
  const [isStopping, setIsStopping] = useState<boolean>(false);
  const [focusSummary, setFocusSummary] = useState<FocusPeriodSummary | null>(null);
  const [periodReview, setPeriodReview] = useState<PeriodFocusReview | null>(null);
  const [isGeneratingReview, setIsGeneratingReview] = useState<boolean>(false);

  const pendingSessionRef = useRef<FocusSessionState | null>(null);
  const taskInputRef = useRef<HTMLTextAreaElement | null>(null);

  const loadInitialState = useCallback(async () => {
    try {
      const [bgResponse, storedSession, settings, activeTab] = await Promise.all([
        sendExtensionMessage<BackgroundEnvelope<FocusSessionState>>({
          type: 'GET_SESSION_STATE'
        }),
        getSessionState(),
        getAppSettings(),
        queryActiveTab()
      ]);

      const resolvedState: FocusSessionState =
        unwrapSessionState(bgResponse) || storedSession;

      setSession(resolvedState);
      if (resolvedState.taskIntent) {
        setTaskIntent(resolvedState.taskIntent);
      }
      if (resolvedState.intensity) {
        setIntensity(resolvedState.intensity);
      }
      if (resolvedState.durationMinutes) {
        setDurationMinutes(resolvedState.durationMinutes);
        if (!PRESET_DURATIONS.includes(resolvedState.durationMinutes as 25 | 45 | 60)) {
          setIsCustomDuration(true);
          setCustomDurationInput(String(resolvedState.durationMinutes));
        }
      }

      const anyKeyReady = Object.values(settings.providers).some(
        (provider) =>
          provider.enabled &&
          (provider.id === 'ollama'
            ? provider.baseUrl.trim().length > 0
            : provider.apiKey.trim().length > 0)
      );
      setHasConfiguredProvider(anyKeyReady);

      if (activeTab?.url) {
        setActiveTabUrl(activeTab.url);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialState();
  }, [loadInitialState]);

  const loadFocusSummary = useCallback(async () => {
    const response = await sendExtensionMessage<{
      ok?: boolean;
      data?: { summary?: FocusPeriodSummary };
    }>({ type: 'GET_FOCUS_STATS' });
    const summary = response?.data?.summary;
    if (summary) {
      setFocusSummary(summary);
      return;
    }
    const records = await getFocusHistoryRecords();
    setFocusSummary(computeFocusPeriodSummary(records));
  }, []);

  useEffect(() => {
    void loadFocusSummary();
  }, [loadFocusSummary, session.isActive, session.lastCompletedSession?.aiRetrospective?.status]);

  const handleGeneratePeriodReview = useCallback(async () => {
    if (isGeneratingReview) return;
    setIsGeneratingReview(true);
    try {
      const response = await sendExtensionMessage<{
        ok?: boolean;
        data?: { review?: PeriodFocusReview };
      }>({ type: 'GENERATE_PERIOD_REVIEW' });
      if (response?.data?.review) {
        setPeriodReview(response.data.review);
      }
    } finally {
      setIsGeneratingReview(false);
    }
  }, [isGeneratingReview]);

  useEffect(() => {
    if (typeof chrome === 'undefined') {
      return;
    }

    const handleStorageChange = (
      changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
      areaName: string
    ) => {
      if (areaName === 'local' && changes[STORAGE_KEYS.SESSION]?.newValue) {
        const nextState = changes[STORAGE_KEYS.SESSION].newValue as FocusSessionState;
        if (isDamping) {
          pendingSessionRef.current = nextState;
        } else {
          setSession(nextState);
        }
      }
    };

    const handleRuntimeMessage = (message: ExtensionMessage) => {
      if (message?.type === 'SESSION_STATE_UPDATED' && message.payload?.state) {
        const nextState = message.payload.state;
        if (isDamping) {
          pendingSessionRef.current = nextState;
        } else {
          setSession(nextState);
        }
      }
    };

    chrome.storage?.onChanged?.addListener(handleStorageChange);
    chrome.runtime?.onMessage?.addListener(handleRuntimeMessage);

    return () => {
      chrome.storage?.onChanged?.removeListener(handleStorageChange);
      chrome.runtime?.onMessage?.removeListener(handleRuntimeMessage);
    };
  }, [isDamping]);

  useEffect(() => {
    if (!session.isActive) {
      return;
    }
    setNowTs(Date.now());
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session.isActive]);

  const openSettingsPage = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open('options.html', '_blank');
    }
  };

  const openReviewPage = () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL && chrome.tabs?.create) {
      void chrome.tabs.create({ url: chrome.runtime.getURL('options.html?tab=review') });
    } else {
      window.open('options.html?tab=review', '_blank');
    }
  };

  const handleExtractTask = async () => {
    if (isExtractingTask) {
      return;
    }
    setIsExtractingTask(true);
    setExtractFeedback('');
    setValidationError('');

    try {
      const response = await sendExtensionMessage<
        BackgroundEnvelope<string | { taskIntent?: string; task?: string }> & {
          taskIntent?: string;
          task?: string;
          title?: string;
        }
      >({
        type: 'EXTRACT_TASK_FROM_ACTIVE_TAB'
      });

      const fromData =
        typeof response?.data === 'string'
          ? response.data
          : response?.data?.taskIntent || response?.data?.task || '';
      const extracted =
        fromData.trim() ||
        response?.taskIntent?.trim() ||
        response?.task?.trim() ||
        response?.title?.trim() ||
        '';

      if (extracted) {
        setTaskIntent(extracted);
        setExtractFeedback('已从当前网页提炼任务');
      } else {
        const activeTab = await queryActiveTab();
        if (activeTab?.title) {
          const cleanedTitle = activeTab.title
            .replace(/\s*[-_|·—]\s*(哔哩哔哩|bilibili|知乎|CSDN|GitHub|Google).*$/i, '')
            .trim();
          setTaskIntent(cleanedTitle || activeTab.title);
          setExtractFeedback('已提取当前页面标题作为任务目标');
        } else {
          setExtractFeedback(response?.error || '当前标签页无可提炼内容，请手动输入');
        }
      }
    } finally {
      setIsExtractingTask(false);
    }
  };

  const resolvedDurationMinutes = useMemo(() => {
    if (!isCustomDuration) {
      return durationMinutes;
    }
    const parsed = Number.parseInt(customDurationInput, 10);
    if (Number.isNaN(parsed)) {
      return 25;
    }
    return Math.max(5, Math.min(240, parsed));
  }, [isCustomDuration, durationMinutes, customDurationInput]);

  const handleStartFocus = async () => {
    if (isDamping) {
      return;
    }
    const trimmedTask = taskIntent.trim();
    if (!trimmedTask) {
      setValidationError('请先输入本次专注任务，或点击右上角从当前网页提炼');
      taskInputRef.current?.focus();
      return;
    }

    setValidationError('');
    setExtractFeedback('');
    setIsDamping(true);

    const finalMinutes = resolvedDurationMinutes;
    const now = Date.now();
    const optimisticState: FocusSessionState = {
      ...INITIAL_SESSION_STATE,
      isActive: true,
      sessionId: `session_${now}`,
      taskIntent: trimmedTask,
      intensity,
      startTime: now,
      durationMinutes: finalMinutes,
      endTime: now + finalMinutes * 60 * 1000
    };
    pendingSessionRef.current = optimisticState;

    const response = await sendExtensionMessage<BackgroundEnvelope<FocusSessionState>>({
      type: 'START_FOCUS_SESSION',
      payload: {
        taskIntent: trimmedTask,
        durationMinutes: finalMinutes,
        intensity
      }
    });

    const nextState = unwrapSessionState(response);
    if (nextState) {
      pendingSessionRef.current = nextState;
    }
  };

  const handleDampingComplete = useCallback(() => {
    window.setTimeout(() => {
      const nextState = pendingSessionRef.current;
      if (nextState) {
        setSession(nextState);
        pendingSessionRef.current = null;
      } else {
        void getSessionState().then(setSession);
      }
      setIsDamping(false);
    }, 260);
  }, []);

  const handleWhitelistActiveTab = async () => {
    if (whitelistingState === 'saving') {
      return;
    }
    setWhitelistingState('saving');
    const activeTab = await queryActiveTab();
    const targetUrl = activeTab?.url || activeTabUrl;

    if (targetUrl) {
      setActiveTabUrl(targetUrl);
      const res = await sendExtensionMessage<BackgroundEnvelope<FocusSessionState>>({
        type: 'WHITELIST_CURRENT_URL',
        payload: { url: targetUrl }
      });
      const nextState = unwrapSessionState(res);
      if (nextState) {
        setSession(nextState);
      } else {
        setSession((prev) => ({
          ...prev,
          sessionWhitelistUrls: prev.sessionWhitelistUrls.includes(targetUrl)
            ? prev.sessionWhitelistUrls
            : [...prev.sessionWhitelistUrls, targetUrl]
        }));
      }
      setWhitelistingState('done');
      window.setTimeout(() => setWhitelistingState('idle'), 2200);
    } else {
      setWhitelistingState('idle');
    }
  };

  const handleRestoreBlackboxTab = async (item: BlackboxTabItem) => {
    setRestoringIds((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await sendExtensionMessage<BackgroundEnvelope<FocusSessionState>>({
        type: 'RESTORE_BLACKBOX_TAB',
        payload: { blackboxItemId: item.id }
      });
      const nextState = unwrapSessionState(res);
      if (nextState) {
        setSession(nextState);
      } else {
        setSession((prev) => ({
          ...prev,
          blackboxTabs: prev.blackboxTabs.filter((tab) => tab.id !== item.id)
        }));
      }
    } finally {
      setRestoringIds((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  const handleRestoreAllTabs = async () => {
    if (isRestoringAll) return;
    setIsRestoringAll(true);
    try {
      const res = await sendExtensionMessage<BackgroundEnvelope<FocusSessionState>>({
        type: 'RESTORE_ALL_TABS'
      });
      const nextState = unwrapSessionState(res);
      if (nextState) {
        setSession(nextState);
      }
    } finally {
      setIsRestoringAll(false);
    }
  };

  const handleActivateLearningTab = async (tabId: number) => {
    await sendExtensionMessage({
      type: 'ACTIVATE_SPECIFIC_TAB',
      payload: { tabId }
    });
  };

  const handleStopFocus = async () => {
    if (isStopping) {
      return;
    }
    setIsStopping(true);
    try {
      const res = await sendExtensionMessage<BackgroundEnvelope<FocusSessionState>>({
        type: 'STOP_FOCUS_SESSION',
        payload: { showReceipt: true }
      });
      const nextState = unwrapSessionState(res);
      if (nextState) {
        setSession(nextState);
      } else {
        setSession((prev) => ({
          ...prev,
          isActive: false
        }));
      }
      setBlackboxExpanded(false);
    } finally {
      setIsStopping(false);
    }
  };

  const isCurrentTabWhitelisted =
    Boolean(activeTabUrl) && session.sessionWhitelistUrls.includes(activeTabUrl);

  const snrPercent = useMemo(() => calculateSnrPercent(session.stats), [session.stats]);
  const remainingMs = Math.max(0, session.endTime - nowTs);
  const activeIntensityMeta =
    INTENSITY_OPTIONS.find((item) => item.id === session.intensity) ?? INTENSITY_OPTIONS[1];

  const idleWaveformMode: AncWaveformMode = isDamping ? 'damping' : 'noisy';
  const showActiveView = session.isActive && !isDamping;

  return (
    <div className="flex min-h-[520px] w-[380px] flex-col bg-white text-[#191919] font-sans">
      <header className="flex items-center justify-between border-b border-[#E9E9E7] bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <DeNoiseLogo size={24} className="shrink-0" />
          <span className="text-[14px] font-semibold tracking-tight text-[#191919]">
            DeNoise
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
              showActiveView
                ? 'border-[#0F7B6C]/25 bg-[#0F7B6C]/10 text-[#0F7B6C]'
                : 'border-[#E9E9E7] bg-[#F7F7F5] text-[#787774]'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                showActiveView ? 'bg-[#0F7B6C]' : 'bg-[#787774]'
              }`}
            />
            {showActiveView ? '降噪中' : '待机'}
          </span>
        </div>

        <button
          type="button"
          onClick={openSettingsPage}
          className="inline-flex items-center gap-1 rounded-md border border-[#E9E9E7] bg-white px-2.5 py-1 text-[11px] font-medium text-[#787774] transition-colors hover:bg-[#EFEFED] hover:text-[#191919]"
        >
          <Settings className="h-3.5 w-3.5" />
          <span>引擎设置</span>
        </button>
      </header>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center py-16 text-[#787774]">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : showActiveView ? (
        <main className="flex flex-1 flex-col justify-between gap-3.5 p-4">
          <div className="space-y-3">
            <section className="rounded-lg border border-[#E9E9E7] bg-[#F7F7F5] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded border border-[#E9E9E7] bg-white px-2 py-0.5 text-[11px] font-medium text-[#191919]">
                  <span>{activeIntensityMeta.emoji}</span>
                  <span>{activeIntensityMeta.title}</span>
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[#0F7B6C] tabular-nums">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#0F7B6C]" />
                  <span>SNR {snrPercent.toFixed(1)}%</span>
                </span>
              </div>

              <div className="mt-2.5 flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-[#787774]">当前锁定目标</div>
                  <p
                    className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug text-[#191919]"
                    title={session.taskIntent}
                  >
                    {session.taskIntent}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[10px] text-[#787774]">剩余时长</div>
                  <div className="font-mono text-[28px] font-semibold leading-none tracking-tight text-[#191919] tabular-nums">
                    {formatCountdown(remainingMs)}
                  </div>
                </div>
              </div>

              <AncWaveform mode="locked" compact className="mt-3" />
            </section>

            <section className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-[#E9E9E7] bg-white p-2.5">
                <div className="flex items-center justify-between text-[#787774]">
                  <span className="text-[11px]">已虚化卡片</span>
                  <EyeOff className="h-3.5 w-3.5" />
                </div>
                <div className="mt-1 font-mono text-[20px] font-semibold leading-tight text-[#191919] tabular-nums">
                  {session.stats.blurredCardsCount}
                </div>
              </div>

              <div className="rounded-lg border border-[#E9E9E7] bg-white p-2.5">
                <div className="flex items-center justify-between text-[#787774]">
                  <span className="text-[11px]">清除热搜 / 弹窗</span>
                  <Shield className="h-3.5 w-3.5" />
                </div>
                <div className="mt-1 font-mono text-[20px] font-semibold leading-tight text-[#191919] tabular-nums">
                  {session.stats.removedNoiseWidgetsCount}
                </div>
              </div>

              <div className="rounded-lg border border-[#E9E9E7] bg-white p-2.5">
                <div className="flex items-center justify-between text-[#787774]">
                  <span className="text-[11px]">休息舱 / 黑匣子接管</span>
                  <FolderArchive className="h-3.5 w-3.5" />
                </div>
                <div className="mt-1 font-mono text-[20px] font-semibold leading-tight text-[#191919] tabular-nums">
                  {session.stats.parkedOrClosedTabsCount}
                </div>
              </div>

              <div className="rounded-lg border border-[#E9E9E7] bg-white p-2.5">
                <div className="flex items-center justify-between text-[#787774]">
                  <span className="text-[11px]">多模态复核保护</span>
                  <ShieldCheck className="h-3.5 w-3.5 text-[#0F7B6C]" />
                </div>
                <div className="mt-1 font-mono text-[20px] font-semibold leading-tight text-[#191919] tabular-nums">
                  {session.stats.visionProtectedTabsCount}
                </div>
              </div>
            </section>

            {((session.learningTabs && session.learningTabs.length > 0) ||
              session.parkedTabIds.length > 0 ||
              Object.keys(session.learningGroupIds ?? {}).length > 0) && (
              <section className="rounded-lg border border-[#E9E9E7] bg-[#F7F7F5] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11.5px] font-medium text-[#191919]">
                      🗂️ 语义标签编组
                    </span>
                    <span className="rounded bg-white px-1.5 py-0.2 font-mono text-[10px] text-[#0F7B6C] border border-[#E9E9E7]">
                      资料 {session.learningTabs?.length ?? 0} · 休息舱 {session.parkedTabIds.length}
                    </span>
                  </div>
                  {(session.parkedTabIds.length > 0 ||
                    session.blackboxTabs.length > 0 ||
                    Object.keys(session.learningGroupIds ?? {}).length > 0) && (
                    <button
                      type="button"
                      disabled={isRestoringAll}
                      onClick={handleRestoreAllTabs}
                      className="inline-flex items-center gap-1 rounded border border-[#E9E9E7] bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-[#191919] transition-colors hover:bg-[#191919] hover:text-white disabled:opacity-50"
                      title="恢复全部休息舱/黑匣子标签页并解散标签分组"
                    >
                      {isRestoringAll ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-2.5 w-2.5" />
                      )}
                      <span>解散分组并恢复</span>
                    </button>
                  )}
                </div>

                {session.learningTabs && session.learningTabs.length > 0 && (
                  <div className="mt-2 max-h-[124px] space-y-1 overflow-y-auto pr-0.5">
                    {session.learningTabs.map((item) => (
                      <button
                        key={item.tabId}
                        type="button"
                        onClick={() => handleActivateLearningTab(item.tabId)}
                        className="flex w-full items-center justify-between gap-2 rounded border border-[#E9E9E7] bg-white px-2 py-1 text-left transition-colors hover:border-[#191919]"
                        title={`${item.title}\n${item.reasonTag}`}
                      >
                        <span className="shrink-0 rounded bg-[#F7F7F5] px-1.5 py-0.2 text-[10px] font-medium text-[#191919]">
                          {item.categoryLabel}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-[#191919]">
                          {item.title}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] font-semibold text-[#0F7B6C]">
                          {item.relevanceScore}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}

            {session.blackboxTabs.length > 0 && (
              <section className="overflow-hidden rounded-lg border border-[#E9E9E7] bg-[#F7F7F5]">
                <button
                  type="button"
                  onClick={() => setBlackboxExpanded((prev) => !prev)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-[#EFEFED]"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-medium text-[#191919]">
                      🛡️ 防误杀黑匣子
                    </span>
                    <span className="rounded-full bg-[#191919] px-1.5 py-0.2 font-mono text-[10px] font-medium text-white tabular-nums">
                      {session.blackboxTabs.length}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#787774]">
                    <span>{blackboxExpanded ? '收起' : '查看快照'}</span>
                    {blackboxExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </span>
                </button>

                {blackboxExpanded && (
                  <div className="max-h-[176px] space-y-2 overflow-y-auto border-t border-[#E9E9E7] bg-white p-2.5">
                    {session.blackboxTabs.map((item) => {
                      const isRestoring = Boolean(restoringIds[item.id]);
                      return (
                        <div
                          key={item.id}
                          className="flex gap-2.5 rounded-md border border-[#E9E9E7] bg-[#F7F7F5] p-2"
                        >
                          <div className="h-12 w-16 shrink-0 overflow-hidden rounded border border-[#E9E9E7] bg-white">
                            {item.screenshotBase64 ? (
                              <img
                                src={item.screenshotBase64}
                                alt={item.title}
                                className="h-full w-full object-cover object-top"
                              />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[#787774]">
                                {item.favicon ? (
                                  <img
                                    src={item.favicon}
                                    alt=""
                                    className="h-4 w-4 rounded-sm"
                                  />
                                ) : (
                                  <Globe className="h-4 w-4" />
                                )}
                                <span className="text-[9px]">无快照</span>
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div
                              className="truncate text-[12px] font-medium text-[#191919]"
                              title={item.title}
                            >
                              {item.title || extractHostname(item.url)}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[#787774]">
                              <span className="truncate font-mono">
                                {extractHostname(item.url)}
                              </span>
                              <span className="shrink-0 rounded border border-[#E9E9E7] bg-white px-1 py-0.2 text-[#787774]">
                                {item.reasonTag}
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={isRestoring}
                              onClick={() => handleRestoreBlackboxTab(item)}
                              className="mt-1.5 inline-flex items-center gap-1 rounded border border-[#191919] bg-white px-2 py-0.5 text-[11px] font-medium text-[#191919] transition-colors hover:bg-[#191919] hover:text-white disabled:opacity-50"
                            >
                              {isRestoring ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              <span>恢复并标为资料</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>

          <footer className="space-y-2 border-t border-[#E9E9E7] pt-3">
            <button
              type="button"
              disabled={whitelistingState === 'saving'}
              onClick={handleWhitelistActiveTab}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#E9E9E7] bg-[#F7F7F5] px-3 py-2 text-[12px] font-medium text-[#191919] transition-colors hover:bg-[#EFEFED] disabled:opacity-60"
            >
              {whitelistingState === 'saving' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : whitelistingState === 'done' || isCurrentTabWhitelisted ? (
                <BookmarkCheck className="h-3.5 w-3.5 text-[#0F7B6C]" />
              ) : (
                <Pin className="h-3.5 w-3.5" />
              )}
              <span>
                {whitelistingState === 'done' || isCurrentTabWhitelisted
                  ? '当前网页已标记为本场资料'
                  : '标记当前网页为资料'}
              </span>
            </button>

            <button
              type="button"
              disabled={isStopping}
              onClick={handleStopFocus}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#191919] px-3 py-2.5 text-[12px] font-medium text-white transition-colors hover:bg-[#2F2F2F] disabled:opacity-60"
            >
              {isStopping ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5 fill-current" />
              )}
              <span>结束专注并生成结算小票</span>
            </button>
          </footer>
        </main>
      ) : (
        <main className="flex flex-1 flex-col justify-between gap-3 p-4">
          <div className="space-y-3">
            <section className="rounded-lg border border-[#E9E9E7] bg-[#F7F7F5] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label
                  htmlFor="denoise-task-input"
                  className="text-[12px] font-medium text-[#191919]"
                >
                  本次专注任务目标
                </label>
                <button
                  type="button"
                  disabled={isExtractingTask || isDamping}
                  onClick={handleExtractTask}
                  className="inline-flex items-center gap-1 rounded-md border border-[#E9E9E7] bg-white px-2 py-0.5 text-[11px] font-medium text-[#191919] transition-colors hover:bg-[#EFEFED] disabled:opacity-50"
                >
                  {isExtractingTask ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  <span>从当前网页提炼任务</span>
                </button>
              </div>

              <textarea
                ref={taskInputRef}
                id="denoise-task-input"
                rows={2}
                disabled={isDamping}
                value={taskIntent}
                onChange={(event) => {
                  setTaskIntent(event.target.value);
                  if (validationError) {
                    setValidationError('');
                  }
                }}
                placeholder="输入当前正在攻克的学习或科研目标..."
                className={`w-full resize-none rounded-md border bg-white px-2.5 py-2 text-[12.5px] leading-relaxed text-[#191919] placeholder:text-[#787774]/75 focus:outline-none ${
                  validationError
                    ? 'border-[#E03E3E] focus:border-[#E03E3E]'
                    : 'border-[#E9E9E7] focus:border-[#191919]'
                }`}
              />

              {validationError && (
                <p className="mt-1 text-[11px] text-[#E03E3E]">{validationError}</p>
              )}
              {extractFeedback && !validationError && (
                <p className="mt-1 text-[11px] text-[#0F7B6C]">{extractFeedback}</p>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_TASK_PRESETS.map((preset) => {
                  const isSelected = taskIntent.trim() === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={isDamping}
                      onClick={() => {
                        setTaskIntent(preset);
                        setValidationError('');
                        setExtractFeedback('');
                      }}
                      className={`max-w-full truncate rounded-full border px-2 py-0.5 text-[10.5px] transition-colors ${
                        isSelected
                          ? 'border-[#191919] bg-[#191919] text-white'
                          : 'border-[#E9E9E7] bg-white text-[#787774] hover:border-[#D3D3CF] hover:text-[#191919]'
                      }`}
                      title={preset}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#787774]">
                  <Clock className="h-3.5 w-3.5" />
                  <span>专注时长</span>
                </span>
                {isCustomDuration && (
                  <span className="font-mono text-[11px] text-[#787774]">
                    5–240 分钟
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-1.5 rounded-lg border border-[#E9E9E7] bg-[#F7F7F5] p-1">
                {PRESET_DURATIONS.map((minutes) => {
                  const selected = !isCustomDuration && durationMinutes === minutes;
                  return (
                    <button
                      key={minutes}
                      type="button"
                      disabled={isDamping}
                      onClick={() => {
                        setIsCustomDuration(false);
                        setDurationMinutes(minutes);
                      }}
                      className={`rounded-md py-1 font-mono text-[12px] font-medium transition-colors ${
                        selected
                          ? 'bg-white text-[#191919] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-[#E9E9E7]'
                          : 'text-[#787774] hover:text-[#191919]'
                      }`}
                    >
                      {minutes}m
                    </button>
                  );
                })}

                <button
                  type="button"
                  disabled={isDamping}
                  onClick={() => setIsCustomDuration(true)}
                  className={`rounded-md py-1 text-[12px] font-medium transition-colors ${
                    isCustomDuration
                      ? 'bg-white text-[#191919] shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-[#E9E9E7]'
                      : 'text-[#787774] hover:text-[#191919]'
                  }`}
                >
                  自定义
                </button>
              </div>

              {isCustomDuration && (
                <div className="mt-1.5 flex items-center gap-2 rounded-md border border-[#E9E9E7] bg-[#F7F7F5] px-2.5 py-1.5">
                  <span className="text-[11.5px] text-[#787774]">自定义时长</span>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    disabled={isDamping}
                    value={customDurationInput}
                    onChange={(event) => setCustomDurationInput(event.target.value)}
                    className="w-16 rounded border border-[#E9E9E7] bg-white px-2 py-0.5 text-center font-mono text-[12px] text-[#191919] focus:border-[#191919] focus:outline-none"
                  />
                  <span className="text-[11.5px] text-[#787774]">分钟</span>
                </div>
              )}
            </section>

            <section>
              <div className="mb-1.5 text-[11.5px] font-medium text-[#787774]">
                专注降噪强度
              </div>
              <div className="space-y-1.5">
                {INTENSITY_OPTIONS.map((option) => {
                  const selected = intensity === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={isDamping}
                      onClick={() => setIntensity(option.id)}
                      className={`flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                        selected
                          ? 'border-[#191919] bg-[#F7F7F5]'
                          : 'border-[#E9E9E7] bg-white hover:bg-[#F7F7F5]'
                      }`}
                    >
                      <span className="mt-0.5 text-[14px] leading-none" aria-hidden="true">
                        {option.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12.5px] font-medium text-[#191919]">
                            {option.title}
                          </span>
                          {option.badge && (
                            <span className="rounded bg-[#EFEFED] px-1.5 py-0.2 text-[10px] font-medium text-[#787774]">
                              {option.badge}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-snug text-[#787774]">
                          {option.description}
                        </p>
                      </div>
                      <span
                        className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          selected
                            ? 'border-[#191919] bg-[#191919] text-white'
                            : 'border-[#D3D3CF] bg-white'
                        }`}
                      >
                        {selected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {focusSummary && (
              <section className="rounded-lg border border-[#E9E9E7] bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-medium text-[#191919]">
                    专注记录
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] text-[#787774]">
                      连续 {focusSummary.streakDays} 天
                    </span>
                    <button
                      type="button"
                      onClick={openReviewPage}
                      className="inline-flex items-center gap-1 rounded border border-[#E9E9E7] bg-[#F7F7F5] px-1.5 py-0.5 text-[10px] font-medium text-[#191919] transition-colors hover:border-[#191919]"
                    >
                      <BarChart3 className="h-2.5 w-2.5 text-[#0F7B6C]" />
                      <span>热力图</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleGeneratePeriodReview}
                      disabled={isGeneratingReview}
                      className="inline-flex items-center gap-1 rounded border border-[#E9E9E7] bg-[#F7F7F5] px-1.5 py-0.5 text-[10px] font-medium text-[#191919] transition-colors hover:border-[#191919] disabled:opacity-60"
                    >
                      {isGeneratingReview ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-2.5 w-2.5 text-[#0F7B6C]" />
                      )}
                      <span>{isGeneratingReview ? '复盘中...' : 'AI 周期复盘'}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {[
                    { label: '今日', minutes: focusSummary.todayMinutes, sessions: focusSummary.todaySessions },
                    { label: '本周', minutes: focusSummary.weekMinutes, sessions: focusSummary.weekSessions },
                    { label: '本月', minutes: focusSummary.monthMinutes, sessions: focusSummary.monthSessions },
                    { label: '今年', minutes: focusSummary.yearMinutes, sessions: focusSummary.yearSessions }
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-md border border-[#E9E9E7] bg-[#F7F7F5] px-1.5 py-1.5"
                    >
                      <div className="text-[10px] text-[#787774]">{item.label}</div>
                      <div className="mt-0.5 font-mono text-[15px] font-semibold leading-none text-[#191919] tabular-nums">
                        {item.minutes}
                        <span className="ml-0.5 text-[9.5px] font-normal text-[#787774]">min</span>
                      </div>
                      <div className="mt-0.5 text-[9.5px] text-[#787774]">
                        {item.sessions} 次
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-[#787774]">
                      本周打卡 {focusSummary.weekMinutes}/{focusSummary.weeklyTargetMinutes} min
                    </span>
                    <span className="font-mono text-[#0F7B6C]">
                      {focusSummary.weeklyProgressPercent}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#EFEFED]">
                    <div
                      className="h-full rounded-full bg-[#0F7B6C] transition-[width] duration-500"
                      style={{ width: `${focusSummary.weeklyProgressPercent}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-[#787774]">
                    {focusSummary.weeklyProgressPercent >= 100
                      ? '本周目标已达成，Pro 权益已解锁'
                      : `再专注 ${Math.max(
                          0,
                          focusSummary.weeklyTargetMinutes - focusSummary.weekMinutes
                        )} 分钟解锁 7 天 Pro`}
                  </p>
                </div>

                {periodReview && (
                  <div className="mt-2.5 rounded-md border border-[#E9E9E7] bg-[#F7F7F5] p-2 text-[10.5px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#191919]">
                        {periodReview.headline}
                      </span>
                      <span className="shrink-0 font-mono text-[9.5px] text-[#0F7B6C]">
                        {periodReview.peakWindow}
                      </span>
                    </div>
                    <p className="mt-1 leading-relaxed text-[#787774]">
                      {periodReview.mainDistraction}
                    </p>
                    <p className="mt-1 font-medium text-[#191919]">
                      建议：{periodReview.suggestion}
                    </p>
                  </div>
                )}
              </section>
            )}
          </div>

          <footer className="space-y-2.5 border-t border-[#E9E9E7] pt-3">
            <AncWaveform
              mode={idleWaveformMode}
              onDampingComplete={handleDampingComplete}
            />

            <button
              type="button"
              role="switch"
              aria-checked={isDamping}
              disabled={isDamping}
              onClick={handleStartFocus}
              className="group flex w-full items-center justify-between rounded-lg bg-[#191919] px-3.5 py-2.5 text-white transition-colors hover:bg-[#2E2E2E] disabled:cursor-wait disabled:bg-[#191919]"
            >
              <div className="flex flex-col text-left">
                <span className="text-[13px] font-medium tracking-tight">
                  {isDamping ? '正在锁定 ANC 主动降噪...' : '开启 ANC 主动降噪'}
                </span>
                <span className="text-[10.5px] text-white/65">
                  {isDamping
                    ? '平滑过滤算法噪音并接管无关标签页'
                    : `${resolvedDurationMinutes} 分钟 · ${activeIntensityMeta.title}`}
                </span>
              </div>

              <span
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition-colors duration-300 ${
                  isDamping
                    ? 'border-[#0F7B6C] bg-[#0F7B6C]'
                    : 'border-white/25 bg-white/15 group-hover:bg-white/25'
                }`}
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 ${
                    isDamping ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>

            {!hasConfiguredProvider && (
              <div className="flex items-center justify-between rounded-md border border-[#E9E9E7] bg-[#F7F7F5] px-2.5 py-1.5 text-[11px] text-[#787774]">
                <span>尚未填入 AI API Key，将使用本地启发式降级</span>
                <button
                  type="button"
                  onClick={openSettingsPage}
                  className="shrink-0 font-medium text-[#191919] underline underline-offset-2 hover:text-[#0F7B6C]"
                >
                  去配置
                </button>
              </div>
            )}
          </footer>
        </main>
      )}
    </div>
  );
};
