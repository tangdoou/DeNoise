import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Download,
  Flame,
  Loader2,
  ShieldCheck,
  Sparkles,
  X
} from 'lucide-react';
import { exportReceiptAsPng } from '../shared/receiptExporter';
import {
  FocusHistoryRecord,
  FocusIntensity,
  FocusPeriodSummary,
  PeriodFocusReview
} from '../shared/types';

export interface FocusReviewPanelProps {
  summary: FocusPeriodSummary;
  records: FocusHistoryRecord[];
  periodReview: PeriodFocusReview | null;
  isGeneratingReview: boolean;
  reviewError: string;
  onGenerateReview: () => void;
  demoMode?: boolean;
  onToggleDemoHistory?: () => void;
}

type TimeRangeKey = 'today' | '7d' | '30d' | '365d' | 'all';
type HeatmapMetric = 'minutes' | 'snr' | 'sessions';

interface DayBucket {
  dateKey: string;
  dateLabel: string;
  weekdayLabel: string;
  minutes: number;
  sessions: number;
  avgSnr: number;
  blurredTotal: number;
}

interface HeatmapCell {
  dateKey: string;
  dateLabel: string;
  weekdayLabel: string;
  isFuture: boolean;
  bucket: DayBucket | null;
  level: 0 | 1 | 2 | 3 | 4;
}

const RANGE_OPTIONS: { id: TimeRangeKey; label: string }[] = [
  { id: 'today', label: '今天' },
  { id: '7d', label: '近 7 天' },
  { id: '30d', label: '近 30 天' },
  { id: '365d', label: '近 1 年' },
  { id: 'all', label: '全部' }
];

const METRIC_OPTIONS: { id: HeatmapMetric; label: string }[] = [
  { id: 'minutes', label: '时长' },
  { id: 'snr', label: '信噪比' },
  { id: 'sessions', label: '次数' }
];

const HEATMAP_COLORS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: '#EFEFED',
  1: '#D5EFE7',
  2: '#8ED8C4',
  3: '#34A88D',
  4: '#0F7B6C'
};

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const INTENSITY_BADGE: Record<FocusIntensity, string> = {
  gentle: '🌱 温和',
  standard: '⚖️ 标准',
  strict: '🔥 强力'
};

function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDurationSummary(totalMinutes: number): { main: string; unit: string } {
  if (totalMinutes >= 120) {
    return {
      main: (totalMinutes / 60).toFixed(1),
      unit: '小时'
    };
  }
  return {
    main: String(totalMinutes),
    unit: '分钟'
  };
}

