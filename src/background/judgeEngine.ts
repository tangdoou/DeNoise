import { evaluateStage2ContentHeuristics, matchDomainStage1 } from '../shared/domainRules';
import { getAppSettings } from '../shared/storage';
import {
  JudgeBatchRequest,
  JudgeItemInput,
  JudgeItemResult,
  ProviderConfig,
  ProviderId
} from '../shared/types';

const POSITIVE_CLUSTERS: Array<{ tag: string; weight: number; terms: string[] }> = [
  {
    tag: '数学与公式',
    weight: 48,
    terms: [
      '高数', '高等数学', '微积分', '线性代数', '矩阵', '特征值', '特征向量', '概率论',
      '统计学', '离散数学', '数学分析', '公式', '推导', '习题', '真题', '期末复习'
    ]
  },
  {
    tag: '编程与技术',
    weight: 46,
    terms: [
      'python', 'java', 'javascript', 'typescript', 'c++', '算法', '数据结构', 'leetcode',
      '动态规划', '代码', '报错', '调试', '显存', 'pytorch', 'tensorflow', 'react',
      'git', 'github', 'stack overflow', 'stackoverflow', '编译', '部署', '接口',
      'deepseek', 'harness', 'agent', 'superagent', 'llm', '大模型', '智能体', 'mcp',
      'rag', 'prompt', 'vibe coding', 'ai编程', '架构', '工程', '框架', 'sdk'
    ]
  },
  {
    tag: '计算机课程',
    weight: 47,
    terms: [
      '计算机网络', '计网', '操作系统', '数据库', '计算机组成', '机器学习', '深度学习',
      '人工智能', '编译原理', '软件工程', '实验报告', '实验', '课程设计', '课设', '网课',
      '教程', '公开课', 'lecture'
    ]
  },
  {
    tag: '学术科研',
    weight: 47,
    terms: [
      '论文', '文献', '综述', 'arxiv', 'research', 'scholar', '实验结果', '参考文献',
      '学术', '科研', '课题', '导师', '投稿', '审稿', '数据集'
    ]
  },
  {
    tag: '学习工具',
    weight: 36,
    terms: [
      'docs', 'documentation', '文档', 'api', 'mdn', 'w3c', 'notion', '笔记', '复习',
      '学习', '作业', '考试', '课程', '教案', '讲义', 'slide', 'ppt'
    ]
  }
];

const NEGATIVE_CLUSTERS: Array<{ tag: string; weight: number; terms: string[] }> = [
  {
    tag: '娱乐八卦',
    weight: 42,
    terms: ['娱乐', '八卦', '吃瓜', '爆料', '绯闻', '明星', '偶像', '热搜', '综艺', '真人秀']
  },
  {
    tag: '游戏直播',
    weight: 43,
    terms: ['游戏', '直播', '电竞', '王者荣耀', '原神', 'steam', '通关', '攻略娱乐', '手游', '网游']
  },
  {
    tag: '短视频搞笑',
    weight: 40,
    terms: ['搞笑', '段子', '沙雕', '短视频', 'meme', '鬼畜', '整活', '主播', '弹幕']
  },
  {
    tag: '网购穿搭',
    weight: 40,
    terms: ['淘宝', '天猫', '京东', '拼多多', '优惠券', '折扣', '促销', '穿搭', '种草', '购物']
  },
  {
    tag: '社交闲聊',
    weight: 32,
    terms: ['朋友圈', '微博热搜', '社媒', '聊天', '相亲', '宠物萌宠', '旅行攻略', '美食探店']
  }
];

