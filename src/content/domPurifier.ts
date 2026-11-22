import { updateSessionState } from '../shared/storage';
import { ExtensionMessage, FocusSessionState, JudgeItemResult } from '../shared/types';
import { resolveSiteAdapter, SiteAdapter } from './siteAdapters';

const HARD_SHIELD_STYLE_ID = 'denoise-hard-shield';
const PURIFIER_UI_STYLE_ID = 'denoise-purifier-ui';
const OVERLAY_CLASS = 'denoise-card-overlay';
const BADGE_CLASS = 'denoise-card-badge';
const BATCH_DEBOUNCE_MS = 300;
const MAX_BATCH_SIZE = 18;

interface PendingCardEntry {
  id: string;
  el: HTMLElement;
  title: string;
  snippet?: string;
  url?: string;
}

const PURIFIER_UI_CSS = `
  [data-denoise-rel="1"] {
    position: relative !important;
  }

  [data-denoise-id] > :not(.${OVERLAY_CLASS}):not(.${BADGE_CLASS}) {
    transition: filter 0.35s ease, opacity 0.35s ease !important;
  }

  [data-denoise-status="blurred"] > :not(.${OVERLAY_CLASS}):not(.${BADGE_CLASS}) {
    filter: blur(11px) grayscale(85%) !important;
    opacity: 0.35 !important;
    pointer-events: none !important;
    user-select: none !important;
    transition: all 0.35s ease !important;
  }

  .${BADGE_CLASS} {
    position: absolute !important;
    top: 8px !important;
    right: 8px !important;
    z-index: 18 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    padding: 2px 7px !important;
    background: rgba(255, 255, 255, 0.96) !important;
    color: #191919 !important;
    border: 1px solid #191919 !important;
    border-radius: 6px !important;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    line-height: 1.4 !important;
    letter-spacing: 0.01em !important;
    box-shadow: 0 1px 3px rgba(25, 25, 25, 0.08) !important;
    pointer-events: none !important;
    white-space: nowrap !important;
  }

  .${OVERLAY_CLASS} {
    position: absolute !important;
    inset: 0 !important;
    z-index: 25 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 8px !important;
    pointer-events: auto !important;
    background: rgba(255, 255, 255, 0.16) !important;
    box-sizing: border-box !important;
  }

  .${OVERLAY_CLASS}__capsule {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    max-width: min(94%, 290px) !important;
    padding: 8px 11px !important;
    background: #FFFFFF !important;
    color: #191919 !important;
    border: 1px solid #191919 !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 16px rgba(25, 25, 25, 0.08) !important;
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif !important;
    text-align: center !important;
    box-sizing: border-box !important;
  }

  .${OVERLAY_CLASS}__title {
    margin: 0 !important;
    padding: 0 !important;
    font-size: 11.5px !important;
    font-weight: 600 !important;
    line-height: 1.35 !important;
    color: #191919 !important;
    word-break: break-word !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2 !important;
    -webkit-box-orient: vertical !important;
    overflow: hidden !important;
  }

  .${OVERLAY_CLASS}__actions {
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
  }

  .${OVERLAY_CLASS}__btn {
    appearance: none !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 3px 8px !important;
    margin: 0 !important;
    border-radius: 6px !important;
    border: 1px solid #E9E9E7 !important;
    background: #F7F7F5 !important;
    color: #191919 !important;
    font-family: inherit !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    line-height: 1.35 !important;
    cursor: pointer !important;
    white-space: nowrap !important;
    transition: background 0.16s ease, border-color 0.16s ease !important;
  }

  .${OVERLAY_CLASS}__btn:hover {
    background: #EFEFED !important;
    border-color: #191919 !important;
  }

  .${OVERLAY_CLASS}__btn--primary {
    background: #191919 !important;
    color: #FFFFFF !important;
    border-color: #191919 !important;
  }

  .${OVERLAY_CLASS}__btn--primary:hover {
    background: #333333 !important;
    border-color: #333333 !important;
  }
`;

