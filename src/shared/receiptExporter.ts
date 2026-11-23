import { calculateSnrPercent } from './constants';
import { FocusAiRetrospective, FocusIntensity, SessionStats } from './types';

export interface ReceiptExportData {
  taskIntent: string;
  intensity: FocusIntensity;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  stats: SessionStats;
  blackboxCount: number;
  parkedCount: number;
  aiRetrospective?: FocusAiRetrospective;
  snrPercentOverride?: number;
  gradeOverride?: string;
}

const SANS_FONT =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const MONO_FONT =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

const INTENSITY_BADGE_MAP: Record<FocusIntensity, string> = {
  gentle: '温和模式',
  standard: '标准模式',
  strict: '强力模式'
};

function padTwoDigits(val: number): string {
  return String(val).padStart(2, '0');
}

function formatDisplayTimestamp(timestampMs: number): string {
  const dateObj = new Date(timestampMs || Date.now());
  const year = dateObj.getFullYear();
  const month = padTwoDigits(dateObj.getMonth() + 1);
  const day = padTwoDigits(dateObj.getDate());
  const hours = padTwoDigits(dateObj.getHours());
  const minutes = padTwoDigits(dateObj.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatFileTimestamp(timestampMs: number): string {
  const dateObj = new Date(timestampMs || Date.now());
  const year = dateObj.getFullYear();
  const month = padTwoDigits(dateObj.getMonth() + 1);
  const day = padTwoDigits(dateObj.getDate());
  const hours = padTwoDigits(dateObj.getHours());
  const minutes = padTwoDigits(dateObj.getMinutes());
  const seconds = padTwoDigits(dateObj.getSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function resolveDurationMinutes(data: ReceiptExportData): number {
  if (data.startTime && data.endTime && data.endTime > data.startTime) {
    const elapsedMinutes = Math.round((data.endTime - data.startTime) / 60000);
    if (elapsedMinutes >= 1) {
      return elapsedMinutes;
    }
  }
  return Math.max(1, data.durationMinutes || 25);
}

function computePurityGrade(snrPercent: number, driftNudges: number): string {
  if (snrPercent >= 95 && driftNudges <= 1) return 'S';
  if (snrPercent >= 93 && driftNudges <= 2) return 'A+';
  if (snrPercent >= 90) return 'A';
  return 'B+';
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  posX: number,
  posY: number,
  width: number,
  height: number,
  radius: number
): void {
  const clampedRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(posX + clampedRadius, posY);
  ctx.lineTo(posX + width - clampedRadius, posY);
  ctx.quadraticCurveTo(posX + width, posY, posX + width, posY + clampedRadius);
  ctx.lineTo(posX + width, posY + height - clampedRadius);
  ctx.quadraticCurveTo(posX + width, posY + height, posX + width - clampedRadius, posY + height);
  ctx.lineTo(posX + clampedRadius, posY + height);
  ctx.quadraticCurveTo(posX, posY + height, posX, posY + height - clampedRadius);
  ctx.lineTo(posX, posY + clampedRadius);
  ctx.quadraticCurveTo(posX, posY, posX + clampedRadius, posY);
  ctx.closePath();
}

function fillAndStrokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  posX: number,
  posY: number,
  width: number,
  height: number,
  radius: number,
  fillColor: string | CanvasGradient,
  strokeColor?: string,
  lineWidth = 1
): void {
  drawRoundedRectPath(ctx, posX, posY, width, height, radius);
  ctx.fillStyle = fillColor;
  ctx.fill();
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const normalized = (rawText || '').trim() || '专注学习与核心任务推进';
  const characters = Array.from(normalized);
  const lines: string[] = [];
  let currentLine = '';

  for (let index = 0; index < characters.length; index += 1) {
    const nextChar = characters[index];
    const candidate = currentLine + nextChar;
    if (ctx.measureText(candidate).width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = nextChar;
      if (lines.length === maxLines - 1) {
        const remaining = characters.slice(index).join('');
        let finalLine = '';
        for (const remChar of Array.from(remaining)) {
          if (ctx.measureText(`${finalLine}${remChar}...`).width > maxWidth) {
            break;
          }
          finalLine += remChar;
        }
        const wasTruncated = finalLine.length < remaining.length;
        lines.push(wasTruncated ? `${finalLine}...` : finalLine);
        return lines;
      }
    } else {
      currentLine = candidate;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }
  return lines.slice(0, maxLines);
}

function drawDashedDivider(
  ctx: CanvasRenderingContext2D,
  startX: number,
  endX: number,
  posY: number,
  paperLeft: number,
  paperRight: number
): void {
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = '#D4D4D8';
  ctx.lineWidth = 1;
  ctx.moveTo(startX, posY);
  ctx.lineTo(endX, posY);
  ctx.stroke();
  ctx.restore();

  const notchRadius = 6;
  ctx.fillStyle = '#18181B';
  ctx.beginPath();
  ctx.arc(paperLeft, posY, notchRadius, -Math.PI / 2, Math.PI / 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(paperRight, posY, notchRadius, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.fill();
}

function drawPerforatedEdge(
  ctx: CanvasRenderingContext2D,
  paperLeft: number,
  paperRight: number,
  edgeY: number
): void {
  const step = 14;
  const holeRadius = 3.6;
  ctx.fillStyle = '#18181B';
  for (let currentX = paperLeft + 14; currentX <= paperRight - 14; currentX += step) {
    ctx.beginPath();
    ctx.arc(currentX, edgeY, holeRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBrandLogo(ctx: CanvasRenderingContext2D, posX: number, posY: number, size: number): void {
  const scale = size / 128;
  ctx.save();
  ctx.translate(posX, posY);
  ctx.scale(scale, scale);

  const bgGrad = ctx.createLinearGradient(16, 8, 112, 120);
  bgGrad.addColorStop(0, '#272725');
  bgGrad.addColorStop(1, '#141413');
  fillAndStrokeRoundedRect(ctx, 2, 2, 124, 124, 30, bgGrad, 'rgba(255, 255, 255, 0.1)', 1.5);

  const glowGrad = ctx.createRadialGradient(96, 64, 0, 96, 64, 28);
  glowGrad.addColorStop(0, 'rgba(16, 185, 129, 0.34)');
  glowGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(96, 64, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(21, 64);
  ctx.bezierCurveTo(26, 64, 27, 89, 32, 89);
  ctx.bezierCurveTo(40, 89, 43, 42, 51, 42);
  ctx.bezierCurveTo(59, 42, 61, 64, 69, 64);
  ctx.strokeStyle = 'rgba(113, 113, 122, 0.52)';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(21, 64);
  ctx.bezierCurveTo(26, 64, 27, 39, 32, 39);
  ctx.bezierCurveTo(40, 39, 43, 86, 51, 86);
  ctx.bezierCurveTo(59, 86, 61, 64, 69, 64);
  ctx.lineTo(78, 64);
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 9.5;
  ctx.stroke();

  ctx.fillStyle = '#10B981';
  ctx.beginPath();
  ctx.arc(96, 64, 10.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawReceiptBarcode(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  topY: number,
  totalWidth: number,
  barHeight: number
): void {
  const pattern = [
    3, 2, 1, 2, 4, 2, 1, 3, 2, 1, 2, 2, 3, 1, 2, 1, 4, 2, 1, 2,
    3, 1, 2, 2, 1, 3, 2, 1, 4, 1, 2, 2, 1, 3, 1, 2, 3, 2, 1, 3
  ];
  const totalUnits = pattern.reduce((sum, unit) => sum + unit, 0);
  const unitWidth = totalWidth / totalUnits;
  let cursorX = centerX - totalWidth / 2;

  ctx.fillStyle = '#18181B';
  pattern.forEach((units, index) => {
    const sliceWidth = units * unitWidth;
    if (index % 2 === 0) {
      ctx.fillRect(cursorX, topY, Math.max(1, sliceWidth - 0.3), barHeight);
    }
    cursorX += sliceWidth;
  });
}

async function triggerCanvasDownload(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  const downloadFromUrl = (url: string, revokeAfter: boolean) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    const host = document.body || document.documentElement;
    host.appendChild(anchor);
    anchor.click();
    anchor.remove();
    if (revokeAfter) {
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
  };

  await new Promise<void>((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => {
        if (blob) {
          const blobUrl = URL.createObjectURL(blob);
          downloadFromUrl(blobUrl, true);
          resolve();
          return;
        }
        const fallbackDataUrl = canvas.toDataURL('image/png');
        downloadFromUrl(fallbackDataUrl, false);
        resolve();
      }, 'image/png');
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    downloadFromUrl(dataUrl, false);
    resolve();
  });
}

export async function exportReceiptAsPng(data: ReceiptExportData): Promise<void> {
  const ai = data.aiRetrospective;
  const hasAiBlock = Boolean(ai?.summary);
  const aiExtraHeight = hasAiBlock ? 108 : 0;
  const logicalWidth = 440;
  const logicalHeight = 640 + aiExtraHeight;
  const retinaScale = 2;

  const canvas = document.createElement('canvas');
  canvas.width = logicalWidth * retinaScale;
  canvas.height = logicalHeight * retinaScale;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable');
  }

  ctx.scale(retinaScale, retinaScale);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#18181B';
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  const glowGradient = ctx.createRadialGradient(
    logicalWidth / 2,
    logicalHeight * 0.34,
    20,
    logicalWidth / 2,
    logicalHeight * 0.34,
    290
  );
  glowGradient.addColorStop(0, 'rgba(16, 185, 129, 0.16)');
  glowGradient.addColorStop(1, 'rgba(24, 24, 27, 0)');
  ctx.fillStyle = glowGradient;
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  const paperLeft = 24;
  const paperTop = 22;
  const paperWidth = 392;
  const paperHeight = 596 + aiExtraHeight;
  const paperRight = paperLeft + paperWidth;
  const paperBottom = paperTop + paperHeight;
  const contentLeft = 46;
  const contentWidth = 348;
  const contentRight = contentLeft + contentWidth;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  fillAndStrokeRoundedRect(ctx, paperLeft, paperTop, paperWidth, paperHeight, 14, '#FFFFFF', '#E4E4E7', 1);
  ctx.restore();

  drawPerforatedEdge(ctx, paperLeft, paperRight, paperTop);
  drawPerforatedEdge(ctx, paperLeft, paperRight, paperBottom);

  drawBrandLogo(ctx, contentLeft, 42, 36);

  ctx.fillStyle = '#18181B';
  ctx.font = `800 17px ${SANS_FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('DeNoise', contentLeft + 46, 58);

  const displayTimestamp = formatDisplayTimestamp(data.endTime || Date.now());
  ctx.fillStyle = '#71717A';
  ctx.font = `500 11px ${MONO_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(displayTimestamp, contentRight, 56);

  ctx.fillStyle = '#71717A';
  ctx.font = `500 10.5px ${SANS_FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('AI ATTENTION ANC · 专注降噪结算小票', contentLeft + 46, 75);

  drawDashedDivider(ctx, contentLeft, contentRight, 94, paperLeft, paperRight);

  const intentBoxTop = 106;
  const intentBoxHeight = 70;
  fillAndStrokeRoundedRect(
    ctx,
    contentLeft,
    intentBoxTop,
    contentWidth,
    intentBoxHeight,
    10,
    '#FAFAFA',
    '#E4E4E7',
    1
  );

  ctx.fillStyle = '#71717A';
  ctx.font = `600 11px ${SANS_FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('本次专注任务目标', contentLeft + 14, intentBoxTop + 20);

  const modeText = INTENSITY_BADGE_MAP[data.intensity] || '标准模式';
  ctx.font = `600 10.5px ${SANS_FONT}`;
  const modeBadgeWidth = ctx.measureText(modeText).width + 16;
  const modeBadgeHeight = 20;
  const modeBadgeLeft = contentRight - 12 - modeBadgeWidth;
  const modeBadgeTop = intentBoxTop + 8;
  fillAndStrokeRoundedRect(
    ctx,
    modeBadgeLeft,
    modeBadgeTop,
    modeBadgeWidth,
    modeBadgeHeight,
    6,
    '#18181B'
  );
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(modeText, modeBadgeLeft + modeBadgeWidth / 2, modeBadgeTop + 14);

  ctx.fillStyle = '#18181B';
  ctx.font = `700 13.5px ${SANS_FONT}`;
  ctx.textAlign = 'left';
  const wrappedIntentLines = wrapTextLines(ctx, data.taskIntent, contentWidth - 28, 2);
  wrappedIntentLines.forEach((lineText, lineIndex) => {
    ctx.fillText(lineText, contentLeft + 14, intentBoxTop + 43 + lineIndex * 18);
  });

  const stats = data.stats;
  const snrPercent =
    typeof data.snrPercentOverride === 'number' ? data.snrPercentOverride : calculateSnrPercent(stats);
  const purityGrade =
    data.gradeOverride || computePurityGrade(snrPercent, stats.driftNudgesCount);

  const heroTop = 188;
  const heroHeight = 108;
  fillAndStrokeRoundedRect(
    ctx,
    contentLeft,
    heroTop,
    contentWidth,
    heroHeight,
    12,
    '#ECFDF5',
    '#A7F3D0',
    1
  );

  const ancBadgeText = 'ACTIVE NOISE CANCELLATION';
  ctx.font = `700 9.5px ${MONO_FONT}`;
  const ancBadgeWidth = ctx.measureText(ancBadgeText).width + 16;
  fillAndStrokeRoundedRect(
    ctx,
    contentLeft + 14,
    heroTop + 12,
    ancBadgeWidth,
    20,
    6,
    '#D1FAE5',
    '#6EE7B7',
    1
  );
  ctx.fillStyle = '#047857';
  ctx.textAlign = 'left';
  ctx.fillText(ancBadgeText, contentLeft + 22, heroTop + 25.5);

  const gradeText = `GRADE ${purityGrade}`;
  ctx.font = `800 10.5px ${MONO_FONT}`;
  const gradeWidth = ctx.measureText(gradeText).width + 14;
  fillAndStrokeRoundedRect(
    ctx,
    contentRight - 14 - gradeWidth,
    heroTop + 12,
    gradeWidth,
    20,
    5,
    '#FFFFFF',
    '#059669',
    1.2
  );
  ctx.fillStyle = '#059669';
  ctx.textAlign = 'center';
  ctx.fillText(gradeText, contentRight - 14 - gradeWidth / 2, heroTop + 25.5);

  ctx.fillStyle = '#059669';
  ctx.font = `800 28px ${MONO_FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`SNR ${snrPercent.toFixed(1)}%`, contentLeft + 14, heroTop + 63);

  const totalScanned =
    stats.totalScannedItems ||
    stats.blurredCardsCount + stats.removedNoiseWidgetsCount + stats.relevantKeptItems;
  const relevantKept = stats.relevantKeptItems;
  // Historical records only persist blur/park/drift counts, so "scanned" and
  // "kept" are unknown there. Don't print a made-up "kept 0" line for them.
  const hasScanStats = stats.totalScannedItems > 0 && stats.relevantKeptItems > 0;
  const heroSummary = hasScanStats
    ? `本次共扫描 ${totalScanned} 条网页信息，精准保留 ${relevantKept} 条任务相关干货`
    : `本次共处理 ${stats.blurredCardsCount + stats.parkedOrClosedTabsCount} 条噪音，专注过程已归档`;

  ctx.fillStyle = '#065F46';
  ctx.font = `500 11px ${SANS_FONT}`;
  const summaryLines = wrapTextLines(ctx, heroSummary, contentWidth - 28, 2);
  summaryLines.forEach((lineText, lineIndex) => {
    ctx.fillText(lineText, contentLeft + 14, heroTop + 85 + lineIndex * 15);
  });

  const gridTop = 308;
  const gridGap = 10;
  const cellWidth = (contentWidth - gridGap) / 2;
  const cellHeight = 60;
  const durationMins = resolveDurationMinutes(data);
  const takeoverCount =
    stats.parkedOrClosedTabsCount || (data.parkedCount || 0) + (data.blackboxCount || 0);

  const metrics = [
    { label: '专注净时长', value: `${durationMins} min` },
    { label: '虚化无关推荐卡', value: `${stats.blurredCardsCount}` },
    { label: '清除热搜 / 弹窗', value: `${stats.removedNoiseWidgetsCount}` },
    { label: '休息舱 / 黑匣子接管', value: `${takeoverCount}` }
  ];

  metrics.forEach((metricItem, metricIndex) => {
    const colIndex = metricIndex % 2;
    const rowIndex = Math.floor(metricIndex / 2);
    const cellLeft = contentLeft + colIndex * (cellWidth + gridGap);
    const cellTop = gridTop + rowIndex * (cellHeight + gridGap);

    fillAndStrokeRoundedRect(
      ctx,
      cellLeft,
      cellTop,
      cellWidth,
      cellHeight,
      10,
      '#FAFAFA',
      '#E4E4E7',
      1
    );

    ctx.fillStyle = '#71717A';
    ctx.font = `500 11px ${SANS_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(metricItem.label, cellLeft + 12, cellTop + 22);

    ctx.fillStyle = '#18181B';
    ctx.font = `700 18px ${MONO_FONT}`;
    ctx.fillText(metricItem.value, cellLeft + 12, cellTop + 46);
  });

  const extraRowTop = 448;
  const extraRowHeight = 48;
  fillAndStrokeRoundedRect(
    ctx,
    contentLeft,
    extraRowTop,
    contentWidth,
    extraRowHeight,
    10,
    '#FAFAFA',
    '#E4E4E7',
    1
  );

  const midDividerX = contentLeft + contentWidth * 0.56;
  ctx.beginPath();
  ctx.strokeStyle = '#E4E4E7';
  ctx.lineWidth = 1;
  ctx.moveTo(midDividerX, extraRowTop + 8);
  ctx.lineTo(midDividerX, extraRowTop + extraRowHeight - 8);
  ctx.stroke();

  ctx.fillStyle = '#71717A';
  ctx.font = `500 10.5px ${SANS_FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('多模态看图防误杀保护', contentLeft + 12, extraRowTop + 19);

  ctx.fillStyle = '#18181B';
  ctx.font = `700 12.5px ${SANS_FONT}`;
  ctx.fillText(`${stats.visionProtectedTabsCount} 个灰区资料页`, contentLeft + 12, extraRowTop + 38);

  ctx.fillStyle = '#71717A';
  ctx.font = `500 10.5px ${SANS_FONT}`;
  ctx.fillText('分心纠偏提醒', midDividerX + 14, extraRowTop + 19);

  ctx.fillStyle = '#18181B';
  ctx.font = `700 12.5px ${SANS_FONT}`;
  ctx.fillText(`${stats.driftNudgesCount} 次`, midDividerX + 14, extraRowTop + 38);

  if (hasAiBlock && ai) {
    const aiTop = 504;
    const aiHeight = 96;
    fillAndStrokeRoundedRect(
      ctx,
      contentLeft,
      aiTop,
      contentWidth,
      aiHeight,
      10,
      '#F8FAF9',
      '#D7E9E0',
      1
    );

    ctx.fillStyle = '#71717A';
    ctx.font = `600 10px ${MONO_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('FOCUS RETROSPECTIVE', contentLeft + 12, aiTop + 18);

    ctx.font = `700 10px ${SANS_FONT}`;
    const badgeWidth = ctx.measureText(ai.badge).width + 14;
    fillAndStrokeRoundedRect(
      ctx,
      contentRight - 12 - badgeWidth,
      aiTop + 7,
      badgeWidth,
      16,
      5,
      '#ECFDF5',
      '#A7F3D0',
      1
    );
    ctx.fillStyle = '#047857';
    ctx.textAlign = 'center';
    ctx.fillText(ai.badge, contentRight - 12 - badgeWidth / 2, aiTop + 18);

    ctx.fillStyle = '#3F3F46';
    ctx.font = `500 11px ${SANS_FONT}`;
    ctx.textAlign = 'left';
    const aiLines = wrapTextLines(ctx, ai.summary, contentWidth - 24, 3);
    aiLines.forEach((lineText, lineIndex) => {
      ctx.fillText(lineText, contentLeft + 12, aiTop + 38 + lineIndex * 15);
    });

    const highlight = ai.highlights[0];
    if (highlight) {
      ctx.fillStyle = '#71717A';
      ctx.font = `500 10px ${SANS_FONT}`;
      const highlightLine = wrapTextLines(ctx, `· ${highlight}`, contentWidth - 24, 1)[0];
      if (highlightLine) {
        ctx.fillText(highlightLine, contentLeft + 12, aiTop + aiHeight - 10);
      }
    }
  }

  const bottomOffset = aiExtraHeight;
  drawDashedDivider(
    ctx,
    contentLeft,
    contentRight,
    512 + bottomOffset,
    paperLeft,
    paperRight
  );

  drawReceiptBarcode(ctx, logicalWidth / 2, 526 + bottomOffset, 268, 34);

  ctx.fillStyle = '#A1A1AA';
  ctx.font = `500 9.5px ${MONO_FONT}`;
  ctx.textAlign = 'center';
  const fileStamp = formatFileTimestamp(data.endTime || Date.now());
  ctx.fillText(
    `DN-${fileStamp} · SNR-${snrPercent.toFixed(1)}`,
    logicalWidth / 2,
    574 + bottomOffset
  );

  ctx.fillStyle = '#71717A';
  ctx.font = `600 9.5px ${MONO_FONT}`;
  ctx.fillText(
    'GENERATED BY DENOISE EXTENSION · KEEP YOUR SIGNAL PURE',
    logicalWidth / 2,
    595 + bottomOffset
  );

  const filename = `DeNoise-专注小票-${fileStamp}.png`;
  await triggerCanvasDownload(canvas, filename);
}