const STRONG_POSITIVE_DOMAINS = [
  'github.com', 'stackoverflow.com', 'arxiv.org', 'scholar.google.com', 'developer.mozilla.org',
  'docs.python.org', 'pytorch.org', 'leetcode.cn', 'leetcode.com', 'notion.so'
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasTerm(haystack: string, term: string): boolean {
  const normalizedTerm = normalize(term);
  return normalizedTerm.length > 0 && haystack.includes(normalizedTerm);
}

function containsAny(haystack: string, terms: string[]): string | undefined {
  return terms.find((term) => hasTerm(haystack, term));
}

function taskTokens(taskIntent: string): string[] {
  const normalized = normalize(taskIntent);
  const ascii = normalized.match(/[a-z][a-z+#.]{2,}/g) ?? [];
  const cjk = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  return [...new Set([...cjk, ...ascii])].filter(Boolean);
}

function localSemanticJudge(item: JudgeItemInput, taskIntent: string): JudgeItemResult {
  const stage1 = item.url
    ? matchDomainStage1(item.url)
    : { stage1: 'unknown' as const, siteName: '', reasonTag: '常规语义核验' };
  if (item.type !== 'feed_card') {
    if (stage1.stage1 === 'direct_learning') {
      return {
        id: item.id,
        relevanceScore: 96,
        confidence: 0.98,
        decision: 'keep',
        reasonTag: stage1.reasonTag
      };
    }
    if (stage1.stage1 === 'direct_park') {
      return {
        id: item.id,
        relevanceScore: 5,
        confidence: 0.98,
        decision: item.type === 'tab_initial' ? 'close' : 'park',
        reasonTag: stage1.reasonTag
      };
    }
  }

  const text = normalize([item.title, item.url ?? '', item.snippet ?? ''].join(' '));
  const task = normalize(taskIntent);
  const tokens = taskTokens(taskIntent);
  let score = 20;
  let confidence = 0.42;
  const reasons: string[] = [];

  if (stage1.stage1 === 'direct_learning') {
    score += 50;
    reasons.push(stage1.reasonTag);
  } else if (stage1.stage1 === 'direct_park') {
    score -= 55;
    reasons.push(stage1.reasonTag);
  }

  for (const cluster of POSITIVE_CLUSTERS) {
    if (containsAny(text, cluster.terms)) {
      score += cluster.weight;
      reasons.push(cluster.tag);
      confidence += 0.11;
    }
  }

  for (const cluster of NEGATIVE_CLUSTERS) {
    if (containsAny(text, cluster.terms)) {
      score -= cluster.weight;
      reasons.push(cluster.tag);
      confidence += 0.1;
    }
  }

  try {
    const hostname = new URL(item.url ?? 'http://localhost').hostname.replace(/^www\./, '');
    if (STRONG_POSITIVE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      score += 45;
      reasons.push('技术资料站');
      confidence += 0.16;
    }
  } catch {
    // A missing or invalid URL does not affect the semantic score.
  }

  for (const token of tokens) {
    if (token.length >= 2 && text.includes(token)) {
      score += token.length >= 4 ? 24 : 16;
      confidence += 0.05;
    }
  }

  const relevanceScore = clamp(Math.round(score), 0, 100);
  confidence = clamp(confidence, 0.4, 0.94);
  const reasonTag = reasons[0] ?? (relevanceScore >= 60 ? '任务相关' : '无关内容');
  return {
    id: item.id,
    relevanceScore,
    confidence,
    decision: decide(item, relevanceScore),
    reasonTag
  };
}

function decide(item: JudgeItemInput, score: number): JudgeItemResult['decision'] {
  if (item.type === 'feed_card') {
    return score >= 50 ? 'keep' : 'blur';
  }
  if (item.type === 'tab_initial') {
    if (score >= 60) return 'keep';
    if (score >= 15) return 'need_vision_review';
    return 'close';
  }
  if (score >= 50) return 'keep';
  if (score >= 30) return 'park';
  return 'close';
}

function extractJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.search(/[[{]/);
    const end = Math.max(trimmed.lastIndexOf(']'), trimmed.lastIndexOf('}'));
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('Model did not return valid JSON');
  }
}

function normalizeRemoteScore(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value <= 1 ? value * 100 : value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed <= 1 ? parsed * 100 : parsed;
    }
  }
  return undefined;
}

function mapRemoteResults(
  payload: unknown,
  items: JudgeItemInput[],
  taskIntent = ''
): JudgeItemResult[] {
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { results?: unknown[] })?.results)
      ? (payload as { results: unknown[] }).results
      : Array.isArray((payload as { questions?: unknown[] })?.questions)
        ? (payload as { questions: unknown[] }).questions
        : [payload];
  const byId = new Map<string, JudgeItemResult>();

  for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
    const record = records[recordIndex];
    if (typeof record !== 'object' || record === null) continue;
    const raw = record as Record<string, unknown>;
    const rawIndex = typeof raw.index === 'number' ? raw.index : recordIndex;
    const fallbackItem = rawIndex >= 0 && rawIndex < items.length ? items[rawIndex] : undefined;
    const id = typeof raw.id === 'string' ? raw.id : fallbackItem?.id;
    if (!id) continue;
    const score =
      normalizeRemoteScore(raw.s) ??
      normalizeRemoteScore(raw.relevanceScore) ??
      normalizeRemoteScore(raw.score) ??
      normalizeRemoteScore(raw.Score) ??
      normalizeRemoteScore(raw.noul) ??
      normalizeRemoteScore(raw.Noul);
    if (score === undefined) continue;
    const relevanceScore = clamp(Math.round(score), 0, 100);
    const item = items.find((candidate) => candidate.id === id);
    if (!item) continue;
    const tagRaw =
      typeof raw.t === 'string' && raw.t
        ? raw.t
        : typeof raw.reasonTag === 'string' && raw.reasonTag
          ? raw.reasonTag
          : typeof raw.reason === 'string' && raw.reason
            ? raw.reason.slice(0, 24)
            : relevanceScore >= 60
              ? '任务相关'
              : '无关内容';
    byId.set(id, {
      id,
      relevanceScore,
      confidence: clamp(Number(raw.confidence ?? 0.82) || 0.82, 0, 1),
      decision: decide(item, relevanceScore),
      reasonTag: tagRaw,
      usedVision: item.type === 'tab_vision_review' && Boolean(item.screenshotBase64)
    });
  }

  return items.map((item) => {
    const mapped = byId.get(item.id);
    return mapped && Number.isFinite(mapped.relevanceScore)
      ? mapped
      : localSemanticJudge(item, taskIntent);
  });
}