function sendRuntimeMessage<T = unknown>(message: ExtensionMessage): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        resolve(null);
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve((response as T) ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

function parseJudgeBatchResponse(raw: unknown): JudgeItemResult[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as JudgeItemResult[];
  const record = raw as { results?: unknown; data?: unknown };
  if (Array.isArray(record.results)) return record.results as JudgeItemResult[];
  if (Array.isArray(record.data)) return record.data as JudgeItemResult[];
  return [];
}

function tokenizeTitle(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

export class DomPurifierEngine {
  private active = false;
  private sessionId = '';
  private currentAdapter: SiteAdapter | null = null;
  private adapterCleanup: (() => void) | null = null;
  private observer: MutationObserver | null = null;
  private debounceTimer: number | null = null;
  private noiseRecheckTimer: number | null = null;
  private initialRescanTimer: number | null = null;
  private cardCounter = 0;
  private reportedNoiseCount = 0;
  private pendingQueue = new Map<string, PendingCardEntry>();
  private trackedCards = new Map<string, HTMLElement>();
  private exemptedIds = new Set<string>();
  private positiveKeywords = new Set<string>();

  public isRunning(): boolean {
    return this.active;
  }

  public start(session: FocusSessionState): void {
    const adapter = resolveSiteAdapter();

    if (
      this.active &&
      this.sessionId === session.sessionId &&
      this.currentAdapter?.id === adapter.id
    ) {
      this.scheduleScan();
      return;
    }

    if (this.active) {
      this.stop();
    }

    this.active = true;
    this.sessionId = session.sessionId;
    this.currentAdapter = adapter;
    this.reportedNoiseCount = 0;

    this.injectStyle(HARD_SHIELD_STYLE_ID, adapter.hardNoiseCss);
    this.injectStyle(PURIFIER_UI_STYLE_ID, PURIFIER_UI_CSS);

    if (adapter.onEnable) {
      const cleanup = adapter.onEnable();
      this.adapterCleanup = typeof cleanup === 'function' ? cleanup : null;
    }

    this.countAndReportHardNoise();
    this.noiseRecheckTimer = window.setTimeout(() => {
      if (this.active) this.countAndReportHardNoise();
    }, 1500);

    this.startObserver();
    this.scanUnprocessedCards();
    this.initialRescanTimer = window.setTimeout(() => {
      if (this.active) this.scanUnprocessedCards();
    }, 800);
  }

  public stop(): void {
    this.active = false;
    this.sessionId = '';

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.noiseRecheckTimer !== null) {
      window.clearTimeout(this.noiseRecheckTimer);
      this.noiseRecheckTimer = null;
    }
    if (this.initialRescanTimer !== null) {
      window.clearTimeout(this.initialRescanTimer);
      this.initialRescanTimer = null;
    }

    if (this.adapterCleanup) {
      try {
        this.adapterCleanup();
      } catch {
        // ignore cleanup errors from detached host nodes
      }
      this.adapterCleanup = null;
    }

    this.removeStyle(HARD_SHIELD_STYLE_ID);
    this.removeStyle(PURIFIER_UI_STYLE_ID);

    this.restoreAllCards();
    this.pendingQueue.clear();
    this.trackedCards.clear();
    this.exemptedIds.clear();
    this.positiveKeywords.clear();
    this.currentAdapter = null;
    this.reportedNoiseCount = 0;
  }

  private injectStyle(id: string, cssText: string): void {
    let styleEl = document.getElementById(id) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = id;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    styleEl.textContent = cssText;
  }

  private removeStyle(id: string): void {
    const styleEl = document.getElementById(id);
    if (styleEl) styleEl.remove();
  }

  private countAndReportHardNoise(): void {
    if (!this.currentAdapter) return;
    const matched = new Set<Element>();
    for (const selector of this.currentAdapter.hardNoiseCountSelectors) {
      try {
        const nodes = document.querySelectorAll(selector);
        nodes.forEach((node) => matched.add(node));
      } catch {
        // ignore unsupported selectors
      }
    }
    const totalCount = matched.size;
    if (totalCount > this.reportedNoiseCount) {
      const delta = totalCount - this.reportedNoiseCount;
      this.reportedNoiseCount = totalCount;
      void sendRuntimeMessage({
        type: 'REPORT_NOISE_WIDGET_REMOVED',
        payload: { count: delta }
      });
    }
  }

  private startObserver(): void {
    if (!document.body) return;
    this.observer = new MutationObserver((mutations) => {
      if (!this.active) return;
      let hasExternalAddition = false;
      for (const mutation of mutations) {
        for (let idx = 0; idx < mutation.addedNodes.length; idx += 1) {
          const added = mutation.addedNodes[idx];
          if (!(added instanceof HTMLElement)) continue;
          if (
            added.id === 'denoise-shadow-host' ||
            added.id === 'denoise-bili-comment-toggle' ||
            added.classList.contains(OVERLAY_CLASS) ||
            added.classList.contains(BADGE_CLASS)
          ) {
            continue;
          }
          hasExternalAddition = true;
          break;
        }
        if (hasExternalAddition) break;
      }
      if (hasExternalAddition) {
        this.scheduleScan();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  private scheduleScan(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      if (this.active) {
        this.scanUnprocessedCards();
      }
    }, BATCH_DEBOUNCE_MS);
  }

  private scanUnprocessedCards(): void {
    if (!this.active || !this.currentAdapter) return;
    const adapter = this.currentAdapter;
    const candidates: HTMLElement[] = [];

    for (const selector of adapter.cardSelectors) {
      try {
        const found = document.querySelectorAll(selector);
        found.forEach((node) => {
          if (node instanceof HTMLElement) {
            candidates.push(node);
          }
        });
      } catch {
        // ignore invalid selector
      }
    }

    for (const el of candidates) {
      if (el.hasAttribute('data-denoise-id')) continue;
      if (el.closest('#denoise-shadow-host')) continue;
      if (el.closest('[data-denoise-id]')) continue;
      if (el.querySelector('[data-denoise-id]')) continue;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;

      const info = adapter.extractCardInfo(el);
      if (!info || !info.title) continue;

      this.cardCounter += 1;
      const cardId = `dn-card-${this.cardCounter}`;
      el.setAttribute('data-denoise-id', cardId);
      el.setAttribute('data-denoise-status', 'pending');
      this.trackedCards.set(cardId, el);

      if (this.matchesLocalPositiveContext(info.title)) {
        this.applyRelevantBadge(el);
        continue;
      }

      this.pendingQueue.set(cardId, {
        id: cardId,
        el,
        title: info.title,
        snippet: info.snippet,
        url: info.url
      });
    }

    if (this.pendingQueue.size > 0) {
      void this.flushPendingBatches();
    }
  }

  private matchesLocalPositiveContext(title: string): boolean {
    if (this.positiveKeywords.size === 0) return false;
    const tokens = tokenizeTitle(title);
    let hits = 0;
    for (const token of tokens) {
      if (this.positiveKeywords.has(token)) {
        hits += 1;
      }
    }
    return hits >= 2;
  }

  private async flushPendingBatches(): Promise<void> {
    if (!this.active || this.pendingQueue.size === 0) return;

    const entries = Array.from(this.pendingQueue.values());
    this.pendingQueue.clear();
    const activeSessionId = this.sessionId;

    for (let start = 0; start < entries.length; start += MAX_BATCH_SIZE) {
      if (!this.active || this.sessionId !== activeSessionId) return;

      const chunk = entries.slice(start, start + MAX_BATCH_SIZE);
      const rawResponse = await sendRuntimeMessage({
        type: 'JUDGE_FEED_CARDS_BATCH',
        payload: {
          items: chunk.map((entry) => ({
            id: entry.id,
            title: entry.title,
            snippet: entry.snippet,
            url: entry.url
          }))
        }
      });

      if (!this.active || this.sessionId !== activeSessionId) return;

      const results = parseJudgeBatchResponse(rawResponse);
      const entryById = new Map(chunk.map((item) => [item.id, item]));
      let newlyBlurredCount = 0;

      for (const result of results) {
        const entry = entryById.get(result.id);
        if (!entry || !entry.el.isConnected) continue;
        if (this.exemptedIds.has(entry.id)) continue;

        if (result.relevanceScore >= 50) {
          this.applyRelevantBadge(entry.el);
        } else {
          this.applyBlurOverlay(entry, result.reasonTag || '与当前任务无关');
          newlyBlurredCount += 1;
        }
      }

      if (newlyBlurredCount > 0 && this.active && this.sessionId === activeSessionId) {
        void updateSessionState((prev) => {
          if (!prev.isActive || prev.sessionId !== activeSessionId) return prev;
          return {
            ...prev,
            stats: {
              ...prev.stats,
              blurredCardsCount: prev.stats.blurredCardsCount + newlyBlurredCount
            }
          };
        });
      }
    }
  }

  private ensureRelativePosition(el: HTMLElement): void {
    const computed = window.getComputedStyle(el);
    if (computed.position === 'static') {
      el.setAttribute('data-denoise-rel', '1');
    }
  }

  private applyRelevantBadge(el: HTMLElement): void {
    el.setAttribute('data-denoise-status', 'relevant');
    this.removeCardOverlay(el);
    this.ensureRelativePosition(el);

    if (el.querySelector(`:scope > .${BADGE_CLASS}`)) return;
    const badge = document.createElement('div');
    badge.className = BADGE_CLASS;
    badge.textContent = '🎯 任务相关';
    el.appendChild(badge);
  }

  private applyBlurOverlay(entry: PendingCardEntry, reasonTag: string): void {
    const { el, id, title, url } = entry;
    el.setAttribute('data-denoise-status', 'blurred');
    this.removeCardBadge(el);
    this.ensureRelativePosition(el);

    this.removeCardOverlay(el);

    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;

    const capsule = document.createElement('div');
    capsule.className = `${OVERLAY_CLASS}__capsule`;

    const titleEl = document.createElement('div');
    titleEl.className = `${OVERLAY_CLASS}__title`;
    titleEl.textContent = `🛡️ 已过滤无关推荐 · ${reasonTag}`;

    const actionsEl = document.createElement('div');
    actionsEl.className = `${OVERLAY_CLASS}__actions`;

    const revealBtn = document.createElement('button');
    revealBtn.type = 'button';
    revealBtn.className = `${OVERLAY_CLASS}__btn`;
    revealBtn.textContent = '👁 临时查看';
    revealBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.exemptedIds.add(id);
      el.setAttribute('data-denoise-status', 'revealed');
      this.removeCardOverlay(el);
    });

    const whitelistBtn = document.createElement('button');
    whitelistBtn.type = 'button';
    whitelistBtn.className = `${OVERLAY_CLASS}__btn ${OVERLAY_CLASS}__btn--primary`;
    whitelistBtn.textContent = '📌 标为资料';
    whitelistBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.exemptedIds.add(id);
      tokenizeTitle(title).forEach((token) => this.positiveKeywords.add(token));
      this.applyRelevantBadge(el);
      if (url) {
        void updateSessionState((prev) => ({
          ...prev,
          sessionWhitelistUrls: Array.from(new Set([...prev.sessionWhitelistUrls, url]))
        }));
      }
    });

    actionsEl.appendChild(revealBtn);
    actionsEl.appendChild(whitelistBtn);
    capsule.appendChild(titleEl);
    capsule.appendChild(actionsEl);
    overlay.appendChild(capsule);

    overlay.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    el.appendChild(overlay);
  }

  private removeCardOverlay(el: HTMLElement): void {
    const existing = el.querySelectorAll(`:scope > .${OVERLAY_CLASS}`);
    existing.forEach((node) => node.remove());
  }

  private removeCardBadge(el: HTMLElement): void {
    const existing = el.querySelectorAll(`:scope > .${BADGE_CLASS}`);
    existing.forEach((node) => node.remove());
  }

  private restoreAllCards(): void {
    this.trackedCards.forEach((el) => {
      if (!el.isConnected) return;
      this.removeCardOverlay(el);
      this.removeCardBadge(el);
      el.removeAttribute('data-denoise-id');
      el.removeAttribute('data-denoise-status');
      el.removeAttribute('data-denoise-rel');
    });

    document
      .querySelectorAll(`.${OVERLAY_CLASS}, .${BADGE_CLASS}`)
      .forEach((node) => node.remove());
  }
}

export const domPurifier = new DomPurifierEngine();
