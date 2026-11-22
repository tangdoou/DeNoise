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
  const nowDate = new Date(nowMs);
  const startOfToday = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate()
  ).getTime();
  const todayStart = Math.max(startOfToday + 20 * 60 * 1000, nowMs - 2.5 * HOUR);

  const recent: FocusHistoryRecord[] = [
    {
      id: 'seed-today-1',
      taskIntent: '学习 DeepSeek Harness 与 SuperAgent 架构实操',
      intensity: 'standard',
      startTime: todayStart,
      endTime: todayStart + 35 * 60 * 1000,
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
      startTime: startOfToday - 1 * DAY + 15 * HOUR,
      endTime: startOfToday - 1 * DAY + 15 * HOUR + 50 * 60 * 1000,
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
      startTime: startOfToday - 2 * DAY + 14 * HOUR,
      endTime: startOfToday - 2 * DAY + 15 * HOUR,
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
      startTime: startOfToday - 3 * DAY + 19 * HOUR,
      endTime: startOfToday - 3 * DAY + 19 * HOUR + 45 * 60 * 1000,
      durationMinutes: 45,
      snrPercent: 95.9,
      grade: 'S',
      blurredCount: 22,
      parkedCount: 2,
      driftCount: 0,
      aiBadge: '🛡️ 极客调优 · 纯净专注',
      aiSummary: '围绕报错检索 StackOverflow 与官方文档，未触发任何娱乐站点停留。'
    }
  ];

  const historicalArchive: Array<
    [number, number, number, FocusHistoryRecord['intensity'], number, number, number, number, string]
  > = [
    [7, 15, 65, 'standard', 96.8, 33, 3, 1, '梳理 Zleap Zev-1 System-1 接口字段与概率映射'],
    [8, 16, 70, 'strict', 97.4, 38, 3, 0, '实现浏览器插件 Shadow DOM 隔离与降噪卡片'],
    [8, 20, 45, 'standard', 96.2, 21, 2, 1, '调试 MutationObserver 增量降噪防抖阈值'],
    [9, 14, 110, 'standard', 96.4, 58, 5, 1, '复习高等数学与线性代数特征值推导'],
    [10, 20, 40, 'gentle', 94.8, 19, 1, 1, '整理深北莫黑客松项目路演原型与竞品调研'],
    [12, 15, 90, 'strict', 97.8, 47, 4, 0, '完成操作系统实验：模拟进程调度与页表置换'],
    [14, 10, 95, 'strict', 97.1, 52, 4, 1, '撰写计算机网络实验报告与 Wireshark 抓包分析'],
    [14, 19, 55, 'standard', 96.5, 26, 2, 0, '阅读 DeepSeek 多模态推理技术报告并整理笔记'],
    [17, 14, 80, 'standard', 96.7, 44, 3, 0, '刷 LeetCode 二叉树与回溯算法高频题'],
    [19, 21, 50, 'gentle', 95.3, 27, 2, 1, '重构 TypeScript 状态机与 MV3 Service Worker 通信'],
    [21, 16, 105, 'strict', 98.1, 56, 4, 0, '推导概率论大数定律与贝叶斯估计习题'],
    [24, 15, 70, 'standard', 96.0, 35, 3, 1, '学习 React 渲染优化与 Tailwind 响应式排版'],
    [27, 10, 95, 'strict', 97.5, 51, 4, 1, '精读 Transformer Self-Attention 源码与注释'],
    [30, 19, 50, 'standard', 95.8, 24, 2, 0, '调试 Chrome Tab Groups API 自动分组逻辑'],
    [33, 14, 85, 'standard', 96.9, 43, 3, 1, '完成数据库 B+ 树索引与事务隔离级别实验'],
    [36, 16, 115, 'strict', 98.2, 64, 5, 0, '刷算法周赛补题：单调栈与并查集专练'],
    [40, 20, 60, 'gentle', 94.9, 21, 1, 1, '阅读 Chrome Extension MV3 安全沙箱规范'],
    [43, 15, 90, 'standard', 96.6, 48, 4, 1, '撰写机器学习课程实验：SVM 与随机森林对比'],
    [47, 14, 75, 'standard', 96.3, 37, 3, 0, '排查异步并发限流与 429 指数退避重试逻辑'],
    [51, 19, 100, 'strict', 97.9, 55, 4, 1, '复习离散数学图论最短路径与最小生成树'],
    [55, 16, 50, 'standard', 95.7, 26, 2, 1, '构建自动化评测基准脚本对比模型首字延迟'],
    [61, 14, 80, 'standard', 96.5, 40, 3, 0, '阅读经典论文 Attention Is All You Need 原文'],
    [67, 15, 65, 'gentle', 95.1, 29, 2, 1, '实现 Canvas 2x Retina 结算小票绘制与导出'],
    [74, 19, 95, 'strict', 97.4, 49, 4, 1, '整理秋季学期专业课参考书单与知识图谱'],
    [82, 14, 70, 'standard', 96.2, 33, 2, 0, 'C++ 智能指针与移动语义底层原理梳理'],
    [95, 16, 85, 'standard', 96.8, 42, 3, 1, '复习计算机组成原理指令流水线与冒险处理'],
    [110, 15, 60, 'gentle', 95.4, 25, 2, 1, '暑期算法训练营：动态规划状态压缩专题'],
    [128, 14, 90, 'strict', 97.3, 46, 3, 0, 'Linux Socket 网络编程与 Epoll 事件模型练习'],
    [146, 19, 55, 'standard', 95.9, 23, 2, 1, 'Python 异步协程 asyncio 与爬虫工程实践'],
    [168, 15, 75, 'standard', 96.4, 36, 3, 0, '面向对象设计模式重构与单元测试编写'],
    [189, 14, 80, 'strict', 97.0, 41, 3, 1, '数据结构期末总复习：红黑树与哈希冲突解决'],
    [206, 16, 65, 'standard', 96.1, 30, 2, 0, '高等数学级数敛散性与傅里叶变换推导'],
    [224, 15, 75, 'standard', 96.3, 35, 3, 1, '数字逻辑与 Verilog 时序仿真实验'],
    [243, 19, 90, 'strict', 97.2, 44, 3, 0, '阅读 CUDA 并行归约与共享内存优化文档'],
    [260, 14, 55, 'gentle', 95.2, 22, 2, 1, '线性代数矩阵奇异值分解 SVD 应用梳理'],
    [281, 16, 85, 'standard', 96.7, 39, 3, 1, '计算机体系结构缓存一致性协议练习'],
    [298, 20, 65, 'standard', 96.0, 29, 2, 0, 'Linux Shell 与自动化构建脚本实战'],
    [318, 15, 95, 'strict', 97.6, 48, 4, 1, 'C++ 模板元编程与 STL 源码剖析'],
    [336, 14, 70, 'standard', 96.4, 34, 2, 0, '微积分多元函数微分与梯度推导'],
    [352, 19, 60, 'gentle', 95.5, 25, 2, 1, '构建第一版终端思维工具与技术方案草稿']
  ];

  const archived: FocusHistoryRecord[] = historicalArchive.map(
    (
      [daysAgo, hour, durationMinutes, intensity, snrPercent, blurredCount, parkedCount, driftCount, taskIntent],
      idx
    ) => {
      const startTime = startOfToday - daysAgo * DAY + hour * HOUR;
      return {
        id: `seed-archive-${idx + 1}`,
        taskIntent,
        intensity,
        startTime,
        endTime: startTime + durationMinutes * 60 * 1000,
        durationMinutes,
        snrPercent,
        grade: snrPercent >= 95 && driftCount <= 1 ? 'S' : snrPercent >= 93 ? 'A+' : 'A',
        blurredCount,
        parkedCount,
        driftCount
      };
    }
  );

  return [...recent, ...archived];
}

