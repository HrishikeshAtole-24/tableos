'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { OpeningHours, RestaurantDto } from '@tableos/schemas';
import { Banner, Button, Chip, Icon, Input, Switch, useToast } from '@tableos/ui';
import { PageHeader } from '@/components/Shell';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { uploadFile } from '@/lib/upload';
import s from '@/components/console.module.css';

const DAY_LABEL = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' } as const;
const ORDERED = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const COLORS = ['#FC8019', '#E43B4F', '#1BA672', '#2B6DE5', '#7B4DE3', '#02060C'];

export default function SettingsPage() {
  const toast = useToast();
  const { restaurant, refreshRestaurant, me, reload } = useSession();
  const [r, setR] = useState<RestaurantDto | null>(restaurant);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<'idle' | 'code'>('idle');

  useEffect(() => setR(restaurant), [restaurant]);
  if (!r) return null;

  const save = async (section: string, patch: Partial<RestaurantDto> & Record<string, unknown>) => {
    setSaving(section);
    setFields({});
    try {
      await api(`/restaurants/${r.id}`, { method: 'PATCH', body: patch });
      await refreshRestaurant();
      toast.success('Saved');
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        toast.error(e.message);
      }
    } finally {
      setSaving(null);
    }
  };
  const set = <K extends keyof RestaurantDto>(k: K, v: RestaurantDto[K]) => setR((cur) => (cur ? { ...cur, [k]: v } : cur));
  const setHours = (day: keyof OpeningHours, value: Array<{ open: string; close: string }>) => setR((cur) => (cur ? { ...cur, openingHours: { ...cur.openingHours, [day]: value } } : cur));

  const onLogo = async (file?: File) => {
    if (!file) return;
    try {
      const t = await uploadFile(file, 'logo');
      await save('logo', { logoUrl: t.publicUrl });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  // Verify the missing identifier later (spec §3.6). Phone OTP needs SMS (DLT) in production.
  const sendPhone = async () => {
    const { error } = await supabase().auth.updateUser({ phone });
    if (error) return toast.error(error.message);
    setPhoneStep('code');
    toast.success('Code sent by SMS');
  };
  const verifyPhone = async () => {
    const { error } = await supabase().auth.verifyOtp({ phone, token: phoneCode, type: 'phone_change' });
    if (error) return toast.error(error.message);
    await supabase().auth.refreshSession();
    await reload();
    setPhoneStep('idle');
    toast.success('Phone verified');
  };

  return (
    <div className={s.page} style={{ maxWidth: 1080 }}>
      <PageHeader title="Settings" subtitle={r.name} />
      <div className={s.stack} style={{ gap: 0 }}>
        <div className={s.settingsSection}>
          <div className={s.settingsAside}>
            <h2>Ordering</h2>
            <p>Switch QR ordering off any time. Your menu stays visible.</p>
          </div>
          <section className={s.card}>
            <Switch checked={r.orderingEnabled} onChange={(v) => { set('orderingEnabled', v); void save('ordering', { orderingEnabled: v }); }} label="Take orders from tables" description="When off, guests see the menu in view-only mode with “Please order with staff”." />
            <Switch checked={r.requireFirstOrderAcceptance} onChange={(v) => { set('requireFirstOrderAcceptance', v); void save('ordering', { requireFirstOrderAcceptance: v }); }} label="Staff must accept the first order of a table" description="Stops prank orders. Later rounds from the same table go straight to the kitchen." />
          </section>
        </div>
        <div className={s.divider} />

        <div className={s.settingsSection}>
          <div className={s.settingsAside}>
            <h2>Restaurant profile</h2>
            <p>Shown at the top of your menu and on bills.</p>
          </div>
          <section className={s.card}>
            <div className={s.photoPick} style={{ marginBottom: 16 }}>
              <div className={s.photoBox}>{r.logoUrl ? <Image src={r.logoUrl} alt="" fill sizes="96px" /> : <Icon name="building" size={28} />}</div>
              <div className={s.stack} style={{ gap: 8 }}>
                <input ref={logoRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => void onLogo(e.target.files?.[0])} />
                <Button size="sm" variant="outline" icon="upload" onClick={() => logoRef.current?.click()}>
                  Upload logo
                </Button>
                <span className={s.small}>Square PNG or JPG. Also printed on QR cards.</span>
              </div>
            </div>
            <div className={s.formGrid} style={{ marginTop: 0 }}>
              <Input label="Name" value={r.name} onChange={(e) => set('name', e.target.value)} error={fields.name} />
              <Input label="Menu link" prefix="/r/" value={r.slug} disabled={!r.canChangeSlug} onChange={(e) => set('slug', e.target.value.toLowerCase())} error={fields.slug} hint={r.canChangeSlug ? 'You can change this once.' : 'Already changed once.'} />
              <Input label="Address" value={r.address ?? ''} onChange={(e) => set('address', e.target.value)} />
              <Input label="City" value={r.city ?? ''} onChange={(e) => set('city', e.target.value)} />
              <Input label="GSTIN" optional value={r.gstin ?? ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} error={fields.gstin} />
              <Input label="FSSAI licence" optional value={r.fssaiNo ?? ''} onChange={(e) => set('fssaiNo', e.target.value)} error={fields.fssaiNo} />
              <Input label="Google review link" optional value={r.googleReviewUrl ?? ''} onChange={(e) => set('googleReviewUrl', e.target.value)} error={fields.googleReviewUrl} fieldClassName={s.span2} />
            </div>
            <div style={{ marginTop: 16 }}>
              <span className={s.label}>Menu theme colour</span>
              <div className={s.chips}>
                {COLORS.map((c) => (
                  <button key={c} type="button" aria-label={c} onClick={() => set('theme', { primary: c })} style={{ width: 36, height: 36, borderRadius: 12, background: c, boxShadow: r.theme.primary.toUpperCase() === c ? '0 0 0 3px #fff, 0 0 0 5px ' + c : 'none' }} />
                ))}
              </div>
            </div>
            <div style={{ marginTop: 20 }}>
              <Button
                loading={saving === 'profile'}
                onClick={() =>
                  void save('profile', {
                    name: r.name,
                    ...(r.canChangeSlug && r.slug !== restaurant?.slug ? { slug: r.slug } : {}),
                    address: r.address || null,
                    city: r.city || null,
                    gstin: r.gstin || null,
                    fssaiNo: r.fssaiNo || null,
                    googleReviewUrl: r.googleReviewUrl || null,
                    theme: r.theme,
                  })
                }
              >
                Save profile
              </Button>
            </div>
          </section>
        </div>
        <div className={s.divider} />

        <div className={s.settingsSection}>
          <div className={s.settingsAside}>
            <h2>Opening hours</h2>
            <p>Outside these hours the menu is view-only. Closing after midnight is fine.</p>
          </div>
          <section className={s.card}>
            <div className={s.stack} style={{ gap: 10 }}>
              {ORDERED.map((d) => {
                const list = r.openingHours[d] ?? [];
                const iv = list[0];
                return (
                  <div key={d} className={s.hoursRow}>
                    <strong>{DAY_LABEL[d]}</strong>
                    {iv ? (
                      <>
                        <input type="time" className={s.cellInput} value={iv.open} onChange={(e) => setHours(d, [{ ...iv, open: e.target.value }])} aria-label={`${d} opens`} />
                        <input type="time" className={s.cellInput} value={iv.close} onChange={(e) => setHours(d, [{ ...iv, close: e.target.value }])} aria-label={`${d} closes`} />
                      </>
                    ) : (
                      <span className={s.muted} style={{ gridColumn: 'span 2' }}>
                        Closed
                      </span>
                    )}
                    <Switch checked={Boolean(iv)} onChange={(v) => setHours(d, v ? [{ open: '11:00', close: '23:00' }] : [])} />
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 20 }}>
              <Button loading={saving === 'hours'} onClick={() => void save('hours', { openingHours: r.openingHours })}>
                Save hours
              </Button>
            </div>
          </section>
        </div>
        <div className={s.divider} />

        <div className={s.settingsSection}>
          <div className={s.settingsAside}>
            <h2>Billing and languages</h2>
            <p>Service charge appears as its own line on bills.</p>
          </div>
          <section className={s.card}>
            <div className={s.formGrid} style={{ marginTop: 0 }}>
              <Input label="Service charge" suffix="%" inputMode="decimal" value={String(r.serviceChargeBp / 100)} onChange={(e) => set('serviceChargeBp', Math.round(Number(e.target.value.replace(/[^\d.]/g, '') || 0) * 100))} hint="0 to 20%. Leave 0 for none." />
            </div>
            <span className={s.label}>Menu languages</span>
            <div className={s.chips}>
              {(['en', 'hi', 'mr'] as const).map((l) => (
                <Chip key={l} selected={r.languages.includes(l)} disabled={l === 'en'} onClick={() => set('languages', r.languages.includes(l) ? r.languages.filter((x) => x !== l) : [...r.languages, l])}>
                  {{ en: 'English', hi: 'हिंदी Hindi', mr: 'मराठी Marathi' }[l]}
                </Chip>
              ))}
            </div>
            <div style={{ marginTop: 20 }}>
              <Button loading={saving === 'billing'} onClick={() => void save('billing', { serviceChargeBp: r.serviceChargeBp, languages: r.languages })}>
                Save
              </Button>
            </div>
          </section>
        </div>
        <div className={s.divider} />

        <div className={s.settingsSection}>
          <div className={s.settingsAside}>
            <h2>Your account</h2>
            <p>Both email and phone are needed to connect a payment account or transfer ownership.</p>
          </div>
          <section className={s.card}>
            <div className={s.stack}>
              <div className={s.between}>
                <span>
                  <strong>Email</strong>
                  <div className={s.small}>{me.user.email ?? 'Not added'}</div>
                </span>
                {me.user.emailVerified && <Icon name="check" size={20} style={{ color: 'var(--color-success)' }} />}
              </div>
              <div className={s.between}>
                <span>
                  <strong>Phone</strong>
                  <div className={s.small}>{me.user.phone ?? 'Not added'}</div>
                </span>
                {me.user.phoneVerified && <Icon name="check" size={20} style={{ color: 'var(--color-success)' }} />}
              </div>
              {!me.user.phoneVerified && (
                <>
                  <Banner tone="info" title="Add and verify your phone number">You will get a 6-digit code by SMS.</Banner>
                  {phoneStep === 'idle' ? (
                    <div className={s.row} style={{ alignItems: 'flex-end' }}>
                      <Input label="Mobile number" prefix="+91" inputMode="tel" value={phone.replace(/^\+91/, '')} onChange={(e) => setPhone(`+91${e.target.value.replace(/\D/g, '').slice(0, 10)}`)} />
                      <Button variant="outline" disabled={phone.length !== 13} onClick={() => void sendPhone()}>
                        Send code
                      </Button>
                    </div>
                  ) : (
                    <div className={s.row} style={{ alignItems: 'flex-end' }}>
                      <Input label="Code" inputMode="numeric" value={phoneCode} onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                      <Button disabled={phoneCode.length !== 6} onClick={() => void verifyPhone()}>
                        Verify
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
