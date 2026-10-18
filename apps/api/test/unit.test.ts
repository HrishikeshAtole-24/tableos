import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../src/lib/crypto';
import { businessDate, financialYear, isOpenAt, monthKey, nextOpenLabel, startOfNextMonthIST } from '../src/lib/time';
import { signQrToken, verifyQrToken } from '../src/modules/auth/tokens';
import { ORDER_TRANSITIONS, canTransition, roleCanMove } from '../src/modules/orders/order-state';
import { mapStatus } from '../src/modules/payments/status-map';
import { crossedAlertLevel, graceEnded, gstOn, orderFee } from '../src/modules/wallet/fees';

const cfg = { feePerOrderPaise: 200, monthlyCapPaise: 99_900 };

describe('order fee and monthly cap (spec §2.3)', () => {
  it('charges 200 paise per accepted order', () => {
    expect(orderFee(cfg, 0, false)).toBe(200);
  });

  it('reaches the cap at the 500th order with a reduced last fee', () => {
    let charged = 0;
    const fees: number[] = [];
    for (let i = 0; i < 520; i++) {
      const f = orderFee(cfg, charged, false);
      charged += f;
      fees.push(f);
    }
    expect(fees[498]).toBe(200); // 499th order
    expect(fees[499]).toBe(100); // 500th order: reduced so the month total is exactly the cap
    expect(fees[500]).toBe(0);
    expect(charged).toBe(99_900);
  });

  it('is zero on an active flat plan', () => {
    expect(orderFee(cfg, 0, true)).toBe(0);
  });

  it('matches the worked examples', () => {
    const month = (orders: number) => {
      let c = 0;
      for (let i = 0; i < orders; i++) c += orderFee(cfg, c, false);
      return c;
    };
    expect(month(240)).toBe(48_000); // 8/day → ₹480
    expect(month(600)).toBe(99_900); // 20/day → capped ₹999
  });
});

describe('grace rules', () => {
  const g = { graceFloorPaise: -10_000, graceHours: 48 };
  const zero = new Date('2026-10-01T10:00:00Z');
  it('ends below the floor', () => expect(graceEnded(g, -10_001, zero, zero)).toBe(true));
  it('continues within 48 hours above the floor', () => expect(graceEnded(g, -5_000, zero, new Date(zero.getTime() + 47 * 3_600_000))).toBe(false));
  it('ends after 48 hours', () => expect(graceEnded(g, -5_000, zero, new Date(zero.getTime() + 48 * 3_600_000))).toBe(true));
  it('never ends with a positive balance', () => expect(graceEnded(g, 100, null, zero)).toBe(false));
});

describe('low-balance alerts fire once per crossing', () => {
  const levels = [10_000, 2_000];
  it('fires at ₹100', () => expect(crossedAlertLevel(levels, 9_800, null)).toBe(10_000));
  it('does not repeat at the same level', () => expect(crossedAlertLevel(levels, 9_000, 10_000)).toBeNull());
  it('fires again at ₹20', () => expect(crossedAlertLevel(levels, 1_800, 10_000)).toBe(2_000));
  it('stays quiet afterwards', () => expect(crossedAlertLevel(levels, 0, 2_000)).toBeNull());
  it('computes 18% GST', () => expect(gstOn(50_000, 1_800)).toBe(9_000));
});

describe('order state machine', () => {
  it('follows the spec transitions', () => {
    expect(ORDER_TRANSITIONS.placed).toEqual(['accepted', 'rejected']);
    expect(canTransition('ready', 'served')).toBe(true);
    expect(canTransition('served', 'cancelled')).toBe(false);
    expect(canTransition('placed', 'preparing')).toBe(false);
  });
  it('limits kitchen to cooking moves', () => {
    expect(roleCanMove('kitchen', 'accepted', 'preparing')).toBe(true);
    expect(roleCanMove('kitchen', 'placed', 'accepted')).toBe(false);
    expect(roleCanMove('waiter', 'placed', 'accepted')).toBe(true);
    expect(roleCanMove('waiter', 'preparing', 'cancelled')).toBe(false);
  });
});

