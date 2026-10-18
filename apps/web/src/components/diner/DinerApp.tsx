'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { type BillDto, type Locale, type OrderDto, type PublicMenuDto, type PublicMenuItem, type ServiceRequestType, LOCALES, formatPaise } from '@tableos/schemas';
import { Banner, Button, Chip, EmptyState, Icon, IconButton, Sheet, cx, useToast } from '@tableos/ui';
import { ApiError, NetworkError, apiFetch, newIdempotencyKey } from '@/lib/api';
import { EMPTY_CART, cartCount, cartReducer, loadCart, qtyForItem, saveCart } from '@/lib/cart';
import { LOCALE_LABEL, LOCALE_SHORT, t } from '@/lib/i18n';
import { searchItems } from '@/lib/search';
import { CartView } from './CartView';
import { DishCard } from './DishCard';
import { type DishSelection, DishSheet } from './DishSheet';
import { useAnalytics, useDinerSession, useOnline, useRealtime } from './hooks';
import { BillSheet, OrdersView } from './OrdersView';
import s from './diner.module.css';

type View = 'menu' | 'cart' | 'orders';
type Filter = 'veg' | 'nonveg' | 'egg' | 'jain' | 'bestseller';
const COOLDOWN_MS = 60_000;

export function DinerApp({ initialMenu, qrToken, initialLocale }: { initialMenu: PublicMenuDto; qrToken: string | null; initialLocale: Locale }) {
  const toast = useToast();
  const [menu, setMenu] = useState(initialMenu);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const strings = t(locale);
  const r = menu.restaurant;
  const { state: session, token, refresh, upsertOrder, markClosed } = useDinerSession(r.slug, qrToken);
  const sessionId = session.kind === 'active' ? session.session.sessionId : null;
  const online = useOnline();
  const track = useAnalytics(r.id, sessionId);

  const [cart, dispatch] = useReducer(cartReducer, EMPTY_CART);
  const hydrated = useRef(false);
  useEffect(() => {
    if (!sessionId) return;
    dispatch({ type: 'hydrate', state: loadCart(sessionId) });
    hydrated.current = true;
  }, [sessionId]);
  useEffect(() => {
    if (sessionId && hydrated.current) saveCart(sessionId, cart);
  }, [cart, sessionId]);

  const [view, setViewState] = useState<View>('menu');
  const setView = useCallback((v: View) => {
    setViewState(v);
    if (v !== 'menu') window.history.pushState({ view: v }, '');
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const onPop = (e: PopStateEvent) => setViewState(((e.state as { view?: View } | null)?.view ?? 'menu') as View);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Set<Filter>>(new Set());
  const [sheetItem, setSheetItem] = useState<PublicMenuItem | null>(null);
  const [menuFab, setMenuFab] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [bill, setBill] = useState<BillDto | null>(null);
  const [billLoading, setBillLoading] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [confirmed, setConfirmed] = useState<OrderDto | null>(null);
  const [unavailable, setUnavailable] = useState<Array<{ itemId: string; name: string }>>([]);
  const [cooldowns, setCooldowns] = useState<Partial<Record<ServiceRequestType, number>>>({});
  const [ackd, setAckd] = useState<Partial<Record<ServiceRequestType, boolean>>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [unavailableAddons, setUnavailableAddons] = useState<Set<string>>(new Set());
  const [, forceTick] = useState(0);

  useEffect(() => {
    track('menu_view');
  }, [track]);

  // Remember language on the device (cookie for server rendering, localStorage as backup).
  const changeLocale = useCallback(
    async (l: Locale) => {
      setLangOpen(false);
      if (l === locale) return;
      document.cookie = `tos-locale=${l}; path=/; max-age=31536000; samesite=lax`;
      try {
        localStorage.setItem('tos-locale', l);
      } catch {
        /* ignore */
      }
      setLocale(l);
      document.documentElement.lang = l;
      try {
        setMenu(await apiFetch<PublicMenuDto>(`/v1/public/restaurants/${r.slug}/menu?locale=${l}`));
      } catch {
        toast.error(t(l).offline);
      }
    },
    [locale, r.slug, toast],
  );

  const reloadMenu = useCallback(async () => {
    try {
      setMenu(await apiFetch<PublicMenuDto>(`/v1/public/restaurants/${r.slug}/menu?locale=${locale}`));
    } catch {
      /* keep the current menu */
    }
  }, [r.slug, locale]);

  const connected = useRealtime(session.kind === 'active' ? session.session.token : null, {
    onOrder: (o) => {
      upsertOrder(o);
      if (o.status === 'accepted' || o.status === 'ready' || o.status === 'rejected') {
        toast.show(`${strings.orderNo(o.number)} · ${strings[`status_${o.status}`]}`, { tone: o.status === 'rejected' ? 'error' : 'success' });
      }
    },
    onAvailability: ({ itemId, available, kind }) => {
      if (kind === 'addon') {
        setUnavailableAddons((cur) => {
          const next = new Set(cur);
          if (available) next.delete(itemId);
          else next.add(itemId);
          return next;
        });
        return;
      }
      setMenu((m) => ({ ...m, categories: m.categories.map((c) => ({ ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, available } : i)) })) }));
    },
    onSession: (p) => {
      if (p.status === 'closed') markClosed();
    },
    onRequest: (req) => {
      if (req.status === 'acknowledged') setAckd((a) => ({ ...a, [req.type]: true }));
    },
    onReconnect: () => {
      void refresh();
      void reloadMenu();
    },
  });

  // Derived menu
  const allItems = useMemo(() => menu.categories.flatMap((c) => c.items), [menu]);
  const passes = useCallback(
    (i: PublicMenuItem) => {
      if (filters.has('veg') && i.diet !== 'veg') return false;
      if (filters.has('nonveg') && i.diet !== 'nonveg') return false;
      if (filters.has('egg') && i.diet !== 'egg') return false;
      if (filters.has('jain') && !i.jainAvailable) return false;
      if (filters.has('bestseller') && !i.tags.includes('bestseller')) return false;
      return true;
    },
    [filters],
  );
  const sections = useMemo(() => {
    const recommended = allItems.filter((i) => i.tags.includes('bestseller') && i.photoUrl).slice(0, 8);
    const base = [
      ...(recommended.length >= 3 && !query ? [{ id: 'recommended', name: strings.recommended, nameLocal: null, items: recommended }] : []),
      ...menu.categories,
    ];
    if (query.trim()) {
      const hits = searchItems(allItems.filter(passes), query);
      return [{ id: 'search', name: `${hits.length} results`, nameLocal: null, items: hits }];
    }
    return base.map((c) => ({ ...c, items: c.items.filter(passes) })).filter((c) => c.items.length > 0);
  }, [allItems, menu.categories, passes, query, strings.recommended]);

  // Sticky category bar with scroll-spy
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const catBar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view !== 'menu') return;
    const els = sections.map((c) => document.getElementById(`cat-${c.id}`)).filter((e): e is HTMLElement => Boolean(e));
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveCat(visible[0].target.id.slice(4));
      },
      { rootMargin: '-120px 0px -65% 0px', threshold: 0 },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [sections, view]);
  useEffect(() => {
    if (!activeCat || !catBar.current) return;
    const btn = catBar.current.querySelector<HTMLElement>(`[data-cat="${activeCat}"]`);
    btn?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [activeCat]);
  const jumpTo = (id: string) => {
    setMenuFab(false);
    setCollapsed((c) => {
      const next = new Set(c);
      next.delete(id);
      return next;
    });
    requestAnimationFrame(() => document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  // Ordering availability
  const blockedReason = !r.isOpen ? strings.closedTitle : !r.orderingAvailable ? strings.pausedBody : null;
  const canOrder = session.kind === 'active' && !blockedReason;
  const count = cartCount(cart);
  const cartTotal = cart.lines.reduce((a, l) => a + l.unitPricePaise * l.qty, 0);
  const orders = session.kind === 'active' ? session.session.orders : [];
  const runningTotal = orders.filter((o) => o.status !== 'rejected' && o.status !== 'cancelled').reduce((a, o) => a + o.totalPaise, 0);

  const addToCart = useCallback(
    (item: PublicMenuItem, sel: DishSelection) => {
      const variant = item.variants.find((v) => v.id === sel.variantId) ?? null;
      const addons = item.addonGroups.flatMap((g) => g.addons).filter((a) => sel.addonIds.includes(a.id));
      dispatch({
        type: 'add',
        qty: sel.qty,
        line: {
          itemId: item.id,
          variantId: variant?.id ?? null,
          addonIds: addons.map((a) => a.id),
          note: sel.note,
          name: item.name,
          variantName: variant?.name ?? null,
          addonNames: addons.map((a) => a.name),
          unitPricePaise: (variant?.pricePaise ?? item.basePricePaise) + addons.reduce((sum, a) => sum + a.pricePaise, 0),
          taxRateBp: item.taxRateBp,
          diet: item.diet,
        },
      });
      track('add_to_cart', item.id);
    },
    [track],
  );
  const quickAdd = useCallback((item: PublicMenuItem) => addToCart(item, { variantId: null, addonIds: [], qty: 1, note: null }), [addToCart]);
  const decrement = useCallback(
    (item: PublicMenuItem) => {
      const lines = cart.lines.filter((l) => l.itemId === item.id);
      const last = lines[lines.length - 1];
      if (last) dispatch({ type: 'dec', key: last.key });
    },
    [cart.lines],
  );
  const openItem = useCallback(
    (item: PublicMenuItem) => {
      setSheetItem(item);
      track('item_view', item.id);
    },
    [track],
  );

  const placeOrder = async (details: { customerName: string | null; customerPhone: string | null }) => {
    if (session.kind !== 'active') return;
    setPlacing(true);
    try {
      const order = await apiFetch<OrderDto>('/v1/public/orders', {
        method: 'POST',
        sessionToken: session.session.token,
        idempotencyKey: newIdempotencyKey(),
        body: JSON.stringify({
          lines: cart.lines.map((l) => ({ itemId: l.itemId, variantId: l.variantId, addonIds: l.addonIds, qty: l.qty, note: l.note })),
          note: cart.note.trim() || null,
          ...details,
        }),
      });
      upsertOrder(order);
      dispatch({ type: 'clear' });
      setUnavailable([]);
      setConfirmed(order);
      track('order_placed');
      setViewState('orders');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'items_unavailable') {
        const list = (err.body.details?.unavailable as Array<{ itemId: string; name: string }>) ?? [];
        setUnavailable(list);
        void reloadMenu();
      } else if (err instanceof ApiError && err.status === 401) {
        markClosed();
      } else {
        toast.error(err instanceof NetworkError ? strings.offline : err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      setPlacing(false);
    }
  };

  const callStaff = async (type: ServiceRequestType) => {
    if (session.kind !== 'active') return;
    const until = cooldowns[type];
    if (until && until > Date.now()) return;
    try {
      await apiFetch('/v1/public/service-requests', { method: 'POST', sessionToken: session.session.token, body: JSON.stringify({ type }) });
      setCooldowns((c) => ({ ...c, [type]: Date.now() + COOLDOWN_MS }));
      setAckd((a) => ({ ...a, [type]: false }));
      toast.success(strings.staffNotified);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        const wait = Number(err.body.details?.retryAfterSeconds ?? 60);
        setCooldowns((c) => ({ ...c, [type]: Date.now() + wait * 1000 }));
      } else toast.error(err instanceof Error ? err.message : 'Could not reach staff');
    }
  };
  useEffect(() => {
    if (!serviceOpen) return;
    const id = window.setInterval(() => forceTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [serviceOpen]);

  const openBill = async () => {
    if (session.kind !== 'active') return;
    setBillOpen(true);
    setBillLoading(true);
    try {
      setBill(await apiFetch<BillDto>('/v1/public/sessions/current/bill', { sessionToken: session.session.token }));
    } catch {
      setBill(null);
    } finally {
      setBillLoading(false);
    }
  };

  const showLocal = locale !== 'en';
  const tableLabel = session.kind === 'active' ? session.session.table.label : null;

  // ───── Full-screen states ─────
  if (session.kind === 'invalid') {
    return (
      <StateScreen icon="qr" title={strings.invalidQr} body={`${session.message} ${strings.callStaffHint}`} restaurant={r.name}>
        <Button variant="outline" onClick={() => (window.location.href = `/r/${r.slug}`)}>
          {strings.viewOnly}
        </Button>
      </StateScreen>
    );
  }
  if (session.kind === 'closed') {
    return (
      <StateScreen icon="heart" title={strings.thankYou} body={strings.sessionClosed} restaurant={r.name}>
        {r.googleReviewUrl && (
          <a className={s.reviewLink} href={r.googleReviewUrl} target="_blank" rel="noreferrer">
            <Icon name="star" size={18} /> {strings.rateUs}
          </a>
        )}
      </StateScreen>
    );
  }

  if (view === 'cart' && session.kind === 'active') {
    return (
      <CartView
        cart={cart}
        dispatch={dispatch}
        strings={strings}
        restaurantName={r.name}
        tableLabel={session.session.table.label}
        serviceChargeBp={r.serviceChargeBp}
        canOrder={canOrder && online}
        blockedReason={blockedReason}
        unavailableNames={unavailable.map((u) => u.name)}
        placing={placing}
        onBack={() => window.history.back()}
        onPlace={placeOrder}
        onRemoveUnavailable={() => {
          dispatch({ type: 'removeItems', itemIds: unavailable.map((u) => u.itemId) });
          setUnavailable([]);
        }}
      />
    );
  }

  if (view === 'orders' && session.kind === 'active') {
    return (
      <>
        <OrdersView
          orders={orders}
          strings={strings}
          runningTotalPaise={runningTotal}
          tableLabel={session.session.table.label}
          onBack={() => (window.history.state?.view ? window.history.back() : setViewState('menu'))}
          onOrderMore={() => setViewState('menu')}
          onViewBill={openBill}
        />
        <BillSheet open={billOpen} onClose={() => setBillOpen(false)} bill={bill} strings={strings} loading={billLoading} />
        <Sheet open={Boolean(confirmed)} onClose={() => setConfirmed(null)} placement="center" size="sm" hideClose label={strings.orderPlaced}>
          {confirmed && (
            <div className={s.confirm}>
              <span className={s.confirmTick}>
                <Icon name="check" size={36} strokeWidth={3} />
              </span>
              <h2>{strings.orderPlaced}</h2>
              <p className={s.confirmNo}>
                {strings.orderNumber} <strong>#{confirmed.number}</strong>
              </p>
              {confirmed.status === 'placed' && <p className={s.viewSub}>{strings.waitingForStaff}</p>}
              <Button block onClick={() => setConfirmed(null)}>
                {strings.trackOrders}
              </Button>
            </div>
          )}
        </Sheet>
      </>
    );
  }

  // ───── Menu ─────
  return (
    <div className={s.page}>
      {!online && (
        <div className={s.offline} role="status">
          <Icon name="wifiOff" size={18} />
          <span>{strings.offline}</span>
          <button type="button" onClick={() => void refresh()}>
            {strings.retry}
          </button>
        </div>
      )}
      {online && session.kind === 'active' && !connected && <div className={s.reconnecting}>Reconnecting…</div>}

      <header className={s.top}>
        <div className={s.topRow}>
          <div className={s.brandRow}>
            {r.logoUrl ? <Image src={r.logoUrl} alt="" width={36} height={36} className={s.logo} /> : <span className={s.logoFallback}>{r.name.slice(0, 1)}</span>}
            {tableLabel && (
              <span className={s.tablePill}>
                <Icon name="table" size={14} />
                {strings.table} {tableLabel}
              </span>
            )}
          </div>
          <div className={s.topActions}>
            <button type="button" className={s.langBtn} onClick={() => setLangOpen(true)} aria-label={strings.language}>
              <Icon name="globe" size={16} />
              {LOCALE_SHORT[locale]}
            </button>
            {session.kind === 'active' && <IconButton icon="bell" label={strings.needHelp} onClick={() => setServiceOpen(true)} filled small />}
          </div>
        </div>
      </header>

      <section className={s.hero} aria-label={r.name}>
        <h1 className={s.restName}>{r.name}</h1>
        <div className={s.infoTray}>
        <div className={s.infoCard}>
          <div className={s.infoRow}>
            <span className={s.cuisine}>{r.cuisine.join(', ') || 'Restaurant'}</span>
          </div>
          <div className={s.infoMeta}>
            <span className={s.metaItem}>
              <Icon name="mapPin" size={15} />
              {[r.address, r.city].filter(Boolean).join(', ') || r.name}
            </span>
            <span className={cx(s.metaItem, r.isOpen ? s.open : s.closed)}>
              <Icon name="clock" size={15} />
              {r.isOpen ? `${strings.openNow}${r.openingHoursLabel ? ` · ${r.openingHoursLabel}` : ''}` : r.nextOpenLabel ?? strings.closedTitle}
            </span>
          </div>
          {session.kind === 'active' && (
            <div className={s.dineIn}>
              <Icon name="utensils" size={16} />
              <span>
                Dine-in · {strings.table} <strong>{tableLabel}</strong>
              </span>
            </div>
          )}
        </div>
        </div>
        {session.kind === 'none' && <Banner tone="info" icon="qr" title={strings.viewOnly}>{strings.viewOnlyTable}</Banner>}
        {session.kind === 'active' && !r.isOpen && <Banner tone="warning" icon="clock" title={strings.closedTitle}>{r.nextOpenLabel ?? strings.viewOnly}</Banner>}
        {session.kind === 'active' && r.isOpen && !r.orderingAvailable && <Banner tone="warning" icon="pause" title={strings.pausedTitle}>{strings.pausedBody}</Banner>}
      </section>

      <div className={s.searchWrap}>
        <label className={s.search}>
          <span className="sr-only">{strings.searchPlaceholder}</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={strings.searchPlaceholder} enterKeyHint="search" />
          {query ? <IconButton icon="close" label="Clear search" small onClick={() => setQuery('')} /> : <Icon name="search" size={20} />}
        </label>
        <div className={cx(s.filters, 'no-scrollbar')} role="group" aria-label="Filters">
          {(['veg', 'nonveg', 'egg', 'jain', 'bestseller'] as Filter[]).map((f) => (
            <Chip
              key={f}
              selected={filters.has(f)}
              removable
              leading={f === 'veg' || f === 'nonveg' || f === 'egg' ? <span className={cx(s.chipDiet, s[`chipDiet_${f}`])} /> : undefined}
              icon={f === 'bestseller' ? 'star' : f === 'jain' ? 'leaf' : undefined}
              onClick={() =>
                setFilters((cur) => {
                  const next = new Set(cur);
                  if (next.has(f)) next.delete(f);
                  else {
                    if (f === 'veg') (['nonveg', 'egg'] as Filter[]).forEach((x) => next.delete(x));
                    if (f === 'nonveg' || f === 'egg') next.delete('veg');
                    next.add(f);
                  }
                  return next;
                })
              }
            >
              {strings[f]}
            </Chip>
          ))}
        </div>
      </div>

      {!query && sections.length > 1 && (
        <nav className={cx(s.catBar, 'no-scrollbar')} ref={catBar} aria-label="Menu categories">
          {sections.map((c) => (
            <button key={c.id} type="button" data-cat={c.id} className={cx(s.catBtn, activeCat === c.id && s.catBtnOn)} onClick={() => jumpTo(c.id)}>
              {showLocal && c.nameLocal ? c.nameLocal : c.name}
            </button>
          ))}
        </nav>
      )}

      <main className={s.menu}>
        {sections.length === 0 || (query && sections[0]?.items.length === 0) ? (
          <EmptyState
            icon="search"
            title={strings.noResults}
            description={strings.tryAnother}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setFilters(new Set());
                }}
              >
                {strings.clearFilters}
              </Button>
            }
          />
        ) : (
          sections.map((c, ci) => {
            const isCollapsed = collapsed.has(c.id);
            return (
              <section key={c.id} id={`cat-${c.id}`} className={s.section} aria-labelledby={`h-${c.id}`}>
                <button
                  type="button"
                  className={s.sectionHead}
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setCollapsed((cur) => {
                      const next = new Set(cur);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      return next;
                    })
                  }
                >
                  <h2 id={`h-${c.id}`}>
                    {showLocal && c.nameLocal ? c.nameLocal : c.name} <span className={s.sectionCount}>({c.items.length})</span>
                  </h2>
                  <Icon name={isCollapsed ? 'chevronDown' : 'chevronUp'} size={22} />
                </button>
                {!isCollapsed &&
                  c.items.map((item, ii) => (
                    <DishCard
                      key={`${c.id}-${item.id}`}
                      item={item}
                      qty={qtyForItem(cart, item.id)}
                      canOrder={canOrder}
                      strings={strings}
                      showLocal={showLocal}
                      onOpen={openItem}
                      onQuickAdd={quickAdd}
                      onDecrement={decrement}
                      priority={ci === 0 && ii < 2}
                    />
                  ))}
                <div className={s.sectionGap} />
              </section>
            );
          })
        )}
        <footer className={s.legal}>
          <p>{r.name}</p>
          <p>Prices include no hidden charges. Taxes are shown before you order.</p>
          <p className={s.poweredBy}>
            Powered by <a href="/">TableOS</a>
          </p>
        </footer>
      </main>

      {/* Floating actions */}
      <div className={cx(s.floating, count > 0 && s.floatingRaised)}>
        {!query && sections.length > 1 && (
          <button type="button" className={s.menuFab} onClick={() => setMenuFab(true)}>
            <Icon name="menuBook" size={18} />
            {strings.menu}
          </button>
        )}
      </div>

      {(count > 0 || orders.length > 0) && session.kind === 'active' && (
        <div className={s.bottomDock}>
          {orders.length > 0 && count === 0 && (
            <button type="button" className={s.trackBar} onClick={() => setView('orders')}>
              <span className={s.trackDot} />
              <span className={s.trackText}>
                <strong>{strings.trackOrders}</strong>
                <span>
                  {strings.runningBill}: {formatPaise(runningTotal)}
                </span>
              </span>
              <Icon name="chevronRight" size={20} />
            </button>
          )}
          {count > 0 && (
            <button type="button" className={s.cartBar} onClick={() => setView('cart')} disabled={!canOrder}>
              <span className={s.cartBarText}>
                <strong>{strings.itemsAdded(count)}</strong>
                <span>
                  {formatPaise(cartTotal)} {strings.plusTaxes}
                </span>
              </span>
              <span className={s.cartBarCta}>
                {strings.viewCart}
                <Icon name="chevronRight" size={20} strokeWidth={2.6} />
              </span>
            </button>
          )}
          {orders.length > 0 && count > 0 && (
            <button type="button" className={s.trackMini} onClick={() => setView('orders')}>
              <span className={s.trackDot} /> {strings.trackOrders}
            </button>
          )}
        </div>
      )}

      <DishSheet
        item={sheetItem}
        open={Boolean(sheetItem)}
        canOrder={canOrder}
        strings={strings}
        showLocal={showLocal}
        unavailableAddons={unavailableAddons}
        onClose={() => setSheetItem(null)}
        onAdd={(item, sel) => {
          addToCart(item, sel);
          setSheetItem(null);
        }}
      />

      <Sheet open={menuFab} onClose={() => setMenuFab(false)} placement="center" size="sm" title={strings.menu}>
        <ul className={s.fabList}>
          {sections.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => jumpTo(c.id)} className={cx(activeCat === c.id && s.fabActive)}>
                <span>{showLocal && c.nameLocal ? c.nameLocal : c.name}</span>
                <span>{c.items.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={langOpen} onClose={() => setLangOpen(false)} title={strings.language} size="sm">
        <div className={s.langList} role="radiogroup">
          {(LOCALES as readonly Locale[])
            .filter((l) => r.languages.includes(l))
            .map((l) => (
              <button key={l} type="button" role="radio" aria-checked={locale === l} className={cx(s.langOption, locale === l && s.langOptionOn)} onClick={() => void changeLocale(l)} lang={l}>
                <span>{LOCALE_LABEL[l]}</span>
                {locale === l && <Icon name="check" size={20} strokeWidth={2.6} />}
              </button>
            ))}
        </div>
      </Sheet>

      <Sheet open={serviceOpen} onClose={() => setServiceOpen(false)} title={strings.needHelp} size="sm">
        <div className={s.serviceGrid}>
          {(
            [
              ['waiter', 'waiter', strings.callWaiter],
              ['water', 'water', strings.water],
              ['bill', 'receipt', strings.askBill],
            ] as const
          ).map(([type, icon, label]) => {
            const until = cooldowns[type] ?? 0;
            const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
            return (
              <button key={type} type="button" className={cx(s.serviceBtn, left > 0 && s.serviceBtnWait)} disabled={left > 0} onClick={() => void callStaff(type)}>
                <span className={s.serviceIcon}>
                  <Icon name={icon} size={26} />
                </span>
                <strong>{label}</strong>
                <span className={s.serviceState}>{left > 0 ? (ackd[type] ? strings.onTheWay : `${strings.staffNotified} · ${left}s`) : ' '}</span>
              </button>
            );
          })}
        </div>
        {orders.length > 0 && (
          <Button variant="outline" block icon="receipt" onClick={() => {
            setServiceOpen(false);
            void openBill();
          }}>
            {strings.viewBill}
          </Button>
        )}
      </Sheet>

      <BillSheet open={billOpen} onClose={() => setBillOpen(false)} bill={bill} strings={strings} loading={billLoading} />
    </div>
  );
}

function StateScreen({ icon, title, body, restaurant, children }: { icon: 'qr' | 'heart'; title: string; body: string; restaurant: string; children?: React.ReactNode }) {
  return (
    <main className={s.stateScreen}>
      <span className={s.stateIcon}>
        <Icon name={icon} size={36} />
      </span>
      <p className={s.stateRestaurant}>{restaurant}</p>
      <h1>{title}</h1>
      <p className={s.stateBody}>{body}</p>
      <div className={s.stateActions}>{children}</div>
      <p className={s.poweredBy}>
        Powered by <a href="/">TableOS</a>
      </p>
    </main>
  );
}

