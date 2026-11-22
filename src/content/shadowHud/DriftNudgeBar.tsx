import React, { useEffect, useRef, useState } from 'react';
import { classifyLearningTabCategory } from '../../shared/constants';
import { ExtensionMessage, FocusSessionState, JudgeItemResult } from '../../shared/types';
import { extractCurrentPageDomSkeleton } from '../siteAdapters';

export interface DriftNudgeBarProps {
  session: FocusSessionState;
  isWhitelisted: boolean;
  currentUrl: string;
  onSwitchToLearningTab: () => void;
  onParkAndSwitch: () => void;
  onWhitelistCurrentPage: () => void;
}

interface DriftVerdict {
  relevanceScore: number;
  reasonTag: string;
}

const DWELL_TRIGGER_SECONDS = 2;

function sendMessage<T = unknown>(message: ExtensionMessage): Promise<T | null> {
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

function parseDriftResult(raw: unknown): DriftVerdict | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate =
    (raw as { data?: JudgeItemResult }).data ??
    (raw as { result?: JudgeItemResult }).result ??
    (raw as Partial<JudgeItemResult>);
  if (!candidate || typeof candidate.relevanceScore !== 'number') return null;
  return {
    relevanceScore: candidate.relevanceScore,
    reasonTag: candidate.reasonTag || '与当前专注任务无关'
  };
}

