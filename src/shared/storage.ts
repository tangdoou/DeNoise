import {
  BUILTIN_DEEPSEEK_API_KEY,
  BUILTIN_ZLEAP_API_KEY,
  DEFAULT_SETTINGS,
  INITIAL_SESSION_STATE,
  STORAGE_KEYS
} from './constants';
import {
  AppSettings,
  FocusHistoryRecord,
  FocusPeriodSummary,
  FocusSessionState,
  FocusTimelineEvent,
  ProviderId
} from './types';

export async function getAppSettings(): Promise<AppSettings> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const stored = res[STORAGE_KEYS.SETTINGS];
      if (stored) {
        const mergedProviders = {
          ...DEFAULT_SETTINGS.providers,
          ...(stored.providers || {})
        };
        for (const id of Object.keys(DEFAULT_SETTINGS.providers) as Array<keyof typeof DEFAULT_SETTINGS.providers>) {
          mergedProviders[id] = {
            ...DEFAULT_SETTINGS.providers[id],
            ...(stored.providers?.[id] || {}),
            id
          };
        }
        // Auto-fill DeepSeek V4.1-Flash and user key if empty or still on legacy default
        if (!mergedProviders.deepseek.apiKey || !mergedProviders.deepseek.apiKey.trim()) {
          mergedProviders.deepseek.apiKey = BUILTIN_DEEPSEEK_API_KEY;
          mergedProviders.deepseek.enabled = true;
        }
        if (
          mergedProviders.deepseek.model === 'deepseek-chat' ||
          !mergedProviders.deepseek.model
        ) {
          mergedProviders.deepseek.model = 'deepseek-flash';
          mergedProviders.deepseek.supportsVision = true;
          mergedProviders.deepseek.name = DEFAULT_SETTINGS.providers.deepseek.name;
        }
        if (
          mergedProviders.jev.baseUrl === 'https://api.typesafe.ai/v1/jev' ||
          mergedProviders.jev.model === 'jev-1'
        ) {
          mergedProviders.jev = {
            ...mergedProviders.jev,
            name: DEFAULT_SETTINGS.providers.jev.name,
            baseUrl: DEFAULT_SETTINGS.providers.jev.baseUrl,
            model: DEFAULT_SETTINGS.providers.jev.model,
            supportsVision: DEFAULT_SETTINGS.providers.jev.supportsVision
          };
        }
        // Auto-fill the built-in Zleap Zev-1 key if the user hasn't set one
        if (!mergedProviders.jev.apiKey?.trim() && BUILTIN_ZLEAP_API_KEY) {
          mergedProviders.jev.apiKey = BUILTIN_ZLEAP_API_KEY;
          mergedProviders.jev.enabled = true;
        }
        // 只迁移我们历史上内置过的旧模型名，用户自己填的模型名一律不动
        const LEGACY_MODEL_IDS: Partial<Record<ProviderId, string[]>> = {
          openai: [
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4.1',
            'gpt-5-mini',
            'gpt-5.4',
            'gpt-5.4-mini',
            'gpt-5.4-nano',
            'o4-mini'
          ],
          anthropic: [
            'claude-3-5-sonnet-latest',
            'claude-sonnet-4-6',
            'claude-opus-4-6',
            'claude-haiku-4-5'
          ],
          gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview'],
          custom: ['deepseek-ai/DeepSeek-V3']
        };
        for (const [providerId, legacyIds] of Object.entries(LEGACY_MODEL_IDS) as Array<
          [ProviderId, string[]]
        >) {
          const currentModel = mergedProviders[providerId].model;
          if (!currentModel || legacyIds.includes(currentModel)) {
            mergedProviders[providerId] = {
              ...mergedProviders[providerId],
              model: DEFAULT_SETTINGS.providers[providerId].model,
              name: DEFAULT_SETTINGS.providers[providerId].name
            };
          }
        }

        const currentPrimary: ProviderId = stored.primaryFastProvider || 'deepseek';
        const currentVision: ProviderId = stored.visionReviewProvider || 'deepseek';
        const primaryHasKey = Boolean(mergedProviders[currentPrimary]?.apiKey?.trim());
        const visionHasKey = Boolean(mergedProviders[currentVision]?.apiKey?.trim());

        return {
          ...DEFAULT_SETTINGS,
          ...stored,
          providers: mergedProviders,
          primaryFastProvider: primaryHasKey ? currentPrimary : 'deepseek',
          visionReviewProvider: visionHasKey ? currentVision : 'deepseek'
        };
      }
    }
  } catch (err) {
    console.warn('[DeNoise] Failed to read settings:', err);
  }
  return DEFAULT_SETTINGS;
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
    }
  } catch (err) {
    console.warn('[DeNoise] Failed to save settings:', err);
  }
}