function buildPrompt(taskIntent: string, intensity: string, items: JudgeItemInput[]): string {
  const questions = items.map((item) => ({
    id: item.id,
    title: (item.title || '').slice(0, 90),
    snippet: (item.snippet || '').slice(0, 80)
  }));
  return JSON.stringify({
    taskIntent,
    intensity,
    questions,
    instructions:
      '判断每个条目与taskIntent的相关性(0完全无关,100高度相关,灰区偏高防误杀)。严禁解释，只输出极简JSON：{"results":[{"id":"...","s":0-100,"t":"4字内原因"}]}'
  });
}

function asDataUrl(screenshotBase64: string): string {
  return screenshotBase64.startsWith('data:')
    ? screenshotBase64
    : `data:image/jpeg;base64,${screenshotBase64}`;
}

function asBase64(screenshotBase64: string): string {
  const commaIndex = screenshotBase64.indexOf(',');
  return screenshotBase64.startsWith('data:') && commaIndex >= 0
    ? screenshotBase64.slice(commaIndex + 1)
    : screenshotBase64;
}

async function fetchOpenAICompatibleChat(
  provider: ProviderConfig,
  bodyObj: Record<string, unknown>
): Promise<Response> {
  const endpoint = `${provider.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (provider.apiKey && provider.apiKey.trim()) {
    headers.Authorization = `Bearer ${provider.apiKey.trim()}`;
  }
  const isDeepSeek =
    provider.id === 'deepseek' || provider.baseUrl.toLowerCase().includes('deepseek.com');
  const requestBody: Record<string, unknown> = {
    ...bodyObj
  };
  if (isDeepSeek && provider.model !== 'deepseek-reasoner') {
    requestBody.thinking = { type: 'disabled' };
  }

  const firstResp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  // Seamless compatibility fallback if deepseek-flash / deepseek-v4-pro is not yet enabled on the account's public endpoint
  if (
    !firstResp.ok &&
    isDeepSeek &&
    (provider.model === 'deepseek-flash' || provider.model === 'deepseek-v4-pro')
  ) {
    const fallbackBody: Record<string, unknown> = { ...requestBody, model: 'deepseek-chat' };
    delete fallbackBody.thinking;
    return fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(fallbackBody)
    });
  }
  return firstResp;
}

async function requestOpenAI(
  provider: ProviderConfig,
  prompt: string,
  items: JudgeItemInput[],
  taskIntent: string
): Promise<JudgeItemResult[]> {
  const visionItems = items.filter((item) => item.type === 'tab_vision_review' && item.screenshotBase64);
  const dynamicMaxTokens = Math.min(256, Math.max(48, items.length * 24 + 16));
  if (visionItems.length === 0) {
    const response = await fetchOpenAICompatibleChat(provider, {
      model: provider.model,
      temperature: 0,
      max_tokens: dynamicMaxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Output compact JSON only.' },
        { role: 'user', content: prompt }
      ]
    });
    if (!response.ok) throw new Error(`OpenAI API ${response.status}`);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content ?? '[]';
    const parsed = extractJson(content);
    const array = Array.isArray(parsed)
      ? parsed
      : ((parsed as { results?: unknown[] })?.results ?? []);
    return mapRemoteResults(array, items, taskIntent);
  }

  const results: JudgeItemResult[] = [];
  for (const item of visionItems) {
    const response = await fetchOpenAICompatibleChat(provider, {
      model: provider.model,
      temperature: 0,
      max_tokens: 72,
      messages: [
        { role: 'system', content: 'Output compact JSON only.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildPrompt(taskIntent, 'strict', [item]) },
            { type: 'image_url', image_url: { url: asDataUrl(item.screenshotBase64!) } }
          ]
        }
      ]
    });
    if (!response.ok) throw new Error(`OpenAI vision API ${response.status}`);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    results.push(...mapRemoteResults(
      extractJson(payload.choices?.[0]?.message?.content ?? '[]'),
      [item],
      taskIntent
    ));
  }
  return results;
}

interface ZevAnswers {
  choice?: unknown;
  confidence?: unknown;
  score?: unknown;
  probabilities?: unknown;
}

interface ZevResponse {
  answers?: Record<string, ZevAnswers>;
  error?: { message?: unknown };
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asConfidence(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : fallback;
}

function buildZevState(item: JudgeItemInput, taskIntent: string): string {
  return [
    `用户任务：${taskIntent}`,
    `页面标题：${item.title}`,
    item.url ? `页面地址：${item.url}` : '',
    item.snippet ? `内容摘要：${item.snippet}` : ''
  ].filter(Boolean).join('\n');
}

async function requestZev(provider: ProviderConfig, state: string): Promise<ZevResponse> {
  const MAX_ATTEMPTS = 3;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(provider.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        state,
        questions: {
          disposition: {
            type: 'choice',
            instructions: '根据用户任务判断这条网页内容的降噪处置方向。',
            criteria: {
              keep: '内容与任务直接相关，应当保留。',
              review: '内容相关性不明确，应当复核或暂存，避免误杀。',
              discard: '内容明显无关，可以降噪处理。'
            }
          },
          relevance: {
            type: 'score',
            instructions: '按从低到高评估内容与用户任务的相关性。',
            criteria: [
              '完全无关，主要是娱乐、购物或社交噪音。',
              '有一点主题重叠，但不是完成任务所需的资料。',
              '与任务有较明显的关联，值得作为参考资料。',
              '高度相关，是完成任务的直接资料或工具。'
            ]
          }
        }
      })
    });

    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfterSeconds = Number(response.headers.get('Retry-After'));
      const delayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
        ? Math.min(retryAfterSeconds * 1000, 15_000)
        : 750 * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      lastError = new Error('Zleap Zev-1 API 429: rate limited');
      continue;
    }

    const payload = (await response.json()) as ZevResponse;
    if (!response.ok) {
      const message = asString(payload.error?.message, '');
      throw new Error(`Zleap Zev-1 API ${response.status}${message ? `: ${message}` : ''}`);
    }
    if (
      typeof payload.answers?.disposition?.choice !== 'string' ||
      typeof payload.answers?.relevance?.score !== 'number'
    ) {
      throw new Error('Zleap Zev-1 did not return valid answers');
    }

    return payload;
  }

  throw lastError ?? new Error('Zleap Zev-1 request failed');
}

function mapZevAnswer(payload: ZevResponse, item: JudgeItemInput): JudgeItemResult {
  const disposition = payload.answers?.disposition ?? {};
  const relevance = payload.answers?.relevance ?? {};
  const rawScore = Number(relevance.score);
  const probabilityKeys = Object.keys(
    typeof relevance.probabilities === 'object' && relevance.probabilities !== null
      ? relevance.probabilities as Record<string, unknown>
      : {}
  );
  const maxScore = probabilityKeys.length > 1 ? probabilityKeys.length - 1 : 3;
  const relevanceScore = clamp(
    Math.round((Number.isFinite(rawScore) ? rawScore : 0) / maxScore * 100),
    0,
    100
  );
  const choice = asString(disposition.choice, 'discard');
  const confidence =
    asConfidence(disposition.confidence, 0.7) * 0.6 +
    asConfidence(relevance.confidence, 0.7) * 0.4;
  const reasonTag =
    choice === 'keep'
      ? '任务相关'
      : choice === 'review'
        ? '灰区待复核'
        : '无关内容';

  return {
    id: item.id,
    relevanceScore,
    confidence,
    decision: decide(item, relevanceScore),
    reasonTag,
    usedVision: item.type === 'tab_vision_review' && Boolean(item.screenshotBase64)
  };
}

async function requestAnthropic(
  provider: ProviderConfig,
  prompt: string,
  items: JudgeItemInput[],
  taskIntent: string
): Promise<JudgeItemResult[]> {
  const contents = items.map((item) => {
    if (item.type !== 'tab_vision_review' || !item.screenshotBase64) {
      return { type: 'text', text: `${item.title}\n${item.url ?? ''}\n${item.snippet ?? ''}` };
    }
    return [
      { type: 'text', text: `${item.title}\n${item.url ?? ''}\n${item.snippet ?? ''}` },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: asBase64(item.screenshotBase64)
        }
      }
    ];
  }).flat();
  const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 1200,
      temperature: 0,
      system: prompt,
      messages: [{ role: 'user', content: contents }]
    })
  });
  if (!response.ok) throw new Error(`Anthropic API ${response.status}`);
  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = payload.content?.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('') ?? '[]';
  return mapRemoteResults(extractJson(text), items, taskIntent);
}

async function requestGemini(
  provider: ProviderConfig,
  prompt: string,
  items: JudgeItemInput[],
  taskIntent: string
): Promise<JudgeItemResult[]> {
  const parts = items.map((item) => {
    if (item.type !== 'tab_vision_review' || !item.screenshotBase64) {
      return { text: `${item.title}\n${item.url ?? ''}\n${item.snippet ?? ''}` };
    }
    return [
      { text: `${item.title}\n${item.url ?? ''}\n${item.snippet ?? ''}` },
      { inline_data: { mime_type: 'image/jpeg', data: asBase64(item.screenshotBase64) } }
    ];
  }).flat();
  const response = await fetch(
    `${provider.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.model,
        contents: [{ role: 'user', parts }],
        systemInstruction: { parts: [{ text: prompt }] }
      })
    }
  );
  if (!response.ok) throw new Error(`Gemini API ${response.status}`);
  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '[]';
  return mapRemoteResults(extractJson(text), items, taskIntent);
}

