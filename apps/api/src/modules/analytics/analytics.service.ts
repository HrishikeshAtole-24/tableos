import type { InsightsDto } from '@tableos/schemas';
import type { z } from 'zod';
import type { analyticsBatchInput } from '@tableos/schemas';
import type { Deps } from '../../context';
import { businessDate, zonedParts } from '../../lib/time';

export class AnalyticsService {
  constructor(private readonly deps: Deps) {}

  /** Batched diner events; unknown restaurants are dropped silently. */
  async ingest(input: z.infer<typeof analyticsBatchInput>): Promise<void> {
    const exists = await this.deps.db.restaurant.findUnique({ where: { id: input.restaurantId }, select: { id: true } });
    if (!exists) return;
    const now = this.deps.clock();
    await this.deps.db.analyticsEvent.createMany({
      data: input.events.map((e) => {
        const at = e.at ? new Date(e.at) : now;
        // Clamp client clocks: no future or very old timestamps.
        const createdAt = at > now || now.getTime() - at.getTime() > 86_400_000 ? now : at;
        return { restaurantId: input.restaurantId, sessionId: input.sessionId, type: e.type, itemId: e.itemId, createdAt };
      }),
    });
  }

  /** Nightly job: per-restaurant daily totals for the given date (default: yesterday, IST). */
  async aggregate(date?: string): Promise<number> {
    const day = date ?? businessDate(new Date(this.deps.clock().getTime() - 86_400_000));
    const start = new Date(`${day}T00:00:00+05:30`);
    const end = new Date(start.getTime() + 86_400_000);
    const restaurants = await this.deps.db.restaurant.findMany({ where: { status: 'active' }, select: { id: true } });
    for (const { id } of restaurants) {
      const [events, placed, accepted, sales, sessions] = await Promise.all([
        this.deps.db.analyticsEvent.groupBy({ by: ['type'], where: { restaurantId: id, createdAt: { gte: start, lt: end } }, _count: { _all: true } }),
        this.deps.db.order.count({ where: { restaurantId: id, businessDate: day } }),
        this.deps.db.order.count({ where: { restaurantId: id, businessDate: day, status: { in: ['accepted', 'preparing', 'ready', 'served'] } } }),
        this.deps.db.bill.aggregate({ where: { restaurantId: id, status: 'paid', paidAt: { gte: start, lt: end } }, _sum: { totalPaise: true } }),
        this.deps.db.tableSession.count({ where: { restaurantId: id, openedAt: { gte: start, lt: end } } }),
      ]);
      const count = (t: string) => events.find((e) => e.type === t)?._count._all ?? 0;
      const data = {
        menuViews: count('menu_view'),
        itemViews: count('item_view'),
        addToCarts: count('add_to_cart'),
        ordersPlaced: placed,
        ordersAccepted: accepted,
        salesPaise: sales._sum.totalPaise ?? 0,
        sessions,
      };
      await this.deps.db.dailyStat.upsert({ where: { restaurantId_date: { restaurantId: id, date: day } }, create: { restaurantId: id, date: day, ...data }, update: data });
    }
    return restaurants.length;
  }

  async insights(restaurantId: string, days: number): Promise<InsightsDto> {
    const now = this.deps.clock();
    const from = new Date(now.getTime() - days * 86_400_000);
    const fromDate = businessDate(from);
    const toDate = businessDate(now);
    const [bills, orders, sessions, views, itemViews] = await Promise.all([
      this.deps.db.bill.findMany({ where: { restaurantId, status: 'paid', paidAt: { gte: from } }, select: { totalPaise: true, paidAt: true } }),
      this.deps.db.order.findMany({
        where: { restaurantId, createdAt: { gte: from }, status: { in: ['accepted', 'preparing', 'ready', 'served'] } },
        select: { createdAt: true, items: { select: { itemId: true, nameSnapshot: true, qty: true, unitPricePaise: true } } },
      }),
      this.deps.db.tableSession.findMany({ where: { restaurantId, openedAt: { gte: from } }, select: { id: true, orders: { select: { id: true }, take: 1 } } }),
      this.deps.db.analyticsEvent.count({ where: { restaurantId, type: 'menu_view', createdAt: { gte: from } } }),
      this.deps.db.analyticsEvent.groupBy({ by: ['itemId'], where: { restaurantId, type: 'item_view', createdAt: { gte: from }, itemId: { not: null } }, _count: { _all: true } }),
    ]);

    const salesPaise = bills.reduce((a, b) => a + b.totalPaise, 0);
    const byDayMap = new Map<string, { salesPaise: number; orders: number }>();
    for (let d = 0; d <= days; d++) byDayMap.set(businessDate(new Date(from.getTime() + d * 86_400_000)), { salesPaise: 0, orders: 0 });
    for (const b of bills) {
      const k = businessDate(b.paidAt!);
      const e = byDayMap.get(k);
      if (e) e.salesPaise += b.totalPaise;
    }
    const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
    const dish = new Map<string, { name: string; qty: number; salesPaise: number }>();
    for (const o of orders) {
      const e = byDayMap.get(businessDate(o.createdAt));
      if (e) e.orders++;
      byHour[zonedParts(o.createdAt).hour]!.orders++;
      for (const i of o.items) {
        const d = dish.get(i.itemId) ?? { name: i.nameSnapshot, qty: 0, salesPaise: 0 };
        d.qty += i.qty;
        d.salesPaise += i.qty * i.unitPricePaise;
        dish.set(i.itemId, d);
      }
    }
    const names = await this.deps.db.menuItem.findMany({
      where: { restaurantId, id: { in: itemViews.map((v) => v.itemId!).filter(Boolean) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(names.map((n) => [n.id, n.name]));
    const sessionsWithOrder = sessions.filter((s) => s.orders.length > 0).length;

    return {
      range: { from: fromDate, to: toDate },
      totals: {
        salesPaise,
        orders: orders.length,
        avgBillPaise: bills.length ? Math.round(salesPaise / bills.length) : 0,
        sessions: sessions.length,
        menuViews: views,
        scanToOrderRate: sessions.length ? sessionsWithOrder / sessions.length : 0,
      },
      byDay: [...byDayMap.entries()].map(([date, v]) => ({ date, ...v })),
      byHour,
      topDishes: [...dish.entries()]
        .map(([itemId, d]) => ({ itemId, ...d }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10),
      viewedNotOrdered: itemViews
        .map((v) => ({ itemId: v.itemId!, name: nameById.get(v.itemId!) ?? 'Removed dish', views: v._count._all, orders: dish.get(v.itemId!)?.qty ?? 0 }))
        .filter((v) => v.views >= 5 && v.orders / v.views < 0.1)
        .sort((a, b) => b.views - a.views)
        .slice(0, 10),
    };
  }
}
