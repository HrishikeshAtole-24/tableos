/** Dev helper: print the diner link for a table of the demo restaurant. Usage: tsx scripts/qr-link.ts [label] */
import { createPrismaClient } from '@tableos/db';
import { signQrToken } from '../src/modules/auth/tokens';

const label = process.argv[2] ?? 'T3';
const db = createPrismaClient(process.env.DATABASE_URL!);
const table = await db.restaurantTable.findFirstOrThrow({ where: { label, restaurant: { slug: 'spice-route-cafe' } }, include: { restaurant: true } });
const token = signQrToken(process.env.QR_SIGNING_SECRET!, table.restaurantId, table.id, table.qrVersion);
console.log(`${process.env.NEXT_PUBLIC_MENU_URL}/r/${table.restaurant.slug}?t=${token}`);
await db.$disconnect();
