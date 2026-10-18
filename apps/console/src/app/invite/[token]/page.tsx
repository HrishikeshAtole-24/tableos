'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, EmptyState, Logo } from '@tableos/ui';
import { ApiError, api, setActiveRestaurant } from '@/lib/api';
import { SessionProvider, useSession } from '@/lib/session';
import s from '@/components/console.module.css';

function Accept() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { me, reload } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = async () => {
    setBusy(true);
    try {
      const r = await api<{ restaurantId: string }>(`/invites/${token}/accept`, { method: 'POST', noTenant: true });
      setActiveRestaurant(r.restaurantId);
      await reload();
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not accept the invite');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={s.onboard}>
      <div className={s.onboardCard}>
        <Logo size={32} />
        <EmptyState
          icon="users"
          title="You have been invited to a team"
          description={error ?? `Accept to join as ${me.user.email}.`}
          action={
            <Button size="lg" loading={busy} onClick={() => void accept()}>
              Accept invite
            </Button>
          }
        />
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <SessionProvider requireRestaurant={false}>
      <Accept />
    </SessionProvider>
  );
}
