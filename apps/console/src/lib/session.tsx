'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { MeDto, RestaurantDto, Role } from '@tableos/schemas/client';
import { Spinner } from '@tableos/ui';
import { api, getActiveRestaurant, setActiveRestaurant } from './api';
import { supabase } from './supabase';

interface SessionCtx {
  me: MeDto;
  restaurant: RestaurantDto | null;
  role: Role | null;
  switchRestaurant: (id: string) => Promise<void>;
  reload: () => Promise<void>;
  refreshRestaurant: () => Promise<void>;
  signOut: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const Ctx = createContext<SessionCtx | null>(null);

const PUBLIC = ['/login', '/signup'];

/** Loads the signed-in user, their memberships and the active restaurant; redirects as needed. */
export function SessionProvider({ children, requireRestaurant = true }: { children: ReactNode; requireRestaurant?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<MeDto | null>(null);
  const [restaurant, setRestaurant] = useState<RestaurantDto | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase().auth.getSession();
    if (!data.session) {
      router.replace(`/login?next=${encodeURIComponent(path)}`);
      return;
    }
    const m = await api<MeDto>('/me', { noTenant: true });
    setMe(m);
    let rid = getActiveRestaurant();
    if (!rid || !m.memberships.some((x) => x.restaurantId === rid)) {
      rid = m.memberships[0]?.restaurantId ?? null;
      setActiveRestaurant(rid);
    }
    if (rid) setRestaurant(await api<RestaurantDto>('/restaurant'));
    else if (requireRestaurant && !m.user.isPlatformAdmin) router.replace('/onboarding');
    setReady(true);
  }, [path, requireRestaurant, router]);

  useEffect(() => {
    load().catch(() => router.replace('/login'));
    const { data } = supabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && !PUBLIC.includes(window.location.pathname)) router.replace('/login');
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<SessionCtx | null>(() => {
    if (!me) return null;
    const role = (me.memberships.find((m) => m.restaurantId === restaurant?.id)?.role ?? null) as Role | null;
    return {
      me,
      restaurant,
      role,
      reload: load,
      refreshRestaurant: async () => setRestaurant(await api<RestaurantDto>('/restaurant')),
      switchRestaurant: async (id) => {
        setActiveRestaurant(id);
        setRestaurant(await api<RestaurantDto>('/restaurant'));
        router.push('/dashboard');
      },
      signOut: async () => {
        await supabase().auth.signOut();
        setActiveRestaurant(null);
        router.replace('/login');
      },
      can: (...roles) => Boolean(role && roles.includes(role)),
    };
  }, [me, restaurant, load, router]);

  if (!ready || !value) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <Spinner size={36} />
      </div>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSession outside SessionProvider');
  return c;
}
