'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, IconButton, Logo, cx } from '@tableos/ui';
import s from './site.module.css';

export const CONSOLE_URL = process.env.NEXT_PUBLIC_CONSOLE_URL ?? 'http://localhost:3001';
const NAV = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/demo', label: 'Live demo' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setOpen(false), [path]);

  return (
    <header className={cx(s.header, scrolled && s.headerScrolled)}>
      <div className={cx('container', s.headerInner)}>
        <Link href="/" aria-label="TableOS home">
          <Logo size={34} />
        </Link>
        <nav className={s.nav} aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cx(s.navLink, path === n.href && s.navOn)}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className={s.headerCtas}>
          <a href={`${CONSOLE_URL}/login`} className={s.signIn}>
            Sign in
          </a>
          <a href={`${CONSOLE_URL}/signup`} className={s.ctaSmall}>
            Create free menu
          </a>
          <IconButton icon={open ? 'close' : 'list'} label="Menu" className={s.burger} onClick={() => setOpen((v) => !v)} aria-expanded={open} />
        </div>
      </div>
      {open && (
        <div className={s.mobileNav}>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={s.mobileLink}>
              {n.label}
              <Icon name="chevronRight" size={18} />
            </Link>
          ))}
          <a href={`${CONSOLE_URL}/login`} className={s.mobileLink}>
            Sign in <Icon name="chevronRight" size={18} />
          </a>
          <a href={`${CONSOLE_URL}/signup`} className={s.ctaBlock}>
            Create your free menu
          </a>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className={cx('container', s.footerGrid)}>
        <div className={s.footerBrand}>
          <Logo size={34} inverse />
          <p>QR menus and table ordering for independent restaurants and cafés in India.</p>
        </div>
        <div>
          <h3>Product</h3>
          <ul>
            <li><Link href="/features">Features</Link></li>
            <li><Link href="/pricing">Pricing</Link></li>
            <li><Link href="/demo">Live demo</Link></li>
          </ul>
        </div>
        <div>
          <h3>Company</h3>
          <ul>
            <li><Link href="/contact">Contact</Link></li>
            <li><a href={`${CONSOLE_URL}/login`}>Sign in</a></li>
          </ul>
        </div>
        <div>
          <h3>Legal</h3>
          <ul>
            <li><Link href="/privacy">Privacy policy</Link></li>
            <li><Link href="/terms">Terms of service</Link></li>
            <li><Link href="/refund">Refund and cancellation</Link></li>
          </ul>
        </div>
      </div>
      <div className={cx('container', s.footerBottom)}>
        <span>© {new Date().getFullYear()} TableOS. Made in India.</span>
        <span>Diner payments go straight to the restaurant, never through us.</span>
      </div>
    </footer>
  );
}
