import { LearningTabCategory } from './types';

export type Stage1RuleType = 'direct_park' | 'direct_learning' | 'content_check' | 'unknown';

export interface DomainRuleMatch {
  stage1: Stage1RuleType;
  siteName: string;
  category?: LearningTabCategory;
  categoryLabel?: string;
  reasonTag: string;
}

export const CATEGORY_BADGE_MAP: Record<LearningTabCategory, string> = {
  video_course: '🎬 视频课程',
  code_docs: '💻 代码与文档',
  search_qa: '🔍 检索与问答',
  paper_notes: '📄 文献与笔记'
};

export const CATEGORY_TAB_GROUP_META: Record<
  LearningTabCategory,
  { title: string; color: chrome.tabGroups.ColorEnum }
> = {
  video_course: { title: '🎬 视频课程', color: 'cyan' },
  code_docs: { title: '💻 代码与文档', color: 'blue' },
  search_qa: { title: '🔍 检索与问答', color: 'green' },
  paper_notes: { title: '📄 文献与笔记', color: 'purple' }
};

interface DirectParkRule {
  domains: string[];
  siteName: string;
  reasonTag: string;
}

interface DirectLearningRule {
  domains: string[];
  siteName: string;
  category: LearningTabCategory;
  reasonTag: string;
}

interface ContentCheckRule {
  domains: string[];
  siteName: string;
  candidateCategory: LearningTabCategory;
  reasonTag: string;
}

/**
 * 第一阶段 A 类：纯娱乐/短视频/直播/网购黑名单 -> 直接放入 💤 暂存休息舱，无需耗费 Token
 */
const DIRECT_PARK_RULES: DirectParkRule[] = [
  {
    domains: ['douyin.com', 'iesdouyin.com', 'tiktok.com', 'kuaishou.com'],
    siteName: '短视频平台',
    reasonTag: '短视频直入暂存区'
  },
  {
    // live.bilibili.com is intentionally NOT here: it also hosts live lectures and
    // course streams, so it must go through content review (see CONTENT_CHECK_RULES).
    domains: ['douyu.com', 'huya.com', 'twitch.tv'],
    siteName: '直播平台',
    reasonTag: '娱乐直播直入暂存区'
  },
  {
    domains: ['iqiyi.com', 'v.qq.com', 'youku.com', 'mgtv.com', 'netflix.com'],
    siteName: '影视综艺',
    reasonTag: '影视剧集直入暂存区'
  },
  {
    domains: ['taobao.com', 'tmall.com', 'jd.com', 'pinduoduo.com', 'yangkeduo.com', 'goofish.com', 'vip.com'],
    siteName: '电商购物',
    reasonTag: '网购页面直入暂存区'
  },
  {
    domains: ['weibo.com', 's.weibo.com', 'tieba.baidu.com', 'hupu.com', 'store.steampowered.com', 'steamcommunity.com'],
    siteName: '娱乐社区',
    reasonTag: '娱乐社区直入暂存区'
  }
];

/**
 * 第一阶段 B 类：生产力/AI检索/代码刷题/学术文献白名单 -> 直接放行并归入对应彩色标签组
 */
