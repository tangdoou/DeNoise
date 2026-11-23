export type ProviderId =
  | 'deepseek'
  | 'jev'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'custom'
  | 'ollama';
export type CustomApiFormat = 'openai' | 'anthropic' | 'gemini';
export type FocusIntensity = 'gentle' | 'standard' | 'strict';
export type LearningTabCategory = 'video_course' | 'code_docs' | 'search_qa' | 'paper_notes';

export interface ModelPreset {
  id: string;
  label: string;
  badge?: string;
  description?: string;
  supportsVision?: boolean;
}

export interface ClassifiedLearningTab {
  tabId: number;
  title: string;
  url: string;
  favicon?: string;
  category: LearningTabCategory;
  categoryLabel: string;
  relevanceScore: number;
  reasonTag: string;
  updatedAt: number;
}

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  supportsVision: boolean;
  apiFormat?: CustomApiFormat;
}

export interface AppSettings {
  providers: Record<ProviderId, ProviderConfig>;
  primaryFastProvider: ProviderId;
  visionReviewProvider: ProviderId;
  globalWhitelistDomains: string[];
}

export interface BlackboxTabItem {
  id: string;
  originalTabId: number;
  title: string;
  url: string;
  favicon?: string;
  screenshotBase64?: string;
  reasonTag: string;
  relevanceScore: number;
  closedAt: number;
}

export interface SessionStats {
  blurredCardsCount: number;
  removedNoiseWidgetsCount: number;
  parkedOrClosedTabsCount: number;
  visionProtectedTabsCount: number;
  driftNudgesCount: number;
  totalScannedItems: number;
  relevantKeptItems: number;
}

export type FocusTimelineEventType =
  | 'session_start'
  | 'tab_learning'
  | 'tab_parked'
  | 'noise_purified'
  | 'drift_warned'
  | 'drift_recovered'
  | 'session_end';

export interface FocusTimelineEvent {
  id: string;
  timestamp: number;
  type: FocusTimelineEventType;
  label: string;
  detail?: string;
  category?: LearningTabCategory;
}

export interface FocusAiRetrospective {
  status: 'pending' | 'ready' | 'fallback';
  badge: string;
  summary: string;
  highlights: string[];
  modelUsed: string;
  generatedAt: number;
}

export interface FocusHistoryRecord {
  id: string;
  taskIntent: string;
  intensity: FocusIntensity;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  snrPercent: number;
  grade: string;
  blurredCount: number;
  parkedCount: number;
  driftCount: number;
  aiBadge?: string;
  aiSummary?: string;
}

export interface FocusPeriodSummary {
  todayMinutes: number;
  todaySessions: number;
  weekMinutes: number;
  weekSessions: number;
  monthMinutes: number;
  monthSessions: number;
  yearMinutes: number;
  yearSessions: number;
  streakDays: number;
  rewardedProDays: number;
  weeklyTargetMinutes: number;
  weeklyProgressPercent: number;
  membershipTier: string;
}

export interface PeriodFocusReview {
  headline: string;
  peakWindow: string;
  mainDistraction: string;
  suggestion: string;
  modelUsed: string;
  generatedAt: number;
}

export interface FocusSessionState {
  isActive: boolean;
  sessionId: string;
  taskIntent: string;
  intensity: FocusIntensity;
  startTime: number;
  durationMinutes: number;
  endTime: number;
  lastActiveLearningTabId?: number;
  parkedGroupId?: number;
  learningGroupIds?: Partial<Record<LearningTabCategory, number>>;
  parkedTabIds: number[];
  sessionWhitelistUrls: string[];
  blackboxTabs: BlackboxTabItem[];
  learningTabs: ClassifiedLearningTab[];
  timeline: FocusTimelineEvent[];
  stats: SessionStats;
  showReceiptModal: boolean;
  lastCompletedSession?: {
    taskIntent: string;
    intensity: FocusIntensity;
    startTime: number;
    endTime: number;
    durationMinutes: number;
    stats: SessionStats;
    blackboxCount: number;
    parkedCount: number;
    timeline?: FocusTimelineEvent[];
    aiRetrospective?: FocusAiRetrospective;
  };
}