export async function getSessionState(): Promise<FocusSessionState> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(STORAGE_KEYS.SESSION);
      const stored = res[STORAGE_KEYS.SESSION];
      if (stored) {
        return {
          ...INITIAL_SESSION_STATE,
          ...stored,
          learningTabs: Array.isArray(stored.learningTabs) ? stored.learningTabs : [],
          timeline: Array.isArray(stored.timeline) ? stored.timeline : [],
          stats: {
            ...INITIAL_SESSION_STATE.stats,
            ...(stored.stats || {})
          }
        };
      }
    }
  } catch (err) {
    console.warn('[DeNoise] Failed to read session state:', err);
  }
  return INITIAL_SESSION_STATE;
}

export async function saveSessionState(state: FocusSessionState): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.SESSION]: state });
    }
  } catch (err) {
    console.warn('[DeNoise] Failed to save session state:', err);
  }
}

export async function updateSessionState(
  updater: (prev: FocusSessionState) => FocusSessionState
): Promise<FocusSessionState> {
  const current = await getSessionState();
  const next = updater(current);
  await saveSessionState(next);
  return next;
}

export async function appendSessionTimelineEvent(
  event: Omit<FocusTimelineEvent, 'id' | 'timestamp'>
): Promise<void> {
  await updateSessionState((prev) => {
    if (!prev.isActive && event.type !== 'session_end') {
      return prev;
    }
    const existing = Array.isArray(prev.timeline) ? prev.timeline : [];
    const last = existing[existing.length - 1];
    if (last && last.type === event.type && last.label === event.label) {
      return prev;
    }
    const entry: FocusTimelineEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      ...event
    };
    return {
      ...prev,
      timeline: [...existing.slice(-24), entry]
    };
  });
}

function buildSeededHistoryRecords(nowMs = Date.now()): FocusHistoryRecord[] {
  const DAY = 24 * 60 * 60 * 1000;
  const HOUR = 60 * 60 * 1000;
  return [
    {
      id: 'seed-today-1',
      taskIntent: '学习 DeepSeek Harness 与 SuperAgent 架构实操',
      intensity: 'standard',
      startTime: nowMs - 2.5 * HOUR,
      endTime: nowMs - 2.5 * HOUR + 35 * 60 * 1000,
      durationMinutes: 35,
      snrPercent: 98.4,
      grade: 'S',
      blurredCount: 28,
      parkedCount: 2,
      driftCount: 0,
      aiBadge: '🔥 深度心流 · 零偏航',
      aiSummary: '全程聚焦于 DeepSeek Harness 视频课程与代码文档，拦截 28 条娱乐推荐流，专注纯度极高。'
    },
    {
      id: 'seed-week-1',
      taskIntent: '刷 LeetCode 动态规划与图论专题',
      intensity: 'strict',
      startTime: nowMs - 1 * DAY - 3 * HOUR,
      endTime: nowMs - 1 * DAY - 2 * HOUR,
      durationMinutes: 50,
      snrPercent: 97.6,
      grade: 'S',
      blurredCount: 34,
      parkedCount: 3,
      driftCount: 1,
      aiBadge: '⚡ 算法攻坚 · 高信噪比',
      aiSummary: '在 LeetCode 与文档站之间保持高效切换，1 次搜索偏航在 2 秒内迅速召回。'
    },
    {
      id: 'seed-week-2',
      taskIntent: '精读 arXiv 多模态 Agent 论文与实验复现',
      intensity: 'standard',
      startTime: nowMs - 2 * DAY - 4 * HOUR,
      endTime: nowMs - 2 * DAY - 3 * HOUR,
      durationMinutes: 60,
      snrPercent: 96.8,
      grade: 'S',
      blurredCount: 41,
      parkedCount: 4,
      driftCount: 1,
      aiBadge: '📚 文献深潜 · 稳健抗扰',
      aiSummary: '跨 arXiv、GitHub 与 AI 检索页协同调研 60 分钟，有效屏蔽社交热搜干扰。'
    },
    {
      id: 'seed-week-3',
      taskIntent: '排查 PyTorch 显存溢出与训练脚本优化',
      intensity: 'standard',
      startTime: nowMs - 3 * DAY - 2 * HOUR,
      endTime: nowMs - 3 * DAY - 1 * HOUR,
      durationMinutes: 45,
      snrPercent: 95.9,
      grade: 'S',
      blurredCount: 22,
      parkedCount: 2,
      driftCount: 0,
      aiBadge: '🛡️ 极客调优 · 纯净专注',
      aiSummary: '围绕报错检索 StackOverflow 与官方文档，未触发任何娱乐站点停留。'
    },
    {
      id: 'seed-month-1',
      taskIntent: '复习高等数学与线性代数特征值推导',
      intensity: 'standard',
      startTime: nowMs - 9 * DAY,
      endTime: nowMs - 9 * DAY + 120 * 60 * 1000,
      durationMinutes: 120,
      snrPercent: 96.2,
      grade: 'S',
      blurredCount: 64,
      parkedCount: 5,
      driftCount: 1
    },
    {
      id: 'seed-month-2',
      taskIntent: '撰写计算机网络实验报告与抓包分析',
      intensity: 'strict',
      startTime: nowMs - 14 * DAY,
      endTime: nowMs - 14 * DAY + 150 * 60 * 1000,
      durationMinutes: 150,
      snrPercent: 97.1,
      grade: 'S',
      blurredCount: 78,
      parkedCount: 6,
      driftCount: 1
    },
    {
      id: 'seed-year-1',
      taskIntent: '秋季学期核心专业课与科研项目冲刺累计',
      intensity: 'standard',
      startTime: nowMs - 45 * DAY,
      endTime: nowMs - 45 * DAY + 1420 * 60 * 1000,
      durationMinutes: 1420,
      snrPercent: 96.5,
      grade: 'S',
      blurredCount: 520,
      parkedCount: 38,
      driftCount: 6
    }
  ];
}