async function requestJev(
  provider: ProviderConfig,
  req: JudgeBatchRequest
): Promise<JudgeItemResult[]> {
  const CONCURRENCY = 8;
  const results: JudgeItemResult[] = [];
  for (let start = 0; start < req.items.length; start += CONCURRENCY) {
    const batch = req.items.slice(start, start + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        try {
          const payload = await requestZev(provider, buildZevState(item, req.taskIntent));
          return mapZevAnswer(payload, item);
        } catch (err) {
          console.warn(`[DeNoise] Zleap Zev-1 item ${item.id} fallback:`, err);
          return localSemanticJudge(item, req.taskIntent);
        }
      })
    );
    results.push(...batchResults);
  }
  return results;
}

async function remoteJudge(
  provider: ProviderConfig,
  req: JudgeBatchRequest
): Promise<JudgeItemResult[]> {
  const format = provider.apiFormat || (provider.id === 'jev' ? 'zleap' : provider.id === 'anthropic' ? 'anthropic' : provider.id === 'gemini' ? 'gemini' : 'openai');
  if (provider.id === 'jev' || format === 'zleap') {
    return requestJev(provider, req);
  }
  const prompt = buildPrompt(req.taskIntent, req.intensity, req.items);
  if (format === 'anthropic') {
    return requestAnthropic(provider, prompt, req.items, req.taskIntent);
  }
  if (format === 'gemini') {
    return requestGemini(provider, prompt, req.items, req.taskIntent);
  }
  return requestOpenAI(provider, prompt, req.items, req.taskIntent);
}

