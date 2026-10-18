'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { RestaurantDto } from '@tableos/schemas/client';
import { Button, Chip, Input, Logo, useToast } from '@tableos/ui';
import { ApiError, api, setActiveRestaurant } from '@/lib/api';
import { SessionProvider, useSession } from '@/lib/session';
import s from '@/components/console.module.css';

const CUISINES = ['North Indian', 'South Indian', 'Maharashtrian', 'Chinese', 'Café', 'Fast food', 'Biryani', 'Desserts', 'Continental', 'Street food'];

function Onboarding() {
  const router = useRouter();
  const toast = useToast();
  const { reload, me } = useSession();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [gstin, setGstin] = useState('');
  const [fssai, setFssai] = useState('');
  const [open, setOpen] = useState('11:00');
  const [close, setClose] = useState('23:00');
  const [cuisine, setCuisine] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setFields({});
    try {
      const day = [{ open, close }];
      const r = await api<RestaurantDto>('/restaurants', {
        method: 'POST',
        noTenant: true,
        body: {
          name,
          city: city || undefined,
          address: address || undefined,
          cuisine,
          gstin: gstin || undefined,
          fssaiNo: fssai || undefined,
          openingHours: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day },
        },
      });
      setActiveRestaurant(r.id);
      await reload();
      toast.success(`${r.name} is ready. Let’s add your menu.`);
      router.replace('/dashboard');
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        if (!Object.keys(e.fields).length) toast.error(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={s.onboard}>
      <div className={s.onboardCard}>
        <Logo size={32} />
        <h1>Tell us about your restaurant</h1>
        <p className={s.muted}>
          Signed in as {me.user.email}. You can change everything later in Settings.
        </p>
        <form
          className={s.formGrid}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Input label="Restaurant name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="e.g. Spice Route Café" error={fields.name} fieldClassName={s.span2} />
          <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Pune" error={fields.city} />
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area" error={fields.address} />
          <div className={s.span2}>
            <span className={s.label}>Cuisine</span>
            <div className={s.chips}>
              {CUISINES.map((c) => (
                <Chip key={c} selected={cuisine.includes(c)} onClick={() => setCuisine((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : cur.length < 6 ? [...cur, c] : cur))}>
                  {c}
                </Chip>
              ))}
            </div>
          </div>
          <Input label="Opens at" type="time" value={open} onChange={(e) => setOpen(e.target.value)} />
          <Input label="Closes at" type="time" value={close} onChange={(e) => setClose(e.target.value)} hint="Closing after midnight is fine" />
          <Input label="GSTIN" optional value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} error={fields.gstin} placeholder="27ABCDE1234F1Z5" />
          <Input label="FSSAI licence number" optional value={fssai} onChange={(e) => setFssai(e.target.value)} error={fields.fssaiNo} inputMode="numeric" />
          <Button type="submit" size="lg" block loading={busy} disabled={name.trim().length < 2} className={s.span2}>
            Create restaurant
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <SessionProvider requireRestaurant={false}>
      <Onboarding />
    </SessionProvider>
  );
}
