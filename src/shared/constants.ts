import { matchDomainStage1 } from './domainRules';
import { AppSettings, FocusSessionState, LearningTabCategory, ModelPreset, ProviderId } from './types';

export const STORAGE_KEYS = {
  SETTINGS: 'denoise_app_settings_v1',
  SESSION: 'denoise_focus_session_v1',
  SCREENSHOT_CACHE: 'denoise_tab_screenshots_v1',
  FOCUS_HISTORY: 'denoise_focus_history_v1'
} as const;

// API keys are never compiled into the bundle. Every provider starts with an empty
// key; users fill them in on the options page and they are persisted to
// chrome.storage.local only.
export const DEFAULT_SETTINGS: AppSettings = {
  providers: {
    deepseek: {
      id: 'deepseek',
      name: 'DeepSeek 官方高速直连 (V4.1-Flash 多模态)',
      enabled: true,
      apiKey: '',
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
      name: 'OpenAI 官方 (GPT-6 系列)',
      enabled: true,
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-6-luna',
      supportsVision: true,
      apiFormat: 'openai'
    },
    anthropic: {
      id: 'anthropic',
      name: 'Anthropic Claude',
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-haiku-5-5',
      supportsVision: true,
      apiFormat: 'anthropic'
    },
    gemini: {
      id: 'gemini',
      name: 'Google Gemini (AI Studio)',
      enabled: false,
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-4-hydrogen',
      supportsVision: true,
      apiFormat: 'gemini'
    },
    custom: {
      id: 'custom',
      name: '自定义服务商 (硅基流动 / OpenRouter / 中转)',
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'deepseek-ai/DeepSeek-V4-Flash',
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
      badge: '默认主力 · 多模态',
      description: '1M 超长上下文 + 原生图文输入，关闭思考链后进入亚秒级响应',
      supportsVision: true
    },
    {
      id: 'deepseek-v4-pro',
      label: 'DeepSeek-V4-Pro (deepseek-v4-pro)',
      badge: '旗舰 · 纯文本',
      description: 'DeepSeek V4 旗舰推理，适合复杂学术/代码语义复核',
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
      id: 'gpt-6-luna',
      label: 'GPT-6 Luna',
      badge: '推荐 · 极速',
      description: '官方价格最低、速度评级最快，适合批量网页判别',
      supportsVision: true
    },
    {
      id: 'gpt-6.2-sol',
      label: 'GPT-6.2 Sol',
      badge: '主力 · 均衡',
      description: '复杂任务下的均衡主力，兼顾成本与多模态理解',
      supportsVision: true
    },
    {
      id: 'gpt-6.2-astra',
      label: 'GPT-6.2 Astra',
      badge: '旗舰',
      description: '最强推理与多模态能力，用于最难的灰区复核',
      supportsVision: true
    },
    {
      id: 'gpt-6.1-terra',
      label: 'GPT-6.1 Terra',
      badge: '性价比',
      description: '低成本均衡档，适合长时间常驻的批量判别',
      supportsVision: true
    }
  ],
  anthropic: [
    {
      id: 'claude-haiku-5-5',
      label: 'Claude Haiku 5.5',
      badge: '推荐 · 极速',
      description: '高并发低延迟，适合分类、抽取与路由',
      supportsVision: true
    },
    {
      id: 'claude-sonnet-5-5',
      label: 'Claude Sonnet 5.5',
      badge: '均衡',
      description: '速度与智能兼顾，适合日常语义复核',
      supportsVision: true
    },
    {
      id: 'claude-opus-5-5',
      label: 'Claude Opus 5.5',
      badge: '默认主力',
      description: '长链路编码与知识工作主力',
      supportsVision: true
    },
    {
      id: 'claude-fable-5-2',
      label: 'Claude Fable 5.2',
      badge: '旗舰',
      description: '最强推理与长链路任务，用于最难的判定',
      supportsVision: true
    }
  ],
  gemini: [
    {
      id: 'gemini-4-hydrogen',
      label: 'Gemini 4 Hydrogen',
      badge: '推荐 · 极速',
      description: '速度与效率兼顾，最适合低延迟批量判别',
      supportsVision: true
    },
    {
      id: 'gemini-4-neon',
      label: 'Gemini 4 Neon',
      badge: '主力',
      description: '前沿智能，端到端任务完成速度快',
      supportsVision: true
    },
    {
      id: 'gemini-4-carbon',
      label: 'Gemini 4 Carbon',
      badge: '旗舰',
      description: '最强推理与复杂工程，适合深度复核',
      supportsVision: true
    },
    {
      id: 'gemini-4-argon',
      label: 'Gemini 4 Argon',
      badge: '高效推理',
      description: '响应更快、单轮 token 消耗更低',
      supportsVision: true
    }
  ],
  custom: [
    {
      id: 'deepseek-ai/DeepSeek-V4-Flash',
      label: 'deepseek-ai/DeepSeek-V4-Flash (硅基流动)',
      badge: '多模态极速',
      description: '硅基流动托管的 DeepSeek V4 Flash',
      supportsVision: true
    },
    {
      id: 'Pro/zai-org/GLM-5.2',
      label: 'Pro/zai-org/GLM-5.2',
      badge: '国产开源',
      description: '智谱 GLM 系列，中文语义判别表现稳定',
      supportsVision: false
    },
    {
      id: 'moonshotai/Kimi-K2.7-Code',
      label: 'moonshotai/Kimi-K2.7-Code',
      badge: '长上下文',
      description: '适合代码与长文档语义复核',
      supportsVision: false
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
  learningGroupIds: {},
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
