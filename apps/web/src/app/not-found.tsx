import Link from 'next/link';
import { Icon, Logo } from '@tableos/ui';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', background: 'radial-gradient(120% 60% at 50% 0%, var(--color-brand-softer), var(--color-page) 60%)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 420 }}>
        <Logo size={36} />
        <h1 style={{ font: 'var(--text-h1)', marginTop: 24 }}>We could not find that page</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>If you scanned a QR code at a restaurant, please ask the staff for help.</p>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '14px 20px', borderRadius: 12, background: 'var(--color-brand)', color: '#fff', fontWeight: 700 }}>
          Go to TableOS <Icon name="arrowRight" size={18} />
        </Link>
      </div>
    </main>
  );
}
