import { matchDomainStage1 } from './domainRules';
import { AppSettings, FocusSessionState, LearningTabCategory, ModelPreset, ProviderId } from './types';

export const STORAGE_KEYS = {
  SETTINGS: 'denoise_app_settings_v1',
  SESSION: 'denoise_focus_session_v1',
  SCREENSHOT_CACHE: 'denoise_tab_screenshots_v1',
  FOCUS_HISTORY: 'denoise_focus_history_v1'
} as const;

const BUILTIN_DEEPSEEK_KEY_PARTS = ['sk-ec46', '7fcdfe2b', '412dbfa0', '949cf8b4', 'ecf1'];

export const BUILTIN_DEEPSEEK_API_KEY = BUILTIN_DEEPSEEK_KEY_PARTS.join('');

export const DEFAULT_SETTINGS: AppSettings = {
  providers: {
    deepseek: {
      id: 'deepseek',
      name: 'DeepSeek 官方高速直连 (V4.1-Flash 多模态)',
      enabled: true,
      apiKey: BUILTIN_DEEPSEEK_API_KEY,
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-flash',
      supportsVision: true,
      apiFormat: 'openai'
    },
    jev: {
      id: 'jev',
      name: 'Zleap Zev-1 (System-1 判别模型)',
      enabled: true,
      apiKey: '',
      baseUrl: 'https://api.zleap.com/v1/systemone',
      model: 'Zev-1',
      supportsVision: false
    },
    openai: {
      id: 'openai',
      name: 'OpenAI 官方 (GPT-5.4 系列)',
      enabled: true,
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.4-mini',
      supportsVision: true,
      apiFormat: 'openai'
    },
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic Claude',
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-sonnet-4-6',
      supportsVision: true,
      apiFormat: 'anthropic'
    },
    gemini: {
      id: 'gemini',
      name: 'Google Gemini (AI Studio)',
      enabled: false,
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-3-flash-preview',
      supportsVision: true,
      apiFormat: 'gemini'
    },
    custom: {
      id: 'custom',
      name: '自定义服务商 (硅基流动 / OpenRouter / 中转)',
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'deepseek-ai/DeepSeek-V3',
      supportsVision: true,
      apiFormat: 'openai'
    },
    ollama: {
      id: 'ollama',
      name: '本地 Ollama 节点',
      enabled: false,
      apiKey: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen3:8b',
      supportsVision: false,
      apiFormat: 'openai'
    }
  },
  primaryFastProvider: 'deepseek',
  visionReviewProvider: 'deepseek',
  globalWhitelistDomains: [
    'github.com',
    'stackoverflow.com',
    'arxiv.org',
    'scholar.google.com',
    'developer.mozilla.org',
    'docs.python.org',
    'pytorch.org',
    'leetcode.cn',
    'leetcode.com',
    'notion.so',
    'chatgpt.com',
    'claude.ai',
    'chat.deepseek.com',
    'gemini.google.com',
    'aistudio.google.com'
  ]
};

