import { useId } from 'react';

/** The mark: an "N" drawn as a small neural network, with the signal lit at its centre. */
export function Logo({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}l`} x1="16" y1="50" x2="48" y2="14" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c3aed" />
          <stop offset=".55" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f5f3ff" />
        </linearGradient>
        <radialGradient id={`${id}g`} cx="32" cy="32" r="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity=".6" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="#0b0814" />
      <rect x=".75" y=".75" width="62.5" height="62.5" rx="14.25" fill="none" stroke="#fff" strokeOpacity=".1" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="20" fill={`url(#${id}g)`} />
      <path d="M19 45V19l26 26V19" fill="none" stroke={`url(#${id}l)`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <g fill="#0b0814" stroke={`url(#${id}l)`} strokeWidth="3.2">
        <circle cx="19" cy="45" r="4.6" />
        <circle cx="19" cy="19" r="4.6" />
        <circle cx="45" cy="45" r="4.6" />
        <circle cx="45" cy="19" r="4.6" />
      </g>
      <circle cx="32" cy="32" r="3.4" fill="#fff" />
    </svg>
  );
}
