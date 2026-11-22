import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Plug,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Sliders,
  X
} from 'lucide-react';
import { DEFAULT_SETTINGS, PROVIDER_MODEL_PRESETS } from '../shared/constants';
import { getAppSettings, saveAppSettings } from '../shared/storage';
import {
  AppSettings,
  ExtensionMessage,
  ModelPreset,
  ProviderConfig,
  ProviderId
} from '../shared/types';

const PROVIDER_ORDER: ProviderId[] = ['jev', 'deepseek', 'openai', 'anthropic', 'gemini'];

const PROVIDER_META: Record<
  ProviderId,
  {
    shortLabel: string;
    badge: string;
    description: string;
    modelHint: string;
    placeholderModel: string;
    placeholderUrl: string;
  }
> = {
  jev: {
    shortLabel: 'Zleap Zev-1',
    badge: 'System-1 判别',
    description: 'Zleap System-1 决策接口，返回降噪选项与相关度评分，适合批量网页初筛。',
    modelHint: 'Zev-1',
    placeholderModel: 'Zev-1',
    placeholderUrl: 'https://api.zleap.com/v1/systemone'
  },
  deepseek: {
    shortLabel: 'DeepSeek 官方直连',
    badge: '国内首选 / 极速',
    description: 'DeepSeek 官方 API (V3.2 / R1)，国内直连无需代理，极速中文任务提炼与网页语义判别。',
    modelHint: 'deepseek-chat',
    placeholderModel: 'deepseek-chat',
    placeholderUrl: 'https://api.deepseek.com/v1'
  },
  openai: {
    shortLabel: 'OpenAI / 兼容接口 (GPT-5.4 / 硅基流动)',
    badge: '通用 / 多模态',
    description: '兼容 OpenAI 官方接口及 DeepSeek、硅基流动、OneAPI 等 OpenAI 协议端点。',
    modelHint: 'gpt-5.4-mini',
    placeholderModel: 'gpt-5.4-mini',
    placeholderUrl: 'https://api.openai.com/v1'
  },
  anthropic: {
    shortLabel: 'Anthropic Claude',
    badge: '通用 / 多模态',
    description: '支持 Claude 系列模型的语义理解与灰区页面截图多模态复核。',
    modelHint: 'claude-sonnet-4-6',
    placeholderModel: 'claude-sonnet-4-6',
    placeholderUrl: 'https://api.anthropic.com/v1'
  },
  gemini: {
    shortLabel: 'Google Gemini',
    badge: '通用 / 多模态',
    description: '支持 Google AI Studio 端点，具备文本初筛与网页视觉截图多模态复核能力。',
    modelHint: 'gemini-3-flash-preview',
    placeholderModel: 'gemini-3-flash-preview',
    placeholderUrl: 'https://generativelanguage.googleapis.com/v1beta'
  }
};