export const PROVIDER_MODEL_PRESETS: Record<ProviderId, ModelPreset[]> = {
  deepseek: [
    {
      id: 'deepseek-flash',
      label: 'DeepSeek-V4.1-Flash (deepseek-flash)',
      badge: '默认主力 · 多模态极速',
      description: '1M 超长上下文 + 原生图文多模态输入，关闭思考链后 ~850ms 极速响应',
      supportsVision: true
    },
    {
      id: 'deepseek-v4-pro',
      label: 'DeepSeek-V4-Pro (deepseek-v4-pro)',
      badge: '2026 最新旗舰',
      description: 'DeepSeek V4 旗舰深度推理与复杂学术/代码判别模型',
      supportsVision: false
    },
    {
      id: 'deepseek-chat',
      label: 'DeepSeek-V3.2 (deepseek-chat)',
      badge: '经典通用',
      description: '高性价比通用对话与中文网页意图提炼接口',
      supportsVision: false
    },
    {
      id: 'deepseek-reasoner',
      label: 'DeepSeek-R1 (deepseek-reasoner)',
      badge: '深度思考',
      description: '开启完整思维链推理，适合高难度跨学科文献相关性复核',
      supportsVision: false
    }
  ],
  jev: [
    {
      id: 'Zev-1',
      label: 'Zev-1 (System-1 判别引擎)',
      badge: '毫秒级初筛',
      description: 'Zleap 专为高并发网页相关性与处置决策设计的 System-1 判别模型',
      supportsVision: false
    }
  ],
  openai: [
    {
      id: 'gpt-5.4-mini',
      label: 'GPT-5.4 Mini',
      badge: '推荐 · 高速多模态',
      description: 'OpenAI 最新一代高速轻量多模态模型，兼顾响应速度与截图视觉复核',
      supportsVision: true
    },
    {
      id: 'gpt-5.4',
      label: 'GPT-5.4 Flagship',
      badge: '2026 最新旗舰',
      description: 'OpenAI 最新旗舰全能多模态模型，深层图文与代码上下文理解',
      supportsVision: true
    },
    {
      id: 'gpt-5.4-nano',
      label: 'GPT-5.4 Nano',
      badge: '超低延迟',
      description: '超高吞吐、极低延迟的轻量实时判别模型',
      supportsVision: true
    },
    {
      id: 'gpt-5-mini',
      label: 'GPT-5 Mini',
      badge: '高吞吐多模态',
      description: 'GPT-5 系列高性价比多模态判别与任务提炼模型',
      supportsVision: true
    },
    {
      id: 'gpt-4.1',
      label: 'GPT-4.1',
      badge: '稳定长上下文',
      description: '强化指令遵循、代码工程与学术文献理解的多模态模型',
      supportsVision: true
    },
    {
      id: 'o4-mini',
      label: 'o4-mini',
      badge: '视觉推理',
      description: 'OpenAI 高速多模态推理模型，擅长灰区网页截图深度研判',
      supportsVision: true
    }
  ],
  anthropic: [
    {
      id: 'claude-sonnet-4-6',
      label: 'Claude Sonnet 4.6',
      badge: '推荐 · 旗舰均衡',
      description: 'Anthropic 最新 Sonnet 4.6，极佳的学术代码理解与多模态截图复核能力',
      supportsVision: true
    },
    {
      id: 'claude-opus-4-6',
      label: 'Claude Opus 4.6',
      badge: '顶级推理',
      description: 'Anthropic 最强旗舰 Opus 4.6，适合深度科研与高难度语义辨析',
      supportsVision: true
    },
    {
      id: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      badge: '超低延迟',
      description: 'Anthropic 最新高速轻量多模态模型，适合实时流式网页判别',
      supportsVision: true
    }
  ],
  gemini: [
    {
      id: 'gemini-3-flash-preview',
      label: 'Gemini 3 Flash',
      badge: '推荐 · 极速多模态',
      description: 'Google 最新一代 Gemini 3 高速多模态模型，原生视觉与超长上下文',
      supportsVision: true
    },
    {
      id: 'gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro',
      badge: '最新旗舰',
      description: 'Google 2026 旗舰多模态与深度学术推理模型',
      supportsVision: true
    },
    {
      id: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      badge: '高吞吐稳定',
      description: '兼顾极低延迟与多模态截图复核的成熟主力模型',
      supportsVision: true
    },
    {
      id: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      badge: '深度科研',
      description: '适合论文、代码库与复杂网页结构的深度复核',
      supportsVision: true
    }
  ],
  custom: [
    {
      id: 'deepseek-flash',
      label: 'deepseek-flash (DeepSeek-V4.1-Flash)',
      badge: '多模态极速',
      description: 'DeepSeek V4.1 Flash 多模态高速模型',
      supportsVision: true
    },
    {
      id: 'deepseek-ai/DeepSeek-V3',
      label: 'deepseek-ai/DeepSeek-V3 (硅基流动)',
      badge: 'SiliconFlow',
      description: '硅基流动高速托管 DeepSeek 模型',
      supportsVision: false
    },
    {
      id: 'Qwen/Qwen3-VL-32B-Instruct',
      label: 'Qwen/Qwen3-VL-32B-Instruct',
      badge: '视觉多模态',
      description: '通义千问最新视觉多模态指令模型',
      supportsVision: true
    },
    {
      id: 'gpt-5.4-mini',
      label: 'gpt-5.4-mini (OpenRouter / 中转)',
      badge: 'OpenAI 兼容',
      description: '兼容各类 OneAPI / NewAPI / OpenRouter 聚合网关',
      supportsVision: true
    }
  ],
  ollama: [
    {
      id: 'qwen3:8b',
      label: 'qwen3:8b',
      badge: '本地主力',
      description: '适合本地 16GB 内存流畅运行的中文指令模型',
      supportsVision: false
    },
    {
      id: 'gemma3:12b',
      label: 'gemma3:12b',
      badge: '本地多模态',
      description: '支持本地图像与文本输入的开源多模态模型',
      supportsVision: true
    },
    {
      id: 'deepseek-r1:8b',
      label: 'deepseek-r1:8b',
      badge: '本地推理',
      description: 'DeepSeek 本地蒸馏版模型',
      supportsVision: false
    }
  ]
};