export async function getFocusHistoryRecords(): Promise<FocusHistoryRecord[]> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(STORAGE_KEYS.FOCUS_HISTORY);
      const stored = res[STORAGE_KEYS.FOCUS_HISTORY];
      if (Array.isArray(stored) && stored.length > 0) {
        const typed = stored as FocusHistoryRecord[];
        const needsSeedUpgrade =
          typed.some((item) => item.id === 'seed-year-1') ||
          (typed.some((item) => item.id.startsWith('seed-')) &&
            !typed.some((item) => item.id === 'seed-archive-40'));
        if (needsSeedUpgrade) {
          const realRecords = typed.filter((item) => !item.id.startsWith('seed-'));
          const upgraded = [...realRecords, ...buildSeededHistoryRecords()];
          await chrome.storage.local.set({ [STORAGE_KEYS.FOCUS_HISTORY]: upgraded });
          return upgraded;
        }
        return typed;
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

  const formatDayKey = (date: Date) =>
    `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  let consecutiveStreak = 0;
  const startOffset = activeDayKeys.has(formatDayKey(now)) ? 0 : 1;
  for (let offset = startOffset; offset < 365; offset += 1) {
    const cursor = new Date(startOfToday - offset * 24 * 60 * 60 * 1000);
    if (activeDayKeys.has(formatDayKey(cursor))) {
      consecutiveStreak += 1;
    } else {
      break;
    }
  }
  const streakDays = records.length > 0 ? Math.max(1, consecutiveStreak) : 0;

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
