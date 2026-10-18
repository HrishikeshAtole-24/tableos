'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { type MenuCategoryDto, type MenuItemDto, MENU_TAGS, type MenuTag } from '@tableos/schemas';
import { Button, Chip, DietMark, Icon, IconButton, Input, Segmented, Select, Sheet, Switch, Textarea, useToast } from '@tableos/ui';
import { ApiError, api } from '@/lib/api';
import { uploadFile } from '@/lib/upload';
import s from './console.module.css';

const TAG_LABEL: Record<MenuTag, string> = { bestseller: 'Bestseller', chef_special: "Chef's special", new: 'New', must_try: 'Must try' };
const TAX_OPTIONS = [
  { value: '0', label: '0% (exempt)' },
  { value: '500', label: '5% (restaurant service)' },
  { value: '1200', label: '12%' },
  { value: '1800', label: '18% (e.g. aerated drinks)' },
];

interface Variant {
  id?: string;
  name: string;
  price: string;
}
interface Addon {
  id?: string;
  name: string;
  price: string;
  available: boolean;
}
interface Group {
  id?: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  addons: Addon[];
}

const rupees = (p: number) => String(p / 100);
const paise = (r: string) => Math.round(Number(r || 0) * 100);

export function DishEditor({ open, item, categories, defaultCategoryId, onClose, onSaved }: { open: boolean; item: MenuItemDto | null; categories: MenuCategoryDto[]; defaultCategoryId: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [diet, setDiet] = useState<'veg' | 'nonveg' | 'egg'>('veg');
  const [price, setPrice] = useState('');
  const [tax, setTax] = useState('500');
  const [spice, setSpice] = useState(0);
  const [tags, setTags] = useState<MenuTag[]>([]);
  const [jain, setJain] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFields({});
    setName(item?.name ?? '');
    setDescription(item?.description ?? '');
    setCategoryId(item?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? '');
    setDiet(item?.diet ?? 'veg');
    setPrice(item ? rupees(item.basePricePaise) : '');
    setTax(String(item?.taxRateBp ?? 500));
    setSpice(item?.spiceLevel ?? 0);
    setTags(item?.tags ?? []);
    setJain(item?.jainAvailable ?? false);
    setPhotoUrl(item?.photoUrl ?? null);
    setVariants(item?.variants.map((v) => ({ id: v.id, name: v.name, price: rupees(v.pricePaise) })) ?? []);
    setGroups(item?.addonGroups.map((g) => ({ id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, addons: g.addons.map((a) => ({ id: a.id, name: a.name, price: rupees(a.pricePaise), available: a.available })) })) ?? []);
  }, [open, item, defaultCategoryId, categories]);

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const t = await uploadFile(file, 'dish');
      setPhotoUrl(t.publicUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setFields({});
    const base = variants.length ? Math.min(...variants.map((v) => paise(v.price))) : paise(price);
    const body = {
      categoryId,
      name,
      description: description.trim() || null,
      diet,
      jainAvailable: jain,
      spiceLevel: spice,
      tags,
      basePricePaise: base,
      taxRateBp: Number(tax),
      photoUrl,
      variants: variants.map((v) => ({ ...(v.id ? { id: v.id } : {}), name: v.name, pricePaise: paise(v.price) })),
      addonGroups: groups.map((g) => ({ ...(g.id ? { id: g.id } : {}), name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, addons: g.addons.map((a) => ({ ...(a.id ? { id: a.id } : {}), name: a.name, pricePaise: paise(a.price), available: a.available })) })),
    };
    try {
      if (item) await api(`/menu/items/${item.id}`, { method: 'PATCH', body });
      else await api('/menu/items', { method: 'POST', body });
      toast.success(item ? 'Dish updated' : 'Dish added');
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        toast.error(Object.keys(e.fields).length ? 'Please fix the highlighted fields' : e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      placement="right"
      size="lg"
      title={item ? `Edit ${item.name}` : 'Add a dish'}
      footer={
        <div className={s.row} style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()} disabled={!name.trim() || (!variants.length && !price)}>
            {item ? 'Save changes' : 'Add dish'}
          </Button>
        </div>
      }
    >
      <div className={s.stack}>
        <div className={s.photoPick}>
          <div className={s.photoBox}>{photoUrl ? <Image src={photoUrl} alt="" fill sizes="96px" /> : <Icon name="utensils" size={28} />}</div>
          <div className={s.stack} style={{ gap: 8 }}>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
            <Button variant="outline" size="sm" icon="upload" loading={uploading} onClick={() => fileRef.current?.click()}>
              {photoUrl ? 'Change photo' : 'Upload photo'}
            </Button>
            {photoUrl && (
              <Button variant="link" size="sm" onClick={() => setPhotoUrl(null)}>
                Remove photo
              </Button>
            )}
            <span className={s.small}>Square photos look best. JPG or PNG up to 10 MB.</span>
          </div>
        </div>

        <div className={s.formGrid} style={{ marginTop: 0 }}>
          <Input label="Dish name" value={name} onChange={(e) => setName(e.target.value)} error={fields.name} fieldClassName={s.span2} />
          <Textarea label="Description" optional value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} rows={3} className={s.span2} />
          <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
          <Select label="GST rate" value={tax} onChange={(e) => setTax(e.target.value)} options={TAX_OPTIONS} />
          {variants.length === 0 && <Input label="Price" prefix="₹" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} error={fields.basePricePaise} />}
        </div>

        <div>
          <span className={s.label}>Food type</span>
          <Segmented
            value={diet}
            onChange={setDiet}
            items={[
              { value: 'veg', label: <span className={s.row} style={{ gap: 6 }}><DietMark diet="veg" size={14} /> Veg</span> },
              { value: 'egg', label: <span className={s.row} style={{ gap: 6 }}><DietMark diet="egg" size={14} /> Egg</span> },
              { value: 'nonveg', label: <span className={s.row} style={{ gap: 6 }}><DietMark diet="nonveg" size={14} /> Non-veg</span> },
            ]}
          />
        </div>

        <div className={s.grid2}>
          <div>
            <span className={s.label}>Spice level</span>
            <Segmented value={String(spice)} onChange={(v) => setSpice(Number(v))} items={[{ value: '0', label: 'None' }, { value: '1', label: 'Mild' }, { value: '2', label: 'Spicy' }, { value: '3', label: 'Hot' }]} />
          </div>
          <div>
            <span className={s.label}>Tags</span>
            <div className={s.chips}>
              {MENU_TAGS.map((t) => (
                <Chip key={t} selected={tags.includes(t)} onClick={() => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))}>
                  {TAG_LABEL[t]}
                </Chip>
              ))}
            </div>
          </div>
        </div>
        <Switch checked={jain} onChange={setJain} label="Jain option available" description="Shows under the Jain filter on the menu." />

        <div className={s.optionGroupBox}>
          <div className={s.between}>
            <div>
              <strong>Sizes</strong>
              <p className={s.small}>e.g. Half and Full. The guest must choose one.</p>
            </div>
            <Button size="sm" variant="outline" icon="plus" onClick={() => setVariants((v) => [...v, { name: '', price: '' }])}>
              Add size
            </Button>
          </div>
          {variants.map((v, i) => (
            <div key={i} className={s.optionRow}>
              <Input label={i === 0 ? 'Name' : undefined} value={v.name} placeholder="Half" onChange={(e) => setVariants((cur) => cur.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input label={i === 0 ? 'Price' : undefined} prefix="₹" inputMode="decimal" value={v.price} onChange={(e) => setVariants((cur) => cur.map((x, j) => (j === i ? { ...x, price: e.target.value.replace(/[^\d.]/g, '') } : x)))} />
              <IconButton icon="trash" label="Remove size" onClick={() => setVariants((cur) => cur.filter((_, j) => j !== i))} />
            </div>
          ))}
        </div>

        <div className={s.optionGroupBox}>
          <div className={s.between}>
            <div>
              <strong>Add-ons</strong>
              <p className={s.small}>e.g. Extra cheese. Set how many a guest can pick.</p>
            </div>
            <Button size="sm" variant="outline" icon="plus" onClick={() => setGroups((g) => [...g, { name: 'Extras', minSelect: 0, maxSelect: 2, addons: [{ name: '', price: '', available: true }] }])}>
              Add group
            </Button>
          </div>
          {groups.map((g, gi) => (
            <div key={gi} className={s.card} style={{ padding: 16 }}>
              <div className={s.optionRow} style={{ gridTemplateColumns: '1fr 90px 90px auto' }}>
                <Input label="Group name" value={g.name} onChange={(e) => setGroups((cur) => cur.map((x, j) => (j === gi ? { ...x, name: e.target.value } : x)))} />
                <Input label="Min" inputMode="numeric" value={String(g.minSelect)} onChange={(e) => setGroups((cur) => cur.map((x, j) => (j === gi ? { ...x, minSelect: Number(e.target.value.replace(/\D/g, '') || 0) } : x)))} />
                <Input label="Max" inputMode="numeric" value={String(g.maxSelect)} onChange={(e) => setGroups((cur) => cur.map((x, j) => (j === gi ? { ...x, maxSelect: Math.max(1, Number(e.target.value.replace(/\D/g, '') || 1)) } : x)))} />
                <IconButton icon="trash" label="Remove group" onClick={() => setGroups((cur) => cur.filter((_, j) => j !== gi))} />
              </div>
              <div className={s.stack} style={{ gap: 8, marginTop: 12 }}>
                {g.addons.map((a, ai) => (
                  <div key={ai} className={s.optionRow}>
                    <Input value={a.name} placeholder="Extra cheese" aria-label="Add-on name" onChange={(e) => setGroups((cur) => cur.map((x, j) => (j === gi ? { ...x, addons: x.addons.map((y, k) => (k === ai ? { ...y, name: e.target.value } : y)) } : x)))} />
                    <Input prefix="₹" inputMode="decimal" value={a.price} aria-label="Add-on price" onChange={(e) => setGroups((cur) => cur.map((x, j) => (j === gi ? { ...x, addons: x.addons.map((y, k) => (k === ai ? { ...y, price: e.target.value.replace(/[^\d.]/g, '') } : y)) } : x)))} />
                    <IconButton icon="close" label="Remove add-on" onClick={() => setGroups((cur) => cur.map((x, j) => (j === gi ? { ...x, addons: x.addons.filter((_, k) => k !== ai) } : x)))} />
                  </div>
                ))}
                <Button size="sm" variant="link" icon="plus" onClick={() => setGroups((cur) => cur.map((x, j) => (j === gi ? { ...x, addons: [...x.addons, { name: '', price: '', available: true }] } : x)))}>
                  Add option
                </Button>
              </div>
            </div>
          ))}
        </div>
        {Object.keys(fields).length > 0 && <p className={s.small} style={{ color: 'var(--color-danger-strong)' }}>{Object.values(fields).join(' · ')}</p>}
      </div>
    </Sheet>
  );
}
