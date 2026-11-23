import React, { useId } from 'react';

export interface DeNoiseLogoProps {
  size?: number;
  className?: string;
}

export const DeNoiseLogo: React.FC<DeNoiseLogoProps> = ({ size = 24, className }) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const bgGradId = `dn-bg-${uid}`;
  const glowGradId = `dn-glow-${uid}`;

  return (
    <svg width={size} height={size} viewBox="0 0 128 128" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={bgGradId} x1="16" y1="8" x2="112" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#272725" />
          <stop offset="100%" stopColor="#141413" />
        </linearGradient>
        <radialGradient id={glowGradId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(96 64) rotate(90) scale(28)">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="124" height="124" rx="30" fill={`url(#${bgGradId})`} />
      <rect x="2.75" y="2.75" width="122.5" height="122.5" rx="29.25" stroke="#FFFFFF" strokeOpacity="0.1" strokeWidth="1.5" />
      <circle cx="96" cy="64" r="28" fill={`url(#${glowGradId})`} />
      <path d="M21 64 C26 64 27 89 32 89 C40 89 43 42 51 42 C59 42 61 64 69 64" stroke="#71717A" strokeOpacity="0.52" strokeWidth="6" strokeLinecap="round" />
      <path d="M21 64 C26 64 27 39 32 39 C40 39 43 86 51 86 C59 86 61 64 69 64 L78 64" stroke="#FFFFFF" strokeWidth="9.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="96" cy="64" r="10.5" fill="#10B981" />
    </svg>
  );
};
