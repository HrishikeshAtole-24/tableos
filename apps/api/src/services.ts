import type { Deps } from './context';
import { AdminService } from './modules/admin/admin.service';
import { AnalyticsService } from './modules/analytics/analytics.service';
import { BillingService } from './modules/billing/billing.service';
import { ImportsService } from './modules/imports/imports.service';
import { MenuService } from './modules/menu/menu.service';
import { NotificationsService } from './modules/notifications/notifications.service';
import { OrdersService } from './modules/orders/orders.service';
import { PaymentService } from './modules/payments/payment.service';
import { PaymentRouter } from './modules/payments/router';
import { RestaurantsService } from './modules/restaurants/restaurants.service';
import { ServiceRequestsService } from './modules/service-requests/service-requests.service';
import { SessionsService } from './modules/sessions/sessions.service';
import { TablesService } from './modules/tables/tables.service';
import { WalletService } from './modules/wallet/wallet.service';

export function createServices(deps: Deps) {
  const wallet = new WalletService(deps);
  const paymentRouter = new PaymentRouter(deps.db, deps.env);
  return {
    restaurants: new RestaurantsService(deps),
    menu: new MenuService(deps),
    imports: new ImportsService(deps),
    tables: new TablesService(deps),
    sessions: new SessionsService(deps),
    orders: new OrdersService(deps, wallet),
    serviceRequests: new ServiceRequestsService(deps),
    billing: new BillingService(deps),
    wallet,
    paymentRouter,
    payments: new PaymentService(deps, paymentRouter, wallet),
    analytics: new AnalyticsService(deps),
    notifications: new NotificationsService(deps),
    admin: new AdminService(deps),
  };
}

export type Services = ReturnType<typeof createServices>;
