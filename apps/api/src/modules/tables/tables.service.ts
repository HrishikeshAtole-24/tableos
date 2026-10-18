import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { TableDto } from '@tableos/schemas';
import type { z } from 'zod';
import type { bulkTablesInput, tableInput, updateTableInput } from '@tableos/schemas';
import type { Deps } from '../../context';
import { conflict, notFound, unprocessable } from '../../lib/errors';
import { signQrToken } from '../auth/tokens';

const A6: [number, number] = [297.64, 419.53]; // points

export class TablesService {
  constructor(private readonly deps: Deps) {}

  qrUrl(slug: string, restaurantId: string, tableId: string, qrVersion: number): string {
    const token = signQrToken(this.deps.env.QR_SIGNING_SECRET, restaurantId, tableId, qrVersion);
    return `${this.deps.env.NEXT_PUBLIC_MENU_URL}/r/${slug}?t=${token}`;
  }

  async list(restaurantId: string): Promise<TableDto[]> {
    const [restaurant, tables] = await Promise.all([
      this.deps.db.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { slug: true } }),
      this.deps.db.restaurantTable.findMany({
        where: { restaurantId },
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
        include: {
          sessions: {
            where: { status: { not: 'closed' } },
            take: 1,
            include: { orders: { where: { status: { notIn: ['rejected', 'cancelled'] } }, select: { totalPaise: true } } },
          },
        },
      }),
    ]);
    return tables.map((t) => {
      const s = t.sessions[0];
      return {
        id: t.id,
        label: t.label,
        section: t.section,
        qrVersion: t.qrVersion,
        active: t.active,
        qrUrl: this.qrUrl(restaurant.slug, restaurantId, t.id, t.qrVersion),
        openSession: s
          ? { id: s.id, status: s.status, openedAt: s.openedAt.toISOString(), runningTotalPaise: s.orders.reduce((a, o) => a + o.totalPaise, 0) }
          : null,
      };
    });
  }

  async create(restaurantId: string, input: z.infer<typeof tableInput>) {
    const dup = await this.deps.db.restaurantTable.findUnique({ where: { restaurantId_label: { restaurantId, label: input.label } } });
    if (dup) throw conflict('table_exists', `A table named ${input.label} already exists`);
    const count = await this.deps.db.restaurantTable.count({ where: { restaurantId } });
    if (count >= 300) throw unprocessable('table_limit', 'You can have up to 300 tables');
    await this.deps.db.restaurantTable.create({ data: { ...input, restaurantId, sortOrder: count } });
    return this.list(restaurantId);
  }

  async createBulk(restaurantId: string, input: z.infer<typeof bulkTablesInput>) {
    if (input.to < input.from || input.to - input.from > 99) throw unprocessable('bad_range', 'Add up to 100 tables at a time');
    const existing = new Set((await this.deps.db.restaurantTable.findMany({ where: { restaurantId }, select: { label: true } })).map((t) => t.label));
    let sort = existing.size;
    const data = [];
    for (let n = input.from; n <= input.to; n++) {
      const label = `${input.prefix}${n}`;
      if (!existing.has(label)) data.push({ restaurantId, label, section: input.section, sortOrder: sort++ });
    }
    if (data.length) await this.deps.db.restaurantTable.createMany({ data });
    return this.list(restaurantId);
  }

  async update(restaurantId: string, id: string, input: z.infer<typeof updateTableInput>) {
    if (input.label) {
      const dup = await this.deps.db.restaurantTable.findFirst({ where: { restaurantId, label: input.label, NOT: { id } } });
      if (dup) throw conflict('table_exists', `A table named ${input.label} already exists`);
    }
    const r = await this.deps.db.restaurantTable.updateMany({ where: { id, restaurantId }, data: input });
    if (r.count === 0) throw notFound('Table');
    return this.list(restaurantId);
  }

  /** Raising qr_version makes every older printed QR for that table invalid. */
  async rotateQr(restaurantId: string, id: string, actorUserId: string) {
    const r = await this.deps.db.restaurantTable.updateMany({ where: { id, restaurantId }, data: { qrVersion: { increment: 1 } } });
    if (r.count === 0) throw notFound('Table');
    await this.deps.db.auditLog.create({ data: { actorUserId, restaurantId, action: 'table.rotate_qr', entityType: 'table', entityId: id } });
    return this.list(restaurantId);
  }

  private async fetchLogo(url: string | null): Promise<Buffer | null> {
    if (!url) return null;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !/image\/(png|jpe?g)/.test(type)) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  /** Print-ready A6 tent cards: logo, table label, QR, short instruction line. */
  async qrPdf(restaurantId: string, tableIds?: string[]): Promise<Buffer> {
    const restaurant = await this.deps.db.restaurant.findUniqueOrThrow({ where: { id: restaurantId } });
    const tables = await this.deps.db.restaurantTable.findMany({
      where: { restaurantId, active: true, ...(tableIds?.length ? { id: { in: tableIds } } : {}) },
      orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
    if (tables.length === 0) throw unprocessable('no_tables', 'Add at least one table first');
    const logo = await this.fetchLogo(restaurant.logoUrl);
    const brand = (restaurant.theme as { primary?: string })?.primary ?? '#FC8019';

    const doc = new PDFDocument({ size: A6, margin: 0, info: { Title: `${restaurant.name} table QR codes`, Author: 'TableOS' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    for (const [i, t] of tables.entries()) {
      if (i > 0) doc.addPage({ size: A6, margin: 0 });
      const [w, h] = A6;
      doc.rect(0, 0, w, 64).fill(brand);
      if (logo) {
        try {
          doc.image(logo, 18, 12, { fit: [40, 40] });
        } catch {
          /* unsupported image: skip */
        }
      }
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text(restaurant.name, logo ? 66 : 18, 22, { width: w - (logo ? 84 : 36), ellipsis: true, lineBreak: false });
      doc.fillColor('#02060C').font('Helvetica-Bold').fontSize(13).text('TABLE', 0, 84, { width: w, align: 'center', characterSpacing: 2 });
      doc.fontSize(34).text(t.label, 0, 100, { width: w, align: 'center' });
      const url = this.qrUrl(restaurant.slug, restaurantId, t.id, t.qrVersion);
      const png = await QRCode.toBuffer(url, { errorCorrectionLevel: 'M', margin: 1, width: 600, color: { dark: '#02060C', light: '#FFFFFF' } });
      const size = 176;
      doc.image(png, (w - size) / 2, 152, { width: size, height: size });
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#02060C').text('Scan to see the menu and order', 0, 342, { width: w, align: 'center' });
      doc.font('Helvetica').fontSize(9).fillColor('#5c5f66').text('No app needed. Opens in your phone browser.', 0, 360, { width: w, align: 'center' });
      if (t.section) doc.fontSize(8).fillColor('#8a8d93').text(t.section, 0, h - 26, { width: w, align: 'center' });
    }
    doc.end();
    const pdf = await done;
    await this.deps.db.restaurant.update({ where: { id: restaurantId }, data: { qrDownloadedAt: this.deps.clock() } });
    return pdf;
  }
}