const DIRECT_LEARNING_RULES: DirectLearningRule[] = [
  {
    domains: [
      'chatgpt.com',
      'chat.openai.com',
      'platform.openai.com',
      'claude.ai',
      'console.anthropic.com',
      'anthropic.com',
      'chat.deepseek.com',
      'platform.deepseek.com',
      'deepseek.com',
      'gemini.google.com',
      'aistudio.google.com',
      'ai.google.dev',
      'perplexity.ai',
      'kimi.moonshot.cn',
      'kimi.com',
      'doubao.com',
      'tongyi.aliyun.com',
      'qianwen.com',
      'yuanbao.tencent.com',
      'chatglm.cn',
      'bigmodel.cn',
      'grok.com'
    ],
    siteName: 'AI 检索与助手',
    category: 'search_qa',
    reasonTag: 'AI 检索官网直通'
  },
  {
    domains: [
      'stackoverflow.com',
      'stackexchange.com',
      'superuser.com',
      'serverfault.com',
      'askubuntu.com'
    ],
    siteName: 'StackOverflow 问答',
    category: 'search_qa',
    reasonTag: '技术问答直通'
  },
  {
    domains: [
      'leetcode.cn',
      'leetcode.com',
      'nowcoder.com',
      'codeforces.com',
      'luogu.com.cn',
      'atcoder.jp',
      'hackerrank.com',
      'kaggle.com'
    ],
    siteName: '算法与刷题',
    category: 'code_docs',
    reasonTag: '算法刷题直通'
  },
  {
    domains: [
      'github.com',
      'gitlab.com',
      'gitee.com',
      'huggingface.co',
      'colab.research.google.com',
      'codesandbox.io',
      'stackblitz.com',
      'npmjs.com',
      'pypi.org',
      'crates.io'
    ],
    siteName: '代码仓库与开发',
    category: 'code_docs',
    reasonTag: '代码托管直通'
  },
  {
    domains: [
      'developer.mozilla.org',
      'docs.python.org',
      'pytorch.org',
      'tensorflow.org',
      'react.dev',
      'vuejs.org',
      'nextjs.org',
      'nodejs.org',
      'rust-lang.org',
      'go.dev',
      'typescriptlang.org',
      'kubernetes.io',
      'docker.com',
      'vite.dev',
      'tailwindcss.com',
      'developer.chrome.com'
    ],
    siteName: '官方技术文档',
    category: 'code_docs',
    reasonTag: '官方文档直通'
  },
  {
    domains: [
      'arxiv.org',
      'scholar.google.com',
      'cnki.net',
      'wanfangdata.com.cn',
      'ieeexplore.ieee.org',
      'dl.acm.org',
      'nature.com',
      'science.org',
      'sciencedirect.com',
      'springer.com',
      'semanticscholar.org',
      'researchgate.net',
      'openreview.net'
    ],
    siteName: '学术文献库',
    category: 'paper_notes',
    reasonTag: '学术文献直通'
  },
  {
    domains: [
      'notion.so',
      'feishu.cn',
      'larksuite.com',
      'yuque.com',
      'overleaf.com',
      'wolai.com',
      'obsidian.md',
      'docs.qq.com',
      'shimo.im'
    ],
    siteName: '知识库与笔记',
    category: 'paper_notes',
    reasonTag: '笔记文档直通'
  },
  {
    domains: [
      'icourse163.org',
      'xuetangx.com',
      'coursera.org',
      'edx.org',
      'udemy.com',
      'ocw.mit.edu'
    ],
    siteName: 'MOOC 在线课程',
    category: 'video_course',
    reasonTag: '公开课平台直通'
  }
];

/**
 * 第一阶段 C 类：混合型平台（B站、YouTube、搜索引擎、知乎等）
 * 必须经过第二阶段「内容相关性匹配」：相关则进入对应学习分类，无关则拦截或归入暂存区
 */
const CONTENT_CHECK_RULES: ContentCheckRule[] = [
  {
    domains: ['bilibili.com', 'b23.tv', 'youtube.com', 'youtu.be'],
    siteName: '视频平台',
    candidateCategory: 'video_course',
    reasonTag: '视频内容二次核验'
  },
  {
    domains: ['google.com', 'google.com.hk', 'bing.com', 'cn.bing.com', 'baidu.com', 'sogou.com', 'duckduckgo.com'],
    siteName: '搜索引擎',
    candidateCategory: 'search_qa',
    reasonTag: '搜索词二次核验'
  },
  {
    domains: ['csdn.net', 'juejin.cn', 'cnblogs.com', 'segmentfault.com', 'oschina.net', '51cto.com', 'infoq.cn'],
    siteName: '技术社区',
    candidateCategory: 'code_docs',
    reasonTag: '技术文章二次核验'
  },
  {
    domains: ['zhihu.com', 'xiaohongshu.com', 'wikipedia.org', 'baike.baidu.com', 'reddit.com', 'medium.com', 'v2ex.com'],
    siteName: '知识与综合社区',
    candidateCategory: 'search_qa',
    reasonTag: '社区内容二次核验'
  }
];

