import type { Metadata } from 'next';
import { Icon } from '@tableos/ui';
import s from '@/components/site/site.module.css';

export const metadata: Metadata = { title: 'Contact', description: 'Talk to the TableOS team.' };

const EMAIL = process.env.CONTACT_EMAIL ?? 'hello@tableos.in';

export default function ContactPage() {
  return (
    <>
      <section className={s.pageHero}>
        <div className="container">
          <span className={s.kicker}>Contact</span>
          <h1>We would love to hear from you</h1>
          <p>Questions about setup, pricing or a feature you need? Write to us and a real person will reply.</p>
        </div>
      </section>
      <section className={s.section}>
        <div className={`container ${s.contactGrid}`}>
          <a href={`mailto:${EMAIL}`} className={s.contactCard}>
            <span className={s.featureIcon}>
              <Icon name="mail" size={24} />
            </span>
            <h2>Email</h2>
            <p>{EMAIL}</p>
            <span className={s.contactLink}>
              Write to us <Icon name="arrowRight" size={16} />
            </span>
          </a>
          <div className={s.contactCard}>
            <span className={s.featureIcon}>
              <Icon name="clock" size={24} />
            </span>
            <h2>Support hours</h2>
            <p>Monday to Saturday, 10 am to 8 pm IST. We reply within one working day.</p>
          </div>
          <div className={s.contactCard}>
            <span className={s.featureIcon}>
              <Icon name="mapPin" size={24} />
            </span>
            <h2>On-site setup</h2>
            <p>Starting in Pune. We can visit, set up your menu and print your QR codes with you.</p>
          </div>
        </div>
      </section>
    </>
  );
}
