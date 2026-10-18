import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/LegalPage';

export const metadata: Metadata = { title: 'Refund and cancellation' };

export default function RefundPage() {
  return (
    <LegalPage
      title="Refund and cancellation"
      updated="18 October 2026"
      sections={[
        { heading: 'Cancel anytime', body: ['There is no contract or lock-in. You can stop using ordering at any time and keep your free menu.'] },
        {
          heading: 'Wallet refunds',
          body: [
            'If you close your account, we refund the unused positive wallet balance to the original payment method within 7 working days of your request, minus any fees already charged for accepted orders.',
            'Fees for accepted orders are not refundable. Rejected orders are never charged.',
          ],
        },
        { heading: 'Flat plan', body: ['The flat plan is paid in advance for a calendar month and is not refundable for a month that has started. You can switch back to pay-as-you-go from the next month.'] },
        { heading: 'Failed or duplicate payments', body: ['If a recharge was charged but not credited, it is credited automatically once the payment gateway confirms it, or refunded in full by the gateway if it fails. Write to billing@tableos.in with your payment reference if you need help.'] },
      ]}
    />
  );
}