function hasUsableProviderAuth(provider?: ProviderConfig): boolean {
  if (!provider || !provider.enabled) return false;
  if (provider.id === 'ollama') return Boolean(provider.baseUrl.trim());
  return Boolean(provider.apiKey && provider.apiKey.trim() !== '');
}

export async function judgeBatch(req: JudgeBatchRequest): Promise<JudgeItemResult[]> {
  if (req.items.length === 0) return [];

  // Stage 1: Fast direct domain rule pre-filter for tab items
  const preResolved = new Map<string, JudgeItemResult>();
  const remainingItems: JudgeItemInput[] = [];

  for (const item of req.items) {
    if (item.type !== 'feed_card' && item.url) {
      const stage1 = matchDomainStage1(item.url);
      if (stage1.stage1 === 'direct_learning') {
        preResolved.set(item.id, {
          id: item.id,
          relevanceScore: 96,
          confidence: 0.98,
          decision: 'keep',
          reasonTag: stage1.reasonTag
        });
        continue;
      }
      if (stage1.stage1 === 'direct_park') {
        preResolved.set(item.id, {
          id: item.id,
          relevanceScore: 4,
          confidence: 0.98,
          decision: item.type === 'tab_initial' ? 'close' : 'park',
          reasonTag: stage1.reasonTag
        });
        continue;
      }
      if (stage1.stage1 === 'content_check') {
        const verdict = evaluateStage2ContentHeuristics({
          taskIntent: req.taskIntent,
          title: item.title,
          snippet: item.snippet,
          url: item.url
        });
        if (verdict.decisive) {
          preResolved.set(item.id, {
            id: item.id,
            relevanceScore: verdict.relevanceScore,
            confidence: 0.9,
            decision: verdict.isRelevant
              ? 'keep'
              : item.type === 'tab_initial'
                ? 'park'
                : 'blur',
            reasonTag: verdict.reasonTag
          });
          continue;
        }
      }
    }
    remainingItems.push(item);
  }

  if (remainingItems.length === 0) {
    return req.items.map((item) => preResolved.get(item.id)!);
  }

  const settings = await getAppSettings();
  const visionCandidate = settings.providers[settings.visionReviewProvider];
  const hasVisionRequest = remainingItems.some(
    (item) => item.type === 'tab_vision_review' && Boolean(item.screenshotBase64)
  );
  const canUseVision =
    hasVisionRequest &&
    Boolean(visionCandidate?.supportsVision && hasUsableProviderAuth(visionCandidate));
  const preferredId: ProviderId = canUseVision
    ? settings.visionReviewProvider
    : settings.primaryFastProvider;
  const preferred = settings.providers[preferredId];
  const fallbackOrder: ProviderId[] = ['deepseek', 'custom', 'openai', 'gemini', 'anthropic', 'ollama', 'jev'];
  const provider =
    hasUsableProviderAuth(preferred)
      ? preferred
      : fallbackOrder
          .map((id) => settings.providers[id])
          .find((candidate) => hasUsableProviderAuth(candidate));

  const judgedRequest: JudgeBatchRequest = canUseVision
    ? { ...req, items: remainingItems }
    : {
      ...req,
      items: remainingItems.map((item) => ({ ...item, screenshotBase64: undefined }))
    };
  let judgedRemaining: JudgeItemResult[] | null = null;
  if (provider && hasUsableProviderAuth(provider)) {
    try {
      judgedRemaining = await remoteJudge(provider, judgedRequest);
    } catch (err) {
      console.warn('[DeNoise] Remote judge failed, using local semantic fallback:', err);
    }
  }
  if (!judgedRemaining) {
    judgedRemaining = remainingItems.map((item) => localSemanticJudge(item, req.taskIntent));
  }
  const byId = new Map<string, JudgeItemResult>(preResolved);
  for (const res of judgedRemaining) {
    byId.set(res.id, res);
  }
  return req.items.map((item) => byId.get(item.id) ?? localSemanticJudge(item, req.taskIntent));
}

