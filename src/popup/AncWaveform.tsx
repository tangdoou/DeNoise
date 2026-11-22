import React, { useEffect, useRef, useState } from 'react';

export type AncWaveformMode = 'noisy' | 'damping' | 'locked';

interface AncWaveformProps {
  mode: AncWaveformMode;
  compact?: boolean;
  onDampingComplete?: () => void;
  className?: string;
}

const DAMPING_DURATION_MS = 1350;

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function interpolateStrokeColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const red = Math.round(lerp(25, 15, clamped));
  const green = Math.round(lerp(25, 123, clamped));
  const blue = Math.round(lerp(25, 108, clamped));
  return `rgb(${red}, ${green}, ${blue})`;
}

function sampleNoiseWave(
  normX: number,
  timeSec: number,
  seedOffset: number,
  freqScale: number
): number {
  const edgeWindow = Math.pow(Math.sin(Math.PI * normX), 0.72);
  const wave1 = Math.sin(normX * 29 * freqScale + timeSec * 7.8 + seedOffset) * 0.42;
  const wave2 = Math.sin(normX * 57 * freqScale - timeSec * 12.6 + seedOffset * 1.7) * 0.3;
  const wave3 = Math.sin(normX * 93 * freqScale + timeSec * 18.4 + seedOffset * 2.3) * 0.18;
  const wave4 = Math.cos(normX * 137 * freqScale - timeSec * 23.1 + seedOffset * 0.6) * 0.14;
  const burst = 0.68 + 0.32 * Math.sin(normX * 13 + timeSec * 4.2 + seedOffset * 0.9);
  return (wave1 + wave2 + wave3 + wave4) * burst * edgeWindow;
}