export const DriftNudgeBar: React.FC<DriftNudgeBarProps> = ({
  session,
  isWhitelisted,
  currentUrl,
  onSwitchToLearningTab,
  onParkAndSwitch,
  onWhitelistCurrentPage
}) => {
  const [verdict, setVerdict] = useState<DriftVerdict | null>(null);
  const [visibleMode, setVisibleMode] = useState<'none' | 'banner' | 'strict_card'>('none');
  const [dismissedUrl, setDismissedUrl] = useState<string>('');
  const reportedKeyRef = useRef<string>('');

  useEffect(() => {
    if (!session.isActive || isWhitelisted) {
      setVerdict(null);
      setVisibleMode('none');
      return;
    }
    if (!/^https?:\/\//i.test(currentUrl)) {
      setVerdict(null);
      setVisibleMode('none');
      return;
    }

    let cancelled = false;
    let dwellTimer: number | null = null;
    let elapsedSeconds = 0;

    setVerdict(null);
    setVisibleMode('none');

    const evaluateCurrentPage = async () => {
      const skeleton = extractCurrentPageDomSkeleton();
      const combinedSnippet = [
        skeleton.metaDescription,
        skeleton.headings.join(' | '),
        skeleton.mainTextSnippet
      ]
        .filter(Boolean)
        .join(' — ')
        .slice(0, 420);

      const raw = await sendMessage({
        type: 'JUDGE_CURRENT_PAGE_DRIFT',
        payload: {
          url: currentUrl,
          title: skeleton.title || document.title,
          snippet: combinedSnippet
        }
      });

      if (cancelled) return;
      const parsed = parseDriftResult(raw);
      if (!parsed) return;
      setVerdict(parsed);

      if (session.intensity === 'strict' && parsed.relevanceScore < 25) {
        setVisibleMode('strict_card');
        return;
      }

      if (parsed.relevanceScore < 48) {
        dwellTimer = window.setInterval(() => {
          if (document.hidden) return;
          elapsedSeconds += 1;
          if (elapsedSeconds >= DWELL_TRIGGER_SECONDS) {
            if (dwellTimer !== null) {
              window.clearInterval(dwellTimer);
              dwellTimer = null;
            }
            if (!cancelled) {
              setVisibleMode('banner');
            }
          }
        }, 1000);
      }
    };

    const initDelay = window.setTimeout(() => {
      void evaluateCurrentPage();
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(initDelay);
      if (dwellTimer !== null) {
        window.clearInterval(dwellTimer);
      }
    };
  }, [session.isActive, session.sessionId, session.intensity, session.taskIntent, isWhitelisted, currentUrl]);

  useEffect(() => {
    if (visibleMode === 'none') return;
    const reportKey = `${session.sessionId}::${currentUrl}::${visibleMode}`;
    if (reportedKeyRef.current === reportKey) return;
    reportedKeyRef.current = reportKey;
    void sendMessage({ type: 'REPORT_DRIFT_NUDGE_SHOWN' });
  }, [visibleMode, session.sessionId, currentUrl]);

  if (!session.isActive || isWhitelisted || visibleMode === 'none' || dismissedUrl === currentUrl) {
    return null;
  }

  const detectedCategory = classifyLearningTabCategory(currentUrl, document.title || '');

  if (visibleMode === 'strict_card') {
    return (
      <div className="dn-backdrop dn-backdrop-strict" role="presentation">
        <div
          className="dn-strict-card"
          role="dialog"
          aria-modal="true"
          aria-label="DeNoise 强力降噪偏航拦截"
        >
          <div className="dn-strict-badge">🛡️ DeNoise 强力降噪护航</div>
          <h2 className="dn-strict-title">
            当前页面偏离专注任务【{session.taskIntent || '当前学习目标'}】
          </h2>
          <p className="dn-strict-desc">
            AI 语义判别认为当前页面与专注任务相关性较低（
            <span className="dn-mono">{Math.round(verdict?.relevanceScore ?? 0)}%</span>
            {verdict?.reasonTag ? ` · ${verdict.reasonTag}` : ''}
            ）。若为误判，可一键立即放行并标为学习资料。
          </p>

          <div className="dn-strict-page-box">
            <div className="dn-strict-page-title">{document.title || currentUrl}</div>
            <div className="dn-strict-page-url dn-mono">{currentUrl}</div>
          </div>

          <div className="dn-strict-actions">
            <button
              type="button"
              className="dn-btn dn-btn-primary dn-btn-lg"
              onClick={onParkAndSwitch}
            >
              💤 确认偏离 · 归入休息舱并切回学习页
            </button>
            <button
              type="button"
              className="dn-btn dn-btn-secondary dn-btn-lg"
              onClick={onSwitchToLearningTab}
            >
              ↩ 仅切回刚才的学习页
            </button>
            <button
              type="button"
              className="dn-btn dn-btn-secondary dn-btn-lg"
              onClick={() => {
                setVisibleMode('none');
                onWhitelistCurrentPage();
              }}
            >
              📌 误判，归入「{detectedCategory.categoryLabel}」并放行
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dn-nudge-wrapper" role="status" aria-live="polite">
      <div className="dn-nudge-bar">
        <div className="dn-nudge-content">
          <span className="dn-nudge-text">
            📡 检测到当前页面偏离任务【<strong>{session.taskIntent || '专注学习'}</strong>】
          </span>
          {verdict?.reasonTag ? (
            <span className="dn-nudge-reason">{verdict.reasonTag}</span>
          ) : null}
        </div>

        <div className="dn-nudge-actions">
          <button
            type="button"
            className="dn-btn dn-btn-primary dn-btn-sm"
            onClick={onParkAndSwitch}
            title="将此分心标签页折叠进 💤 暂存休息舱，并立即切回学习标签页"
          >
            💤 归入休息舱并切回
          </button>
          <button
            type="button"
            className="dn-btn dn-btn-secondary dn-btn-sm"
            onClick={onSwitchToLearningTab}
          >
            ↩ 切回学习页
          </button>
          <button
            type="button"
            className="dn-btn dn-btn-secondary dn-btn-sm"
            onClick={() => {
              setVisibleMode('none');
              onWhitelistCurrentPage();
            }}
          >
            📌 标为资料 ({detectedCategory.categoryLabel})
          </button>
          <button
            type="button"
            className="dn-icon-btn dn-icon-btn-sm"
            onClick={() => setDismissedUrl(currentUrl)}
            aria-label="暂时收起提醒"
            title="暂时收起"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};
