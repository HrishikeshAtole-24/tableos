/**
 * Typo-tolerant dish search over the loaded menu (docs/decisions.md #15).
 * Score = best of: prefix/substring match, per-word edit distance, trigram overlap.
 */

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** Damerau–Levenshtein (optimal string alignment), early exit above `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length]![b.length]!;
}

export function scoreText(query: string, text: string): number {
  const q = normalise(query);
  const t = normalise(text);
  if (!q || !t) return 0;
  if (t === q) return 1;
  if (t.startsWith(q)) return 0.95;
  if (t.split(' ').some((w) => w.startsWith(q))) return 0.9;
  if (t.includes(q)) return 0.8;

  // Every query word must roughly match some text word.
  const words = t.split(' ');
  let wordScore = 0;
  const qWords = q.split(' ');
  for (const qw of qWords) {
    const allowed = qw.length <= 3 ? 0 : qw.length <= 5 ? 1 : 2;
    let best = 0;
    for (const w of words) {
      const prefix = w.slice(0, Math.max(qw.length, 1));
      const dist = Math.min(editDistance(qw, w, allowed), editDistance(qw, prefix, allowed));
      if (dist <= allowed) best = Math.max(best, 1 - dist / (qw.length + 1));
    }
    if (best === 0) {
      wordScore = 0;
      break;
    }
    wordScore += best / qWords.length;
  }

  const qa = trigrams(q);
  const ta = trigrams(t);
  let common = 0;
  for (const g of qa) if (ta.has(g)) common++;
  const tri = common / Math.max(qa.size, 1);

  return Math.max(wordScore * 0.75, tri >= 0.5 ? tri * 0.6 : 0);
}

export function searchItems<T extends { name: string; nameLocal: string | null; description: string | null }>(items: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return items;
  return items
    .map((item) => ({
      item,
      score: Math.max(scoreText(q, item.name), item.nameLocal ? scoreText(q, item.nameLocal) : 0, item.description ? scoreText(q, item.description) * 0.6 : 0),
    }))
    .filter((r) => r.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}
