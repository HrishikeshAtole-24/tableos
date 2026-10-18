import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/LegalPage';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="18 October 2026"
      sections={[
        { heading: 'Who we are', body: ['TableOS provides QR menus, table ordering and billing software to restaurants. This policy explains what personal data we process and why.'] },
        {
          heading: 'Data about diners',
          body: [
            'Diners do not need an account. When you order, we store the items, the table and the time so the restaurant can prepare and bill your order.',
            'Your name and phone number are optional. If you provide them, they are shared only with the restaurant you ordered from. If you agree to receive messages, we store the time of your consent.',
            'We record anonymous usage events (for example, which dishes were viewed) to show restaurants which dishes guests look at. These events do not identify you.',
          ],
        },
        {
          heading: 'Data about restaurant users',
          body: [
            'For owners and staff we store your email or phone number, your name and your role. We use them to sign you in with one-time codes and to send service messages such as low-balance alerts and invoices.',
          ],
        },
        {
          heading: 'Payments',
          body: [
            'Payments are processed by licensed payment gateways. We never see or store card numbers, CVV or UPI PINs. Diner payments go directly to the restaurant.',
          ],
        },
        { heading: 'Storage and security', body: ['Data is stored in India-region cloud infrastructure, encrypted in transit with HTTPS. Access is limited to people who need it to run the service, and support access to a restaurant account is logged.'] },
        { heading: 'Your choices', body: ['Restaurant users can export or delete their account data by writing to us. Diners can ask the restaurant, or us, to delete any phone number they shared.'] },
        { heading: 'Contact', body: ['Questions about privacy: privacy@tableos.in.'] },
      ]}
    />
  );
}
