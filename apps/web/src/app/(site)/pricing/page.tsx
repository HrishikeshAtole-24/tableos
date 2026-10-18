import type { Metadata } from 'next';
import { Icon } from '@tableos/ui';
import { PricingCalculator } from '@/components/site/PricingCalculator';
import { CONSOLE_URL } from '@/components/site/SiteChrome';
import s from '@/components/site/site.module.css';

export const metadata: Metadata = { title: 'Pricing', description: 'Free QR menu. ₹2 per accepted order from a prepaid wallet, capped at ₹999 a month. Or a flat ₹999 a month.' };

const PLANS = [
  {
    name: 'Free menu',
    price: '₹0',
    per: 'forever',
    lead: 'A digital menu your guests will enjoy.',
    points: ['QR menu with photos', 'QR tent cards for every table', 'English, Hindi and Marathi', 'AI menu import', 'Sold out and hide in one tap'],
    cta: 'Create free menu',
  },
  {
    name: 'Pay as you go',
    price: '₹2',
    per: 'per accepted order',
    lead: 'Table ordering, kitchen screen and billing.',
    points: ['Everything in Free', 'Ordering from the table', 'Kitchen and waiter screens', 'Billing with GST and discounts', 'Fees stop at ₹999 a month'],
    cta: 'Start free',
    featured: true,
  },
  {
    name: 'Flat',
    price: '₹999',
    per: 'per month',
    lead: 'A fixed bill for busy restaurants.',
    points: ['Everything in Pay as you go', 'Unlimited orders', 'Paid in advance for the month', 'Same features, predictable cost'],
    cta: 'Choose flat',
  },
];

export default function PricingPage() {
  return (
    <>
      <section className={s.pageHero}>
        <div className="container">
          <span className={s.kicker}>Pricing</span>
          <h1>Simple, fair, and capped</h1>
          <p>No setup fee and no commission on your bill. GST at 18% applies to platform fees.</p>
        </div>
      </section>
      <section className={s.section}>
        <div className="container">
          <div className={s.plans}>
            {PLANS.map((p) => (
              <article key={p.name} className={`${s.plan} ${p.featured ? s.planFeatured : ''}`}>
                {p.featured && <span className={s.planBadge}>Most popular</span>}
                <h2>{p.name}</h2>
                <p className={s.planLead}>{p.lead}</p>
                <p className={s.planPrice}>
                  {p.price} <small>{p.per}</small>
                </p>
                <ul>
                  {p.points.map((pt) => (
                    <li key={pt}>
                      <Icon name="check" size={16} strokeWidth={3} /> {pt}
                    </li>
                  ))}
                </ul>
                <a href={`${CONSOLE_URL}/signup`} className={p.featured ? s.ctaPrimary : s.ctaGhostDark}>
                  {p.cta}
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className={`${s.section} ${s.sectionTinted}`}>
        <div className="container">
          <header className={s.sectionHead}>
            <h2>What would it cost you?</h2>
            <p>8 orders a day is about 240 a month, or ₹480. At 20 a day you hit the cap and pay ₹999.</p>
          </header>
          <PricingCalculator />
        </div>
      </section>
      <section className={s.section}>
        <div className={`container ${s.prose}`}>
          <h2>How the wallet works</h2>
          <ul>
            <li>Recharge from ₹200. The fee is taken only when your staff accept an order. Rejected orders are never charged.</li>
            <li>We alert you on the dashboard and by email when your balance drops to ₹100 and to ₹20.</li>
            <li>If the balance reaches zero, ordering keeps working for up to 48 hours (down to −₹100).</li>
            <li>After that, ordering pauses at your next closing time, never during service. The free menu and QR codes keep working.</li>
            <li>A recharge clears any negative balance and switches ordering back on at once.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
