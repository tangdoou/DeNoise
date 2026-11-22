import React, { useEffect, useRef, useState } from 'react';
import { calculateSnrPercent } from '../../shared/constants';
import { FocusIntensity, FocusSessionState } from '../../shared/types';

export interface FloatingPillProps {
  session: FocusSessionState;
  isWhitelisted: boolean;
  onWhitelistCurrentPage: () => void;
  onOpenBlackbox: () => void;
  onStopFocus: () => void;
}

const INTENSITY_LABEL: Record<FocusIntensity, string> = {
  gentle: '🍃 温和降噪',
  standard: '🎧 标准降噪',
  strict: '🔥 强力降噪'
};

function formatCountdown(endTime: number, now: number): string {
  const remainingMs = Math.max(0, endTime - now);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export const FloatingPill: React.FC<FloatingPillProps> = ({
  session,
  isWhitelisted,
  onWhitelistCurrentPage,
  onOpenBlackbox,
  onStopFocus
}) => {
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState({ right: 20, bottom: 20 });
  const dragStateRef = useRef<{
    dragging: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origRight: number;
    origBottom: number;
  }>({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    origRight: 20,
    origBottom: 20
  });

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session.endTime]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = dragStateRef.current;
      if (!drag.dragging) return;
      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;
      if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
        drag.moved = true;
      }
      if (!drag.moved) return;

      const maxRight = Math.max(20, window.innerWidth - 220);
      const maxBottom = Math.max(20, window.innerHeight - 64);
      const nextRight = Math.min(maxRight, Math.max(12, drag.origRight - deltaX));
      const nextBottom = Math.min(maxBottom, Math.max(12, drag.origBottom - deltaY));
      setOffset({ right: nextRight, bottom: nextBottom });
    };

    const handlePointerUp = () => {
      dragStateRef.current.dragging = false;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const snr = calculateSnrPercent(session.stats).toFixed(1);
  const filteredTotal =
    session.stats.blurredCardsCount + session.stats.removedNoiseWidgetsCount;
  const blackboxCount = session.blackboxTabs.length;
  const countdownText = formatCountdown(session.endTime, now);

  const handlePillPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button[data-dn-blackbox-badge="true"]')) {
      return;
    }
    dragStateRef.current = {
      dragging: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      origRight: offset.right,
      origBottom: offset.bottom
    };
  };

  const handlePillClick = () => {
    if (dragStateRef.current.moved) {
      dragStateRef.current.moved = false;
      return;
    }
    setExpanded((prev) => !prev);
  };

  return (
    <div
      className="dn-pill-anchor"
      style={{ right: `${offset.right}px`, bottom: `${offset.bottom}px` }}
    >
      {expanded && (
        <div className="dn-pill-menu" role="menu" aria-label="DeNoise 快捷菜单">
          <div className="dn-pill-menu-header">
            <div className="dn-pill-menu-brand">
              <span className="dn-pill-menu-title">DeNoise 专注舱</span>
              <span className="dn-tag">{INTENSITY_LABEL[session.intensity]}</span>
            </div>
            <div className="dn-pill-menu-task" title={session.taskIntent}>
              当前任务：{session.taskIntent || '专注学习中'}
            </div>
          </div>

          <div className="dn-pill-menu-divider" />

          <div className="dn-pill-menu-actions">
            <button
              type="button"
              className="dn-menu-item"
              disabled={isWhitelisted}
              onClick={() => {
                onWhitelistCurrentPage();
                setExpanded(false);
              }}
            >
              <span>
                {isWhitelisted
                  ? '✅ 当前网页已标记为学习资料'
                  : '📌 标记当前网页为学习资料'}
              </span>
            </button>

            <button
              type="button"
              className="dn-menu-item"
              onClick={() => {
                setExpanded(false);
                onOpenBlackbox();
              }}
            >
              <span>🛡️ 打开防误杀黑匣子 ({blackboxCount})</span>
            </button>

            <button
              type="button"
              className="dn-menu-item dn-menu-item-danger"
              onClick={() => {
                setExpanded(false);
                onStopFocus();
              }}
            >
              <span>⏹ 结束专注并生成结算小票</span>
            </button>
          </div>
        </div>
      )}

      <div
        className={`dn-pill ${expanded ? 'dn-pill-active' : ''}`}
        onPointerDown={handlePillPointerDown}
        onClick={handlePillClick}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setExpanded((prev) => !prev);
          }
        }}
        aria-expanded={expanded}
        title="点击展开 DeNoise 快捷菜单，按住可拖拽"
      >
        <span className="dn-pill-status">
          <span className="dn-flow-dot" aria-hidden="true" />
          <span>🟢 降噪中</span>
          <span className="dn-mono">{countdownText}</span>
        </span>

        <span className="dn-pill-sep" aria-hidden="true">|</span>

        <span className="dn-pill-metric">
          信噪比 <strong className="dn-mono">{snr}%</strong>
        </span>

        <span className="dn-pill-sep" aria-hidden="true">|</span>

        <span className="dn-pill-metric">
          已滤 <strong className="dn-mono">{filteredTotal}</strong> 条
        </span>

        {blackboxCount > 0 && (
          <button
            type="button"
            data-dn-blackbox-badge="true"
            className="dn-blackbox-badge"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded(false);
              onOpenBlackbox();
            }}
            title="查看强力模式下暂存的标签页快照"
          >
            🛡️ 黑匣子 ({blackboxCount})
          </button>
        )}
      </div>
    </div>
  );
};
