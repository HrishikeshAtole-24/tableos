import type { Metadata } from 'next';
import { Icon, type IconName } from '@tableos/ui';
import { CONSOLE_URL } from '@/components/site/SiteChrome';
import s from '@/components/site/site.module.css';

export const metadata: Metadata = { title: 'Features', description: 'QR menu, table ordering, kitchen screen, waiter view, billing and a prepaid wallet in one product.' };

const GROUPS: Array<{ title: string; lead: string; items: Array<{ icon: IconName; title: string; body: string }> }> = [
  {
    title: 'For your guests',
    lead: 'Fast, one-handed and friendly on a slow network.',
    items: [
      { icon: 'qr', title: 'Scan and open', body: 'The QR opens your menu with the table already selected. An old or misused code shows a clear message.' },
      { icon: 'search', title: 'Search that forgives typos', body: '“panner tika” still finds Paneer Tikka. Filters for Veg, Non-veg, Egg, Jain and Bestsellers.' },
      { icon: 'globe', title: 'Three languages', body: 'One-tap switch between English, Hindi and Marathi, remembered on the device.' },
      { icon: 'bag', title: 'Cart and live bill', body: 'Variants, add-ons and notes. Taxes and service charge are shown before the order is placed.' },
      { icon: 'clock', title: 'Live order tracking', body: 'Placed, Accepted, Preparing, Ready, Served. Several phones on one table, one shared bill.' },
      { icon: 'bell', title: 'Call staff', body: 'Waiter, Water and Bill buttons with a cooldown that stops repeat taps.' },
    ],
  },
  {
    title: 'For owners and managers',
    lead: 'Go live in fifteen minutes and stay in control.',
    items: [
      { icon: 'sparkles', title: 'AI menu import', body: 'Upload up to ten photos or a PDF. Low-confidence fields are highlighted for review before you publish.' },
      { icon: 'menuBook', title: 'Menu editor', body: 'Drag to reorder, variants and add-ons, one-tap sold out, hide without deleting, bulk price changes.' },
      { icon: 'table', title: 'Tables and QR codes', body: 'Sections like AC or Rooftop, print-ready A6 tent cards, and one-click QR regeneration.' },
      { icon: 'grid', title: 'Live orders board', body: 'Orders grouped by status and a table view with each table’s running bill. A sound for every new order.' },
      { icon: 'users', title: 'Staff and roles', body: 'Owner, Manager, Waiter and Kitchen roles. Invite staff by email.' },
      { icon: 'wallet', title: 'Prepaid wallet', body: 'See your balance, this month’s fees against the ₹999 cap, low-balance alerts and GST invoices.' },
    ],
  },
  {
    title: 'For the kitchen and floor',
    lead: 'Never miss an order and never retype one.',
    items: [
      { icon: 'chef', title: 'Kitchen display', body: 'One ticket per order with table, dishes, quantities and notes. Large type on a low-cost Android tablet.' },
      { icon: 'clock', title: 'Ageing timers', body: 'Each ticket’s timer turns amber and then red as it waits, so nothing sits on the pass.' },
      { icon: 'refresh', title: 'Recovers on its own', body: 'After a network drop the screen reconnects and catches up within seconds.' },
      { icon: 'waiter', title: 'Waiter queue', body: 'Acknowledge requests, accept first orders, place orders for guests and mark bills paid.' },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <section className={s.pageHero}>
        <div className="container">
          <span className={s.kicker}>Features</span>
          <h1>Everything a busy dining room needs</h1>
          <p>One product for the guest’s phone, the kitchen pass and the cash counter.</p>
        </div>
      </section>
      {GROUPS.map((g, gi) => (
        <section key={g.title} className={`${s.section} ${gi % 2 ? s.sectionTinted : ''}`}>
          <div className="container">
            <header className={s.sectionHead}>
              <h2>{g.title}</h2>
              <p>{g.lead}</p>
            </header>
            <div className={s.featureGrid}>
              {g.items.map((f) => (
                <article key={f.title} className={s.featureCard}>
                  <span className={s.featureIcon}>
                    <Icon name={f.icon} size={24} />
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      ))}
      <section className={s.finalCta}>
        <div className="container">
          <h2>Start with the free menu today</h2>
          <p>Upgrade to ordering whenever you are ready. No upfront payment.</p>
          <a href={`${CONSOLE_URL}/signup`} className={s.ctaWhite}>
            Create your free menu <Icon name="arrowRight" size={20} />
          </a>
        </div>
      </section>
    </>
  );
}
