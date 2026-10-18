import type { Db, Tx } from '@tableos/db';

export type AfterCommit = (fn: () => void | Promise<void>) => void;

/**
 * Run `work` in a transaction. Side effects that must not happen for a rolled-back
 * write (socket emits, job enqueues, emails) are registered with `afterCommit` and
 * run only once the transaction has committed (docs/decisions.md #9).
 */
export async function withTx<T>(
  db: Db,
  work: (tx: Tx, afterCommit: AfterCommit) => Promise<T>,
  opts: { isolationLevel?: 'ReadCommitted' | 'Serializable'; timeout?: number } = {},
): Promise<T> {
  const effects: Array<() => void | Promise<void>> = [];
  const result = await db.$transaction((tx) => work(tx, (fn) => effects.push(fn)), {
    timeout: opts.timeout ?? 15_000,
    ...(opts.isolationLevel ? { isolationLevel: opts.isolationLevel } : {}),
  });
  for (const fn of effects) {
    try {
      await fn();
    } catch {
      // Post-commit effects are best effort; each effect logs its own failures.
    }
  }
  return result;
}
