import { SiteFooter, SiteHeader } from '@/components/site/SiteChrome';
import s from '@/components/site/site.module.css';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.site}>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
