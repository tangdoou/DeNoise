import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  Info,
  Loader2,
  Plug,
  Plus,
  RotateCcw,
  Save,
  Shield,
  ShieldCheck,
  Sliders,
  X
} from 'lucide-react';
import { DEFAULT_SETTINGS, PROVIDER_MODEL_PRESETS, STORAGE_KEYS } from '../shared/constants';
import {
  computeFocusPeriodSummary,
  getAppSettings,
  getFocusHistoryRecords,
  saveAppSettings
} from '../shared/storage';
import {
  AppSettings,
  ExtensionMessage,
  FocusHistoryRecord,
  FocusPeriodSummary,
  ModelPreset,
  PeriodFocusReview,
  ProviderConfig,
  ProviderId
} from '../shared/types';
import { FocusReviewPanel } from './FocusReviewPanel';

const PROVIDER_ORDER: ProviderId[] = [
  'deepseek',
  'jev',
  'openai',
  'anthropic',
  'gemini',
  'custom',
  'ollama'
];

const PROVIDER_META: Record<
  ProviderId,
  {
    shortLabel: string;
    badge: string;
    description: string;
    placeholderModel: string;
    placeholderUrl: string;
  }
> = {
  jev: {
    shortLabel: 'Zleap Zev-1',
    badge: 'System-1 判别',
    description: 'Zleap System-1 决策接口，返回降噪选项与相关度评分，适合批量网页初筛。',
    placeholderModel: 'Zev-1',
    placeholderUrl: 'https://api.zleap.com/v1/systemone'
  },
  deepseek: {
    shortLabel: 'DeepSeek 官方直连',
    badge: 'V4.1 · 国内直连',
    description: 'DeepSeek 官方 API，V4.1-Flash 支持图文多模态与 1M 上下文，国内直连无需代理。',
    placeholderModel: 'deepseek-flash',
    placeholderUrl: 'https://api.deepseek.com/v1'
  },
  openai: {
    shortLabel: 'OpenAI 官方',
    badge: '通用 / 多模态',
    description: '兼容 OpenAI 官方接口及 OpenAI 协议中转端点。',
    placeholderModel: 'gpt-6-luna',
    placeholderUrl: 'https://api.openai.com/v1'
  },
  anthropic: {
    shortLabel: 'Anthropic Claude',
    badge: '通用 / 多模态',
    description: '支持 Claude 系列模型的语义理解与灰区页面截图多模态复核。',
    placeholderModel: 'claude-haiku-5-5',
    placeholderUrl: 'https://api.anthropic.com/v1'
  },
  gemini: {
    shortLabel: 'Google Gemini',
    badge: '通用 / 多模态',
    description: '支持 Google AI Studio 端点，具备文本初筛与网页截图多模态复核能力。',
    placeholderModel: 'gemini-4-hydrogen',
    placeholderUrl: 'https://generativelanguage.googleapis.com/v1beta'
  },
  custom: {
    shortLabel: '自定义服务商',
    badge: '中转 / 聚合',
    description: '硅基流动、OpenRouter、OneAPI 等兼容端点，可自选协议并拉取模型列表。',
    placeholderModel: 'deepseek-ai/DeepSeek-V4-Flash',
    placeholderUrl: 'https://api.siliconflow.cn/v1'
  },
  ollama: {
    shortLabel: '本地 Ollama',
    badge: '本地 / 免 Key',
    description: '直连本机 Ollama 服务，模型与推理全部留在本地，只需填写节点地址。',
    placeholderModel: 'qwen3:8b',
    placeholderUrl: 'http://localhost:11434/v1'
  }
};

interface ConnectionTestState {
  status: 'idle' | 'testing' | 'success' | 'error';
  latencyMs?: number;
  message?: string;
}

interface InfoTooltipProps {
  text: string;
  label?: string;
  align?: 'left' | 'right' | 'center';
  side?: 'top' | 'bottom';
  pill?: boolean;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({
  text,
  label,
  align = 'left',
  side = 'top',
  pill = false
}) => {
  const alignClass =
    align === 'right'
      ? 'right-0'
      : align === 'center'
        ? 'left-1/2 -translate-x-1/2'
        : 'left-0';
  const sideClass = side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2';

  return (
    <span className="group relative inline-flex items-center">
      <span
        tabIndex={0}
        className={
          pill
            ? 'inline-flex cursor-help items-center gap-1 rounded-full border border-[#E9E9E7] bg-[#F7F7F5] px-2 py-0.5 text-[11px] font-medium text-[#787774] transition-colors hover:border-[#D3D3CF] hover:text-[#191919] focus:outline-none'
            : 'inline-flex cursor-help items-center gap-1 text-[11.5px] text-[#787774] transition-colors hover:text-[#191919] focus:outline-none'
        }
      >
        <Info className="h-3.5 w-3.5 shrink-0" />
        {label ? <span>{label}</span> : null}
      </span>
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute z-50 w-[260px] max-w-[75vw] rounded-lg bg-[#191919] px-3 py-2 text-[11px] font-normal leading-relaxed text-white opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${alignClass} ${sideClass}`}
      >
        {text}
      </span>
    </span>
  );
};

function isProviderReady(provider: ProviderConfig): boolean {
  if (!provider.enabled) {
    return false;
  }
  if (provider.id === 'ollama') {
    return provider.baseUrl.trim().length > 0;
  }
  return provider.apiKey.trim().length > 0;
}

function normalizeDomainInput(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  let candidate = trimmed;
  if (/^https?:\/\//.test(candidate)) {
    try {
      candidate = new URL(candidate).hostname;
    } catch {
      return null;
    }
  } else {
    candidate = candidate.split('/')[0].split('?')[0].split('#')[0];
  }
  candidate = candidate.replace(/^www\./, '').replace(/:\d+$/, '').trim();
  if (!candidate || !candidate.includes('.') || /\s/.test(candidate)) {
    return null;
  }
  return candidate;
}

async function sendExtensionMessage<T = any>(message: ExtensionMessage): Promise<T | null> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return null;
  }
  return await chrome.runtime.sendMessage(message);
}

