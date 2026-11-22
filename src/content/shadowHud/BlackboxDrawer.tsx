import React, { useEffect, useState } from 'react';
import { BlackboxTabItem } from '../../shared/types';

export interface BlackboxDrawerProps {
  open: boolean;
  tabs: BlackboxTabItem[];
  onClose: () => void;
  onRestoreTab: (blackboxItemId: string) => void;
  onRestoreAll: () => void;
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function extractHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export const BlackboxDrawer: React.FC<BlackboxDrawerProps> = ({
  open,
  tabs,
  onClose,
  onRestoreTab,
  onRestoreAll
}) => {
  const [restoringIds, setRestoringIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleRestoreSingle = (itemId: string) => {
    setRestoringIds((prev) => ({ ...prev, [itemId]: true }));
    onRestoreTab(itemId);
  };

  return (
    <div className="dn-backdrop" onClick={onClose} role="presentation">
      <aside
        className="dn-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="防误杀黑匣子"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dn-drawer-header">
          <div>
            <div className="dn-drawer-title-row">
              <h2 className="dn-drawer-title">🛡️ 防误杀黑匣子</h2>
              <span className="dn-count-chip dn-mono">{tabs.length}</span>
            </div>
            <p className="dn-drawer-subtitle">
              强力模式下关闭的无关标签页均保留完整快照，点击即可原位恢复并加入本场学习白名单。
            </p>
          </div>
          <button
            type="button"
            className="dn-icon-btn"
            onClick={onClose}
            aria-label="关闭黑匣子"
          >
            ✕
          </button>
        </div>

        <div className="dn-drawer-body">
          {tabs.length === 0 ? (
            <div className="dn-empty-state">
              <div className="dn-empty-icon">🛡️</div>
              <div className="dn-empty-title">黑匣子当前为空</div>
              <div className="dn-empty-desc">
                当前尚未有被强力模式关闭的标签页。任何被接管的页面都会附带截图留档于此，确保零误杀。
              </div>
            </div>
          ) : (
            <div className="dn-blackbox-list">
              {tabs.map((item) => {
                const host = extractHost(item.url);
                const isRestoring = Boolean(restoringIds[item.id]);
                return (
                  <div key={item.id} className="dn-blackbox-card">
                    <div className="dn-blackbox-thumb">
                      {item.screenshotBase64 ? (
                        <img
                          src={item.screenshotBase64}
                          alt={item.title || host}
                          className="dn-blackbox-img"
                        />
                      ) : (
                        <div className="dn-blackbox-placeholder">
                          <div className="dn-placeholder-bar">
                            <span className="dn-placeholder-dot" />
                            <span className="dn-placeholder-dot" />
                            <span className="dn-placeholder-dot" />
                            <span className="dn-placeholder-host dn-mono">{host}</span>
                          </div>
                          <div className="dn-placeholder-body">
                            {item.favicon ? (
                              <img
                                src={item.favicon}
                                alt=""
                                className="dn-placeholder-favicon"
                              />
                            ) : (
                              <span className="dn-placeholder-glyph">📄</span>
                            )}
                            <span className="dn-placeholder-caption">
                              静态快照占位 · 可一键原位恢复
                            </span>
                          </div>
                        </div>
                      )}
                      <span className="dn-blackbox-score dn-mono">
                        相关性 {Math.round(item.relevanceScore)}%
                      </span>
                    </div>

                    <div className="dn-blackbox-meta">
                      <div className="dn-blackbox-card-title" title={item.title}>
                        {item.title || '未命名网页'}
                      </div>
                      <div className="dn-blackbox-url dn-mono" title={item.url}>
                        {item.url}
                      </div>
                      <div className="dn-blackbox-tags">
                        <span className="dn-reason-tag">🛡️ {item.reasonTag || '与任务无关'}</span>
                        {item.closedAt ? (
                          <span className="dn-time-tag dn-mono">
                            {formatTime(item.closedAt)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="dn-blackbox-actions">
                      <button
                        type="button"
                        className="dn-btn dn-btn-primary dn-btn-full"
                        disabled={isRestoring}
                        onClick={() => handleRestoreSingle(item.id)}
                      >
                        {isRestoring ? '正在恢复...' : '↩ 恢复并标为资料'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="dn-drawer-footer">
          {tabs.length > 0 && (
            <button
              type="button"
              className="dn-btn dn-btn-primary"
              onClick={() => {
                onRestoreAll();
                onClose();
              }}
            >
              ↩ 一键恢复全部 ({tabs.length})
            </button>
          )}
          <button type="button" className="dn-btn dn-btn-secondary" onClick={onClose}>
            关闭
          </button>
        </div>
      </aside>
    </div>
  );
};
