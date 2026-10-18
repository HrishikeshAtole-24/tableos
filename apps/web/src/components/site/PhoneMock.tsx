import Image from 'next/image';
import { DietMark, Icon, Tag } from '@tableos/ui';
import s from './site.module.css';

const DISHES = [
  { name: 'Paneer Tikka', price: '₹289', diet: 'veg' as const, tag: true, photo: '1567188040759-fb8a883dc6d8' },
  { name: 'Chicken Dum Biryani', price: '₹329', diet: 'nonveg' as const, tag: true, photo: '1589302168068-964664d93dc0' },
  { name: 'Masala Dosa', price: '₹149', diet: 'veg' as const, tag: false, photo: '1668236543090-82eba5ee5976' },
];

/** Illustrative phone showing the diner menu (the real UI, simplified). */
export function PhoneMock() {
  return (
    <div className={s.phone} aria-hidden>
      <div className={s.phoneNotch} />
      <div className={s.phoneScreen}>
        <div className={s.pmTop}>
          <span className={s.pmTable}>
            <Icon name="table" size={11} /> Table T3
          </span>
          <span className={s.pmLang}>EN</span>
        </div>
        <p className={s.pmName}>Spice Route Café</p>
        <div className={s.pmSearch}>
          Search for dishes <Icon name="search" size={13} />
        </div>
        {DISHES.map((d, i) => (
          <div key={d.name} className={s.pmDish}>
            <div className={s.pmDishText}>
              <span className={s.pmMarks}>
                <DietMark diet={d.diet} size={11} />
                {d.tag && (
                  <Tag tone="brand" icon="star">
                    Bestseller
                  </Tag>
                )}
              </span>
              <strong>{d.name}</strong>
              <span>{d.price}</span>
            </div>
            <div className={s.pmMedia}>
              <Image src={`https://images.unsplash.com/photo-${d.photo}?w=240&q=60&auto=format&fit=crop`} alt="" fill sizes="96px" quality={60} className={s.pmImg} priority={i === 0} />
              <span className={s.pmAdd}>{i === 0 ? '−  1  +' : 'ADD'}</span>
            </div>
          </div>
        ))}
        <div className={s.pmCart}>
          <span>
            <strong>1 item added</strong>
            <small>₹289 plus taxes</small>
          </span>
          <span>
            View Cart <Icon name="chevronRight" size={12} />
          </span>
        </div>
      </div>
    </div>
  );
}
