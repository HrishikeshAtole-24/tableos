import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/LegalPage';

export const metadata: Metadata = { title: 'Terms of service' };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      updated="18 October 2026"
      sections={[
        { heading: 'The service', body: ['TableOS lets a restaurant publish a digital menu, take orders from tables, run a kitchen screen and produce bills. The restaurant is responsible for its menu, prices, taxes and food.'] },
        {
          heading: 'Fees',
          body: [
            'The digital menu is free. Ordering costs ₹2 for each order the restaurant accepts, deducted from a prepaid wallet, and fees stop at ₹999 per calendar month (India time). A flat plan of ₹999 per month is also available. GST at 18% is added to platform fees.',
            'We may change prices with at least 30 days’ notice by email. Changes never apply to a month already paid for.',
          ],
        },
        {
          heading: 'Wallet balance and grace',
          body: [
            'If the wallet balance reaches zero, ordering continues for up to 48 hours or until the balance reaches −₹100. After that, ordering pauses at the next closing time. The menu and QR codes keep working in view-only mode. A recharge first clears any negative balance.',
          ],
        },
        { heading: 'Acceptable use', body: ['Do not use the service for unlawful content, to mislead guests about prices, or to collect guest data without consent.'] },
        { heading: 'Availability', body: ['We aim for 99.5% monthly uptime for ordering and the menu. Planned maintenance is announced in advance and scheduled outside typical service hours.'] },
        { heading: 'Liability', body: ['Our total liability in any month is limited to the platform fees paid for that month.'] },
        { heading: 'Contact', body: ['legal@tableos.in'] },
      ]}
    />
  );
}
