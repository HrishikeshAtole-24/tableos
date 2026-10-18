'use client';

import Image from 'next/image';
import { memo } from 'react';
import { type PublicMenuItem, formatPaise } from '@tableos/schemas';
import { AddButton, DietMark, Icon, SpiceLevel, Tag, cx } from '@tableos/ui';
import type { Strings } from '@/lib/i18n';
import s from './diner.module.css';

interface Props {
  item: PublicMenuItem;
  qty: number;
  canOrder: boolean;
  strings: Strings;
  showLocal: boolean;
  onOpen: (item: PublicMenuItem) => void;
  onQuickAdd: (item: PublicMenuItem) => void;
  onDecrement: (item: PublicMenuItem) => void;
  priority?: boolean;
}

export const TAG_TONE = { bestseller: 'brand', chef_special: 'info', new: 'success', must_try: 'warning' } as const;

export const DishCard = memo(function DishCard({ item, qty, canOrder, strings, showLocal, onOpen, onQuickAdd, onDecrement, priority }: Props) {
  const customisable = item.variants.length > 0 || item.addonGroups.length > 0;
  const fromPrice = item.variants.length ? Math.min(...item.variants.map((v) => v.pricePaise)) : item.basePricePaise;
  const soldOut = !item.available;
  const add = () => (customisable ? onOpen(item) : onQuickAdd(item));

  return (
    <article className={cx(s.dish, soldOut && s.dishSoldOut)} aria-labelledby={`dish-${item.id}`}>
      <div className={s.dishText}>
        <div className={s.dishMarks}>
          <DietMark diet={item.diet} />
          {item.tags.slice(0, 1).map((tag) => (
            <Tag key={tag} tone={TAG_TONE[tag]} icon={tag === 'bestseller' ? 'star' : undefined}>
              {strings[tag]}
            </Tag>
          ))}
          {item.jainAvailable && <span className={s.jain}>{strings.jain}</span>}
        </div>
        <button type="button" className={s.dishNameBtn} onClick={() => onOpen(item)}>
          <h3 id={`dish-${item.id}`} className={s.dishName}>
            {item.name}
          </h3>
          {showLocal && item.nameLocal && <span className={s.dishLocal} lang="hi">{item.nameLocal}</span>}
        </button>
        <div className={s.dishPriceRow}>
          <span className={s.dishPrice}>
            {item.variants.length > 1 && <span className={s.from}>from </span>}
            {formatPaise(fromPrice)}
          </span>
          <SpiceLevel level={item.spiceLevel} />
        </div>
        {(item.descriptionLocal && showLocal ? item.descriptionLocal : item.description) && (
          <p className={s.dishDesc}>{showLocal && item.descriptionLocal ? item.descriptionLocal : item.description}</p>
        )}
      </div>

      <div className={cx(s.dishMedia, !item.photoUrl && s.dishMediaBare)}>
        {item.photoUrl ? (
          <button type="button" className={s.dishPhotoBtn} onClick={() => onOpen(item)} aria-label={`${item.name} details`}>
            <Image src={item.photoUrl} alt="" fill sizes="156px" quality={70} className={s.dishPhoto} priority={priority} />
          </button>
        ) : null}
        <div className={s.dishAdd}>
          {canOrder ? (
            <AddButton
              qty={qty}
              disabled={soldOut}
              disabledLabel={strings.soldOut}
              customisable={customisable}
              label={item.name}
              onAdd={add}
              onIncrement={add}
              onDecrement={() => onDecrement(item)}
            />
          ) : soldOut ? (
            <span className={s.soldOutPill}>{strings.soldOut}</span>
          ) : null}
          {canOrder && customisable && !soldOut && <span className={s.customisable}>{strings.customisable}</span>}
        </div>
      </div>
    </article>
  );
});

export function DishSkeleton() {
  return (
    <div className={s.dish} aria-hidden>
      <div className={s.dishText}>
        <span className={s.sk} style={{ width: 16, height: 16 }} />
        <span className={s.sk} style={{ width: '70%', height: 20, marginTop: 8 }} />
        <span className={s.sk} style={{ width: 60, height: 16, marginTop: 8 }} />
        <span className={s.sk} style={{ width: '90%', height: 14, marginTop: 12 }} />
      </div>
      <div className={s.dishMedia}>
        <span className={s.sk} style={{ width: 156, height: 144, borderRadius: 16 }} />
      </div>
    </div>
  );
}

export function SoldOutIcon() {
  return <Icon name="alert" size={16} />;
}