export const OptionsApp: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    JSON.stringify(DEFAULT_SETTINGS)
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string>('');

  const [visibleKeys, setVisibleKeys] = useState<Record<ProviderId, boolean>>({
    jev: false,
    deepseek: false,
    openai: false,
    anthropic: false,
    gemini: false,
    custom: false,
    ollama: false
  });

  const [testStates, setTestStates] = useState<Record<ProviderId, ConnectionTestState>>({
    jev: { status: 'idle' },
    deepseek: { status: 'idle' },
    openai: { status: 'idle' },
    anthropic: { status: 'idle' },
    gemini: { status: 'idle' },
    custom: { status: 'idle' },
    ollama: { status: 'idle' }
  });

  const [openModelDrawer, setOpenModelDrawer] = useState<ProviderId | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<ProviderId | null>(null);
  const modelFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [remoteModels, setRemoteModels] = useState<Record<string, string[]>>({});
  const [modelFetchState, setModelFetchState] = useState<
    Record<string, { status: 'idle' | 'loading' | 'error'; message?: string }>
  >({});

  const [domainInput, setDomainInput] = useState<string>('');
  const [domainError, setDomainError] = useState<string>('');
  const [activeView, setActiveView] = useState<'settings' | 'review'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'review' || window.location.hash === '#review') {
        return 'review';
      }
    }
    return 'settings';
  });
  const [activeSection, setActiveSection] = useState<'routing' | 'providers' | 'whitelist'>(
    'routing'
  );
  const [focusSummary, setFocusSummary] = useState<FocusPeriodSummary | null>(null);
  const [focusRecords, setFocusRecords] = useState<FocusHistoryRecord[]>([]);
  const [periodReview, setPeriodReview] = useState<PeriodFocusReview | null>(null);
  const [isGeneratingReview, setIsGeneratingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    void getAppSettings().then((loaded) => {
      if (!mounted) {
        return;
      }
      setSettings(loaded);
      setSavedSnapshot(JSON.stringify(loaded));
      setIsLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const loadFocusReviewData = useCallback(async () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        const res = (await chrome.runtime.sendMessage({ type: 'GET_FOCUS_STATS' })) as {
          ok?: boolean;
          data?: { summary?: FocusPeriodSummary; records?: FocusHistoryRecord[] };
        };
        if (res?.ok && res.data?.summary) {
          setFocusSummary(res.data.summary);
          setFocusRecords(res.data.records ?? []);
          return;
        }
      } catch {
        // Fall back to direct local storage reading.
      }
    }
    const records = await getFocusHistoryRecords();
    setFocusRecords(records);
    setFocusSummary(computeFocusPeriodSummary(records));
  }, []);

  useEffect(() => {
    void loadFocusReviewData();
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) {
      return;
    }
    const handleStorageChange = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      areaName: string
    ) => {
      if (areaName === 'local' && changes[STORAGE_KEYS.FOCUS_HISTORY]) {
        void loadFocusReviewData();
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [loadFocusReviewData]);

  const handleGeneratePeriodReview = async () => {
    if (isGeneratingReview) return;
    setIsGeneratingReview(true);
    setReviewError('');
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        const res = (await chrome.runtime.sendMessage({ type: 'GENERATE_PERIOD_REVIEW' })) as {
          ok?: boolean;
          data?: { review?: PeriodFocusReview };
          error?: string;
        };
        if (res?.ok && res.data?.review) {
          setPeriodReview(res.data.review);
          return;
        }
        setReviewError(res?.error || '生成 AI 复盘失败，请检查模型配置后重试');
      } else {
        setReviewError('请在 Chrome 扩展页面中触发 AI 复盘');
      }
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : '生成 AI 复盘失败');
    } finally {
      setIsGeneratingReview(false);
    }
  };

  useEffect(() => {
    if (!openModelDrawer) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const container = modelFieldRefs.current[openModelDrawer];
      if (container && !container.contains(event.target as Node)) {
        setOpenModelDrawer(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenModelDrawer(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openModelDrawer]);

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(settings) !== savedSnapshot,
    [settings, savedSnapshot]
  );

  const showSavedFeedback = useCallback((text: string) => {
    setSaveToast(text);
    window.setTimeout(() => {
      setSaveToast((current) => (current === text ? '' : current));
    }, 2400);
  }, []);

  const handleSaveAll = useCallback(
    async (label = '配置已保存') => {
      setIsSaving(true);
      try {
        await saveAppSettings(settings);
        setSavedSnapshot(JSON.stringify(settings));
        showSavedFeedback(label);
      } finally {
        setIsSaving(false);
      }
    },
    [settings, showSavedFeedback]
  );

  const updateProviderField = <K extends keyof ProviderConfig>(
    providerId: ProviderId,
    field: K,
    value: ProviderConfig[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      providers: {
        ...prev.providers,
        [providerId]: {
          ...(prev.providers[providerId] ?? DEFAULT_SETTINGS.providers[providerId]),
          [field]: value
        }
      }
    }));
  };

  const handleSelectModelPreset = (providerId: ProviderId, preset: ModelPreset) => {
    setSettings((prev) => {
      const current = prev.providers[providerId] ?? DEFAULT_SETTINGS.providers[providerId];
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [providerId]: {
            ...current,
            model: preset.id,
            ...(preset.supportsVision !== undefined && providerId !== 'jev'
              ? { supportsVision: preset.supportsVision }
              : {})
          }
        }
      };
    });
    setOpenModelDrawer(null);
  };

  const handleTestProvider = async (providerId: ProviderId) => {
    const providerConfig =
      settings.providers[providerId] ?? DEFAULT_SETTINGS.providers[providerId];
    if (!providerConfig.apiKey.trim() && providerId !== 'ollama') {
      setTestStates((prev) => ({
        ...prev,
        [providerId]: {
          status: 'error',
          message: '请先填写 API Key 再进行连通性测试'
        }
      }));
      return;
    }
    if (!providerConfig.baseUrl.trim()) {
      setTestStates((prev) => ({
        ...prev,
        [providerId]: {
          status: 'error',
          message: '请先填写 Base URL 再进行连通性测试'
        }
      }));
      return;
    }

    setTestStates((prev) => ({
      ...prev,
      [providerId]: { status: 'testing', message: '正在验证接口连通性...' }
    }));

    const startedAt = performance.now();
    try {
      const response = await sendExtensionMessage<{
        ok?: boolean;
        success?: boolean;
        data?: {
          ok?: boolean;
          latencyMs?: number;
          message?: string;
        };
        latencyMs?: number;
        message?: string;
        error?: string;
      }>({
        type: 'TEST_PROVIDER_CONNECTION',
        payload: { providerConfig }
      });

      if (!response) {
        setTestStates((prev) => ({
          ...prev,
          [providerId]: {
            status: 'error',
            message: '后台服务未响应，请确认已在 Chrome 扩展环境中加载'
          }
        }));
        return;
      }

      const inner = response.data;
      const elapsedMs =
        typeof inner?.latencyMs === 'number'
          ? Math.round(inner.latencyMs)
          : typeof response.latencyMs === 'number'
            ? Math.round(response.latencyMs)
            : Math.round(performance.now() - startedAt);
      const isSuccess =
        inner && typeof inner.ok === 'boolean'
          ? Boolean(response.ok !== false && inner.ok)
          : Boolean(response.ok ?? response.success);
      const resolvedMessage =
        inner?.message || response.error || response.message;

      setTestStates((prev) => ({
        ...prev,
        [providerId]: isSuccess
          ? {
              status: 'success',
              latencyMs: elapsedMs,
              message: resolvedMessage || '连接正常'
            }
          : {
              status: 'error',
              latencyMs: elapsedMs,
              message: resolvedMessage || '接口校验失败，请检查 Base URL、Key 或模型名'
            }
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : '请求异常';
      setTestStates((prev) => ({
        ...prev,
        [providerId]: {
          status: 'error',
          message
        }
      }));
    }
  };

  const handleFetchRemoteModels = async (providerId: ProviderId) => {
    const config = settings.providers[providerId] ?? DEFAULT_SETTINGS.providers[providerId];
    if (!config.baseUrl.trim()) {
      setModelFetchState((prev) => ({
        ...prev,
        [providerId]: { status: 'error', message: '请先填写 Base URL' }
      }));
      return;
    }
    if (!config.apiKey.trim() && providerId !== 'ollama') {
      setModelFetchState((prev) => ({
        ...prev,
        [providerId]: { status: 'error', message: '请先填写 API Key' }
      }));
      return;
    }

    setModelFetchState((prev) => ({
      ...prev,
      [providerId]: { status: 'loading' }
    }));

    try {
      const response = await sendExtensionMessage<{
        ok?: boolean;
        data?: { models?: string[]; error?: string };
        error?: string;
      }>({
        type: 'FETCH_PROVIDER_MODELS',
        payload: { providerConfig: config }
      });

      const models = response?.data?.models ?? [];
      if (!response || response.ok === false || models.length === 0) {
        setModelFetchState((prev) => ({
          ...prev,
          [providerId]: {
            status: 'error',
            message:
              response?.data?.error ||
              response?.error ||
              '端点未返回模型列表，可手动填写模型名'
          }
        }));
        return;
      }

      setRemoteModels((prev) => ({ ...prev, [providerId]: models }));
      setModelFetchState((prev) => ({
        ...prev,
        [providerId]: { status: 'idle', message: `已拉取 ${models.length} 个模型` }
      }));
      setOpenModelDrawer(providerId);
    } catch (err) {
      setModelFetchState((prev) => ({
        ...prev,
        [providerId]: {
          status: 'error',
          message: err instanceof Error ? err.message : '拉取模型列表失败'
        }
      }));
    }
  };

  const handleAddWhitelistDomain = () => {
    const normalized = normalizeDomainInput(domainInput);
    if (!normalized) {
      setDomainError('请输入有效域名，例如 arxiv.org 或 github.com');
      return;
    }
    if (settings.globalWhitelistDomains.includes(normalized)) {
      setDomainError(`域名 ${normalized} 已存在于白名单中`);
      return;
    }
    setSettings((prev) => ({
      ...prev,
      globalWhitelistDomains: [...prev.globalWhitelistDomains, normalized]
    }));
    setDomainInput('');
    setDomainError('');
  };

  const handleRemoveWhitelistDomain = (domain: string) => {
    setSettings((prev) => ({
      ...prev,
      globalWhitelistDomains: prev.globalWhitelistDomains.filter((item) => item !== domain)
    }));
  };

  const handleRestoreDefaultWhitelist = () => {
    setSettings((prev) => ({
      ...prev,
      globalWhitelistDomains: [...DEFAULT_SETTINGS.globalWhitelistDomains]
    }));
    setDomainError('');
  };

  const scrollToSection = (sectionId: 'routing' | 'providers' | 'whitelist') => {
    setActiveView('settings');
    setActiveSection(sectionId);
    window.requestAnimationFrame(() => {
      const element = document.getElementById(`section-${sectionId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const selectedFastProvider =
    settings.providers[settings.primaryFastProvider] ?? DEFAULT_SETTINGS.providers.jev;
  const selectedVisionProvider =
    settings.providers[settings.visionReviewProvider] ?? DEFAULT_SETTINGS.providers.openai;
  const fastProviderReady = isProviderReady(selectedFastProvider);
  const readyProvidersCount = PROVIDER_ORDER.filter((id) =>
    isProviderReady(settings.providers[id] ?? DEFAULT_SETTINGS.providers[id])
  ).length;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F5] text-[#787774]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#191919] font-sans">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-5 px-5 py-7 md:flex-row md:items-start md:px-8">
        <aside className="w-full shrink-0 md:sticky md:top-7 md:w-[208px]">
          <div className="rounded-lg border border-[#E9E9E7] bg-white p-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#191919] text-white">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M1.5 8H4L5.5 4.2L7.3 11.8L9 6.2L10.3 8H14.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div>
                <div className="text-[14px] font-semibold tracking-tight text-[#191919]">
                  DeNoise
                </div>
                <div className="text-[11px] text-[#787774]">偏好设置</div>
              </div>
            </div>

            <nav className="mt-3.5 space-y-1 border-t border-[#E9E9E7] pt-3">
              <button
                type="button"
                onClick={() => setActiveView('review')}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors ${
                  activeView === 'review'
                    ? 'bg-[#EFEFED] text-[#191919]'
                    : 'text-[#787774] hover:bg-[#F7F7F5] hover:text-[#191919]'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>专注回顾</span>
                </span>
                <span className="rounded bg-[#0F7B6C]/10 px-1.5 py-0.2 font-mono text-[10px] text-[#0F7B6C]">
                  热力图
                </span>
              </button>

              <div className="my-1.5 border-t border-[#E9E9E7]" />

              <button
                type="button"
                onClick={() => scrollToSection('routing')}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors ${
                  activeView === 'settings' && activeSection === 'routing'
                    ? 'bg-[#EFEFED] text-[#191919]'
                    : 'text-[#787774] hover:bg-[#F7F7F5] hover:text-[#191919]'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>引擎路由</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('providers')}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors ${
                  activeView === 'settings' && activeSection === 'providers'
                    ? 'bg-[#EFEFED] text-[#191919]'
                    : 'text-[#787774] hover:bg-[#F7F7F5] hover:text-[#191919]'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" />
                <span>AI 供应商</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('whitelist')}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors ${
                  activeView === 'settings' && activeSection === 'whitelist'
                    ? 'bg-[#EFEFED] text-[#191919]'
                    : 'text-[#787774] hover:bg-[#F7F7F5] hover:text-[#191919]'
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                <span>域名白名单</span>
              </button>
            </nav>

            <div className="mt-3.5 flex items-center justify-between border-t border-[#E9E9E7] pt-3 text-[11.5px] text-[#787774]">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#0F7B6C]" />
                <span>Key 仅存本机</span>
              </span>
              <InfoTooltip
                text="所有 API Key 仅保存于本机 chrome.storage.local，扩展后台直连供应商，无第三方中转。"
                align="left"
                side="top"
              />
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-5">
          {activeView === 'review' ? (
            focusSummary ? (
              <FocusReviewPanel
                summary={focusSummary}
                records={focusRecords}
                periodReview={periodReview}
                isGeneratingReview={isGeneratingReview}
                reviewError={reviewError}
                onGenerateReview={() => void handleGeneratePeriodReview()}
              />
            ) : (
              <div className="flex items-center justify-center rounded-lg border border-[#E9E9E7] bg-white py-16 text-[12.5px] text-[#787774]">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                <span>加载专注回顾数据...</span>
              </div>
            )
          ) : (
            <>
          <header className="sticky top-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E9E9E7] bg-white/95 px-5 py-3.5 backdrop-blur-sm">
            <h1 className="text-[16px] font-semibold tracking-tight text-[#191919]">
              引擎与降噪设置
            </h1>

            <div className="flex items-center gap-2.5">
              {saveToast ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-[#0F7B6C]/25 bg-[#0F7B6C]/10 px-2.5 py-1 text-[12px] font-medium text-[#0F7B6C]">
                  <Check className="h-3.5 w-3.5" />
                  <span>{saveToast}</span>
                </span>
              ) : hasUnsavedChanges ? (
                <span className="text-[12px] text-[#D9730D]">未保存更改</span>
              ) : null}

              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveAll('全部配置已保存')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#191919] px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-[#2F2F2F] disabled:opacity-60"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span>保存配置</span>
              </button>
            </div>
          </header>

          <section
            id="section-routing"
            className="scroll-mt-20 rounded-lg border border-[#E9E9E7] bg-white p-5"
          >
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[14.5px] font-semibold text-[#191919]">
                  双引擎路由
                </h2>
                <InfoTooltip
                  text="分别指定日常推荐流与标签页初筛引擎，以及强力模式下对灰区页面截图二次核验的复核引擎。"
                  side="bottom"
                  align="left"
                />
              </div>
              <InfoTooltip
                pill
                label="存疑仅折叠"
                text="复核引擎未开启看图或尚未截到图时，退回 DOM 语义骨架判断；仍存疑页面只折叠进休息舱，不关闭。"
                side="bottom"
                align="right"
              />
            </div>

            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <div className="rounded-lg border border-[#E9E9E7] bg-[#F7F7F5] p-3.5">
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="primary-fast-provider"
                    className="text-[12.5px] font-medium text-[#191919]"
                  >
                    初筛引擎
                  </label>
                  <InfoTooltip
                    text="负责网页推荐流卡片与后台标签页的批量相关性初筛。"
                    side="top"
                    align="left"
                  />
                </div>
                <select
                  id="primary-fast-provider"
                  value={settings.primaryFastProvider}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      primaryFastProvider: event.target.value as ProviderId
                    }))
                  }
                  className="mt-2 w-full rounded-md border border-[#E9E9E7] bg-white px-3 py-2 text-[12.5px] font-medium text-[#191919] focus:border-[#191919] focus:outline-none"
                >
                  {PROVIDER_ORDER.map((id) => (
                    <option key={id} value={id}>
                      {PROVIDER_META[id].shortLabel}
                    </option>
                  ))}
                </select>

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="font-mono text-[#787774]">
                    {selectedFastProvider.model || '未填模型'}
                  </span>
                  <span
                    className={
                      fastProviderReady
                        ? 'text-[#0F7B6C]'
                        : 'text-[#D9730D]'
                    }
                  >
                    {fastProviderReady
                      ? '已就绪'
                      : !selectedFastProvider.enabled
                        ? '未启用'
                        : '缺 Key'}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-[#E9E9E7] bg-[#F7F7F5] p-3.5">
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="vision-review-provider"
                    className="text-[12.5px] font-medium text-[#191919]"
                  >
                    灰区复核
                  </label>
                  <InfoTooltip
                    text="强力模式下对灰区标签页结合静默截图与 DOM 骨架执行二次确认。"
                    side="top"
                    align="left"
                  />
                </div>
                <select
                  id="vision-review-provider"
                  value={settings.visionReviewProvider}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      visionReviewProvider: event.target.value as ProviderId
                    }))
                  }
                  className="mt-2 w-full rounded-md border border-[#E9E9E7] bg-white px-3 py-2 text-[12.5px] font-medium text-[#191919] focus:border-[#191919] focus:outline-none"
                >
                  {PROVIDER_ORDER.map((id) => (
                    <option key={id} value={id}>
                      {PROVIDER_META[id].shortLabel}
                    </option>
                  ))}
                </select>

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="font-mono text-[#787774]">
                    {selectedVisionProvider.model || '未填模型'}
                  </span>
                  <span
                    className={
                      selectedVisionProvider.supportsVision
                        ? 'text-[#0F7B6C]'
                        : 'text-[#D9730D]'
                    }
                  >
                    {selectedVisionProvider.supportsVision
                      ? 'Vision 已开启'
                      : '纯文本降级'}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section id="section-providers" className="scroll-mt-20 rounded-lg border border-[#E9E9E7] bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-[#E9E9E7] px-5 py-3.5">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[14.5px] font-semibold text-[#191919]">
                  AI 供应商
                </h2>
                <InfoTooltip
                  text="点击任意供应商展开配置，支持官方直连、自定义中转与本地 Ollama 节点。"
                  side="top"
                  align="left"
                />
              </div>
              <span className="text-[11.5px] text-[#787774]">
                已就绪 {readyProvidersCount} / {PROVIDER_ORDER.length}
              </span>
            </div>

            <div className="divide-y divide-[#E9E9E7]">
              {PROVIDER_ORDER.map((providerId, providerIndex) => {
              const defaults = DEFAULT_SETTINGS.providers[providerId];
              const config = settings.providers[providerId] ?? defaults;
              const meta = PROVIDER_META[providerId];
              const presets = PROVIDER_MODEL_PRESETS[providerId] ?? [];
              const fetchedModels = remoteModels[providerId] ?? [];
              const drawerPresets: ModelPreset[] = [
                ...presets,
                ...fetchedModels
                  .filter((id) => !presets.some((preset) => preset.id === id))
                  .map((id) => ({
                    id,
                    label: id,
                    badge: '从端点拉取',
                    description: '该模型由端点 /models 接口实时返回'
                  }))
              ];
              const fetchState = modelFetchState[providerId];
              const isDrawerOpen = openModelDrawer === providerId;
              const testState = testStates[providerId];
              const isKeyVisible = visibleKeys[providerId];
              const isPrimaryFast = settings.primaryFastProvider === providerId;
              const isVisionReview = settings.visionReviewProvider === providerId;
              const isExpanded = expandedProvider === providerId;
              const ready = isProviderReady(config);
              const isLastProvider = providerIndex === PROVIDER_ORDER.length - 1;
              const visionHint =
                providerId === 'jev'
                  ? 'Jev 专注纯文本结构化判别，默认关闭'
                  : providerId === 'deepseek'
                    ? 'DeepSeek 默认优先纯文本语义高速判别，开启后支持强力模式看图复核'
                    : '允许在强力模式灰区复核时发送网页截图';

              return (
                <article key={providerId}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => {
                      setOpenModelDrawer(null);
                      setExpandedProvider((prev) =>
                        prev === providerId ? null : providerId
                      );
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setOpenModelDrawer(null);
                        setExpandedProvider((prev) =>
                          prev === providerId ? null : providerId
                        );
                      }
                    }}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-[#FAFAF9] ${
                      isLastProvider && !isExpanded ? 'rounded-b-lg' : ''
                    }`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          ready
                            ? 'bg-[#0F7B6C]'
                            : config.enabled
                              ? 'bg-[#D9730D]'
                              : 'bg-[#D3D3CF]'
                        }`}
                      />
                      <span className="truncate text-[13px] font-medium text-[#191919]">
                        {meta.shortLabel}
                      </span>
                      {isPrimaryFast && (
                        <span className="shrink-0 rounded bg-[#191919] px-1.5 py-0.5 text-[10px] font-medium text-white">
                          初筛
                        </span>
                      )}
                      {isVisionReview && (
                        <span className="shrink-0 rounded border border-[#0F7B6C]/30 bg-[#0F7B6C]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#0F7B6C]">
                          复核
                        </span>
                      )}
                      <span className="hidden truncate font-mono text-[11.5px] text-[#787774] sm:inline">
                        {config.model || meta.placeholderModel}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className={`text-[11px] font-medium ${
                          ready
                            ? 'text-[#0F7B6C]'
                            : config.enabled
                              ? 'text-[#D9730D]'
                              : 'text-[#787774]/80'
                        }`}
                      >
                        {ready ? '就绪' : config.enabled ? '缺 Key' : '未启用'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={config.enabled}
                        aria-label={`启用 ${meta.shortLabel}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          updateProviderField(providerId, 'enabled', !config.enabled);
                        }}
                        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                          config.enabled ? 'bg-[#191919]' : 'bg-[#D3D3CF]'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            config.enabled ? 'translate-x-[14px]' : 'translate-x-[2px]'
                          }`}
                        />
                      </button>
                      <ChevronDown
                        className={`h-4 w-4 text-[#787774] transition-transform ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div
                      className={`border-t border-[#E9E9E7] bg-[#FAFAF9] px-5 py-4 ${
                        isLastProvider ? 'rounded-b-lg' : ''
                      }`}
                    >
                      <div className="mb-3 flex items-center gap-1.5">
                        <span className="rounded border border-[#E9E9E7] bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-[#787774]">
                          {meta.badge}
                        </span>
                        <InfoTooltip text={meta.description} side="top" align="left" />
                      </div>

                      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                        <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label
                          htmlFor={`base-url-${providerId}`}
                          className="text-[12px] font-medium text-[#191919]"
                        >
                          Base URL
                        </label>
                        {config.baseUrl !== defaults.baseUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              updateProviderField(providerId, 'baseUrl', defaults.baseUrl)
                            }
                            className="text-[11px] text-[#787774] underline underline-offset-2 hover:text-[#191919]"
                          >
                            恢复默认
                          </button>
                        )}
                      </div>
                      <input
                        id={`base-url-${providerId}`}
                        type="url"
                        value={config.baseUrl}
                        onChange={(event) =>
                          updateProviderField(providerId, 'baseUrl', event.target.value)
                        }
                        placeholder={meta.placeholderUrl || defaults.baseUrl}
                        className="w-full rounded-md border border-[#E9E9E7] bg-white px-3 py-2 font-mono text-[12px] text-[#191919] placeholder:text-[#787774]/70 focus:border-[#191919] focus:outline-none"
                      />
                      {providerId === 'custom' && (
                        <div className="mt-2">
                          <label
                            htmlFor={`api-format-${providerId}`}
                            className="mb-1 block text-[11.5px] font-medium text-[#191919]"
                          >
                            接口格式
                          </label>
                          <select
                            id={`api-format-${providerId}`}
                            value={config.apiFormat ?? 'openai'}
                            onChange={(event) =>
                              updateProviderField(
                                providerId,
                                'apiFormat',
                                event.target.value as ProviderConfig['apiFormat']
                              )
                            }
                            className="w-full rounded-md border border-[#E9E9E7] bg-white px-2.5 py-1.5 text-[12px] text-[#191919] focus:border-[#191919] focus:outline-none"
                          >
                            <option value="openai">OpenAI 兼容 (/chat/completions)</option>
                            <option value="anthropic">Anthropic (/messages)</option>
                            <option value="gemini">Gemini (generateContent)</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div
                      className={`relative ${isDrawerOpen ? 'z-40' : ''}`}
                      ref={(node) => {
                        modelFieldRefs.current[providerId] = node;
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label
                          htmlFor={`model-${providerId}`}
                          className="text-[12px] font-medium text-[#191919]"
                        >
                          Model Name
                        </label>
                      </div>

                      <div className="relative">
                        <input
                          id={`model-${providerId}`}
                          type="text"
                          value={config.model}
                          onChange={(event) =>
                            updateProviderField(providerId, 'model', event.target.value)
                          }
                          placeholder={meta.placeholderModel}
                          className="w-full rounded-md border border-[#E9E9E7] bg-white py-2 pl-3 pr-24 font-mono text-[12px] text-[#191919] placeholder:text-[#787774]/70 focus:border-[#191919] focus:outline-none"
                        />
                        {drawerPresets.length > 0 && (
                          <button
                            type="button"
                            aria-expanded={isDrawerOpen}
                            aria-label="打开模型预设列表"
                            onClick={() =>
                              setOpenModelDrawer((prev) =>
                                prev === providerId ? null : providerId
                              )
                            }
                            className={`absolute right-1.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                              isDrawerOpen
                                ? 'bg-[#191919] text-white'
                                : 'text-[#787774] hover:bg-[#EFEFED] hover:text-[#191919]'
                            }`}
                          >
                            <span>选择模型</span>
                            <ChevronDown
                              className={`h-3 w-3 transition-transform ${
                                isDrawerOpen ? 'rotate-180' : ''
                              }`}
                            />
                          </button>
                        )}
                      </div>

                      {isDrawerOpen && drawerPresets.length > 0 && (
                        <div className="absolute left-0 right-0 top-full z-40 mt-1.5 rounded-lg border border-[#E9E9E7] bg-white p-2 shadow-lg">
                          <div className="mb-1.5 flex items-center justify-between px-1.5 text-[11px] text-[#787774]">
                            <span>选择模型</span>
                            <button
                              type="button"
                              onClick={() => setOpenModelDrawer(null)}
                              className="rounded p-0.5 text-[#787774] hover:bg-[#F7F7F5] hover:text-[#191919]"
                              aria-label="关闭模型抽屉"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          {(providerId === 'custom' || providerId === 'ollama') && (
                            <div className="mb-1.5 flex items-center justify-between gap-2 rounded-md bg-[#F7F7F5] px-2 py-1.5">
                              <span className="text-[10.5px] text-[#787774]">
                                {fetchState?.message ||
                                  (providerId === 'ollama'
                                    ? '读取本地已下载模型'
                                    : '读取端点模型列表')}
                              </span>
                              <button
                                type="button"
                                disabled={fetchState?.status === 'loading'}
                                onClick={() => void handleFetchRemoteModels(providerId)}
                                className="inline-flex shrink-0 items-center gap-1 rounded border border-[#E9E9E7] bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-[#191919] hover:bg-[#EFEFED] disabled:opacity-60"
                              >
                                {fetchState?.status === 'loading' ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-3 w-3" />
                                )}
                                <span>拉取模型</span>
                              </button>
                            </div>
                          )}
                          <div className="max-h-60 space-y-1 overflow-y-auto pr-0.5">
                            {drawerPresets.map((preset) => {
                              const isSelected = config.model === preset.id;
                              return (
                                <button
                                  key={preset.id}
                                  type="button"
                                  onClick={() =>
                                    handleSelectModelPreset(providerId, preset)
                                  }
                                  className={`flex w-full items-start justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                                    isSelected
                                      ? 'border-[#191919] bg-[#F7F7F5]'
                                      : 'border-transparent hover:border-[#E9E9E7] hover:bg-[#F7F7F5]/70'
                                  }`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-[12px] font-semibold text-[#191919]">
                                        {preset.label}
                                      </span>
                                      <code className="rounded bg-[#EFEFED] px-1.5 py-0.5 font-mono text-[11px] text-[#191919]">
                                        {preset.id}
                                      </code>
                                      {preset.badge && (
                                        <span className="rounded border border-[#0F7B6C]/25 bg-[#0F7B6C]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#0F7B6C]">
                                          {preset.badge}
                                        </span>
                                      )}
                                    </div>
                                    {preset.description && (
                                      <p className="mt-1 text-[11px] leading-snug text-[#787774]">
                                        {preset.description}
                                      </p>
                                    )}
                                  </div>
                                  <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                                    {isSelected && (
                                      <Check className="h-3.5 w-3.5 text-[#191919]" />
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor={`api-key-${providerId}`}
                        className="mb-1 block text-[12px] font-medium text-[#191919]"
                      >
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          id={`api-key-${providerId}`}
                          type={isKeyVisible ? 'text' : 'password'}
                          autoComplete="off"
                          value={config.apiKey}
                          onChange={(event) =>
                            updateProviderField(providerId, 'apiKey', event.target.value)
                          }
                          placeholder={
                            providerId === 'ollama' ? '本地节点可留空' : '粘贴你的 API Key'
                          }
                          className="w-full rounded-md border border-[#E9E9E7] bg-white py-2 pl-3 pr-9 font-mono text-[12px] text-[#191919] placeholder:text-[#787774]/70 focus:border-[#191919] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setVisibleKeys((prev) => ({
                              ...prev,
                              [providerId]: !prev[providerId]
                            }))
                          }
                          aria-label={isKeyVisible ? '隐藏 API Key' : '显示 API Key'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#787774] hover:text-[#191919]"
                        >
                          {isKeyVisible ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-md border border-[#E9E9E7] bg-white px-3 py-2">
                      <div className="flex items-center gap-1.5 pr-3">
                        <span className="text-[12px] font-medium text-[#191919]">
                          多模态看图 (Vision)
                        </span>
                        <InfoTooltip text={visionHint} side="top" align="left" />
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={config.supportsVision}
                        aria-label={`${meta.shortLabel} 支持多模态看图`}
                        onClick={() =>
                          updateProviderField(
                            providerId,
                            'supportsVision',
                            !config.supportsVision
                          )
                        }
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                          config.supportsVision ? 'bg-[#0F7B6C]' : 'bg-[#D3D3CF]'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            config.supportsVision ? 'translate-x-[18px]' : 'translate-x-[3px]'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-[#E9E9E7] pt-3">
                    <div className="min-w-0 flex-1 text-[12px]">
                      {testState.status === 'testing' && (
                        <span className="inline-flex items-center gap-1.5 text-[#787774]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>{testState.message}</span>
                        </span>
                      )}
                      {testState.status === 'success' && (
                        <span className="inline-flex items-center gap-1.5 font-medium text-[#0F7B6C]">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {testState.message}
                            {typeof testState.latencyMs === 'number' && (
                              <span className="ml-1.5 font-mono text-[11.5px]">
                                · {testState.latencyMs}ms
                              </span>
                            )}
                          </span>
                        </span>
                      )}
                      {testState.status === 'error' && (
                        <span className="inline-flex items-start gap-1.5 text-[#E03E3E]">
                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="break-all">
                            {testState.message}
                            {typeof testState.latencyMs === 'number' && (
                              <span className="ml-1 font-mono text-[11px] opacity-80">
                                ({testState.latencyMs}ms)
                              </span>
                            )}
                          </span>
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={testState.status === 'testing'}
                      onClick={() => handleTestProvider(providerId)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#E9E9E7] bg-white px-3 py-1.5 text-[12px] font-medium text-[#191919] transition-colors hover:bg-[#EFEFED] disabled:opacity-60"
                    >
                      {testState.status === 'testing' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plug className="h-3.5 w-3.5" />
                      )}
                      <span>测试连接</span>
                    </button>
                  </div>
                  </div>
                  )}
                </article>
              );
            })}
            </div>
          </section>

          <section
            id="section-whitelist"
            className="scroll-mt-20 rounded-lg border border-[#E9E9E7] bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <h2 className="text-[14.5px] font-semibold text-[#191919]">
                  学习域名白名单
                </h2>
                <InfoTooltip
                  text="列表中的科研、文档与工具网站在任意专注强度下均永不虚化、折叠或关闭。"
                  side="top"
                  align="left"
                />
              </div>
              <button
                type="button"
                onClick={handleRestoreDefaultWhitelist}
                className="inline-flex items-center gap-1 rounded-md border border-[#E9E9E7] bg-[#F7F7F5] px-2.5 py-1 text-[11.5px] font-medium text-[#787774] transition-colors hover:bg-[#EFEFED] hover:text-[#191919]"
              >
                <RotateCcw className="h-3 w-3" />
                <span>恢复默认</span>
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              <div className="relative flex-1">
                <Globe className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#787774]" />
                <input
                  type="text"
                  value={domainInput}
                  onChange={(event) => {
                    setDomainInput(event.target.value);
                    if (domainError) {
                      setDomainError('');
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddWhitelistDomain();
                    }
                  }}
                  placeholder="输入域名或粘贴网址，例如：arxiv.org、overleaf.com"
                  className="w-full rounded-md border border-[#E9E9E7] bg-[#F7F7F5] py-2 pl-9 pr-3 font-mono text-[12px] text-[#191919] placeholder:font-sans placeholder:text-[#787774]/75 focus:border-[#191919] focus:bg-white focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleAddWhitelistDomain}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#191919] px-3.5 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#2F2F2F]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>添加域名</span>
              </button>
            </div>

            {domainError && (
              <p className="mt-1.5 text-[11.5px] text-[#E03E3E]">{domainError}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {settings.globalWhitelistDomains.length === 0 ? (
                <span className="text-[12px] text-[#787774]">
                  当前白名单为空，可在上方添加常用学术或开发站点域名。
                </span>
              ) : (
                settings.globalWhitelistDomains.map((domain) => (
                  <span
                    key={domain}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#E9E9E7] bg-[#F7F7F5] px-2.5 py-1 font-mono text-[12px] text-[#191919]"
                  >
                    <span>{domain}</span>
                    <button
                      type="button"
                      aria-label={`移除 ${domain}`}
                      onClick={() => handleRemoveWhitelistDomain(domain)}
                      className="rounded p-0.5 text-[#787774] transition-colors hover:bg-[#EFEFED] hover:text-[#191919]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>
          </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
};