export const AncWaveform: React.FC<AncWaveformProps> = ({
  mode,
  compact = false,
  onDampingComplete,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const completeCallbackRef = useRef(onDampingComplete);
  const [displayDb, setDisplayDb] = useState<number>(mode === 'locked' ? 0 : 82);
  const [dampingDone, setDampingDone] = useState<boolean>(mode === 'locked');

  useEffect(() => {
    completeCallbackRef.current = onDampingComplete;
  }, [onDampingComplete]);

  useEffect(() => {
    if (mode === 'noisy') {
      setDisplayDb(82);
      setDampingDone(false);
    } else if (mode === 'locked') {
      setDisplayDb(0);
      setDampingDone(true);
    } else if (mode === 'damping') {
      setDampingDone(false);
    }
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    let animationFrameId = 0;
    let dampingStartTs: number | null = null;
    let completionNotified = false;
    let lastDbUpdateTs = 0;

    const canvasHeight = compact ? 26 : 40;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const cssWidth = Math.max(120, Math.floor(rect.width));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(canvasHeight * dpr);
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${canvasHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return cssWidth;
    };

    let width = resizeCanvas();

    const drawStaticFlatline = (currentWidth: number) => {
      const midY = canvasHeight / 2;
      ctx.clearRect(0, 0, currentWidth, canvasHeight);

      ctx.strokeStyle = '#E9E9E7';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(currentWidth, midY);
      ctx.stroke();

      ctx.strokeStyle = '#0F7B6C';
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(4, midY);
      ctx.lineTo(currentWidth - 4, midY);
      ctx.stroke();

      ctx.fillStyle = '#0F7B6C';
      ctx.beginPath();
      ctx.arc(4, midY, 2, 0, Math.PI * 2);
      ctx.arc(currentWidth - 4, midY, 2, 0, Math.PI * 2);
      ctx.fill();
    };

    const resizeObserver = new ResizeObserver(() => {
      width = resizeCanvas();
      if (mode === 'locked') {
        drawStaticFlatline(width);
      }
    });
    resizeObserver.observe(container);

    if (mode === 'locked') {
      drawStaticFlatline(width);
      return () => {
        resizeObserver.disconnect();
      };
    }

    const renderFrame = (now: number) => {
      const timeSec = now / 1000;
      const midY = canvasHeight / 2;
      const maxAmplitude = canvasHeight / 2 - 4;

      let amplitudeFactor = 1;
      let freqScale = 1;
      let colorProgress = 0;

      if (mode === 'damping') {
        if (dampingStartTs === null) {
          dampingStartTs = now;
        }
        const elapsed = now - dampingStartTs;
        const progress = Math.min(1, elapsed / DAMPING_DURATION_MS);

        amplitudeFactor = Math.exp(-5.4 * progress) * (1 - progress);
        freqScale = lerp(1, 0.35, progress);
        colorProgress = Math.min(1, progress * 1.15);

        if (now - lastDbUpdateTs > 45 || progress >= 1) {
          const nextDb = Math.max(0, Math.round(82 * Math.pow(1 - progress, 2.2)));
          setDisplayDb(nextDb);
          lastDbUpdateTs = now;
        }

        if (progress >= 1) {
          drawStaticFlatline(width);
          if (!completionNotified) {
            completionNotified = true;
            setDisplayDb(0);
            setDampingDone(true);
            completeCallbackRef.current?.();
          }
          return;
        }
      }

      ctx.clearRect(0, 0, width, canvasHeight);

      ctx.strokeStyle = '#E9E9E7';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();

      const steps = Math.max(80, Math.floor(width / 2));

      if (amplitudeFactor > 0.015) {
        ctx.strokeStyle =
          mode === 'damping'
            ? `rgba(120, 119, 116, ${(0.28 * amplitudeFactor).toFixed(3)})`
            : 'rgba(120, 119, 116, 0.28)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let idx = 0; idx <= steps; idx++) {
          const normX = idx / steps;
          const posX = normX * width;
          const val = sampleNoiseWave(normX, timeSec * 0.92, 2.1, freqScale);
          const posY = midY + val * maxAmplitude * 0.85 * amplitudeFactor;
          if (idx === 0) {
            ctx.moveTo(posX, posY);
          } else {
            ctx.lineTo(posX, posY);
          }
        }
        ctx.stroke();
      }

      ctx.strokeStyle =
        mode === 'damping' ? interpolateStrokeColor(colorProgress) : '#191919';
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let idx = 0; idx <= steps; idx++) {
        const normX = idx / steps;
        const posX = normX * width;
        const val = sampleNoiseWave(normX, timeSec, 0, freqScale);
        const posY = midY + val * maxAmplitude * amplitudeFactor;
        if (idx === 0) {
          ctx.moveTo(posX, posY);
        } else {
          ctx.lineTo(posX, posY);
        }
      }
      ctx.stroke();

      animationFrameId = window.requestAnimationFrame(renderFrame);
    };

    animationFrameId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [mode, compact]);

  const isQuiet = mode === 'locked' || dampingDone;

  return (
    <div
      className={`rounded-lg border border-[#E9E9E7] bg-white px-3 ${
        compact ? 'py-2' : 'py-2.5'
      } ${className}`}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[#787774]">
          ANC 主动降噪波形
        </span>
        {isQuiet ? (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[#0F7B6C]">
            <span aria-hidden="true">🟢</span>
            <span>0dB · 主动降噪已锁定</span>
          </span>
        ) : mode === 'damping' ? (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-[#191919] tabular-nums">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0F7B6C]" />
            <span>降噪阻尼熨平中 ({displayDb}dB)</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#787774] tabular-nums">
            <span className="h-1.5 w-1.5 rounded-full bg-[#191919]" />
            <span>环境算法噪度：高 (82dB)</span>
          </span>
        )}
      </div>

      <div ref={containerRef} className="w-full overflow-hidden">
        <canvas
          ref={canvasRef}
          aria-label={isQuiet ? '主动降噪已锁定平直波形' : '环境高噪度波形'}
          className="block w-full"
        />
      </div>
    </div>
  );
};