function formatRecordTimestamp(ts: number): string {
  const date = new Date(ts);
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${m}-${d} ${hh}:${mm}`;
}

function computeHeatmapLevel(bucket: DayBucket | null, metric: HeatmapMetric): 0 | 1 | 2 | 3 | 4 {
  if (!bucket || bucket.sessions === 0) return 0;
  if (metric === 'minutes') {
    if (bucket.minutes >= 110) return 4;
    if (bucket.minutes >= 75) return 3;
    if (bucket.minutes >= 45) return 2;
    return 1;
  }
  if (metric === 'snr') {
    if (bucket.avgSnr >= 97.5) return 4;
    if (bucket.avgSnr >= 96.5) return 3;
    if (bucket.avgSnr >= 95.0) return 2;
    return 1;
  }
  if (bucket.sessions >= 3) return 4;
  if (bucket.sessions === 2) return 3;
  return bucket.minutes >= 60 ? 2 : 1;
}

export const FocusReviewPanel: React.FC<FocusReviewPanelProps> = ({
  summary,
  records,
  periodReview,
  isGeneratingReview,
  reviewError,
  onGenerateReview,
  demoMode = false,
  onToggleDemoHistory
}) => {
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('30d');
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>('minutes');
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<HeatmapCell | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const nowMs = useMemo(() => Date.now(), [records.length]);

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => (b.endTime || b.startTime) - (a.endTime || a.startTime)),
    [records]
  );

  const dayBucketMap = useMemo(() => {
    const accumulator = new Map<
      string,
      { minutes: number; sessions: number; snrSum: number; blurredTotal: number; date: Date }
    >();
    for (const rec of sortedRecords) {
      const ts = rec.endTime || rec.startTime;
      const date = new Date(ts);
      const key = toLocalDateKey(date);
      const current = accumulator.get(key) ?? {
        minutes: 0,
        sessions: 0,
        snrSum: 0,
        blurredTotal: 0,
        date
      };
      current.minutes += Math.max(1, Math.round(rec.durationMinutes || 0));
      current.sessions += 1;
      current.snrSum += rec.snrPercent;
      current.blurredTotal += rec.blurredCount;
      accumulator.set(key, current);
    }
    const result = new Map<string, DayBucket>();
    for (const [key, item] of accumulator.entries()) {
      result.set(key, {
        dateKey: key,
        dateLabel: `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}-${String(
          item.date.getDate()
        ).padStart(2, '0')}`,
        weekdayLabel: WEEKDAY_NAMES[item.date.getDay()],
        minutes: item.minutes,
        sessions: item.sessions,
        avgSnr: Number((item.snrSum / item.sessions).toFixed(1)),
        blurredTotal: item.blurredTotal
      });
    }
    return result;
  }, [sortedRecords]);

  const rangeRecords = useMemo(() => {
    const now = new Date(nowMs);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const DAY = 24 * 60 * 60 * 1000;
    const cutoffMap: Record<TimeRangeKey, number> = {
      today: startOfToday,
      '7d': startOfToday - 6 * DAY,
      '30d': startOfToday - 29 * DAY,
      '365d': startOfToday - 364 * DAY,
      all: 0
    };
    const cutoff = cutoffMap[timeRange];
    return sortedRecords.filter((rec) => (rec.endTime || rec.startTime) >= cutoff);
  }, [sortedRecords, timeRange, nowMs]);

  const rangeKpis = useMemo(() => {
    if (rangeRecords.length === 0) {
      return {
        totalMinutes: 0,
        sessionCount: 0,
        avgSnr: 0,
        blurredTotal: 0,
        parkedTotal: 0,
        driftTotal: 0,
        intensityCounts: { gentle: 0, standard: 0, strict: 0 }
      };
    }
    let totalMinutes = 0;
    let snrSum = 0;
    let blurredTotal = 0;
    let parkedTotal = 0;
    let driftTotal = 0;
    const intensityCounts: Record<FocusIntensity, number> = {
      gentle: 0,
      standard: 0,
      strict: 0
    };
    for (const rec of rangeRecords) {
      totalMinutes += Math.max(1, Math.round(rec.durationMinutes || 0));
      snrSum += rec.snrPercent;
      blurredTotal += rec.blurredCount;
      parkedTotal += rec.parkedCount;
      driftTotal += rec.driftCount;
      intensityCounts[rec.intensity] = (intensityCounts[rec.intensity] ?? 0) + 1;
    }
    return {
      totalMinutes,
      sessionCount: rangeRecords.length,
      avgSnr: Number((snrSum / rangeRecords.length).toFixed(1)),
      blurredTotal,
      parkedTotal,
      driftTotal,
      intensityCounts
    };
  }, [rangeRecords]);

  const heatmapData = useMemo(() => {
    const today = new Date(nowMs);
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayDayOfWeek = (todayMid.getDay() + 6) % 7;
    const currentWeekMonday = new Date(todayMid.getTime() - todayDayOfWeek * 24 * 60 * 60 * 1000);
    const startMonday = new Date(currentWeekMonday.getTime() - 52 * 7 * 24 * 60 * 60 * 1000);

    const weeks: HeatmapCell[][] = [];
    const monthMarkers: { col: number; label: string }[] = [];
    let activeDays = 0;
    let peakMinutes = 0;
    let lastMarkerCol = -4;

    for (let col = 0; col < 53; col += 1) {
      const column: HeatmapCell[] = [];
      for (let row = 0; row < 7; row += 1) {
        const cellDate = new Date(
          startMonday.getTime() + (col * 7 + row) * 24 * 60 * 60 * 1000
        );
        const isFuture = cellDate.getTime() > todayMid.getTime();
        const dateKey = toLocalDateKey(cellDate);
        const bucket = !isFuture ? dayBucketMap.get(dateKey) ?? null : null;
        if (bucket) {
          activeDays += 1;
          if (bucket.minutes > peakMinutes) peakMinutes = bucket.minutes;
        }
        if (!isFuture && cellDate.getDate() === 1 && col - lastMarkerCol >= 3) {
          monthMarkers.push({ col, label: `${cellDate.getMonth() + 1}月` });
          lastMarkerCol = col;
        }
        column.push({
          dateKey,
          dateLabel: `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(
            2,
            '0'
          )}-${String(cellDate.getDate()).padStart(2, '0')}`,
          weekdayLabel: WEEKDAY_NAMES[cellDate.getDay()],
          isFuture,
          bucket,
          level: isFuture ? 0 : computeHeatmapLevel(bucket, heatmapMetric)
        });
      }
      weeks.push(column);
    }

    return {
      weeks,
      monthMarkers,
      activeDays,
      peakMinutes
    };
  }, [dayBucketMap, heatmapMetric, nowMs]);

  const last14Days = useMemo(() => {
    const today = new Date(nowMs);
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const DAY = 24 * 60 * 60 * 1000;
    const items: {
      dateKey: string;
      shortLabel: string;
      minutes: number;
      sessions: number;
      isToday: boolean;
    }[] = [];

    for (let offset = 13; offset >= 0; offset -= 1) {
      const d = new Date(todayMid.getTime() - offset * DAY);
      const key = toLocalDateKey(d);
      const bucket = dayBucketMap.get(key);
      items.push({
        dateKey: key,
        shortLabel:
          offset === 0
            ? '今天'
            : `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`,
        minutes: bucket?.minutes ?? 0,
        sessions: bucket?.sessions ?? 0,
        isToday: offset === 0
      });
    }
    const maxMinutes = Math.max(30, ...items.map((item) => item.minutes));
    const totalMinutes = items.reduce((acc, item) => acc + item.minutes, 0);
    return { items, maxMinutes, totalMinutes };
  }, [dayBucketMap, nowMs]);

  const tableRecords = useMemo(() => {
    if (selectedDateKey) {
      return sortedRecords.filter(
        (rec) => toLocalDateKey(new Date(rec.endTime || rec.startTime)) === selectedDateKey
      );
    }
    return rangeRecords;
  }, [rangeRecords, sortedRecords, selectedDateKey]);

  const visibleTableRecords = showAllRows ? tableRecords : tableRecords.slice(0, 8);
  const durationDisplay = formatDurationSummary(rangeKpis.totalMinutes);

  const handleExportRecordPng = async (rec: FocusHistoryRecord) => {
    if (exportingId) return;
    setExportingId(rec.id);
    try {
      await exportReceiptAsPng({
        taskIntent: rec.taskIntent,
        intensity: rec.intensity,
        startTime: rec.startTime,
        endTime: rec.endTime,
        durationMinutes: rec.durationMinutes,
        stats: {
          blurredCardsCount: rec.blurredCount,
          // FocusHistoryRecord does not persist these, so we must not invent them.
          removedNoiseWidgetsCount: 0,
          parkedOrClosedTabsCount: rec.parkedCount,
          visionProtectedTabsCount: 0,
          driftNudgesCount: rec.driftCount,
          totalScannedItems: rec.blurredCount + rec.parkedCount,
          relevantKeptItems: 0
        },
        blackboxCount: rec.intensity === 'strict' ? rec.parkedCount : 0,
        parkedCount: rec.parkedCount,
        snrPercentOverride: rec.snrPercent,
        gradeOverride: rec.grade,
        aiRetrospective:
          rec.aiSummary && rec.aiBadge
            ? {
                status: 'ready',
                badge: rec.aiBadge,
                summary: rec.aiSummary,
                highlights: [
                  `持续专注 ${rec.durationMinutes} 分钟，环境信噪比 ${rec.snrPercent.toFixed(1)}%`,
                  `净化推荐卡片 ${rec.blurredCount} 条，休息舱接管 ${rec.parkedCount} 个标签页`
                ],
                modelUsed: '本机专注账本',
                generatedAt: rec.endTime
              }
            : undefined
      });
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {demoMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D9730D]/40 bg-[#D9730D]/10 px-4 py-2.5">
          <span className="text-[12px] font-medium text-[#B45309]">
            🎬 当前展示的是<strong>演示数据</strong>，并非你的真实专注记录。做真实专注时请先清除。
          </span>
          {onToggleDemoHistory && (
            <button
              type="button"
              onClick={onToggleDemoHistory}
              className="shrink-0 rounded-md border border-[#D9730D]/50 bg-white px-2.5 py-1 text-[11.5px] font-medium text-[#B45309] transition-colors hover:bg-[#FED7AA]"
            >
              清除演示数据
            </button>
          )}
        </div>
      )}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E9E9E7] bg-white px-5 py-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[16px] font-semibold tracking-tight text-[#191919]">
              专注回顾
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#0F7B6C]/25 bg-[#0F7B6C]/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#0F7B6C]">
              <Flame className="h-3 w-3" />
              <span>连续 {summary.streakDays} 天</span>
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] text-[#787774]">
            本地专注历史、53 周热力分布与深潜信噪比档案
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!demoMode && onToggleDemoHistory && (
            <button
              type="button"
              onClick={onToggleDemoHistory}
              title="载入一组虚构的专注记录，仅用于演示与截图"
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#E9E9E7] bg-white px-3 py-1.5 text-[12px] font-medium text-[#787774] transition-colors hover:border-[#D9730D] hover:text-[#B45309]"
            >
              <span>载入演示数据</span>
            </button>
          )}
          <div className="inline-flex rounded-lg border border-[#E9E9E7] bg-[#F7F7F5] p-0.5">
            {RANGE_OPTIONS.map((option) => {
              const active = timeRange === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    setTimeRange(option.id);
                    setSelectedDateKey(null);
                  }}
                  className={`rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                    active
                      ? 'bg-white text-[#191919] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                      : 'text-[#787774] hover:text-[#191919]'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onGenerateReview}
            disabled={isGeneratingReview}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#191919] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#2F2F2F] disabled:opacity-60"
          >
            {isGeneratingReview ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>{periodReview ? '刷新 AI 复盘' : '生成 AI 复盘'}</span>
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 divide-y divide-[#E9E9E7] rounded-lg border border-[#E9E9E7] bg-white lg:grid-cols-4 lg:divide-x lg:divide-y-0">
        <div className="px-4 py-3.5">
          <div className="text-[11.5px] font-medium text-[#787774]">专注总时长</div>
          <div className="mt-1 flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-[24px] font-semibold leading-none text-[#191919]">
              {durationDisplay.main}
            </span>
            <span className="text-[12px] text-[#787774]">{durationDisplay.unit}</span>
          </div>
          <div className="mt-1.5 text-[11px] text-[#787774]">
            {rangeKpis.sessionCount} 次专注 · 累计 {rangeKpis.totalMinutes} min
          </div>
        </div>

        <div className="px-4 py-3.5">
          <div className="text-[11.5px] font-medium text-[#787774]">平均环境信噪比</div>
          <div className="mt-1 font-mono text-[24px] font-semibold leading-none text-[#0F7B6C] tabular-nums">
            {rangeKpis.sessionCount > 0 ? `${rangeKpis.avgSnr.toFixed(1)}%` : '—'}
          </div>
          <div className="mt-1.5 text-[11px] text-[#787774]">
            已过滤 {rangeKpis.blurredTotal} 条推荐噪音
          </div>
        </div>

        <div className="px-4 py-3.5">
          <div className="text-[11.5px] font-medium text-[#787774]">标签拦截与召回</div>
          <div className="mt-1 flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-[24px] font-semibold leading-none text-[#191919]">
              {rangeKpis.parkedTotal}
            </span>
            <span className="text-[12px] text-[#787774]">页</span>
          </div>
          <div className="mt-1.5 text-[11px] text-[#787774]">
            偏航温和召回 {rangeKpis.driftTotal} 次
          </div>
        </div>

        <div className="px-4 py-3.5">
          <div className="flex items-center justify-between text-[11.5px] font-medium text-[#787774]">
            <span>本周 Pro 激励</span>
            <span className="font-mono text-[#0F7B6C]">{summary.weeklyProgressPercent}%</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-[24px] font-semibold leading-none text-[#191919]">
              {summary.weekMinutes}
            </span>
            <span className="text-[11px] text-[#787774]">
              / {summary.weeklyTargetMinutes} min
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#EFEFED]">
            <div
              className="h-full rounded-full bg-[#0F7B6C] transition-[width] duration-300"
              style={{ width: `${summary.weeklyProgressPercent}%` }}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[#E9E9E7] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[14px] font-semibold text-[#191919]">专注热力图</h2>
            <p className="mt-0.5 text-[11.5px] text-[#787774]">
              最近 53 周的每日专注情况 · 点击日期方块可筛选下方明细
            </p>
          </div>

          <div className="inline-flex rounded-lg border border-[#E9E9E7] bg-[#F7F7F5] p-0.5">
            {METRIC_OPTIONS.map((opt) => {
              const active = heatmapMetric === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setHeatmapMetric(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-white text-[#191919] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                      : 'text-[#787774] hover:text-[#191919]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto pb-1">
          <div className="min-w-[680px]">
            <div className="mb-1.5 flex items-center gap-1.5">
              <div className="w-7 shrink-0" />
              <div className="relative h-3.5 flex-1 text-[10px] text-[#787774]">
                {heatmapData.monthMarkers.map((marker) => (
                  <span
                    key={`${marker.col}-${marker.label}`}
                    style={{ left: `${(marker.col / 53) * 100}%` }}
                    className="absolute top-0 whitespace-nowrap leading-none"
                  >
                    {marker.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-stretch gap-1.5">
              <div className="grid w-7 shrink-0 grid-rows-7 gap-[3px] text-right text-[10px] text-[#787774]">
                <span className="flex items-center justify-end leading-none">周一</span>
                <span />
                <span className="flex items-center justify-end leading-none">周三</span>
                <span />
                <span className="flex items-center justify-end leading-none">周五</span>
                <span />
                <span className="flex items-center justify-end leading-none">周日</span>
              </div>

              <div className="grid flex-1 grid-cols-[repeat(53,minmax(0,1fr))] gap-[3px]">
                {heatmapData.weeks.map((week, colIndex) => (
                  <div key={colIndex} className="grid grid-rows-7 gap-[3px]">
                    {week.map((cell) => {
                      const isSelected = selectedDateKey === cell.dateKey;
                      if (cell.isFuture) {
                        return (
                          <span
                            key={cell.dateKey}
                            className="aspect-square w-full rounded-[2px] bg-transparent"
                            aria-hidden="true"
                          />
                        );
                      }
                      const hasData = Boolean(cell.bucket && cell.bucket.sessions > 0);
                      return (
                        <button
                          key={cell.dateKey}
                          type="button"
                          aria-label={`${cell.dateLabel} ${
                            cell.bucket ? `${cell.bucket.minutes} 分钟` : '无记录'
                          }`}
                          onMouseEnter={() => setHoveredCell(cell)}
                          onMouseLeave={() => setHoveredCell(null)}
                          onClick={() => {
                            if (!hasData) return;
                            setSelectedDateKey((prev) =>
                              prev === cell.dateKey ? null : cell.dateKey
                            );
                          }}
                          style={{ backgroundColor: HEATMAP_COLORS[cell.level] }}
                          className={`aspect-square w-full rounded-[2px] transition-all ${
                            hasData ? 'cursor-pointer hover:ring-1 hover:ring-[#191919]' : 'cursor-default'
                          } ${isSelected ? 'ring-2 ring-[#191919] ring-offset-1' : ''}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#E9E9E7] pt-3 text-[11px] text-[#787774]">
          <div className="min-h-[18px]">
            {hoveredCell ? (
              <span className="font-mono text-[#191919]">
                {hoveredCell.dateLabel} ({hoveredCell.weekdayLabel}) ·{' '}
                {hoveredCell.bucket
                  ? `${hoveredCell.bucket.minutes} 分钟 · ${hoveredCell.bucket.sessions} 次 · SNR ${hoveredCell.bucket.avgSnr.toFixed(1)}%`
                  : '当日暂无专注记录'}
              </span>
            ) : (
              <span>
                近 53 周累计活跃 <strong className="font-medium text-[#191919]">{heatmapData.activeDays}</strong> 天 · 单日峰值{' '}
                <strong className="font-mono font-medium text-[#191919]">{heatmapData.peakMinutes}</strong> min
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span>少</span>
            {([0, 1, 2, 3, 4] as const).map((lvl) => (
              <span
                key={lvl}
                className="h-2.5 w-2.5 rounded-[2px]"
                style={{ backgroundColor: HEATMAP_COLORS[lvl] }}
              />
            ))}
            <span>多</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="rounded-lg border border-[#E9E9E7] bg-white p-5 lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-[#191919]" />
              <h2 className="text-[13.5px] font-semibold text-[#191919]">近 14 天专注节奏</h2>
            </div>
            <span className="font-mono text-[11.5px] text-[#787774]">
              合计 {last14Days.totalMinutes} min
            </span>
          </div>

          <div className="mt-4 flex h-[126px] items-end gap-1.5">
            {last14Days.items.map((item) => {
              const heightPct =
                item.minutes > 0
                  ? Math.max(10, Math.round((item.minutes / last14Days.maxMinutes) * 100))
                  : 4;
              const isSelected = selectedDateKey === item.dateKey;
              return (
                <button
                  key={item.dateKey}
                  type="button"
                  onClick={() => {
                    if (item.minutes === 0) return;
                    setSelectedDateKey((prev) =>
                      prev === item.dateKey ? null : item.dateKey
                    );
                  }}
                  title={`${item.dateKey}: ${item.minutes} 分钟 (${item.sessions} 次)`}
                  className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
                >
                  <span className="font-mono text-[9.5px] text-[#787774] opacity-0 transition-opacity group-hover:opacity-100">
                    {item.minutes > 0 ? `${item.minutes}m` : ''}
                  </span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-t-[3px] transition-all ${
                        item.minutes === 0
                          ? 'bg-[#EFEFED]'
                          : item.isToday || isSelected
                            ? 'bg-[#0F7B6C]'
                            : 'bg-[#191919]/80 group-hover:bg-[#191919]'
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-[#787774]">
            <span>{last14Days.items[0]?.shortLabel}</span>
            <span>{last14Days.items[4]?.shortLabel}</span>
            <span>{last14Days.items[9]?.shortLabel}</span>
            <span className="font-medium text-[#0F7B6C]">今天</span>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-[#E9E9E7] pt-3 text-[11px] text-[#787774]">
            <span>当前区间强度分布：</span>
            {(['strict', 'standard', 'gentle'] as FocusIntensity[]).map((mode) => (
              <span
                key={mode}
                className="inline-flex items-center gap-1 rounded border border-[#E9E9E7] bg-[#F7F7F5] px-2 py-0.5 text-[10.5px] text-[#191919]"
              >
                <span>{INTENSITY_BADGE[mode]}</span>
                <span className="font-mono text-[#787774]">
                  {rangeKpis.intensityCounts[mode]}次
                </span>
              </span>
            ))}
          </div>
        </section>

        <section className="flex flex-col justify-between rounded-lg border border-[#E9E9E7] bg-white p-5 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#0F7B6C]" />
                <h2 className="text-[13.5px] font-semibold text-[#191919]">AI 周期复盘</h2>
              </div>
              {periodReview && (
                <span className="rounded border border-[#E9E9E7] bg-[#F7F7F5] px-1.5 py-0.5 font-mono text-[10px] text-[#787774]">
                  {periodReview.modelUsed}
                </span>
              )}
            </div>

            {reviewError && (
              <p className="mt-2 rounded bg-[#E03E3E]/10 px-2.5 py-1.5 text-[11.5px] text-[#E03E3E]">
                {reviewError}
              </p>
            )}

            {periodReview ? (
              <div className="mt-3 space-y-2.5 text-[12px]">
                <div className="rounded-md border border-[#E9E9E7] bg-[#F7F7F5] px-3 py-2 font-medium text-[#191919]">
                  {periodReview.headline}
                </div>
                <div className="space-y-1.5 text-[11.5px] leading-relaxed">
                  <div className="flex items-start justify-between gap-2">
                    <span className="shrink-0 text-[#787774]">黄金时段</span>
                    <span className="text-right font-mono text-[#0F7B6C]">
                      {periodReview.peakWindow}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#787774]">主要干扰：</span>
                    <span className="text-[#191919]">{periodReview.mainDistraction}</span>
                  </div>
                  <div>
                    <span className="text-[#787774]">改进建议：</span>
                    <span className="font-medium text-[#191919]">{periodReview.suggestion}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-dashed border-[#D3D3CF] bg-[#F7F7F5]/60 p-4 text-[12px] leading-relaxed text-[#787774]">
                基于本机真实专注时段、信噪比波动与偏航拦截记录，由 DeepSeek 提炼你的高效学习窗口与干扰模式。
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-[#E9E9E7] pt-3 text-[11px] text-[#787774]">
            <span>{summary.membershipTier}</span>
            <button
              type="button"
              onClick={onGenerateReview}
              disabled={isGeneratingReview}
              className="font-medium text-[#191919] underline-offset-2 hover:underline disabled:opacity-50"
            >
              {isGeneratingReview ? '分析中...' : periodReview ? '重新分析' : '立即生成'}
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-[#E9E9E7] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E9E9E7] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-semibold text-[#191919]">专注明细</h2>
            <span className="rounded-full bg-[#F7F7F5] px-2 py-0.5 font-mono text-[11px] text-[#787774]">
              {tableRecords.length} 条
            </span>
            {selectedDateKey && (
              <button
                type="button"
                onClick={() => setSelectedDateKey(null)}
                className="inline-flex items-center gap-1 rounded-full border border-[#0F7B6C]/30 bg-[#0F7B6C]/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-[#0F7B6C] hover:bg-[#0F7B6C]/15"
              >
                <span>日期: {selectedDateKey}</span>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <span className="text-[11px] text-[#787774]">支持导出单次高清小票 PNG</span>
        </div>

        {visibleTableRecords.length === 0 ? (
          <div className="px-5 py-10 text-center text-[12.5px] text-[#787774]">
            当前筛选条件下暂无专注记录
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E9E9E7] bg-[#F7F7F5]/70 text-[11px] font-medium text-[#787774]">
                  <th className="whitespace-nowrap pl-4 pr-2 py-2.5">时间</th>
                  <th className="px-2 py-2.5">专注任务目标</th>
                  <th className="whitespace-nowrap px-2 py-2.5">强度</th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-right">时长</th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-right">SNR</th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-right">拦截</th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-center">评级</th>
                  <th className="whitespace-nowrap pl-2 pr-4 py-2.5 text-right">小票</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E9E7]">
                {visibleTableRecords.map((rec) => (
                  <tr key={rec.id} className="transition-colors hover:bg-[#F7F7F5]/60">
                    <td className="whitespace-nowrap pl-4 pr-2 py-2.5 font-mono text-[11px] text-[#787774] tabular-nums">
                      {formatRecordTimestamp(rec.startTime)}
                    </td>
                    <td className="max-w-[195px] px-2 py-2.5">
                      <div className="truncate font-medium text-[#191919]" title={rec.taskIntent}>
                        {rec.taskIntent}
                      </div>
                      {rec.aiBadge && (
                        <div className="mt-0.5 truncate text-[10.5px] text-[#787774]">
                          {rec.aiBadge}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-[11px] text-[#787774]">
                      {INTENSITY_BADGE[rec.intensity]}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[11.5px] text-[#191919] tabular-nums">
                      {rec.durationMinutes}m
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[11.5px] font-medium text-[#0F7B6C] tabular-nums">
                      {rec.snrPercent.toFixed(1)}%
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[11px] text-[#787774] tabular-nums">
                      滤{rec.blurredCount} · 舱{rec.parkedCount}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-center">
                      <span className="inline-block rounded border border-[#191919]/20 bg-[#F7F7F5] px-1.5 py-0.2 font-mono text-[10.5px] font-semibold text-[#191919]">
                        {rec.grade}
                      </span>
                    </td>
                    <td className="whitespace-nowrap pl-2 pr-4 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={exportingId === rec.id}
                        onClick={() => void handleExportRecordPng(rec)}
                        className="inline-flex items-center gap-1 rounded border border-[#E9E9E7] bg-white px-2 py-0.5 text-[11px] font-medium text-[#191919] transition-colors hover:border-[#191919] disabled:opacity-50"
                      >
                        {exportingId === rec.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        <span>PNG</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tableRecords.length > 8 && (
          <div className="border-t border-[#E9E9E7] px-5 py-2.5 text-center">
            <button
              type="button"
              onClick={() => setShowAllRows((prev) => !prev)}
              className="text-[11.5px] font-medium text-[#787774] transition-colors hover:text-[#191919]"
            >
              {showAllRows ? '收起部分记录' : `展开全部 ${tableRecords.length} 条记录`}
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
