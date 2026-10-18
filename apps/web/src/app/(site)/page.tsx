import Link from 'next/link';
import { Icon, type IconName } from '@tableos/ui';
import { CONSOLE_URL } from '@/components/site/SiteChrome';
import { PhoneMock } from '@/components/site/PhoneMock';
import { PricingCalculator } from '@/components/site/PricingCalculator';
import s from '@/components/site/site.module.css';

const STEPS: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'upload', title: 'Snap your printed menu', body: 'Upload photos or a PDF. Our AI reads categories, dishes and prices into an editable list. Nothing goes live until you tap Publish.' },
  { icon: 'qr', title: 'Print QR codes for tables', body: 'Download print-ready tent cards with your logo and a code for every table. Reprint a single table any time.' },
  { icon: 'utensils', title: 'Guests order from the table', body: 'No app, no login. Orders appear on the kitchen screen in seconds and the running bill stays on the guest’s phone.' },
];

const FEATURES: Array<{ icon: IconName; title: string; body: string }> = [
  { icon: 'menuBook', title: 'A menu guests enjoy', body: 'Food photos, veg and non-veg marks, spice levels, search that forgives typos, and filters for Veg, Egg and Jain.' },
  { icon: 'globe', title: 'English, Hindi and Marathi', body: 'Automatic translations you can correct. The original dish name stays beside the translation.' },
  { icon: 'chef', title: 'Kitchen screen', body: 'Large tickets that read from two metres away, a timer that changes colour as tickets age, and a loud alert for every order.' },
  { icon: 'waiter', title: 'Waiter view', body: 'Water, waiter and bill requests in one queue. Accept the first order of a table and place orders for guests.' },
  { icon: 'receipt', title: 'Billing that closes the loop', body: 'One bill per table with GST per item, service charge, discounts and a clean round-off. Mark it paid by cash, card or UPI.' },
  { icon: 'zap', title: 'Live, even on slow networks', body: 'Status updates arrive instantly and fall back to polling on a weak connection. The cart is never lost.' },
];

const FAQ = [
  ['Is the digital menu really free?', 'Yes. The QR menu, QR codes, translations and AI menu import are free forever. You pay only when guests order through TableOS.'],
  ['How much does ordering cost?', '₹2 for each order your staff accept, taken from a prepaid wallet. Fees stop at ₹999 in a calendar month, so busy months never cost more. Rejected orders are never charged.'],
  ['Do guest payments go through you?', 'No. Guests pay you directly at the counter by cash, card or your own UPI. Diner money never enters our account.'],
  ['What happens if my wallet runs out?', 'Ordering keeps working for up to 48 hours. If it is still unpaid, ordering pauses at your next closing time, never during service. Your menu and QR codes keep working in view-only mode.'],
  ['Do my guests need to install anything?', 'No. The menu opens in the phone browser in a couple of seconds, even on a slow 4G connection.'],
];

export default function HomePage() {
  return (
    <>
      <section className={s.hero}>
        <div className={`container ${s.heroGrid}`}>
          <div className={s.heroText}>
            <span className={s.eyebrow}>
              <Icon name="sparkles" size={14} /> Free QR menu · ₹2 per order
            </span>
            <h1 className={s.heroTitle}>
              Your menu on every table. <span>Orders straight to the kitchen.</span>
            </h1>
            <p className={s.heroLead}>
              TableOS gives your restaurant a beautiful QR menu, table ordering, a kitchen screen and billing, all from one dashboard. Go live in fifteen minutes.
            </p>
            <div className={s.heroCtas}>
              <a href={`${CONSOLE_URL}/signup`} className={s.ctaPrimary}>
                Create your free menu <Icon name="arrowRight" size={20} />
              </a>
              <Link href="/demo" className={s.ctaGhost}>
                <Icon name="qr" size={20} /> Try the live demo
              </Link>
            </div>
            <ul className={s.heroPoints}>
              <li><Icon name="check" size={16} strokeWidth={3} /> No setup fee</li>
              <li><Icon name="check" size={16} strokeWidth={3} /> No commission on your bill</li>
              <li><Icon name="check" size={16} strokeWidth={3} /> Cancel anytime</li>
            </ul>
          </div>
          <div className={s.heroArt}>
            <div className={s.heroBlob} />
            <PhoneMock />
            <div className={s.floatCard} style={{ top: '18%', left: '-4%' }}>
              <span className={s.floatIcon} style={{ background: 'var(--color-success)' }}>
                <Icon name="check" size={16} strokeWidth={3} />
              </span>
              <span>
                <strong>Order #24 accepted</strong>
                <small>Table T3 · 2 items</small>
              </span>
            </div>
            <div className={s.floatCard} style={{ bottom: '16%', right: '-2%' }}>
              <span className={s.floatIcon}>
                <Icon name="bell" size={16} />
              </span>
              <span>
                <strong>Water requested</strong>
                <small>Rooftop · R2</small>
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className="container">
          <header className={s.sectionHead}>
            <span className={s.kicker}>How it works</span>
            <h2>Live in three steps</h2>
          </header>
          <ol className={s.steps}>
            {STEPS.map((st, i) => (
              <li key={st.title} className={s.stepCard}>
                <span className={s.stepNum}>{i + 1}</span>
                <span className={s.stepIcon}>
                  <Icon name={st.icon} size={26} />
                </span>
                <h3>{st.title}</h3>
                <p>{st.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${s.section} ${s.sectionTinted}`}>
        <div className="container">
          <header className={s.sectionHead}>
            <span className={s.kicker}>Everything in one place</span>
            <h2>Built for the rush hour</h2>
            <p>From the guest’s phone to the kitchen pass to the final bill, every step stays in sync.</p>
          </header>
          <div className={s.featureGrid}>
            {FEATURES.map((f) => (
              <article key={f.title} className={s.featureCard}>
                <span className={s.featureIcon}>
                  <Icon name={f.icon} size={24} />
                </span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
          <div className={s.centerCta}>
            <Link href="/features" className={s.ctaGhostDark}>
              See all features <Icon name="arrowRight" size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section className={s.section}>
        <div className="container">
          <header className={s.sectionHead}>
            <span className={s.kicker}>Pricing</span>
            <h2>Pay only for orders, never more than ₹999 a month</h2>
            <p>Your menu is free. Move the slider to see what QR ordering would cost you.</p>
          </header>
          <PricingCalculator />
        </div>
      </section>

      <section className={`${s.section} ${s.sectionTinted}`}>
        <div className={`container ${s.faqWrap}`}>
          <header className={s.sectionHead}>
            <span className={s.kicker}>Questions</span>
            <h2>Good to know</h2>
          </header>
          <div className={s.faq}>
            {FAQ.map(([q, a]) => (
              <details key={q} className={s.faqItem}>
                <summary>
                  {q}
                  <Icon name="chevronDown" size={20} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={s.finalCta}>
        <div className="container">
          <h2>Ready to put your menu on the table?</h2>
          <p>Set up takes about fifteen minutes. We will help you print your first QR codes.</p>
          <a href={`${CONSOLE_URL}/signup`} className={s.ctaWhite}>
            Create your free menu <Icon name="arrowRight" size={20} />
          </a>
        </div>
      </section>
    </>
  );
}
