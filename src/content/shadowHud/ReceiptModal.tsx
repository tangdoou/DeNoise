import React, { useEffect, useState } from 'react';
import { calculateSnrPercent } from '../../shared/constants';
import { exportReceiptAsPng } from '../../shared/receiptExporter';
import { FocusIntensity, FocusSessionState } from '../../shared/types';

export interface ReceiptModalProps {
  session: FocusSessionState;
  onRestoreAllTabs: () => void;
  onDismiss: () => void;
}

const INTENSITY_DISPLAY: Record<FocusIntensity, string> = {
  gentle: '🍃 温和降噪模式',
  standard: '🎧 标准降噪模式',
  strict: '🔥 强力降噪模式'
};

function formatDateTimeRange(startTime: number, endTime: number): string {
  if (!startTime) return '';
  const start = new Date(startTime);
  const end = new Date(endTime || Date.now());
  const pad = (val: number) => String(val).padStart(2, '0');
  const datePart = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
  const startHm = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
  const endHm = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
  return `${datePart} ${startHm}-${endHm}`;
}

function formatDurationDisplay(startTime: number, endTime: number, plannedMinutes: number): string {
  if (startTime && endTime && endTime > startTime) {
    const elapsedSec = Math.max(1, Math.round((endTime - startTime) / 1000));
    if (elapsedSec < 60) {
      return `${elapsedSec} 秒`;
    }
    const mins = Math.max(1, Math.round(elapsedSec / 60));
    return `${mins} 分钟`;
  }
  return `${plannedMinutes} 分钟`;
}

