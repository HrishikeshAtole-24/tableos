import type { Metadata, Viewport } from 'next';
import { Mukta, Outfit } from 'next/font/google';
import { ToastProvider } from '@tableos/ui';
import '@tableos/ui/styles.css';

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap', weight: ['400', '500', '600', '700', '800'] });
const mukta = Mukta({ subsets: ['devanagari'], variable: '--font-mukta', display: 'swap', weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_MENU_URL ?? 'http://localhost:3000'),
  title: { default: 'TableOS · QR menu and table ordering for restaurants', template: '%s · TableOS' },
  description: 'A free QR menu your guests love. Table ordering, kitchen screen and billing for ₹2 per order, capped at ₹999 a month.',
  applicationName: 'TableOS',
  icons: { icon: '/icon.svg' },
  openGraph: { type: 'website', siteName: 'TableOS' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${mukta.variable}`}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