function extractCleanHost(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function hostMatchesDomain(host: string, domain: string): boolean {
  const clean = domain.toLowerCase().replace(/^www\./, '');
  return host === clean || host.endsWith(`.${clean}`);
}

export function matchDomainStage1(rawUrl: string): DomainRuleMatch {
  const host = extractCleanHost(rawUrl);
  if (!host) {
    return {
      stage1: 'unknown',
      siteName: '未知页面',
      reasonTag: '常规语义核验'
    };
  }

  for (const rule of DIRECT_PARK_RULES) {
    if (rule.domains.some((d) => hostMatchesDomain(host, d))) {
      return {
        stage1: 'direct_park',
        siteName: rule.siteName,
        reasonTag: rule.reasonTag
      };
    }
  }

  for (const rule of DIRECT_LEARNING_RULES) {
    if (rule.domains.some((d) => hostMatchesDomain(host, d))) {
      return {
        stage1: 'direct_learning',
        siteName: rule.siteName,
        category: rule.category,
        categoryLabel: CATEGORY_BADGE_MAP[rule.category],
        reasonTag: rule.reasonTag
      };
    }
  }

  for (const rule of CONTENT_CHECK_RULES) {
    if (rule.domains.some((d) => hostMatchesDomain(host, d))) {
      return {
        stage1: 'content_check',
        siteName: rule.siteName,
        category: rule.candidateCategory,
        categoryLabel: CATEGORY_BADGE_MAP[rule.candidateCategory],
        reasonTag: rule.reasonTag
      };
    }
  }

  if (rawUrl.toLowerCase().endsWith('.pdf')) {
    return {
      stage1: 'direct_learning',
      siteName: 'PDF 文献',
      category: 'paper_notes',
      categoryLabel: CATEGORY_BADGE_MAP.paper_notes,
      reasonTag: 'PDF 文献直通'
    };
  }

  return {
    stage1: 'unknown',
    siteName: host,
    reasonTag: '页面内容语义核验'
  };
}

/**
 * Unambiguous entertainment markers. A hit here is enough to call a page noise,
 * because none of these words have a common technical / academic meaning.
 */
const ENTERTAINMENT_NOISE_KEYWORDS = [
  '真人秀',
  '综艺',
  '哈哈哈哈哈',
  '五哈',
  '搞笑',
  '鬼畜',
  '八卦',
  '吃瓜',
  '娱乐圈',
  '恋综',
  '下饭',
  '追剧',
  '电影解说',
  '游戏实况',
  '带货',
  '穿搭',
  '美妆',
  '开箱',
  '探店',
  '搞笑视频',
  '整活',
  '吐槽',
  '狗血',
  '爽剧',
  '短剧'
];

/**
 * Words that usually mean entertainment but are also common in technical writing
 * ("热搜引擎", "主播推荐系统", "游戏理论", "明星公司"). They only count as a weak
 * signal and can be outweighed by task-token matches.
 */
const AMBIGUOUS_ENTERTAINMENT_KEYWORDS = ['明星', '热搜', '主播', '游戏', '直播', '购物'];

const LEARNING_SIGNAL_KEYWORDS = [
  '教程',
  '课程',
  '公开课',
  '源码',
  '算法',
  '文档',
  '论文',
  '实验',
  '讲解',
  '实战',
  '精讲',
  '原理',
  '架构',
  '指南',
  '部署',
  '报错',
  '公式',
  '推导',
  '题解',
  'lecture',
  'tutorial',
  'course',
  'documentation',
  'paper',
  'benchmark',
  'agent',
  'harness',
  'deepseek',
  'llm',
  'python',
  'pytorch',
  'react',
  'typescript'
];

export function extractTaskTokens(taskIntent: string): string[] {
  const normalized = (taskIntent || '').toLowerCase();
  const ascii = normalized.match(/[a-z0-9+#.-]{2,}/g) ?? [];
  const genericStopWords = new Set(['学习', '复习', '研究', '掌握', '撰写', '排查', '教程', '课程', '资料', '精读', '怎么', '如何']);
  const rawCjk = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const cjkTokens: string[] = [];
  for (const chunk of rawCjk) {
    const cleaned = chunk
      .replace(/^(学习|复习|研究|掌握|撰写|排查|精读)/, '')
      .replace(/(学习|复习|研究|教程|课程|资料)$/, '');
    if (cleaned.length >= 2 && !genericStopWords.has(cleaned)) {
      cjkTokens.push(cleaned);
    }
    if (chunk.length >= 2 && !genericStopWords.has(chunk)) {
      cjkTokens.push(chunk);
    }
  }
  return Array.from(new Set([...ascii, ...cjkTokens]));
}

/**
 * Chinese has no spaces, so a whole sentence like "复习高等数学与线性代数特征值" is
 * one un-splittable string and `includes()` will almost never match a real page
 * title. We instead match on character bigrams, which is a robust, dependency-free
 * way to measure overlap between two short Chinese strings.
   */
export function extractCjkBigrams(text: string): Set<string> {
  const bigrams = new Set<string>();
  const runs = (text || '').toLowerCase().match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  for (const run of runs) {
    for (let index = 0; index + 1 < run.length; index += 1) {
      bigrams.add(run.slice(index, index + 2));
    }
  }
  return bigrams;
}

export interface TaskTokenMatch {
  /** Number of distinct task tokens found in the text. */
  matched: number;
  /** Tokens that matched. */
  tokens: string[];
  /** Share of the task's Chinese bigrams that appear in the text (0..1). */
  cjkCoverage: number;
}

/**
 * Matches a page text against the task intent. ASCII tokens use whole-word
 * matching; Chinese uses bigram coverage. Generic verb prefixes ("学习", "复习")
 * are stripped from the task first so they don't inflate coverage.
 */
export function matchTaskTokens(taskIntent: string, text: string): TaskTokenMatch {
  const haystack = (text || '').toLowerCase();
  const asciiTokens = extractTaskTokens(taskIntent).filter((token) => /^[a-z0-9+#.-]+$/.test(token));
  const matchedAscii = asciiTokens.filter((token) =>
    new RegExp(`(^|[^a-z0-9+#.-])${token.replace(/[.+-]/g, '\\$&')}([^a-z0-9+#.-]|$)`, 'i').test(haystack)
  );

  const normalizedTask = (taskIntent || '')
    .toLowerCase()
    .replace(/^(学习|复习|研究|掌握|撰写|排查|精读|阅读|刷|攻克|实操|理解|梳理|调试|完成|整理|精读)+/g, '');
  const textBigrams = extractCjkBigrams(haystack);
  // "高等数学与线性代数特征值" is two topics. Score each sub-topic separately and
  // keep the best one, so a page about either half still counts as on-task.
  const subTopics = normalizedTask
    .split(/[与和、及,，;；/|\s]+/)
    .map((part) => part.trim())
    .filter((part) => /[\u4e00-\u9fff]{2,}/.test(part));
  const bigramSets = (subTopics.length > 0 ? subTopics : [normalizedTask]).map((topic) =>
    extractCjkBigrams(topic)
  );
  let bestCoverage = 0;
  for (const taskBigrams of bigramSets) {
    if (taskBigrams.size === 0) continue;
    let hitBigrams = 0;
    for (const bigram of taskBigrams) {
      if (textBigrams.has(bigram)) hitBigrams += 1;
    }
    bestCoverage = Math.max(bestCoverage, hitBigrams / taskBigrams.size);
  }
  const cjkCoverage = bestCoverage;
  return {
    matched: matchedAscii.length + (cjkCoverage >= 0.25 ? 1 : 0),
    tokens: matchedAscii,
    cjkCoverage
  };
}

export function extractSearchQueryFromUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return (
      parsed.searchParams.get('q') ||
      parsed.searchParams.get('wd') ||
      parsed.searchParams.get('keyword') ||
      parsed.searchParams.get('search_query') ||
      parsed.searchParams.get('word') ||
      ''
    ).trim();
  } catch {
    return '';
  }
}

export interface Stage2HeuristicVerdict {
  decisive: boolean;
  isRelevant: boolean;
  relevanceScore: number;
  reasonTag: string;
}

/**
 * 第二阶段：针对混合型平台（如 B站、YouTube、Google/百度搜索、知乎等）进行内容匹配
 */
export function evaluateStage2ContentHeuristics(params: {
  taskIntent: string;
  title: string;
  snippet?: string;
  url?: string;
}): Stage2HeuristicVerdict {
  const searchQuery = extractSearchQueryFromUrl(params.url || '');
  const fullText = `${params.title || ''} ${searchQuery} ${params.snippet || ''}`.toLowerCase();
  const titleAndQuery = `${params.title || ''} ${searchQuery}`.toLowerCase();

  const hitEntertainment = ENTERTAINMENT_NOISE_KEYWORDS.find((kw) => fullText.includes(kw.toLowerCase()));
  const titleMatch = matchTaskTokens(params.taskIntent, titleAndQuery);
  const fullMatch = matchTaskTokens(params.taskIntent, fullText);
  // A page counts as task-relevant when the title alone carries enough of the task.
  const matchedTitleTaskTokens = titleMatch.cjkCoverage >= 0.25 || titleMatch.tokens.length > 0
    ? [...titleMatch.tokens, ...(titleMatch.cjkCoverage >= 0.25 ? ['任务关键词'] : [])]
    : [];
  const matchedTaskTokens = fullMatch.cjkCoverage >= 0.25 || fullMatch.tokens.length > 0
    ? [...fullMatch.tokens, ...(fullMatch.cjkCoverage >= 0.25 ? ['任务关键词'] : [])]
    : [];
  const hitLearning = LEARNING_SIGNAL_KEYWORDS.find((kw) => titleAndQuery.includes(kw.toLowerCase()));

  // 1. 标题或搜索词直接命中任务核心词，且不含娱乐噪音 -> 高分通过
  if (matchedTitleTaskTokens.length > 0 && !hitEntertainment) {
    return {
      decisive: true,
      isRelevant: true,
      relevanceScore: Math.min(96, 80 + Math.round(titleMatch.cjkCoverage * 14) + titleMatch.tokens.length * 6),
      reasonTag: `匹配任务关键词 (${Math.round(titleMatch.cjkCoverage * 100)}%)`
    };
  }

  // 2. 命中强娱乐/综艺/八卦特征，且未命中任务词 -> 直接判定为分心
  if (hitEntertainment && matchedTitleTaskTokens.length === 0) {
    return {
      decisive: true,
      isRelevant: false,
      relevanceScore: 10,
      reasonTag: `娱乐内容 (${hitEntertainment})`
    };
  }

  // 3. 搜索引擎页面，搜索词明确但与当前学习任务及学习信号均无关（如搜“哈哈哈”、“吃什么”）
  if (searchQuery.length >= 2 && matchedTitleTaskTokens.length === 0 && !hitLearning) {
    const isPureNoiseQuery = /^[哈嘿嘻啊哦呵喵汪666？?!！]+$/.test(searchQuery) || Boolean(hitEntertainment);
    if (isPureNoiseQuery) {
      return {
        decisive: true,
        isRelevant: false,
        relevanceScore: 12,
        reasonTag: `无关搜索「${searchQuery.slice(0, 10)}」`
      };
    }
  }

  // 4. 标题包含明显课程/学习关键词且正文命中任务词
  if (hitLearning && matchedTaskTokens.length > 0) {
    return {
      decisive: true,
      isRelevant: true,
      relevanceScore: 84,
      reasonTag: `课程资料 (${hitLearning})`
    };
  }

  // Ambiguous words ("热搜引擎", "游戏理论", "明星公司") deliberately do NOT decide
  // anything here. They fall through as non-decisive and go to the LLM.
  return {
    decisive: false,
    isRelevant: matchedTaskTokens.length > 0 || Boolean(hitLearning),
    relevanceScore:
      matchedTaskTokens.length > 0
        ? Math.min(74, 56 + Math.round(fullMatch.cjkCoverage * 18))
        : hitLearning
          ? 56
          : AMBIGUOUS_ENTERTAINMENT_KEYWORDS.some((kw) => fullText.includes(kw))
            ? 34
            : 28,
    reasonTag: matchedTaskTokens.length > 0 ? '相关资料' : hitLearning ? '泛学习内容' : '疑似偏离任务'
  };
}
