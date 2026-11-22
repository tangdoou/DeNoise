import { DEFAULT_SETTINGS, INITIAL_SESSION_STATE, STORAGE_KEYS } from './constants';
import { AppSettings, FocusSessionState } from './types';

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
        if (mergedProviders.openai.model === 'gpt-4o-mini' || mergedProviders.openai.model === 'gpt-4o') {
          mergedProviders.openai.model = DEFAULT_SETTINGS.providers.openai.model;
          mergedProviders.openai.name = DEFAULT_SETTINGS.providers.openai.name;
        }
        if (mergedProviders.anthropic.model === 'claude-3-5-sonnet-latest') {
          mergedProviders.anthropic.model = DEFAULT_SETTINGS.providers.anthropic.model;
        }
        return {
          ...DEFAULT_SETTINGS,
          ...stored,
          providers: mergedProviders
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