export interface TabDomSkeleton {
  tabId: number;
  url: string;
  title: string;
  metaDescription: string;
  headings: string[];
  mainTextSnippet: string;
  mediaAlts: string[];
}

export interface JudgeItemInput {
  id: string;
  type: 'feed_card' | 'tab_initial' | 'tab_vision_review';
  title: string;
  url?: string;
  snippet?: string;
  screenshotBase64?: string;
}

export interface JudgeBatchRequest {
  taskIntent: string;
  intensity: FocusIntensity;
  items: JudgeItemInput[];
}

export interface JudgeItemResult {
  id: string;
  relevanceScore: number; // 0 ~ 100
  confidence: number;     // 0 ~ 1
  decision: 'keep' | 'blur' | 'park' | 'close' | 'need_vision_review';
  reasonTag: string;
  usedVision?: boolean;
}

export type ExtensionMessage =
  | {
      type: 'START_FOCUS_SESSION';
      payload: { taskIntent: string; durationMinutes: number; intensity: FocusIntensity };
    }
  | {
      type: 'STOP_FOCUS_SESSION';
      payload: { showReceipt: boolean };
    }
  | { type: 'DISMISS_RECEIPT_MODAL' }
  | { type: 'GET_SESSION_STATE' }
  | {
      type: 'JUDGE_FEED_CARDS_BATCH';
      payload: { items: { id: string; title: string; snippet?: string; url?: string }[] };
    }
  | {
      type: 'JUDGE_CURRENT_PAGE_DRIFT';
      payload: { url: string; title: string; snippet?: string };
    }
  | {
      type: 'PARK_CURRENT_TAB_AND_SWITCH';
      payload?: { url?: string; title?: string; reasonTag?: string };
    }
  | {
      type: 'ACTIVATE_SPECIFIC_TAB';
      payload: { tabId: number };
    }
  | {
      type: 'REPORT_NOISE_WIDGET_REMOVED';
      payload: { count: number };
    }
  | {
      type: 'REPORT_CARDS_BLURRED';
      payload: { count: number; sessionId: string };
    }
  | {
      type: 'ADD_SESSION_WHITELIST_URL';
      payload: { url: string };
    }
  | {
      type: 'REPORT_DRIFT_NUDGE_SHOWN';
      payload: { title: string; reasonTag: string };
    }
  | {
      type: 'REPORT_DRIFT_RECOVERED';
      payload: { title: string; action: 'parked' | 'switch_learning' };
    }
  | {
      type: 'WHITELIST_CURRENT_URL';
      payload: { url: string };
    }
  | {
      type: 'SWITCH_TO_LEARNING_TAB';
    }
  | {
      type: 'RESTORE_BLACKBOX_TAB';
      payload: { blackboxItemId: string };
    }
  | {
      type: 'RESTORE_ALL_TABS';
    }
  | {
      type: 'EXTRACT_TASK_FROM_ACTIVE_TAB';
    }
  | {
      type: 'TEST_PROVIDER_CONNECTION';
      payload: { providerConfig: ProviderConfig };
    }
  | {
      type: 'FETCH_PROVIDER_MODELS';
      payload: { providerConfig: ProviderConfig };
    }
  | { type: 'GET_FOCUS_STATS' }
  | { type: 'GENERATE_PERIOD_REVIEW' }
  | { type: 'LOAD_DEMO_FOCUS_HISTORY' }
  | { type: 'CLEAR_DEMO_FOCUS_HISTORY' }
  | {
      type: 'EXTRACT_TAB_DOM_SKELETON';
    }
  | {
      type: 'SESSION_STATE_UPDATED';
      payload: { state: FocusSessionState };
    };
