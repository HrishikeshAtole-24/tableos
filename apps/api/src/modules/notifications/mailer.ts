import type { Logger } from '../../lib/logger';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Resend HTTP API (no SDK). */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(mail: Mail): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
  }
}

/** Development / test: log instead of sending. */
export class LogMailer implements Mailer {
  readonly outbox: Mail[] = [];
  constructor(private readonly log?: Logger) {}
  async send(mail: Mail): Promise<void> {
    this.outbox.push(mail);
    this.log?.info({ to: mail.to, subject: mail.subject }, `email (not sent): ${mail.text.slice(0, 160)}`);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Branded, table-based email layout that renders in every client. */
export function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<tr><td style="padding-top:24px"><a href="${esc(cta.url)}" style="display:inline-block;background:#fc8019;color:#fff;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:12px">${esc(cta.label)}</a></td></tr>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f0f0f5;font-family:Arial,Helvetica,sans-serif;color:#02060c">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;padding:32px">
<tr><td style="font-size:22px;font-weight:800;color:#fc8019">TableOS</td></tr>
<tr><td style="padding-top:20px;font-size:20px;font-weight:700">${esc(title)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:22px;color:#3d4046">${bodyHtml}</td></tr>
${button}
</table></td></tr></table></body></html>`;
}

export { esc as escapeHtml };
