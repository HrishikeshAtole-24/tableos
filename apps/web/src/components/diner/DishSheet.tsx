'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { type PublicMenuItem, formatPaise } from '@tableos/schemas';
import { Button, DietMark, Icon, Sheet, SpiceLevel, Tag, cx } from '@tableos/ui';
import type { Strings } from '@/lib/i18n';
import { TAG_TONE } from './DishCard';
import s from './diner.module.css';

export interface DishSelection {
  variantId: string | null;
  addonIds: string[];
  qty: number;
  note: string | null;
}

interface Props {
  item: PublicMenuItem | null;
  open: boolean;
  canOrder: boolean;
  strings: Strings;
  showLocal: boolean;
  unavailableAddons: Set<string>;
  onClose: () => void;
  onAdd: (item: PublicMenuItem, sel: DishSelection) => void;
}

export function DishSheet({ item, open, canOrder, strings, showLocal, unavailableAddons, onClose, onAdd }: Props) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    if (!item) return;
    setVariantId(item.variants[0]?.id ?? null);
    setAddons([]);
    setQty(1);
    setNote('');
    setShowNote(false);
  }, [item]);

  const unit = useMemo(() => {
    if (!item) return 0;
    const base = item.variants.find((v) => v.id === variantId)?.pricePaise ?? item.basePricePaise;
    const extra = item.addonGroups.flatMap((g) => g.addons).filter((a) => addons.includes(a.id)).reduce((sum, a) => sum + a.pricePaise, 0);
    return base + extra;
  }, [item, variantId, addons]);

  const groupErrors = useMemo(() => {
    if (!item) return [];
    return item.addonGroups.filter((g) => addons.filter((id) => g.addons.some((a) => a.id === id)).length < g.minSelect).map((g) => g.id);
  }, [item, addons]);

  if (!item) return null;
  const toggleAddon = (groupId: string, addonId: string) => {
    const group = item.addonGroups.find((g) => g.id === groupId)!;
    setAddons((cur) => {
      if (cur.includes(addonId)) return cur.filter((x) => x !== addonId);
      const inGroup = cur.filter((id) => group.addons.some((a) => a.id === id));
      if (group.maxSelect === 1) return [...cur.filter((id) => !inGroup.includes(id)), addonId];
      if (inGroup.length >= group.maxSelect) return cur;
      return [...cur, addonId];
    });
  };
  const local = (name: string, nameLocal: string | null) => (showLocal && nameLocal ? nameLocal : name);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      label={item.name}
      hideClose={false}
      bodyClassName={s.sheetBody}
      footer={
        canOrder && item.available ? (
          <div className={s.sheetFooter}>
            <div className={s.qtyStepper} role="group" aria-label="Quantity">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" disabled={qty <= 1}>
                <Icon name="minus" size={18} strokeWidth={3} />
              </button>
              <span aria-live="polite">{qty}</span>
              <button type="button" onClick={() => setQty((q) => Math.min(50, q + 1))} aria-label="Increase quantity">
                <Icon name="plus" size={18} strokeWidth={3} />
              </button>
            </div>
            <Button
              variant="success"
              size="lg"
              block
              disabled={groupErrors.length > 0}
              onClick={() => onAdd(item, { variantId, addonIds: addons, qty, note: note.trim() || null })}
            >
              {strings.addItem} · {formatPaise(unit * qty)}
            </Button>
          </div>
        ) : undefined
      }
    >
      {item.photoUrl && (
        <div className={s.sheetHero}>
          <Image src={item.photoUrl} alt={item.name} fill sizes="(max-width: 640px) 100vw, 480px" quality={80} className={s.sheetHeroImg} />
        </div>
      )}
      <div className={s.sheetHead}>
        <div className={s.dishMarks}>
          <DietMark diet={item.diet} />
          {item.tags.map((tag) => (
            <Tag key={tag} tone={TAG_TONE[tag]} icon={tag === 'bestseller' ? 'star' : undefined}>
              {strings[tag]}
            </Tag>
          ))}
          <SpiceLevel level={item.spiceLevel} />
        </div>
        <h2 className={s.sheetTitle}>{item.name}</h2>
        {showLocal && item.nameLocal && <p className={s.sheetLocal}>{item.nameLocal}</p>}
        <p className={s.sheetPrice}>{formatPaise(item.variants.find((v) => v.id === variantId)?.pricePaise ?? item.basePricePaise)}</p>
        {(item.description || item.descriptionLocal) && <p className={s.sheetDesc}>{showLocal && item.descriptionLocal ? item.descriptionLocal : item.description}</p>}
        {!item.available && <p className={s.sheetSoldOut}>{strings.soldOut}</p>}
      </div>

      {item.variants.length > 0 && (
        <fieldset className={s.optionGroup}>
          <legend className={s.optionLegend}>
            <span>{strings.chooseSize}</span>
            <span className={s.reqPill}>{strings.required}</span>
          </legend>
          {item.variants.map((v) => (
            <label key={v.id} className={cx(s.option, variantId === v.id && s.optionOn)}>
              <DietMark diet={item.diet} size={14} />
              <span className={s.optionName}>{local(v.name, v.nameLocal)}</span>
              <span className={s.optionPrice}>{formatPaise(v.pricePaise)}</span>
              <input type="radio" name="variant" checked={variantId === v.id} onChange={() => setVariantId(v.id)} disabled={!canOrder} />
              <span className={s.radio} aria-hidden />
            </label>
          ))}
        </fieldset>
      )}

      {item.addonGroups.map((g) => (
        <fieldset key={g.id} className={s.optionGroup}>
          <legend className={s.optionLegend}>
            <span>{local(g.name, g.nameLocal)}</span>
            <span className={cx(s.reqPill, g.minSelect === 0 && s.optPill, groupErrors.includes(g.id) && s.reqPillError)}>
              {g.minSelect > 0 ? strings.required : g.maxSelect > 1 ? strings.upTo(g.maxSelect) : strings.optional}
            </span>
          </legend>
          {g.addons.map((a) => {
            const off = !a.available || unavailableAddons.has(a.id);
            const checked = addons.includes(a.id);
            return (
              <label key={a.id} className={cx(s.option, checked && s.optionOn, off && s.optionOff)}>
                <span className={s.optionName}>{local(a.name, a.nameLocal)}</span>
                <span className={s.optionPrice}>{off ? strings.soldOut : `+ ${formatPaise(a.pricePaise)}`}</span>
                <input type={g.maxSelect === 1 ? 'radio' : 'checkbox'} name={g.id} checked={checked} disabled={off || !canOrder} onChange={() => toggleAddon(g.id, a.id)} />
                <span className={g.maxSelect === 1 ? s.radio : s.checkbox} aria-hidden />
              </label>
            );
          })}
        </fieldset>
      ))}

      {canOrder && item.available && (
        <div className={s.noteBlock}>
          {showNote ? (
            <textarea
              className={s.noteInput}
              autoFocus
              maxLength={140}
              rows={2}
              placeholder={strings.notePlaceholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label={strings.cookingNote}
            />
          ) : (
            <button type="button" className={s.noteToggle} onClick={() => setShowNote(true)}>
              <Icon name="edit" size={16} />
              {strings.cookingNote}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
