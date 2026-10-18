import { Router } from 'express';
import { z } from 'zod';
import {
  availabilityInput,
  bulkPriceInput,
  bulkTablesInput,
  categoryInput,
  closeSessionInput,
  createImportInput,
  createRestaurantInput,
  discountInput,
  idParam,
  inviteStaffInput,
  itemInput,
  listOrdersQuery,
  locale,
  markPaidInput,
  paginationQuery,
  rechargeInput,
  reorderInput,
  staffOrderInput,
  tableInput,
  translationInput,
  updateCategoryInput,
  updateImportInput,
  updateItemInput,
  updateMemberInput,
  updateOrderStatusInput,
  updateProfileInput,
  updateRestaurantInput,
  updateTableInput,
  uploadRequestInput,
  uuid,
} from '@tableos/schemas';
import type { Deps } from '../context';
import { badRequest } from '../lib/errors';
import { json, parse } from '../lib/http';
import { idempotent } from '../lib/idempotency';
import { requireRestaurant, requireRole, requireUser } from '../modules/auth/auth.middleware';
import type { SupabaseVerifier } from '../modules/auth/tokens';
import type { Services } from '../services';

const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'application/pdf': 'pdf' };

/** All routes for signed-in restaurant users (owner, manager, waiter, kitchen). */
export function dashboardRoutes(deps: Deps, s: Services, verifier: SupabaseVerifier): Router {
  const r = Router();
  const auth = requireUser(deps, verifier);
  const tenant = requireRestaurant(deps);
  const managers = requireRole('owner', 'manager');
  const owner = requireRole('owner');
  const floor = requireRole('owner', 'manager', 'waiter');
  const rid = (req: { ctx: { restaurantId?: string } }) => req.ctx.restaurantId!;
  const uid = (req: { ctx: { user?: { id: string } } }) => req.ctx.user!.id;

  // ───── Me & onboarding ─────
  r.get('/me', auth, json((req) => s.restaurants.me(req.ctx.user!)));
  r.patch('/me', auth, json(async (req) => { await s.restaurants.updateProfile(uid(req), parse(updateProfileInput, req.body).name); return s.restaurants.me(req.ctx.user!); }));
  r.post('/invites/:token/accept', auth, json((req) => s.restaurants.acceptInvite(req.ctx.user!, z.string().min(10).parse(req.params.token))));
  r.post('/restaurants', auth, json((req) => s.restaurants.create(req.ctx.user!, parse(createRestaurantInput, req.body)), { created: true }));

  // Path-scoped restaurant routes from the spec; the id must match the tenant header.
  const sameTenant = (req: { params: Record<string, string | string[]>; ctx: { restaurantId?: string } }) => {
    if (req.params.id !== req.ctx.restaurantId) throw badRequest('Restaurant id does not match the selected restaurant');
  };
  r.get('/restaurants/:id', auth, tenant, json((req) => { sameTenant(req); return s.restaurants.get(rid(req)); }));
  r.patch('/restaurants/:id', auth, tenant, managers, json((req) => { sameTenant(req); return s.restaurants.update(rid(req), uid(req), parse(updateRestaurantInput, req.body)); }));
  r.get('/restaurant', auth, tenant, json((req) => s.restaurants.get(rid(req))));
  r.get('/restaurant/checklist', auth, tenant, json((req) => s.restaurants.checklist(rid(req))));

  // ───── Staff ─────
  r.get('/staff', auth, tenant, managers, json((req) => s.restaurants.listStaff(rid(req))));
  r.post('/staff/invites', auth, tenant, managers, json((req) => s.restaurants.invite(rid(req), uid(req), parse(inviteStaffInput, req.body)), { created: true }));
  r.delete('/staff/invites/:id', auth, tenant, managers, json(async (req) => { await s.restaurants.revokeInvite(rid(req), parse(idParam, req.params).id); }));
  r.patch('/staff/:id', auth, tenant, managers, json(async (req) => { await s.restaurants.updateMember(rid(req), uid(req), parse(idParam, req.params).id, parse(updateMemberInput, req.body).role); }));
  r.delete('/staff/:id', auth, tenant, managers, json(async (req) => { await s.restaurants.removeMember(rid(req), uid(req), parse(idParam, req.params).id); }));
  r.post('/staff/:id/transfer-ownership', auth, tenant, owner, json(async (req) => { await s.restaurants.transferOwnership(rid(req), req.ctx.user!, parse(idParam, req.params).id); }));

  // ───── Uploads (signed URLs, files go straight to storage) ─────
  r.post('/uploads', auth, tenant, managers, json(async (req) => {
    const input = parse(uploadRequestInput, req.body);
    const ext = MIME_EXT[input.contentType];
    if (!ext || (input.purpose !== 'import' && ext === 'pdf')) throw badRequest('Unsupported file type');
    return deps.storage.createUploadTicket(rid(req), input.purpose, ext);
  }));

  // ───── Menu ─────
  r.get('/menu', auth, tenant, json((req) => s.menu.fullMenu(rid(req))));
  r.get('/menu/categories', auth, tenant, json((req) => s.menu.fullMenu(rid(req))));
  r.post('/menu/categories', auth, tenant, managers, json((req) => s.menu.createCategory(rid(req), parse(categoryInput, req.body)), { created: true }));
  r.patch('/menu/categories/:id', auth, tenant, managers, json(async (req) => { await s.menu.updateCategory(rid(req), parse(idParam, req.params).id, parse(updateCategoryInput, req.body)); }));
  r.delete('/menu/categories/:id', auth, tenant, managers, json(async (req) => { await s.menu.deleteCategory(rid(req), parse(idParam, req.params).id); }));
  r.get('/menu/items', auth, tenant, json(async (req) => (await s.menu.fullMenu(rid(req))).flatMap((c) => c.items)));
  r.post('/menu/items', auth, tenant, managers, json((req) => s.menu.createItem(rid(req), parse(itemInput, req.body)), { created: true }));
  r.patch('/menu/items/:id', auth, tenant, managers, json((req) => s.menu.updateItem(rid(req), parse(idParam, req.params).id, parse(updateItemInput, req.body))));
  r.delete('/menu/items/:id', auth, tenant, managers, json((req) => s.menu.deleteItem(rid(req), parse(idParam, req.params).id)));
  // Sold-out toggles are a floor task too (waiters mark dishes sold out during service).
  r.patch('/menu/items/:id/availability', auth, tenant, floor, json(async (req) => { await s.menu.setAvailability(rid(req), parse(idParam, req.params).id, parse(availabilityInput, req.body).available); }));
  r.patch('/menu/addons/:id/availability', auth, tenant, floor, json(async (req) => { await s.menu.setAddonAvailability(rid(req), parse(idParam, req.params).id, parse(availabilityInput, req.body).available); }));
  r.post('/menu/reorder', auth, tenant, managers, json(async (req) => { await s.menu.reorder(rid(req), parse(reorderInput, req.body)); }));
  r.post('/menu/bulk-price', auth, tenant, managers, json((req) => s.menu.bulkPrice(rid(req), parse(bulkPriceInput, req.body))));
  r.get('/menu/translations', auth, tenant, managers, json((req) => s.menu.listTranslations(rid(req), parse(z.object({ locale: locale.exclude(['en']) }), req.query).locale)));
  r.put('/menu/translations', auth, tenant, managers, json(async (req) => { await s.menu.upsertTranslation(rid(req), parse(translationInput, req.body)); }));

  // ───── AI menu import ─────
  r.get('/menu/imports', auth, tenant, managers, json((req) => s.imports.list(rid(req))));
  r.post('/menu/imports', auth, tenant, managers, json((req) => s.imports.create(rid(req), uid(req), parse(createImportInput, req.body).filePaths), { created: true }));
  r.get('/menu/imports/:id', auth, tenant, managers, json((req) => s.imports.get(rid(req), parse(idParam, req.params).id)));
  r.patch('/menu/imports/:id', auth, tenant, managers, json((req) => s.imports.update(rid(req), parse(idParam, req.params).id, parse(updateImportInput, req.body).result)));
  r.post('/menu/imports/:id/retry', auth, tenant, managers, json((req) => s.imports.retry(rid(req), parse(idParam, req.params).id)));
  r.post('/menu/imports/:id/publish', auth, tenant, managers, json((req) => s.imports.publish(rid(req), parse(idParam, req.params).id)));

  // ───── Tables & QR ─────
  r.get('/tables', auth, tenant, json((req) => s.tables.list(rid(req))));
  r.post('/tables', auth, tenant, managers, json((req) => s.tables.create(rid(req), parse(tableInput, req.body)), { created: true }));
  r.post('/tables/bulk', auth, tenant, managers, json((req) => s.tables.createBulk(rid(req), parse(bulkTablesInput, req.body)), { created: true }));
  r.get('/tables/qr.pdf', auth, tenant, managers, async (req, res) => {
    const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',').filter((x) => uuid.safeParse(x).success) : undefined;
    const pdf = await s.tables.qrPdf(rid(req), ids);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="table-qr-codes.pdf"');
    res.send(pdf);
  });
  r.patch('/tables/:id', auth, tenant, managers, json((req) => s.tables.update(rid(req), parse(idParam, req.params).id, parse(updateTableInput, req.body))));
  r.post('/tables/:id/rotate-qr', auth, tenant, managers, json((req) => s.tables.rotateQr(rid(req), parse(idParam, req.params).id, uid(req))));

  // ───── Orders ─────
  r.get('/orders', auth, tenant, json((req) => s.orders.list(rid(req), parse(listOrdersQuery, req.query))));
  r.get('/orders/live', auth, tenant, json((req) => s.orders.live(rid(req))));
  r.post(
    '/orders',
    auth,
    tenant,
    floor,
    idempotent(deps.db, (req) => `staff-order:${req.ctx.restaurantId}`),
    json(async (req) => {
      const input = parse(staffOrderInput, req.body);
      return s.orders.placeStaffOrder(rid(req), uid(req), input.tableId, input);
    }, { created: true }),
  );
  r.patch('/orders/:id/status', auth, tenant, json((req) => {
    const body = parse(updateOrderStatusInput, req.body);
    return s.orders.updateStatus(rid(req), req.ctx.role!, parse(idParam, req.params).id, body.status, body.reason);
  }));
  r.delete('/orders/:id/items/:itemId', auth, tenant, floor, json((req) => {
    const p = parse(z.object({ id: uuid, itemId: uuid }), req.params);
    return s.orders.removeItem(rid(req), p.id, p.itemId);
  }));

  // ───── Service requests ─────
  r.get('/service-requests', auth, tenant, floor, json((req) => s.serviceRequests.listOpen(rid(req))));
  r.patch('/service-requests/:id/ack', auth, tenant, floor, json((req) => s.serviceRequests.acknowledge(rid(req), parse(idParam, req.params).id, uid(req))));

  // ───── Billing ─────
  r.get('/sessions/:id/bill', auth, tenant, floor, json((req) => s.billing.get(rid(req), parse(idParam, req.params).id)));
  r.post('/sessions/:id/bill/discount', auth, tenant, managers, json((req) => {
    const b = parse(discountInput, req.body);
    return s.billing.setDiscount(rid(req), parse(idParam, req.params).id, b.discountPaise, b.reason, uid(req));
  }));
  r.post('/sessions/:id/bill/paid', auth, tenant, floor, json((req) => s.billing.markPaid(rid(req), parse(idParam, req.params).id, parse(markPaidInput, req.body).paidVia)));
  r.post('/sessions/:id/close', auth, tenant, floor, json(async (req) => {
    const b = parse(closeSessionInput, req.body ?? {});
    const id = parse(idParam, req.params).id;
    if (b.paidVia) return s.billing.markPaid(rid(req), id, b.paidVia);
    await s.sessions.close(rid(req), id);
    return s.billing.get(rid(req), id);
  }));

  // ───── Wallet & payments ─────
  r.get('/wallet', auth, tenant, managers, json((req) => s.wallet.getWallet(rid(req))));
  r.get('/wallet/ledger', auth, tenant, managers, json((req) => { const q = parse(paginationQuery, req.query); return s.wallet.listLedger(rid(req), q.limit, q.cursor); }));
  r.get('/wallet/invoices', auth, tenant, managers, json((req) => s.wallet.listInvoices(rid(req))));
  r.get('/wallet/invoices/:id', auth, tenant, managers, async (req, res) => {
    const { renderInvoiceHtml } = await import('../modules/wallet/invoice');
    const html = await renderInvoiceHtml(deps, rid(req), parse(idParam, req.params).id);
    res.type('html').send(html);
  });
  r.get('/wallet/payments', auth, tenant, managers, json((req) => s.payments.listForRestaurant(rid(req))));
  r.get('/wallet/payments/:reference', auth, tenant, managers, json((req) => s.payments.getForRestaurant(rid(req), z.string().max(40).parse(req.params.reference))));
  r.post(
    '/wallet/recharges',
    auth,
    tenant,
    managers,
    idempotent(deps.db, (req) => `recharge:${req.ctx.restaurantId}`),
    json((req) => s.payments.createRecharge(rid(req), uid(req), parse(rechargeInput, req.body)), { created: true }),
  );

  // ───── Insights ─────
  r.get('/insights', auth, tenant, managers, json((req) => s.analytics.insights(rid(req), parse(z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }), req.query).days)));

  return r;
}
