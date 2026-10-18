import { formatPaise } from '@tableos/schemas';
import type { Deps } from '../../context';
import { escapeHtml as esc, layout, type Mail } from './mailer';

type Vars = Record<string, string>;

/**
 * Email triggers (spec §3.7 Notifications): staff invite, low balance, grace started,
 * ordering paused, recharge receipt. WhatsApp and SMS come later (DLT registration).
 */
export class NotificationsService {
  constructor(private readonly deps: Deps) {}

  private render(template: string, restaurantName: string, vars: Vars): Omit<Mail, 'to'> | null {
    const consoleUrl = this.deps.env.CONSOLE_URL;
    switch (template) {
      case 'staff_invite':
        return {
          subject: `You're invited to join ${restaurantName} on TableOS`,
          html: layout(`Join ${esc(restaurantName)}`, `You have been invited as <b>${esc(vars.role ?? 'staff')}</b>. Sign in with this email address to accept.`, {
            label: 'Accept invite',
            url: `${consoleUrl}/invite/${vars.token}`,
          }),
          text: `You have been invited to ${restaurantName} on TableOS as ${vars.role}. Accept: ${consoleUrl}/invite/${vars.token}`,
        };
      case 'low_balance':
        return {
          subject: `Low wallet balance for ${restaurantName}: ${vars.balance}`,
          html: layout('Your wallet is running low', `Your TableOS wallet balance is <b>${esc(vars.balance ?? '')}</b>. Recharge to keep taking QR orders without interruption.`, {
            label: 'Recharge wallet',
            url: `${consoleUrl}/wallet`,
          }),
          text: `Your TableOS wallet balance is ${vars.balance}. Recharge: ${consoleUrl}/wallet`,
        };
      case 'grace_started':
        return {
          subject: `Action needed: ${restaurantName} wallet is empty`,
          html: layout('Your wallet is empty', `Orders keep working for up to 48 hours. After that, QR ordering pauses at your next closing time. Your menu always stays visible.`, {
            label: 'Recharge now',
            url: `${consoleUrl}/wallet`,
          }),
          text: `Your TableOS wallet is empty. Recharge within 48 hours to keep QR ordering on: ${consoleUrl}/wallet`,
        };
      case 'ordering_paused':
        return {
          subject: `QR ordering is paused for ${restaurantName}`,
          html: layout('QR ordering is paused', `Your balance is <b>${esc(vars.balance ?? '')}</b>. Your menu and QR codes still work in view-only mode. Recharge to switch ordering back on instantly.`, {
            label: 'Recharge wallet',
            url: `${consoleUrl}/wallet`,
          }),
          text: `QR ordering is paused (balance ${vars.balance}). Recharge to resume: ${consoleUrl}/wallet`,
        };
      case 'recharge_receipt':
        return {
          subject: `Payment received: ${vars.amount} (${vars.invoice})`,
          html: layout('Payment received', `We received <b>${esc(vars.amount ?? '')}</b>. Invoice <b>${esc(vars.invoice ?? '')}</b>, reference ${esc(vars.reference ?? '')}.`, {
            label: 'View invoices',
            url: `${consoleUrl}/wallet`,
          }),
          text: `Payment received: ${vars.amount}. Invoice ${vars.invoice}. Reference ${vars.reference}.`,
        };
      default:
        return null;
    }
  }

  /** Job handler for notify.email. Without `to`, sends to the restaurant's owners and managers. */
  async sendEmail(data: { restaurantId: string; template: string; to?: string; vars?: Vars }): Promise<void> {
    const r = await this.deps.db.restaurant.findUnique({ where: { id: data.restaurantId }, select: { name: true } });
    if (!r) return;
    const content = this.render(data.template, r.name, data.vars ?? {});
    if (!content) {
      this.deps.log.warn({ template: data.template }, 'unknown email template');
      return;
    }
    let recipients: string[];
    if (data.to) recipients = [data.to];
    else {
      const members = await this.deps.db.membership.findMany({
        where: { restaurantId: data.restaurantId, role: { in: ['owner', 'manager'] }, user: { emailVerifiedAt: { not: null } } },
        select: { user: { select: { email: true } } },
      });
      recipients = members.map((m) => m.user.email).filter((e): e is string => Boolean(e));
    }
    for (const to of recipients) await this.deps.mailer.send({ to, ...content });
  }

  /** wallet.alerts job: one alert per threshold crossing. */
  async walletAlert(data: { restaurantId: string; level: number; balancePaise: number }): Promise<void> {
    const template = data.balancePaise <= 0 ? 'grace_started' : 'low_balance';
    await this.sendEmail({ restaurantId: data.restaurantId, template, vars: { balance: formatPaise(data.balancePaise) } });
  }
}