interface ConnectionTestState {
  status: 'idle' | 'testing' | 'success' | 'error';
  latencyMs?: number;
  message?: string;
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
    gemini: false
  });

  const [testStates, setTestStates] = useState<Record<ProviderId, ConnectionTestState>>({
    jev: { status: 'idle' },
    deepseek: { status: 'idle' },
    openai: { status: 'idle' },
    anthropic: { status: 'idle' },
    gemini: { status: 'idle' }
  });

  const [openModelDrawer, setOpenModelDrawer] = useState<ProviderId | null>(null);

  const [domainInput, setDomainInput] = useState<string>('');
  const [domainError, setDomainError] = useState<string>('');
  const [activeSection, setActiveSection] = useState<'routing' | 'providers' | 'whitelist'>(
    'routing'
  );

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
    if (!providerConfig.apiKey.trim()) {
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
    setActiveSection(sectionId);
    const element = document.getElementById(`section-${sectionId}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectedFastProvider =
    settings.providers[settings.primaryFastProvider] ?? DEFAULT_SETTINGS.providers.jev;
  const selectedVisionProvider =
    settings.providers[settings.visionReviewProvider] ?? DEFAULT_SETTINGS.providers.openai;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F5] text-[#787774]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-[#191919] font-sans">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-6 px-5 py-8 md:flex-row md:items-start md:px-8">
        <aside className="w-full shrink-0 md:sticky md:top-8 md:w-[232px]">
          <div className="rounded-lg border border-[#E9E9E7] bg-white p-4">
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
                <div className="text-[11px] text-[#787774]">引擎与降噪配置台</div>
              </div>
            </div>

            <nav className="mt-4 space-y-1 border-t border-[#E9E9E7] pt-3">
              <button
                type="button"
                onClick={() => scrollToSection('routing')}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors ${
                  activeSection === 'routing'
                    ? 'bg-[#EFEFED] text-[#191919]'
                    : 'text-[#787774] hover:bg-[#F7F7F5] hover:text-[#191919]'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>双引擎路由总览</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('providers')}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors ${
                  activeSection === 'providers'
                    ? 'bg-[#EFEFED] text-[#191919]'
                    : 'text-[#787774] hover:bg-[#F7F7F5] hover:text-[#191919]'
                }`}
              >
                <Cpu className="h-3.5 w-3.5" />
                <span>AI 供应商 (BYOK)</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('whitelist')}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] font-medium transition-colors ${
                  activeSection === 'whitelist'
                    ? 'bg-[#EFEFED] text-[#191919]'
                    : 'text-[#787774] hover:bg-[#F7F7F5] hover:text-[#191919]'
                }`}
              >
                <Shield className="h-3.5 w-3.5" />
                <span>免死金牌白名单</span>
              </button>
            </nav>

            <div className="mt-4 space-y-1.5 border-t border-[#E9E9E7] pt-3">
              <div className="text-[11px] font-medium text-[#787774]">供应商就绪状态</div>
              {PROVIDER_ORDER.map((id) => {
                const provider =
                  settings.providers[id] ?? DEFAULT_SETTINGS.providers[id];
                const ready = provider.enabled && provider.apiKey.trim().length > 0;
                return (
                  <div
                    key={id}
                    className="flex items-center justify-between text-[11.5px] text-[#787774]"
                  >
                    <span className="truncate">{PROVIDER_META[id].shortLabel}</span>
                    <span
                      className={`inline-flex items-center gap-1 font-mono text-[10.5px] ${
                        ready ? 'text-[#0F7B6C]' : 'text-[#787774]/70'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          ready
                            ? 'bg-[#0F7B6C]'
                            : provider.enabled
                              ? 'bg-[#D9730D]'
                              : 'bg-[#D3D3CF]'
                        }`}
                      />
                      {ready ? '就绪' : provider.enabled ? '缺 Key' : '未启用'}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 rounded-md bg-[#F7F7F5] p-2.5 text-[11px] leading-relaxed text-[#787774]">
              所有 API Key 仅保存于本机浏览器隔离存储（<code className="font-mono text-[#191919]">chrome.storage.local</code>），请求由扩展后台直连供应商，无第三方中转服务器。
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E9E9E7] bg-white px-5 py-4">
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight text-[#191919]">
                引擎路由与降噪策略
              </h1>
              <p className="mt-0.5 text-[12.5px] text-[#787774]">
                管理判别模型密钥、灰区多模态复核策略与全局学习域名白名单。
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              {saveToast ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-[#0F7B6C]/25 bg-[#0F7B6C]/10 px-2.5 py-1 text-[12px] font-medium text-[#0F7B6C]">
                  <Check className="h-3.5 w-3.5" />
                  <span>{saveToast}</span>
                </span>
              ) : hasUnsavedChanges ? (
                <span className="text-[12px] text-[#D9730D]">有未保存的更改</span>
              ) : null}

              <button
                type="button"
                disabled={isSaving}
                onClick={() => handleSaveAll('全部配置已保存')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#191919] px-3.5 py-2 text-[12.5px] font-medium text-white transition-colors hover:bg-[#2F2F2F] disabled:opacity-60"
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
            className="rounded-lg border border-[#E9E9E7] bg-white p-5"
          >
            <div className="mb-4">
              <h2 className="text-[15px] font-semibold text-[#191919]">
                双引擎路由总览
              </h2>
              <p className="mt-0.5 text-[12px] text-[#787774]">
                分别指定日常初筛引擎与强力模式下的灰区多模态复核引擎，可独立选择不同供应商。
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-[#E9E9E7] bg-[#F7F7F5] p-3.5">
                <label
                  htmlFor="primary-fast-provider"
                  className="block text-[12.5px] font-medium text-[#191919]"
                >
                  默认高速初筛引擎
                </label>
                <p className="mt-0.5 text-[11.5px] text-[#787774]">
                  负责网页推荐流卡片与后台标签页的批量相关性初筛。
                </p>
                <select
                  id="primary-fast-provider"
                  value={settings.primaryFastProvider}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      primaryFastProvider: event.target.value as ProviderId
                    }))
                  }
                  className="mt-2.5 w-full rounded-md border border-[#E9E9E7] bg-white px-3 py-2 text-[12.5px] font-medium text-[#191919] focus:border-[#191919] focus:outline-none"
                >
                  {PROVIDER_ORDER.map((id) => (
                    <option key={id} value={id}>
                      {(settings.providers[id] ?? DEFAULT_SETTINGS.providers[id]).name}
                    </option>
                  ))}
                </select>

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="font-mono text-[#787774]">
                    模型：{selectedFastProvider.model || '未填写'}
                  </span>
                  <span
                    className={
                      selectedFastProvider.enabled && selectedFastProvider.apiKey.trim()
                        ? 'text-[#0F7B6C]'
                        : 'text-[#D9730D]'
                    }
                  >
                    {selectedFastProvider.enabled && selectedFastProvider.apiKey.trim()
                      ? '已启用并配置 Key'
                      : !selectedFastProvider.enabled
                        ? '该槽位当前未启用'
                        : '尚未填写 API Key'}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-[#E9E9E7] bg-[#F7F7F5] p-3.5">
                <label
                  htmlFor="vision-review-provider"
                  className="block text-[12.5px] font-medium text-[#191919]"
                >
                  多模态灰区复核引擎
                </label>
                <p className="mt-0.5 text-[11.5px] text-[#787774]">
                  强力模式下对灰区标签页结合静默截图与 DOM 骨架执行二次确认。
                </p>
                <select
                  id="vision-review-provider"
                  value={settings.visionReviewProvider}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      visionReviewProvider: event.target.value as ProviderId
                    }))
                  }
                  className="mt-2.5 w-full rounded-md border border-[#E9E9E7] bg-white px-3 py-2 text-[12.5px] font-medium text-[#191919] focus:border-[#191919] focus:outline-none"
                >
                  {PROVIDER_ORDER.map((id) => (
                    <option key={id} value={id}>
                      {(settings.providers[id] ?? DEFAULT_SETTINGS.providers[id]).name}
                    </option>
                  ))}
                </select>

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="font-mono text-[#787774]">
                    模型：{selectedVisionProvider.model || '未填写'}
                  </span>
                  <span
                    className={
                      selectedVisionProvider.supportsVision
                        ? 'text-[#0F7B6C]'
                        : 'text-[#D9730D]'
                    }
                  >
                    {selectedVisionProvider.supportsVision
                      ? '支持多模态看图'
                      : '未开启 Vision（将走文本降级）'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3.5 flex items-center">
              <div className="group relative inline-flex">
                <span
                  tabIndex={0}
                  className="inline-flex cursor-help items-center gap-1.5 rounded-full border border-[#E9E9E7] bg-[#F7F7F5] px-2.5 py-1 text-[11.5px] font-medium text-[#787774] transition-colors hover:border-[#191919]/30 hover:bg-[#EFEFED] hover:text-[#191919] focus:outline-none"
                >
                  <span>ⓘ 0 误杀自动降级保底机制（悬浮查看）</span>
                </span>
                <div
                  role="tooltip"
                  className="pointer-events-none invisible absolute bottom-full left-0 z-30 mb-2 w-[340px] max-w-[85vw] rounded-lg border border-[#E9E9E7] bg-[#191919] p-3 text-[11.5px] leading-relaxed text-white opacity-0 shadow-lg transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                >
                  当所选复核引擎未开启多模态看图（supportsVision = false）或目标标签页尚无缓存截图时，系统会自动退化为「DOM 语义骨架深度复核」，且对灰区存疑页强制改为归入 💤 暂存休息舱 折叠保护，绝不盲目关闭学习资料页。
                </div>
              </div>
            </div>
          </section>

          <section id="section-providers" className="space-y-4">
            <div className="flex items-baseline justify-between px-0.5">
              <div>
                <h2 className="text-[15px] font-semibold text-[#191919]">
                  五大 AI 供应商配置槽位 (BYOK · 支持 DeepSeek 国内直连)
                </h2>
                <p className="mt-0.5 text-[12px] text-[#787774]">
                  按需启用任意供应商，支持自定义中转 Base URL 与模型名称。
                </p>
              </div>
            </div>

            {PROVIDER_ORDER.map((providerId) => {
              const defaults = DEFAULT_SETTINGS.providers[providerId];
              const config = settings.providers[providerId] ?? defaults;
              const meta = PROVIDER_META[providerId];
              const presets = PROVIDER_MODEL_PRESETS[providerId] ?? [];
              const isDrawerOpen = openModelDrawer === providerId;
              const testState = testStates[providerId];
              const isKeyVisible = visibleKeys[providerId];
              const isPrimaryFast = settings.primaryFastProvider === providerId;
              const isVisionReview = settings.visionReviewProvider === providerId;

              return (
                <article
                  key={providerId}
                  className={`rounded-lg border bg-white transition-colors ${
                    config.enabled ? 'border-[#E9E9E7]' : 'border-[#E9E9E7]/80'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E9E9E7] px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[14px] font-semibold text-[#191919]">
                          {config.name}
                        </h3>
                        <span className="rounded border border-[#E9E9E7] bg-[#F7F7F5] px-1.5 py-0.5 text-[10.5px] font-medium text-[#787774]">
                          {meta.badge}
                        </span>
                        {isPrimaryFast && (
                          <span className="rounded bg-[#191919] px-1.5 py-0.5 text-[10.5px] font-medium text-white">
                            当前初筛引擎
                          </span>
                        )}
                        {isVisionReview && (
                          <span className="rounded border border-[#0F7B6C]/30 bg-[#0F7B6C]/10 px-1.5 py-0.5 text-[10.5px] font-medium text-[#0F7B6C]">
                            当前复核引擎
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[12px] text-[#787774]">{meta.description}</p>
                    </div>

                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <span className="text-[12px] font-medium text-[#787774]">
                        {config.enabled ? '已启用' : '未启用'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={config.enabled}
                        aria-label={`启用 ${config.name}`}
                        onClick={() =>
                          updateProviderField(providerId, 'enabled', !config.enabled)
                        }
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          config.enabled ? 'bg-[#191919]' : 'bg-[#D3D3CF]'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            config.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
                          }`}
                        />
                      </button>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2">
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
                        className="w-full rounded-md border border-[#E9E9E7] bg-[#F7F7F5] px-3 py-2 font-mono text-[12px] text-[#191919] placeholder:text-[#787774]/70 focus:border-[#191919] focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div className="relative">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label
                          htmlFor={`model-${providerId}`}
                          className="text-[12px] font-medium text-[#191919]"
                        >
                          Model Name
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenModelDrawer((prev) =>
                              prev === providerId ? null : providerId
                            )
                          }
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                            isDrawerOpen
                              ? 'border-[#191919] bg-[#191919] text-white'
                              : 'border-[#E9E9E7] bg-[#F7F7F5] text-[#191919] hover:border-[#191919]/40 hover:bg-[#EFEFED]'
                          }`}
                        >
                          <span>📦 模型抽屉</span>
                          <ChevronDown
                            className={`h-3 w-3 transition-transform ${
                              isDrawerOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
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
                          className="w-full rounded-md border border-[#E9E9E7] bg-[#F7F7F5] py-2 pl-3 pr-24 font-mono text-[12px] text-[#191919] placeholder:text-[#787774]/70 focus:border-[#191919] focus:bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setOpenModelDrawer((prev) =>
                              prev === providerId ? null : providerId
                            )
                          }
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[11px] font-medium text-[#787774] transition-colors hover:bg-[#EFEFED] hover:text-[#191919]"
                        >
                          选择最新模型 ▾
                        </button>
                      </div>

                      {isDrawerOpen && presets.length > 0 && (
                        <div className="mt-2 rounded-lg border border-[#E9E9E7] bg-white p-2 shadow-md">
                          <div className="mb-1.5 flex items-center justify-between px-1.5 text-[11px] text-[#787774]">
                            <span>官方推荐与 2026 最新模型预设（点击一键填入）</span>
                            <button
                              type="button"
                              onClick={() => setOpenModelDrawer(null)}
                              className="rounded p-0.5 text-[#787774] hover:bg-[#F7F7F5] hover:text-[#191919]"
                              aria-label="关闭模型抽屉"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <div className="max-h-60 space-y-1 overflow-y-auto pr-0.5">
                            {presets.map((preset) => {
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
                          placeholder="粘贴你的 API Key"
                          className="w-full rounded-md border border-[#E9E9E7] bg-[#F7F7F5] py-2 pl-3 pr-9 font-mono text-[12px] text-[#191919] placeholder:text-[#787774]/70 focus:border-[#191919] focus:bg-white focus:outline-none"
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

                    <div className="flex items-center justify-between rounded-md border border-[#E9E9E7] bg-[#F7F7F5] px-3 py-2">
                      <div className="pr-3">
                        <div className="text-[12px] font-medium text-[#191919]">
                          支持多模态看图（Vision）
                        </div>
                        <div className="text-[11px] text-[#787774]">
                          {providerId === 'jev'
                            ? 'Jev 专注纯文本结构化判别，默认关闭'
                            : providerId === 'deepseek'
                              ? 'DeepSeek 默认使用纯文本语义骨架高速判别'
                            : '允许在强力模式灰区复核时发送网页截图'}
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={config.supportsVision}
                        aria-label={`${config.name} 支持多模态看图`}
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

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E9E9E7] bg-[#F7F7F5]/60 px-5 py-3">
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
                      {testState.status === 'idle' && (
                        <span className="text-[11.5px] text-[#787774]">
                          点击右侧按钮发送最小化探针请求验证密钥与端点可用性
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
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

                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleSaveAll(`${meta.shortLabel} 配置已保存`)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#191919] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#2F2F2F] disabled:opacity-60"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>保存配置</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <section
            id="section-whitelist"
            className="rounded-lg border border-[#E9E9E7] bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-[#191919]">
                  全局免死金牌白名单域名
                </h2>
                <p className="mt-0.5 text-[12px] text-[#787774]">
                  列表中的科研、文档与工具网站在任意专注强度下均永不虚化、永不折叠、永不关闭。
                </p>
              </div>
              <button
                type="button"
                onClick={handleRestoreDefaultWhitelist}
                className="inline-flex items-center gap-1 rounded-md border border-[#E9E9E7] bg-[#F7F7F5] px-2.5 py-1 text-[11.5px] font-medium text-[#787774] transition-colors hover:bg-[#EFEFED] hover:text-[#191919]"
              >
                <RotateCcw className="h-3 w-3" />
                <span>恢复默认科研白名单</span>
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
        </main>
      </div>
    </div>
  );
};