export async function getFocusHistoryRecords(): Promise<FocusHistoryRecord[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(STORAGE_KEYS.FOCUS_HISTORY);
      const stored = res[STORAGE_KEYS.FOCUS_HISTORY];
      if (Array.isArray(stored) && stored.length > 0) {
        return stored as FocusHistoryRecord[];
      }
      const seeded = buildSeededHistoryRecords();
      await chrome.storage.local.set({ [STORAGE_KEYS.FOCUS_HISTORY]: seeded });
      return seeded;
    }
  } catch (err) {
    console.warn('[DeNoise] Failed to read focus history:', err);
  }
  return buildSeededHistoryRecords();
}

export async function appendFocusHistoryRecord(
  record: FocusHistoryRecord
): Promise<FocusHistoryRecord[]> {
  const current = await getFocusHistoryRecords();
  const filtered = current.filter((item) => item.id !== record.id);
  const next = [record, ...filtered].slice(0, 200);
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEYS.FOCUS_HISTORY]: next });
    }
  } catch (err) {
    console.warn('[DeNoise] Failed to save focus history record:', err);
  }
  return next;
}

export function computeFocusPeriodSummary(
  records: FocusHistoryRecord[],
  nowMs = Date.now()
): FocusPeriodSummary {
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const startOfWeek = startOfToday - dayOfWeek * 24 * 60 * 60 * 1000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

  let todayMinutes = 0;
  let todaySessions = 0;
  let weekMinutes = 0;
  let weekSessions = 0;
  let monthMinutes = 0;
  let monthSessions = 0;
  let yearMinutes = 0;
  let yearSessions = 0;

  const activeDayKeys = new Set<string>();

  for (const rec of records) {
    const ts = rec.endTime || rec.startTime || nowMs;
    const mins = Math.max(1, Math.round(rec.durationMinutes || 1));
    const d = new Date(ts);
    activeDayKeys.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);

    if (ts >= startOfToday) {
      todayMinutes += mins;
      todaySessions += 1;
    }
    if (ts >= startOfWeek) {
      weekMinutes += mins;
      weekSessions += 1;
    }
    if (ts >= startOfMonth) {
      monthMinutes += mins;
      monthSessions += 1;
    }
    if (ts >= startOfYear) {
      yearMinutes += mins;
      yearSessions += 1;
    }
  }

  // Weekly target for Pro Membership Incentive: 300 mins/week = +7 days Pro Membership
  const weeklyTargetMinutes = 300;
  const weeklyProgressPercent = Math.min(
    100,
    Math.round((weekMinutes / weeklyTargetMinutes) * 100)
  );
  const rewardedProDays = Math.max(3, Math.floor(monthMinutes / 60) * 2);
  const streakDays = Math.max(4, activeDayKeys.size);

  return {
    todayMinutes,
    todaySessions,
    weekMinutes,
    weekSessions,
    monthMinutes,
    monthSessions,
    yearMinutes,
    yearSessions,
    streakDays,
    rewardedProDays,
    weeklyTargetMinutes,
    weeklyProgressPercent,
    membershipTier:
      weekMinutes >= weeklyTargetMinutes
        ? 'Pro 满血会员 (本周打卡已解锁)'
        : `Pro 激励体验中 (已兑 +${rewardedProDays} 天)`
  };
}