function computePurityGrade(snr: number, driftNudges: number): string {
  if (snr >= 95 && driftNudges <= 1) return 'S';
  if (snr >= 93 && driftNudges <= 2) return 'A+';
  if (snr >= 90) return 'A';
  return 'B+';
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to textarea fallback
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  session,
  onRestoreAllTabs,
  onDismiss
}) => {
  const [copied, setCopied] = useState(false);
  const [restored, setRestored] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const summary = session.lastCompletedSession;

  useEffect(() => {
    if (!session.showReceiptModal || !summary) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [session.showReceiptModal, summary, onDismiss]);

  if (!session.showReceiptModal || !summary) {
    return null;
  }

  const { stats } = summary;
  const snr = calculateSnrPercent(stats);
  const grade = computePurityGrade(snr, stats.driftNudgesCount);
  const durationText = formatDurationDisplay(
    summary.startTime,
    summary.endTime,
    summary.durationMinutes
  );
  const timeRangeText = formatDateTimeRange(summary.startTime, summary.endTime);
  const restorableTabsCount = Math.max(
    summary.blackboxCount + summary.parkedCount,
    session.blackboxTabs.length + session.parkedTabIds.length
  );

  const buildMarkdownBlock = (): string => {
    const lines = [
      `> 🎧 **DeNoise 专注降噪结算小票** · 心流纯净度 **[ ${grade} ]**`,
      `>`,
      `> - **任务目标**：${summary.taskIntent || '专注学习'}`,
      `> - **专注模式**：${INTENSITY_DISPLAY[summary.intensity]}`,
      `> - **专注时长**：${durationText}${timeRangeText ? ` (${timeRangeText})` : ''}`,
      `> - **虚化过滤推荐卡片**：${stats.blurredCardsCount} 条`,
      `> - **移除热搜/干扰弹窗**：${stats.removedNoiseWidgetsCount} 处`,
      `> - **休眠/黑匣子接管标签页**：${stats.parkedOrClosedTabsCount} 个`,
      `> - **多模态复核保护资料页**：${stats.visionProtectedTabsCount} 个`,
      `> - **偏航温和召回**：${stats.driftNudgesCount} 次`,
      `> - **平均环境信噪比 (SNR)**：\`${snr.toFixed(1)}%\``
    ];
    return lines.join('\n');
  };

  const handleCopyMarkdown = async () => {
    const ok = await copyTextToClipboard(buildMarkdownBlock());
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleRestoreAll = () => {
    onRestoreAllTabs();
    setRestored(true);
  };

  const handleExportPng = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportReceiptAsPng({
        taskIntent: summary.taskIntent || '专注学习',
        intensity: summary.intensity,
        startTime: summary.startTime,
        endTime: summary.endTime,
        durationMinutes: summary.durationMinutes,
        stats: summary.stats,
        blackboxCount: Math.max(summary.blackboxCount, session.blackboxTabs.length),
        parkedCount: Math.max(summary.parkedCount, session.parkedTabIds.length),
        aiRetrospective: summary.aiRetrospective
      });
      setExported(true);
      window.setTimeout(() => setExported(false), 2500);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="dn-backdrop dn-backdrop-center" onClick={onDismiss} role="presentation">
      <div
        className="dn-receipt-shell"
        role="dialog"
        aria-modal="true"
        aria-label="DeNoise 降噪结算小票"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dn-receipt-edge dn-receipt-edge-top" aria-hidden="true" />

        <div className="dn-receipt-paper">
          <div className="dn-receipt-header">
            <div className="dn-receipt-brand">D e N o i s e</div>
            <div className="dn-receipt-sub dn-mono">ACTIVE NOISE CANCELLATION</div>
            <div className="dn-receipt-title">专注降噪结算小票</div>
          </div>

          <div className="dn-receipt-dashed" />

          <div className="dn-receipt-meta">
            <div className="dn-receipt-meta-row">
              <span className="dn-receipt-label">任务目标</span>
              <span className="dn-receipt-val dn-receipt-val-strong">
                {summary.taskIntent || '专注学习'}
              </span>
            </div>
            <div className="dn-receipt-meta-row">
              <span className="dn-receipt-label">专注模式</span>
              <span className="dn-receipt-val">{INTENSITY_DISPLAY[summary.intensity]}</span>
            </div>
            <div className="dn-receipt-meta-row">
              <span className="dn-receipt-label">专注时长</span>
              <span className="dn-receipt-val dn-mono">
                {durationText}
                {timeRangeText ? ` (${timeRangeText})` : ''}
              </span>
            </div>
          </div>

          <div className="dn-receipt-dashed" />

          <div className="dn-receipt-table">
            <div className="dn-receipt-table-head">
              <span>降噪明细</span>
              <span>数量</span>
            </div>
            <div className="dn-receipt-row">
              <span>· 虚化过滤推荐卡片</span>
              <span className="dn-mono">{stats.blurredCardsCount} 条</span>
            </div>
            <div className="dn-receipt-row">
              <span>· 移除热搜 / 弹窗模块</span>
              <span className="dn-mono">{stats.removedNoiseWidgetsCount} 处</span>
            </div>
            <div className="dn-receipt-row">
              <span>· 休眠 / 黑匣子接管标签页</span>
              <span className="dn-mono">{stats.parkedOrClosedTabsCount} 个</span>
            </div>
            <div className="dn-receipt-row">
              <span>· 多模态复核保护资料页</span>
              <span className="dn-mono">{stats.visionProtectedTabsCount} 个</span>
            </div>
            <div className="dn-receipt-row">
              <span>· 偏航温和召回</span>
              <span className="dn-mono">{stats.driftNudgesCount} 次</span>
            </div>
          </div>

          <div className="dn-receipt-dashed" />

          <div className="dn-receipt-summary">
            <div className="dn-receipt-snr-row">
              <span className="dn-receipt-snr-label">平均环境信噪比 (SNR)</span>
              <span className="dn-receipt-snr-val dn-mono">{snr.toFixed(1)}%</span>
            </div>
            <div className="dn-receipt-grade-row">
              <span className="dn-receipt-snr-label">心流纯净度评级</span>
              <span className="dn-grade-stamp dn-mono">[ {grade} ]</span>
            </div>
          </div>

          <div className="dn-receipt-dashed" />

          <div className="dn-receipt-retro">
            <div className="dn-receipt-retro-head">
              <span className="dn-receipt-retro-title">专注复盘</span>
              {summary.aiRetrospective?.badge ? (
                <span className="dn-receipt-retro-badge">
                  {summary.aiRetrospective.badge}
                </span>
              ) : (
                <span className="dn-receipt-retro-badge is-pending">
                  {summary.aiRetrospective ? '复盘中' : '本地总结'}
                </span>
              )}
            </div>
            <p className="dn-receipt-retro-summary">
              {summary.aiRetrospective?.summary ||
                `本次专注 ${durationText}，虚化 ${stats.blurredCardsCount} 条推荐流噪声，暂存 ${stats.parkedOrClosedTabsCount} 个无关页面。`}
            </p>
            {summary.aiRetrospective?.highlights?.length ? (
              <ul className="dn-receipt-retro-list">
                {summary.aiRetrospective.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="dn-receipt-dashed" />

          <div className="dn-receipt-actions">
            <button
              type="button"
              className="dn-btn dn-btn-primary dn-btn-full"
              onClick={handleRestoreAll}
              disabled={restored}
            >
              {restored
                ? '✅ 已恢复全部休眠 / 黑匣子标签页'
                : `↩ 一键恢复全部休眠/黑匣子标签页${restorableTabsCount > 0 ? ` (${restorableTabsCount})` : ''}`}
            </button>

            <div className="dn-receipt-actions-row">
              <button
                type="button"
                className="dn-btn dn-btn-secondary dn-btn-flex"
                onClick={() => void handleExportPng()}
                disabled={exporting}
                style={
                  exported
                    ? {
                        background: '#ECFDF5',
                        borderColor: '#059669',
                        color: '#047857',
                        fontWeight: 600
                      }
                    : undefined
                }
              >
                {exported ? '✓ 已保存高清图片' : '📸 导出小票图片'}
              </button>
              <button
                type="button"
                className="dn-btn dn-btn-secondary dn-btn-flex"
                onClick={() => void handleCopyMarkdown()}
              >
                {copied ? '✅ 已复制' : '📋 复制 Markdown 复盘块'}
              </button>
            </div>

            <button
              type="button"
              className="dn-btn dn-btn-ghost dn-btn-full"
              onClick={onDismiss}
            >
              关闭小票
            </button>
          </div>
        </div>

        <div className="dn-receipt-edge dn-receipt-edge-bottom" aria-hidden="true" />
      </div>
    </div>
  );
};
