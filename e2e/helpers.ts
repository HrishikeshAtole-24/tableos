import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
export const CONSOLE = process.env.CONSOLE_URL ?? 'http://localhost:3001';
export const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
// Tests run from the repository root.
const apiDir = join(process.cwd(), 'apps', 'api');

/** Signed diner link for a demo table (uses the API's QR signing). */
export function tableLink(label: string): string {
  const out = execFileSync('npx', ['tsx', '--env-file=../../.env', 'scripts/qr-link.ts', label], { cwd: apiDir, encoding: 'utf8', shell: true });
  return out.trim().split('\n').pop()!.trim();
}

export async function latestOtp(email: string, after: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = (await fetch(`${MAILPIT}/api/v1/messages?limit=10`)
      .then((r) => r.json())
      .catch(() => null)) as { messages?: Array<{ ID: string; Created: string; To: Array<{ Address: string }> }> } | null;
    const msg = res?.messages?.find((m) => m.To.some((t) => t.Address === email) && new Date(m.Created).getTime() > after);
    if (msg) {
      const full = (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`).then((r) => r.json())) as { Text?: string; HTML?: string };
      const code = [full.Text, full.HTML].join(' ').match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No OTP email for ${email}`);
}