async function requestProviderMessage(provider: ProviderConfig, message: string): Promise<string> {
  const format = provider.apiFormat || (provider.id === 'anthropic' ? 'anthropic' : provider.id === 'gemini' ? 'gemini' : 'openai');
  if (format === 'anthropic') {
    const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 64,
        messages: [{ role: 'user', content: message }]
      })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { content?: Array<{ text?: string }> };
    return payload.content?.map((part) => part.text ?? '').join('') ?? '';
  }

  if (format === 'gemini') {
    const response = await fetch(
      `${provider.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: provider.model,
          contents: [{ role: 'user', parts: [{ text: message }] }]
        })
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
  }

  const response = await fetchOpenAICompatibleChat(provider, {
    model: provider.model,
    temperature: 0,
    max_tokens: 64,
    messages: [{ role: 'user', content: message }]
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content ?? '';
}

/**
 * 用轻量文本请求拿到一段纯文本（专注复盘小票用），DeepSeek 走关闭思考链的极速路径。
 */
async function requestProviderText(
  provider: ProviderConfig,
  prompt: string,
  maxTokens = 320
): Promise<string> {
  const format =
    provider.apiFormat ||
    (provider.id === 'anthropic' ? 'anthropic' : provider.id === 'gemini' ? 'gemini' : 'openai');

  if (format === 'anthropic') {
    const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as { content?: Array<{ text?: string }> };
    return payload.content?.map((part) => part.text ?? '').join('') ?? '';
  }

  if (format === 'gemini') {
    const response = await fetch(
      `${provider.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 }
        })
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return (
      payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
    );
  }

  const response = await fetchOpenAICompatibleChat(provider, {
    model: provider.model,
    temperature: 0.4,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }]
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return payload.choices?.[0]?.message?.content ?? '';
}

export interface RetrospectiveInput {
  taskIntent: string;
  intensity: 'gentle' | 'standard' | 'strict';
  durationMinutes: number;
  blurredCount: number;
  parkedCount: number;
  driftCount: number;
  visionProtected: number;
  learningTitles: string[];
  timeline: Array<{ label: string; type: string }>;
}

export interface RetrospectiveOutput {
  badge: string;
  summary: string;
  highlights: string[];
  modelUsed: string;
}

function intensityLabel(intensity: RetrospectiveInput['intensity']): string {
  if (intensity === 'strict') return '强力降噪';
  if (intensity === 'gentle') return '温和降噪';
  return '标准降噪';
}

function buildRetrospectiveFallback(input: RetrospectiveInput): RetrospectiveOutput {
  const focusRatio =
    input.durationMinutes > 0
      ? Math.min(100, Math.round(((input.durationMinutes * 60) / Math.max(1, input.durationMinutes * 60 + input.driftCount * 45)) * 100))
      : 0;
  const highlights = [
    `守住 ${input.learningTitles.length} 个学习页，挡掉 ${input.blurredCount} 条推荐流噪声`,
    input.parkedCount > 0
      ? `${input.parkedCount} 个偏航页面被收进暂存舱，没有直接消失`
      : '本次没有页面被强制收走，节奏很稳',
    input.driftCount > 0
      ? `出现 ${input.driftCount} 次偏离提醒，其中多数在提醒后回到了任务`
      : '全程没有触发偏离提醒'
  ];
  return {
    badge: focusRatio >= 90 ? '信号完整' : focusRatio >= 70 ? '轻微漏音' : '需要复听',
    summary: `这 ${input.durationMinutes} 分钟里，你把注意力留在「${input.taskIntent}」上，${intensityLabel(input.intensity)}替你压住了大部分推送和推荐流。`,
    highlights,
    modelUsed: 'local-heuristic'
  };
}

function parseRetrospectiveJson(raw: string): Partial<RetrospectiveOutput> | null {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Partial<RetrospectiveOutput>;
  } catch {
    return null;
  }
}

export async function generateFocusRetrospective(
  input: RetrospectiveInput
): Promise<RetrospectiveOutput> {
  const settings = await getAppSettings();
  const order: ProviderId[] = ['deepseek', 'custom', 'openai', 'gemini', 'anthropic', 'ollama'];
  const provider = order
    .map((id) => settings.providers[id])
    .find((candidate) => candidate && candidate.enabled && hasUsableProviderAuth(candidate));

  const fallback = buildRetrospectiveFallback(input);
  if (!provider) return fallback;

  const timelineText = input.timeline
    .slice(-10)
    .map((event) => `- [${event.type}] ${event.label}`)
    .join('\n');
  const prompt = [
    '你是专注工具 DeNoise 的复盘助手。根据下面这次专注会话的原始数据，写一段简短、克制、像真人教练的复盘。',
    '要求：',
    '1. 只输出 JSON，不要 markdown，不要多余解释。',
    '2. 字段：badge（4-6 个汉字，如「信号完整」「轻微漏音」）、summary（60-90 字，口语化，不要营销腔）、highlights（2-3 条，每条 20 字内，必须引用具体数字）。',
    '3. 不要编造数据里没有的内容，不要夸奖过度，不要出现「AI」「模型」等词。',
    '',
    `任务：${input.taskIntent}`,
    `模式：${intensityLabel(input.intensity)}`,
    `实际专注：${input.durationMinutes} 分钟`,
    `虚化推荐卡片：${input.blurredCount} 条`,
    `暂存/关闭页面：${input.parkedCount} 个`,
    `偏离提醒：${input.driftCount} 次`,
    `截图复核保住的页面：${input.visionProtected} 个`,
    `学习页：${input.learningTitles.slice(0, 6).join('、') || '无'}`,
    '关键事件：',
    timelineText || '- 无',
    '',
    '输出示例：{"badge":"信号完整","summary":"...","highlights":["...","..."]}'
  ].join('\n');

  try {
    const raw = await requestProviderText(provider, prompt, 320);
    const parsed = parseRetrospectiveJson(raw);
    if (!parsed?.summary) return fallback;
    return {
      badge: (parsed.badge || fallback.badge).slice(0, 8),
      summary: parsed.summary.trim().slice(0, 200),
      highlights: (parsed.highlights ?? fallback.highlights)
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, 3),
      modelUsed: `${provider.id}:${provider.model}`
    };
  } catch (err) {
    console.warn('[DeNoise] AI retrospective failed, using local summary:', err);
    return fallback;
  }
}

