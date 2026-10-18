'use client';

import { useState } from 'react';
import type { StaffInviteDto, StaffMemberDto } from '@tableos/schemas/client';
import { Badge, Button, Input, Segmented, Sheet, Skeleton, useToast } from '@tableos/ui';
import { PageHeader } from '@/components/Shell';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import s from '@/components/console.module.css';

const ROLE_HELP = { manager: 'Everything except ownership, payment account and closing the account', waiter: 'Orders, service requests and bills', kitchen: 'Kitchen screen only' };

export default function StaffPage() {
  const toast = useToast();
  const { me, can } = useSession();
  const staff = useQuery<{ members: StaffMemberDto[]; invites: StaffInviteDto[] }>('/staff');
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'manager' | 'waiter' | 'kitchen'>('waiter');
  const [busy, setBusy] = useState(false);

  const invite = async () => {
    setBusy(true);
    try {
      await api('/staff/invites', { method: 'POST', body: { email, role } });
      toast.success(`Invite sent to ${email}`);
      setEmail('');
      setOpen(false);
      void staff.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not invite');
    } finally {
      setBusy(false);
    }
  };
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      void staff.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  };

  return (
    <div className={s.page} style={{ maxWidth: 1000 }}>
      <PageHeader title="Staff" subtitle="Invite your team and choose what each person can do." actions={<Button icon="plus" onClick={() => setOpen(true)}>Invite staff</Button>} />
      <section className={s.card}>
        {!staff.data ? (
          <Skeleton height={160} />
        ) : (
          <div className={s.tableWrap}>
            <table className={s.dataTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {staff.data.members.map((m) => (
                  <tr key={m.membershipId}>
                    <td>
                      <strong>{m.name ?? m.email ?? m.phone}</strong>
                      <div className={s.small}>{m.email ?? m.phone}</div>
                    </td>
                    <td>
                      {m.role === 'owner' || m.userId === me.user.id ? (
                        <Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{m.role}</Badge>
                      ) : (
                        <select className={s.cellInput} style={{ maxWidth: 140 }} value={m.role} onChange={(e) => void act(() => api(`/staff/${m.membershipId}`, { method: 'PATCH', body: { role: e.target.value } }), 'Role updated')}>
                          <option value="manager">Manager</option>
                          <option value="waiter">Waiter</option>
                          <option value="kitchen">Kitchen</option>
                        </select>
                      )}
                    </td>
                    <td className={s.small}>{new Date(m.joinedAt).toLocaleDateString('en-IN')}</td>
                    <td>
                      {m.role !== 'owner' && m.userId !== me.user.id && (
                        <div className={s.row} style={{ justifyContent: 'flex-end', gap: 4 }}>
                          {can('owner') && (
                            <Button size="sm" variant="ghost" onClick={() => window.confirm(`Make ${m.name ?? m.email} the owner? You become a manager.`) && void act(() => api(`/staff/${m.membershipId}/transfer-ownership`, { method: 'POST' }), 'Ownership transferred')}>
                              Make owner
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => window.confirm('Remove this person from your team?') && void act(() => api(`/staff/${m.membershipId}`, { method: 'DELETE' }), 'Removed')}>
                            Remove
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {staff.data.invites.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.email ?? i.phone}</strong>
                      <div className={s.small}>Invite pending</div>
                    </td>
                    <td>
                      <Badge tone="warning">{i.role}</Badge>
                    </td>
                    <td className={s.small}>Expires {new Date(i.expiresAt).toLocaleDateString('en-IN')}</td>
                    <td>
                      <div className={s.row} style={{ justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="ghost" onClick={() => void act(() => api(`/staff/invites/${i.id}`, { method: 'DELETE' }), 'Invite revoked')}>
                          Revoke
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Sheet open={open} onClose={() => setOpen(false)} placement="center" size="sm" title="Invite staff" footer={<Button block loading={busy} disabled={!/\S+@\S+\.\S+/.test(email)} onClick={() => void invite()}>Send invite</Button>}>
        <div className={s.stack}>
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" icon="mail" />
          <div>
            <span className={s.label}>Role</span>
            <Segmented value={role} onChange={setRole} items={[{ value: 'manager', label: 'Manager' }, { value: 'waiter', label: 'Waiter' }, { value: 'kitchen', label: 'Kitchen' }]} />
            <p className={s.small} style={{ marginTop: 8 }}>{ROLE_HELP[role]}</p>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
