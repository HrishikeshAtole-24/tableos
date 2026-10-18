/** TableOS mark: a plate seen from above on an orange tile, with the "T" of a table. */
export function Logo({ size = 32, wordmark = true, inverse = false }: { size?: number; wordmark?: boolean; inverse?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.3 }}>
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden={wordmark} role={wordmark ? undefined : 'img'} aria-label={wordmark ? undefined : 'TableOS'}>
        <rect width="40" height="40" rx="11" fill="#FC8019" />
        <circle cx="20" cy="20" r="11.5" fill="none" stroke="#fff" strokeWidth="2.6" opacity="0.95" />
        <path d="M14 15.5h12M20 15.5v11" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
      {wordmark && (
        <span
          style={{
            font: `800 ${size * 0.66}px/1 var(--font-sans)`,
            letterSpacing: '-0.03em',
            color: inverse ? '#fff' : 'var(--color-text)',
          }}
        >
          Table<span style={{ color: inverse ? '#FFE1C7' : '#FC8019' }}>OS</span>
        </span>
      )}
    </span>
  );
}
