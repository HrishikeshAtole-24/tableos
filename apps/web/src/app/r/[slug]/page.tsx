import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { type Locale, type PublicMenuDto, LOCALES } from '@tableos/schemas/client';
import { DinerApp } from '@/components/diner/DinerApp';
import { API_URL } from '@/lib/api';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
}

async function getMenu(slug: string, locale: Locale): Promise<PublicMenuDto | null> {
  const res = await fetch(`${API_URL}/v1/public/restaurants/${encodeURIComponent(slug)}/menu?locale=${locale}`, {
    next: { tags: [`menu:${slug}`], revalidate: 60 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Menu request failed: ${res.status}`);
  return (await res.json()) as PublicMenuDto;
}

async function resolveLocale(): Promise<Locale> {
  const c = (await cookies()).get('tos-locale')?.value;
  return (LOCALES as readonly string[]).includes(c ?? '') ? (c as Locale) : 'en';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const menu = await getMenu(slug, 'en').catch(() => null);
  if (!menu) return { title: 'Menu not found' };
  const r = menu.restaurant;
  return {
    title: `${r.name} menu`,
    description: `${r.name}${r.city ? `, ${r.city}` : ''}. ${r.cuisine.join(', ')}. Browse the menu and order from your table.`,
    openGraph: { title: `${r.name} · Menu`, images: r.coverUrl ? [r.coverUrl] : undefined },
    robots: { index: true, follow: true },
  };
}

export default async function MenuPage({ params, searchParams }: Props) {
  const [{ slug }, { t }, locale] = await Promise.all([params, searchParams, resolveLocale()]);
  const menu = await getMenu(slug, locale);
  if (!menu) notFound();
  return <DinerApp initialMenu={menu} qrToken={t ?? null} initialLocale={locale} />;
}