export async function testProviderConnection(
  provider: ProviderConfig
): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const startedAt = performance.now();
  try {
    if (provider.id !== 'ollama' && provider.apiKey.trim() === '') {
      return { ok: false, message: '未配置 API Key', latencyMs: Math.round(performance.now() - startedAt) };
    }
    let message: string;
    if (provider.id === 'jev') {
      if (!provider.model.trim()) {
        throw new Error('未填写模型名称，例如 Zev-1');
      }
      const payload = await requestZev(
        provider,
        '用户任务：复习线性代数特征值。页面标题：线性代数中的特征值与特征向量讲解。内容摘要：课程讲解特征值定义、计算例题与应用。'
      );
      const choice = payload.answers?.disposition?.choice;
      const score = Number(payload.answers?.relevance?.score);
      if (!Number.isFinite(score)) {
        throw new Error('接口返回缺少 relevance.score');
      }
      message = `连接正常 · ${asString(choice, 'unknown')} · score ${score.toFixed(2)}`;
    } else {
      const text = await requestProviderMessage(provider, '请只返回：ok');
      message = text.trim() ? '连接正常' : '接口未返回内容';
    }
    return {
      ok: message.startsWith('连接正常'),
      message,
      latencyMs: Math.round(performance.now() - startedAt)
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : '连接失败',
      latencyMs: Math.round(performance.now() - startedAt)
    };
  }
}

