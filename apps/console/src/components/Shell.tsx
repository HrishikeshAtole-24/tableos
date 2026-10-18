'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import type { Role } from '@tableos/schemas';
import { Icon, type IconName, IconButton, Logo, Sheet, cx } from '@tableos/ui';
import { useSession } from '@/lib/session';
import s from './console.module.css';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  roles: Role[];
}

const ALL: Role[] = ['owner', 'manager', 'waiter', 'kitchen'];
const MGR: Role[] = ['owner', 'manager'];

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: 'home', roles: ALL },
  { href: '/orders', label: 'Live orders', icon: 'grid', roles: ['owner', 'manager', 'waiter'] },
  { href: '/kitchen', label: 'Kitchen', icon: 'chef', roles: ['owner', 'manager', 'kitchen'] },
  { href: '/waiter', label: 'Waiter', icon: 'waiter', roles: ['owner', 'manager', 'waiter'] },
  { href: '/menu', label: 'Menu', icon: 'menuBook', roles: MGR },
  { href: '/tables', label: 'Tables & QR', icon: 'qr', roles: MGR },
  { href: '/insights', label: 'Insights', icon: 'chart', roles: MGR },
  { href: '/wallet', label: 'Wallet', icon: 'wallet', roles: MGR },
  { href: '/staff', label: 'Staff', icon: 'users', roles: MGR },
  { href: '/settings', label: 'Settings', icon: 'settings', roles: MGR },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { me, restaurant, role, switchRestaurant, signOut } = useSession();
  const [switcher, setSwitcher] = useState(false);
  const items = NAV.filter((n) => role && n.roles.includes(role));
  const mobile = items.slice(0, 4);

  return (
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <Link href="/dashboard" className={s.sideLogo}>
          <Logo size={30} />
        </Link>
        <button type="button" className={s.restSwitch} onClick={() => setSwitcher(true)}>
          <span className={s.restAvatar}>{restaurant?.name.slice(0, 1) ?? '?'}</span>
          <span className={s.restText}>
            <strong>{restaurant?.name ?? 'No restaurant'}</strong>
            <small>{role ? role[0]!.toUpperCase() + role.slice(1) : 'Platform admin'}</small>
          </span>
          <Icon name="chevronDown" size={16} />
        </button>
        <nav className={s.sideNav} aria-label="Dashboard">
          {items.map((n) => (
            <Link key={n.href} href={n.href} className={cx(s.sideLink, path.startsWith(n.href) && s.sideLinkOn)}>
              <Icon name={n.icon} size={20} />
              {n.label}
            </Link>
          ))}
          {me.user.isPlatformAdmin && (
            <Link href="/admin" className={cx(s.sideLink, path.startsWith('/admin') && s.sideLinkOn)}>
              <Icon name="shield" size={20} />
              Platform admin
            </Link>
          )}
        </nav>
        <div className={s.sideFoot}>
          {restaurant && (
            <a className={s.sideLink} href={`${process.env.NEXT_PUBLIC_MENU_URL}/r/${restaurant.slug}`} target="_blank" rel="noreferrer">
              <Icon name="external" size={20} />
              View live menu
            </a>
          )}
          <button type="button" className={s.sideLink} onClick={() => void signOut()}>
            <Icon name="logout" size={20} />
            Sign out
          </button>
          <p className={s.sideUser}>{me.user.email}</p>
        </div>
      </aside>

      <div className={s.content}>
        <header className={s.mobileTop}>
          <Logo size={26} />
          <button type="button" className={s.mobileRest} onClick={() => setSwitcher(true)}>
            {restaurant?.name ?? 'Choose'} <Icon name="chevronDown" size={14} />
          </button>
        </header>
        {children}
      </div>

      <nav className={s.bottomNav} aria-label="Dashboard">
        {mobile.map((n) => (
          <Link key={n.href} href={n.href} className={cx(s.bottomLink, path.startsWith(n.href) && s.bottomLinkOn)}>
            <Icon name={n.icon} size={22} />
            <span>{n.label}</span>
          </Link>
        ))}
        <button type="button" className={s.bottomLink} onClick={() => setSwitcher(true)}>
          <Icon name="more" size={22} />
          <span>More</span>
        </button>
      </nav>

      <Sheet open={switcher} onClose={() => setSwitcher(false)} title="Menu" size="sm">
        <div className={s.switcherList}>
          {me.memberships.length > 1 && <p className={s.label}>Restaurants</p>}
          {me.memberships.length > 1 &&
            me.memberships.map((m) => (
              <button
                key={m.restaurantId}
                type="button"
                className={cx(s.switcherItem, m.restaurantId === restaurant?.id && s.switcherOn)}
                onClick={() => {
                  setSwitcher(false);
                  void switchRestaurant(m.restaurantId);
                }}
              >
                <span className={s.restAvatar}>{m.restaurantName.slice(0, 1)}</span>
                <span className={s.restText}>
                  <strong>{m.restaurantName}</strong>
                  <small>{m.role}</small>
                </span>
              </button>
            ))}
          <p className={s.label}>Go to</p>
          {items.map((n) => (
            <Link key={n.href} href={n.href} className={s.switcherItem} onClick={() => setSwitcher(false)}>
              <Icon name={n.icon} size={20} /> {n.label}
            </Link>
          ))}
          {me.user.isPlatformAdmin && (
            <Link href="/admin" className={s.switcherItem} onClick={() => setSwitcher(false)}>
              <Icon name="shield" size={20} /> Platform admin
            </Link>
          )}
          <Link href="/onboarding" className={s.switcherItem} onClick={() => setSwitcher(false)}>
            <Icon name="plus" size={20} /> Add another restaurant
          </Link>
          <button type="button" className={s.switcherItem} onClick={() => void signOut()}>
            <Icon name="logout" size={20} /> Sign out
          </button>
        </div>
      </Sheet>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <header className={s.pageHeader}>
      <div className={s.pageTitleRow}>
        {back && (
          <Link href={back} aria-label="Back">
            <IconButton icon="arrowLeft" label="Back" />
          </Link>
        )}
        <div>
          <h1 className={s.pageTitle}>{title}</h1>
          {subtitle && <p className={s.pageSub}>{subtitle}</p>}
        </div>
      </div>
      {actions && <div className={s.pageActions}>{actions}</div>}
    </header>
  );
}