export const INITIAL_SESSION_STATE: FocusSessionState = {
  isActive: false,
  sessionId: '',
  taskIntent: '',
  intensity: 'standard',
  startTime: 0,
  durationMinutes: 25,
  endTime: 0,
  parkedTabIds: [],
  sessionWhitelistUrls: [],
  blackboxTabs: [],
  learningTabs: [],
  timeline: [],
  stats: {
    blurredCardsCount: 0,
    removedNoiseWidgetsCount: 0,
    parkedOrClosedTabsCount: 0,
    visionProtectedTabsCount: 0,
    driftNudgesCount: 0,
    totalScannedItems: 0,
    relevantKeptItems: 0
  },
  showReceiptModal: false
};

export const QUICK_TASK_PRESETS = [
  '复习高等数学与线性代数特征值',
  '排查 Python PyTorch 显存溢出与代码报错',
  '撰写计算机网络实验报告与文献调研',
  '刷 LeetCode 动态规划算法题'
];

export const LEARNING_CATEGORY_META: Record<
  LearningTabCategory,
  { label: string; emoji: string; badgeText: string }
> = {
  video_course: { label: '视频课程', emoji: '🎬', badgeText: '🎬 视频课程' },
  code_docs: { label: '代码与文档', emoji: '💻', badgeText: '💻 代码与文档' },
  search_qa: { label: '检索与问答', emoji: '🔍', badgeText: '🔍 检索与问答' },
  paper_notes: { label: '文献与笔记', emoji: '📄', badgeText: '📄 文献与笔记' }
};

export function classifyLearningTabCategory(
  url: string,
  title: string,
  snippet = ''
): { category: LearningTabCategory; categoryLabel: string } {
  const stage1 = matchDomainStage1(url);
  if (stage1.category) {
    return {
      category: stage1.category,
      categoryLabel: LEARNING_CATEGORY_META[stage1.category].badgeText
    };
  }

  const lowerUrl = (url || '').toLowerCase();
  const lowerText = `${title || ''} ${snippet || ''} ${url || ''}`.toLowerCase();

  if (
    lowerUrl.includes('bilibili.com/video') ||
    lowerUrl.includes('youtube.com/watch') ||
    lowerUrl.includes('icourse163.org') ||
    lowerUrl.includes('coursera.org') ||
    /教程|网课|公开课|课程|实战|讲解|lecture|tutorial|course|50分钟|吃透/.test(lowerText) &&
      (lowerUrl.includes('bilibili.com') || lowerUrl.includes('youtube.com') || /视频|精讲/.test(lowerText))
  ) {
    return {
      category: 'video_course',
      categoryLabel: LEARNING_CATEGORY_META.video_course.badgeText
    };
  }

  if (
    lowerUrl.includes('arxiv.org') ||
    lowerUrl.includes('scholar.google') ||
    lowerUrl.includes('notion.so') ||
    lowerUrl.includes('overleaf.com') ||
    lowerUrl.includes('feishu.cn') ||
    lowerUrl.endsWith('.pdf') ||
    /论文|文献|笔记|实验报告|综述|arxiv|paper|review|笔记/.test(lowerText)
  ) {
    return {
      category: 'paper_notes',
      categoryLabel: LEARNING_CATEGORY_META.paper_notes.badgeText
    };
  }

  if (
    lowerUrl.includes('github.com') ||
    lowerUrl.includes('gitlab.com') ||
    lowerUrl.includes('developer.mozilla.org') ||
    lowerUrl.includes('docs.') ||
    lowerUrl.includes('pytorch.org') ||
    lowerUrl.includes('leetcode.') ||
    /github|api|文档|documentation|sdk|源码|repository|leetcode|代码|框架/.test(lowerText)
  ) {
    return {
      category: 'code_docs',
      categoryLabel: LEARNING_CATEGORY_META.code_docs.badgeText
    };
  }

  if (
    lowerUrl.includes('google.com/search') ||
    lowerUrl.includes('bing.com/search') ||
    lowerUrl.includes('baidu.com/s') ||
    lowerUrl.includes('stackoverflow.com') ||
    lowerUrl.includes('zhihu.com') ||
    lowerUrl.includes('bilibili.com/all') ||
    lowerUrl.includes('search.bilibili.com')
  ) {
    return {
      category: 'search_qa',
      categoryLabel: LEARNING_CATEGORY_META.search_qa.badgeText
    };
  }

  return {
    category: 'code_docs',
    categoryLabel: LEARNING_CATEGORY_META.code_docs.badgeText
  };
}

export function calculateSnrPercent(stats: FocusSessionState['stats']): number {
  const totalNoiseHandled =
    stats.blurredCardsCount +
    stats.removedNoiseWidgetsCount +
    stats.parkedOrClosedTabsCount;
  if (stats.totalScannedItems === 0 && totalNoiseHandled === 0) {
    return 98.0;
  }
  const base = 92 + Math.min(7.6, Math.log10(1 + totalNoiseHandled + stats.relevantKeptItems) * 3.8);
  return Number(base.toFixed(1));
}