describe('QR tokens', () => {
  const secret = 'x'.repeat(40);
  it('round-trips and rejects tampering', () => {
    const t = signQrToken(secret, 'r1', 't1', 3);
    expect(verifyQrToken(secret, t)).toEqual({ restaurantId: 'r1', tableId: 't1', qrVersion: 3 });
    expect(verifyQrToken(secret, t.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')))).toBeNull();
    expect(verifyQrToken('y'.repeat(40), t)).toBeNull();
    expect(verifyQrToken(secret, 'garbage')).toBeNull();
  });
});

describe('time in Asia/Kolkata', () => {
  it('computes month key and business date in IST', () => {
    const lateUtc = new Date('2026-10-31T19:00:00Z'); // 1 Nov 00:30 IST
    expect(monthKey(lateUtc)).toBe('2026-11');
    expect(businessDate(lateUtc)).toBe('2026-11-01');
  });
  it('handles intervals that cross midnight', () => {
    const hours = { sat: [{ open: '18:00', close: '01:00' }], sun: [] };
    expect(isOpenAt(hours, new Date('2026-10-17T14:00:00Z'))).toBe(true); // Sat 19:30 IST
    expect(isOpenAt(hours, new Date('2026-10-17T19:00:00Z'))).toBe(true); // Sun 00:30 IST
    expect(isOpenAt(hours, new Date('2026-10-17T20:00:00Z'))).toBe(false); // Sun 01:30 IST
  });
  it('treats empty hours as always open and labels the next opening', () => {
    expect(isOpenAt({}, new Date())).toBe(true);
    expect(nextOpenLabel({ mon: [{ open: '11:00', close: '23:00' }] }, new Date('2026-10-12T02:00:00Z'))).toBe('Opens at 11 am');
  });
  it('finds the next IST month boundary and the financial year', () => {
    expect(startOfNextMonthIST(new Date('2026-10-14T08:00:00Z')).toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(financialYear(new Date('2026-03-31T10:00:00Z'))).toBe('2025-26');
    expect(financialYear(new Date('2026-04-01T10:00:00Z'))).toBe('2026-27');
  });
});

describe('credentials encryption and status mapping', () => {
  it('encrypts with AES-256-GCM', () => {
    const key = Buffer.alloc(32, 1).toString('base64');
    const c = encrypt('{"keySecret":"s"}', key);
    expect(c).not.toContain('keySecret');
    expect(decrypt(c, key)).toBe('{"keySecret":"s"}');
  });
  it('maps provider statuses', () => {
    expect(mapStatus('razorpay', 'captured')).toBe('succeeded');
    expect(mapStatus('stripe', 'expired')).toBe('expired');
    expect(mapStatus('razorpay', 'weird')).toBe('pending');
  });
});

describe('image resizing job', () => {
  it('writes three widths in AVIF and WebP', async () => {
    const sharp = (await import('sharp')).default;
    const { MemoryStorage } = await import('../src/modules/storage/storage');
    const { resizeImage, pathFromPublicUrl } = await import('../src/modules/storage/images');
    const storage = new MemoryStorage();
    const rid = '11111111-1111-1111-1111-111111111111';
    const path = `r/${rid}/dish/22222222-2222-2222-2222-222222222222.png`;
    const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#fc8019' } }).png().toBuffer();
    await storage.upload(path, png, 'image/png');
    expect(pathFromPublicUrl(storage.publicUrl(path))).toBe(path);
    const out = await resizeImage(storage, path);
    expect(out).toHaveLength(6);
    const meta = await sharp(storage.files.get(path.replace('.png', '-640.webp'))!.body).metadata();
    expect(meta.width).toBe(640);
    expect(meta.format).toBe('webp');
  });
});
