import type { Metadata } from 'next';
import Link from 'next/link';
import QRCode from 'qrcode';
import { Icon } from '@tableos/ui';
import { PhoneMock } from '@/components/site/PhoneMock';
import s from '@/components/site/site.module.css';

export const metadata: Metadata = { title: 'Live demo', description: 'Open a real TableOS demo menu on this page or scan it with your phone.' };

const DEMO_SLUG = process.env.DEMO_RESTAURANT_SLUG ?? 'spice-route-cafe';

export default async function DemoPage() {
  const base = process.env.NEXT_PUBLIC_MENU_URL ?? 'http://localhost:3000';
  const url = `${base}/r/${DEMO_SLUG}`;
  const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#02060C', light: '#FFFFFF' } });
  return (
    <>
      <section className={s.pageHero}>
        <div className="container">
          <span className={s.kicker}>Live demo</span>
          <h1>Try the menu your guests will see</h1>
          <p>This is a real demo restaurant running on TableOS. Scan the code with your phone or open it here.</p>
        </div>
      </section>
      <section className={s.section}>
        <div className={`container ${s.demoGrid}`}>
          <div className={s.demoCard}>
            <div className={s.demoQr} dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label="QR code for the demo menu" />
            <h2>Scan with your phone camera</h2>
            <p>The menu opens in your browser. No app to install.</p>
            <Link href={`/r/${DEMO_SLUG}`} className={s.ctaPrimary}>
              Open the demo menu <Icon name="external" size={18} />
            </Link>
            <p className={s.demoNote}>
              <Icon name="info" size={16} /> The public demo link is view-only. A table QR code adds ordering, live tracking and call-staff buttons.
            </p>
          </div>
          <div className={s.demoArt}>
            <div className={s.heroBlob} />
            <PhoneMock />
          </div>
        </div>
      </section>
    </>
  );
}
