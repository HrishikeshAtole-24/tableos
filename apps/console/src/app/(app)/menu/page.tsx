'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { type MenuCategoryDto, type MenuItemDto, formatPaise } from '@tableos/schemas/client';
import { Button, DietMark, EmptyState, Icon, IconButton, Input, Segmented, Sheet, Skeleton, Switch, Tabs, Tag, cx, useToast } from '@tableos/ui';
import { DishEditor } from '@/components/DishEditor';
import { PageHeader } from '@/components/Shell';
import { ApiError, api } from '@/lib/api';
import { useQuery } from '@/lib/hooks';
import s from '@/components/console.module.css';

export default function MenuPage() {
  const toast = useToast();
  const menu = useQuery<MenuCategoryDto[]>('/menu');
  const [tab, setTab] = useState<'dishes' | 'translations'>('dishes');
  const [catId, setCatId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ open: boolean; item: MenuItemDto | null }>({ open: false, item: null });
  const [catSheet, setCatSheet] = useState<{ open: boolean; cat: MenuCategoryDto | null }>({ open: false, cat: null });
  const [bulk, setBulk] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const cats = useMemo(() => menu.data ?? [], [menu.data]);
  useEffect(() => {
    if (!catId && cats[0]) setCatId(cats[0].id);
  }, [cats, catId]);
  const current = cats.find((c) => c.id === catId) ?? null;
  const items = useMemo(() => {
    if (query.trim()) return cats.flatMap((c) => c.items).filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
    return current?.items ?? [];
  }, [cats, current, query]);

  const patchLocal = (id: string, patch: Partial<MenuItemDto>) =>
    menu.setData((cur) => (cur ?? []).map((c) => ({ ...c, items: c.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })));

  const toggle = async (item: MenuItemDto, field: 'available' | 'visible') => {
    const value = !item[field];
    patchLocal(item.id, { [field]: value });
    try {
      if (field === 'available') await api(`/menu/items/${item.id}/availability`, { method: 'PATCH', body: { available: value } });
      else await api(`/menu/items/${item.id}`, { method: 'PATCH', body: { visible: value } });
      toast.success(field === 'available' ? (value ? `${item.name} is back` : `${item.name} marked sold out`) : value ? 'Dish shown on menu' : 'Dish hidden from menu');
    } catch (e) {
      patchLocal(item.id, { [field]: !value });
      toast.error(e instanceof ApiError ? e.message : 'Could not update');
    }
  };

  const remove = async (item: MenuItemDto) => {
    if (!window.confirm(`Delete ${item.name}? If it was ever ordered, it will be hidden instead.`)) return;
    try {
      const r = await api<{ deleted: boolean; hidden: boolean }>(`/menu/items/${item.id}`, { method: 'DELETE' });
      toast.success(r.deleted ? 'Dish deleted' : 'Dish hidden (it has past orders)');
      void menu.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not delete');
    }
  };

  const drop = async (targetId: string) => {
    if (!current || !dragId || dragId === targetId) return;
    const ids = current.items.map((i) => i.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]!);
    menu.setData((cur) => (cur ?? []).map((c) => (c.id === current.id ? { ...c, items: ids.map((id) => c.items.find((i) => i.id === id)!) } : c)));
    setDragId(null);
    setOverId(null);
    try {
      await api('/menu/reorder', { method: 'POST', body: { items: [{ categoryId: current.id, itemIds: ids }] } });
    } catch {
      toast.error('Could not save the new order');
      void menu.reload();
    }
  };

  const moveCat = async (id: string, dir: -1 | 1) => {
    const ids = cats.map((c) => c.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    menu.setData((cur) => ids.map((x) => (cur ?? []).find((c) => c.id === x)!));
    await api('/menu/reorder', { method: 'POST', body: { categories: ids } }).catch(() => void menu.reload());
  };

  return (
    <div className={s.page}>
      <PageHeader
        title="Menu"
        subtitle={`${cats.length} categories · ${cats.reduce((a, c) => a + c.items.length, 0)} dishes`}
        actions={
          <>
            <Link href="/menu/import">
              <Button variant="outline" icon="sparkles">
                Import with AI
              </Button>
            </Link>
            <Button variant="outline" icon="rupee" onClick={() => setBulk(true)} disabled={!cats.length}>
              Bulk price
            </Button>
            <Button icon="plus" onClick={() => setEditing({ open: true, item: null })} disabled={!cats.length}>
              Add dish
            </Button>
          </>
        }
      />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'dishes', label: 'Dishes' }, { value: 'translations', label: 'Translations' }]} />
      <div style={{ height: 20 }} />

      {tab === 'translations' ? (
        <Translations menu={cats} />
      ) : menu.loading && !menu.data ? (
        <div className={s.menuLayout}>
          <Skeleton height={300} radius={16} />
          <Skeleton height={400} radius={16} />
        </div>
      ) : cats.length === 0 ? (
        <section className={s.card}>
          <EmptyState
            icon="menuBook"
            title="Your menu is empty"
            description="Snap your printed menu and let AI build it for you, or start by adding a category."
            action={
              <div className={s.row} style={{ justifyContent: 'center' }}>
                <Link href="/menu/import">
                  <Button icon="sparkles">Import with AI</Button>
                </Link>
                <Button variant="outline" icon="plus" onClick={() => setCatSheet({ open: true, cat: null })}>
                  Add category
                </Button>
              </div>
            }
          />
        </section>
      ) : (
        <div className={s.menuLayout}>
          <section className={s.card} style={{ padding: 12 }}>
            <div className={s.catList}>
              {cats.map((c, i) => (
                <div key={c.id} className={s.row} style={{ gap: 2, flexWrap: 'nowrap' }}>
                  <button type="button" className={cx(s.catItem, c.id === catId && !query && s.catItemOn)} style={{ flex: 1 }} onClick={() => { setCatId(c.id); setQuery(''); }}>
                    {!c.visible && <Icon name="eyeOff" size={14} />}
                    {c.name}
                    <span className={s.catCount}>{c.items.length}</span>
                  </button>
                  {c.id === catId && (
                    <>
                      <IconButton small icon="chevronUp" label="Move up" disabled={i === 0} onClick={() => void moveCat(c.id, -1)} />
                      <IconButton small icon="edit" label="Edit category" onClick={() => setCatSheet({ open: true, cat: c })} />
                    </>
                  )}
                </div>
              ))}
              <button type="button" className={s.catItem} style={{ color: 'var(--color-brand)' }} onClick={() => setCatSheet({ open: true, cat: null })}>
                <Icon name="plus" size={16} /> Add category
              </button>
            </div>
          </section>

          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>{query ? 'Search results' : current?.name}</h2>
              <div style={{ maxWidth: 260, width: '100%' }}>
                <Input icon="search" placeholder="Search all dishes" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
            </div>
            {items.length === 0 ? (
              <EmptyState compact icon="utensils" title="No dishes here yet" action={<Button size="sm" icon="plus" onClick={() => setEditing({ open: true, item: null })}>Add dish</Button>} />
            ) : (
              <div>
                {items.map((it) => (
                  <div
                    key={it.id}
                    className={cx(s.dishRow, !it.visible && s.dishHidden, dragId === it.id && s.dishRowDragging, overId === it.id && s.dishRowOver)}
                    draggable={!query}
                    onDragStart={() => setDragId(it.id)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOverId(it.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    onDrop={() => void drop(it.id)}
                  >
                    {!query && <Icon name="drag" size={18} className={s.dragHandle} />}
                    <div className={s.dishThumb}>{it.photoUrl ? <Image src={it.photoUrl} alt="" fill sizes="56px" /> : <Icon name="utensils" size={20} />}</div>
                    <div className={s.dishInfo}>
                      <strong>
                        <DietMark diet={it.diet} size={13} /> {it.name}
                        {!it.visible && <Tag>Hidden</Tag>}
                        {!it.available && <Tag tone="danger">Sold out</Tag>}
                      </strong>
                      <span className={s.small}>
                        {it.variants.length ? it.variants.map((v) => `${v.name} ${formatPaise(v.pricePaise)}`).join(' · ') : formatPaise(it.basePricePaise)}
                        {it.addonGroups.length > 0 && ` · ${it.addonGroups.reduce((a, g) => a + g.addons.length, 0)} add-ons`}
                      </span>
                    </div>
                    <div className={s.row} style={{ gap: 4, flexWrap: 'nowrap' }}>
                      <span className={s.small} style={{ display: 'none' }}>In stock</span>
                      <Switch checked={it.available} onChange={() => void toggle(it, 'available')} />
                      <IconButton small icon={it.visible ? 'eye' : 'eyeOff'} label={it.visible ? 'Hide from menu' : 'Show on menu'} onClick={() => void toggle(it, 'visible')} />
                      <IconButton small icon="edit" label="Edit dish" onClick={() => setEditing({ open: true, item: it })} />
                      <IconButton small icon="trash" label="Delete dish" onClick={() => void remove(it)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <DishEditor open={editing.open} item={editing.item} categories={cats} defaultCategoryId={catId} onClose={() => setEditing({ open: false, item: null })} onSaved={() => void menu.reload()} />
      <CategorySheet state={catSheet} onClose={() => setCatSheet({ open: false, cat: null })} onSaved={(id) => { void menu.reload(); if (id) setCatId(id); }} />
      <BulkPriceSheet open={bulk} onClose={() => setBulk(false)} menu={cats} onDone={() => void menu.reload()} />
    </div>
  );
}

function CategorySheet({ state, onClose, onSaved }: { state: { open: boolean; cat: MenuCategoryDto | null }; onClose: () => void; onSaved: (id?: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(state.cat?.name ?? '');
    setVisible(state.cat?.visible ?? true);
  }, [state]);
  const save = async () => {
    setBusy(true);
    try {
      if (state.cat) {
        await api(`/menu/categories/${state.cat.id}`, { method: 'PATCH', body: { name, visible } });
        onSaved();
      } else {
        const c = await api<MenuCategoryDto>('/menu/categories', { method: 'POST', body: { name, visible } });
        onSaved(c.id);
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    if (!state.cat) return;
    try {
      await api(`/menu/categories/${state.cat.id}`, { method: 'DELETE' });
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not delete');
    }
  };
  return (
    <Sheet
      open={state.open}
      onClose={onClose}
      placement="center"
      size="sm"
      title={state.cat ? 'Edit category' : 'New category'}
      footer={
        <div className={s.row} style={{ justifyContent: 'space-between' }}>
          {state.cat ? (
            <Button variant="link" onClick={() => void del()} style={{ color: 'var(--color-danger)' }}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <Button loading={busy} disabled={!name.trim()} onClick={() => void save()}>
            Save
          </Button>
        </div>
      }
    >
      <div className={s.stack}>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Starters" />
        <Switch checked={visible} onChange={setVisible} label="Show on menu" />
      </div>
    </Sheet>
  );
}

function BulkPriceSheet({ open, onClose, menu, onDone }: { open: boolean; onClose: () => void; menu: MenuCategoryDto[]; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('10');
  const [cats, setCats] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setCats(menu.map((c) => c.id));
  }, [open, menu]);
  const itemIds = menu.filter((c) => cats.includes(c.id)).flatMap((c) => c.items.map((i) => i.id));
  const apply = async () => {
    setBusy(true);
    try {
      const n = Number(value);
      const r = await api<{ updated: number }>('/menu/bulk-price', { method: 'POST', body: { itemIds, mode, value: mode === 'percent' ? Math.round(n * 100) : Math.round(n * 100), roundTo: 'rupee' } });
      toast.success(`Updated ${r.updated} dishes`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not update prices');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} placement="center" size="sm" title="Bulk price change" footer={<Button block loading={busy} disabled={!itemIds.length || !Number(value)} onClick={() => void apply()}>Apply to {itemIds.length} dishes</Button>}>
      <div className={s.stack}>
        <Segmented value={mode} onChange={setMode} items={[{ value: 'percent', label: 'By percent' }, { value: 'amount', label: 'By amount' }]} />
        <Input label={mode === 'percent' ? 'Change (%)' : 'Change (₹)'} hint="Use a minus sign to lower prices. Prices round to the nearest rupee." value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.-]/g, ''))} inputMode="decimal" />
        <div>
          <span className={s.label}>Categories</span>
          <div className={s.chips}>
            {menu.map((c) => (
              <button key={c.id} type="button" className={cx(s.catItem, cats.includes(c.id) && s.catItemOn)} onClick={() => setCats((cur) => (cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id]))}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function Translations({ menu }: { menu: MenuCategoryDto[] }) {
  const toast = useToast();
  const [locale, setLocale] = useState<'hi' | 'mr'>('hi');
  const list = useQuery<Array<{ entityType: string; entityId: string; field: string; value: string; source: string }>>(`/menu/translations?locale=${locale}`, [locale]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const map = useMemo(() => new Map((list.data ?? []).map((t) => [`${t.entityType}:${t.entityId}:${t.field}`, t])), [list.data]);
  const rows = menu.flatMap((c) => [{ type: 'category', id: c.id, field: 'name', text: c.name }, ...c.items.flatMap((i) => [{ type: 'item', id: i.id, field: 'name', text: i.name }])]);
  const save = async (r: (typeof rows)[number]) => {
    const key = `${r.type}:${r.id}:${r.field}`;
    const value = draft[key];
    if (!value?.trim()) return;
    try {
      await api('/menu/translations', { method: 'PUT', body: { entityType: r.type, entityId: r.id, locale, field: r.field, value } });
      toast.success('Translation saved');
      void list.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save');
    }
  };
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <div>
          <h2 className={s.cardTitle}>Translations</h2>
          <p className={s.small}>Filled in automatically. Correct anything that reads wrong; your edits are never overwritten.</p>
        </div>
        <Segmented value={locale} onChange={setLocale} items={[{ value: 'hi', label: 'हिंदी' }, { value: 'mr', label: 'मराठी' }]} />
      </div>
      <div className={s.tableWrap}>
        <table className={s.dataTable}>
          <thead>
            <tr>
              <th>English</th>
              <th>{locale === 'hi' ? 'Hindi' : 'Marathi'}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = `${r.type}:${r.id}:${r.field}`;
              const t = map.get(key);
              return (
                <tr key={key}>
                  <td style={{ fontWeight: r.type === 'category' ? 700 : 400 }}>{r.text}</td>
                  <td>
                    <input className={s.cellInput} lang={locale} value={draft[key] ?? t?.value ?? ''} placeholder="Not translated yet" onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} onBlur={() => void save(r)} />
                  </td>
                  <td className={s.small}>{t ? (t.source === 'manual' ? 'Edited' : 'Auto') : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