export async function fetchProviderModels(
  provider: ProviderConfig
): Promise<{ ok: boolean; models: string[]; error?: string }> {
  const format =
    provider.apiFormat ||
    (provider.id === 'anthropic' ? 'anthropic' : provider.id === 'gemini' ? 'gemini' : 'openai');
  const baseUrl = provider.baseUrl.replace(/\/$/, '');
  if (!baseUrl) {
    return { ok: false, models: [], error: '未填写 Base URL' };
  }
  if (!provider.apiKey.trim() && provider.id !== 'ollama') {
    return { ok: false, models: [], error: '未填写 API Key' };
  }

  try {
    if (format === 'anthropic') {
      const response = await fetch(`${baseUrl}/models?limit=100`, {
        headers: {
          'x-api-key': provider.apiKey,
          'anthropic-version': '2023-06-01'
        }
      });
      if (!response.ok) {
        return { ok: false, models: [], error: `HTTP ${response.status}` };
      }
      const payload = (await response.json()) as { data?: Array<{ id?: string }> };
      return {
        ok: true,
        models: (payload.data ?? []).map((item) => item.id ?? '').filter(Boolean)
      };
    }

    if (format === 'gemini') {
      const response = await fetch(
        `${baseUrl}/models?key=${encodeURIComponent(provider.apiKey)}&pageSize=200`
      );
      if (!response.ok) {
        return { ok: false, models: [], error: `HTTP ${response.status}` };
      }
      const payload = (await response.json()) as {
        models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
      };
      return {
        ok: true,
        models: (payload.models ?? [])
          .filter((item) =>
            (item.supportedGenerationMethods ?? []).includes('generateContent')
          )
          .map((item) => (item.name ?? '').replace(/^models\//, ''))
          .filter(Boolean)
      };
    }

    const headers: Record<string, string> = {};
    if (provider.apiKey.trim()) {
      headers.Authorization = `Bearer ${provider.apiKey}`;
    }
    const response = await fetch(`${baseUrl}/models`, { headers });
    if (!response.ok) {
      return { ok: false, models: [], error: `HTTP ${response.status}` };
    }
    const payload = (await response.json()) as {
      data?: Array<{ id?: string }>;
      models?: Array<{ name?: string }>;
    };
    const ids = payload.data
      ? payload.data.map((item) => item.id ?? '')
      : (payload.models ?? []).map((item) => item.name ?? '');
    return {
      ok: true,
      models: ids
        .map((id) => id.replace(/^models\//, ''))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    };
  } catch (err) {
    return {
      ok: false,
      models: [],
      error: err instanceof Error ? err.message : '拉取模型列表失败'
    };
  }
}

function cleanRawPageTitle(raw: string): string {
  let cleaned = (raw || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  // Strip common site suffixes like "_哔哩哔哩_bilibili", "- 知乎", "- Google 搜索", etc.
  cleaned = cleaned
    .replace(/_哔哩哔哩_bilibili.*$/i, '')
    .replace(/\s*[-_|—–·]\s*(哔哩哔哩|bilibili|知乎|CSDN|掘金|稀土掘金|博客园|简书|YouTube|Google\s*搜索|Google|Bing|百度搜索|百度|GitHub|Stack\s*Overflow|LeetCode|力扣|小红书|抖音).*$/i, '')
    .trim();

  // Strip clickbait leading bracket tags like 【全网最全】【保姆级】[2026最新]
  cleaned = cleaned
    .replace(/^(?:\s*(?:【[^】]{1,14}】|\[[^\]]{1,14}\]|《[^》]{1,14}》))\s*/g, '')
    .trim();

  return cleaned;
}

function localExtractTask(title: string, headings: string[], url: string): string {
  const candidates = [
    ...headings.filter((h) => h && h.trim().length >= 4 && !/^(目录|评论|推荐|相关|登录|首页)$/.test(h.trim())),
    title
  ]
    .map(cleanRawPageTitle)
    .filter(Boolean);

  const primary = candidates[0] || cleanRawPageTitle(title);
  if (primary) {
    // Split by strong sentence punctuation and pick the most substantive subject clause
    const clauses = primary
      .split(/[！!？?。；;|｜]+/)
      .map((c) =>
        c
          .replace(/^(?:\d+\s*(?:分钟|小时|天)|一口气|手把手|零基础|全网最全|超详细)\s*(?:吃透|学会|掌握|搞懂|讲透)?\s*/i, '')
          .replace(/\s+/g, ' ')
          .trim()
      )
      .filter((c) => c.length >= 3);

    const bestClause = clauses[0] || primary;
    // Add a natural space between ASCII words and CJK characters for readability
    const spaced = bestClause
      .replace(/([A-Za-z0-9+#.]+)(?=[\u4e00-\u9fff])/g, '$1 ')
      .replace(/([\u4e00-\u9fff])(?=[A-Za-z0-9+#.]+)/g, '$1 ')
      .replace(/\s+/g, ' ')
      .trim();

    const hasActionVerb = /^(学习|复习|研究|掌握|排查|撰写|阅读|刷|精读|攻克|实操|理解)/.test(spaced);
    const formatted = hasActionVerb ? spaced : `学习 ${spaced}`;
    return formatted.slice(0, 26).trim();
  }

  try {
    const parsedUrl = new URL(url);
    const q = parsedUrl.searchParams.get('q') || parsedUrl.searchParams.get('keyword') || parsedUrl.searchParams.get('wd');
    if (q && q.trim()) {
      return `检索学习 ${q.trim()}`.slice(0, 24);
    }
  } catch {
    // Ignore invalid URL
  }
  return '专注学习当前课程资料';
}

export async function extractTaskFromText(
  title: string,
  headings: string[],
  url: string,
  description = ''
): Promise<string> {
  const settings = await getAppSettings();
  const llmOrder: ProviderId[] = [
    settings.primaryFastProvider,
    settings.visionReviewProvider,
    'deepseek',
    'custom',
    'openai',
    'gemini',
    'anthropic',
    'ollama'
  ];
  const provider = llmOrder
    .filter((id): id is ProviderId => Boolean(id) && id !== 'jev')
    .map((id) => settings.providers[id])
    .find((candidate) => hasUsableProviderAuth(candidate));

  const cleanedTitle = cleanRawPageTitle(title);
  const message =
    `你是专注力学习助手。请从当前网页信息中提炼一个清晰、自然、准确的中文专注学习目标（8~22个字，保留英文专有名词之间的空格，去掉营销词和网站后缀）。\n` +
    `示例输入：标题="【全网最全】DeepSeek Harness超详细教程！50分钟吃透DSH，让SuperAgent给你干活！_哔哩哔哩_bilibili"\n` +
    `示例输出：{"task":"学习 DeepSeek Harness 超详细教程"}\n` +
    `只返回 JSON 对象：{"task":"..."}\n` +
    `当前网页标题：${cleanedTitle || title}\n` +
    `页面核心标题组：${headings.slice(0, 5).join('；')}\n` +
    (description ? `页面简介：${description.slice(0, 160)}\n` : '') +
    `URL：${url}`;

  if (provider && provider.apiKey.trim() !== '') {
    try {
      const payload = extractJson(await requestProviderMessage(provider, message)) as { task?: unknown };
      if (typeof payload.task === 'string' && payload.task.trim()) {
        return payload.task.replace(/\s+/g, ' ').trim().slice(0, 26);
      }
    } catch (err) {
      console.warn('[DeNoise] Task extraction fallback:', err);
    }
  }
  return localExtractTask(title, headings, url);
}
