export interface ExtractPageInput {
  url: string;
  contentType: string;
}

export interface TranslateItem {
  key: string;
  text: string;
}

export interface AiClient {
  /** Returns raw JSON from the vision model; the caller validates it with Zod. */
  extractMenu(files: ExtractPageInput[]): Promise<unknown>;
  translate(items: TranslateItem[], locales: string[]): Promise<Record<string, Record<string, string>>>;
}

export class HttpAiClient implements AiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
    const res = await fetch(new URL(path, this.baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`AI service ${path} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  extractMenu(files: ExtractPageInput[]): Promise<unknown> {
    return this.post('/v1/extract-menu', { files }, 180_000);
  }

  async translate(items: TranslateItem[], locales: string[]) {
    const r = await this.post<{ translations: Record<string, Record<string, string>> }>('/v1/translate', { items, locales }, 120_000);
    return r.translations;
  }
}

/** Deterministic fake used in tests. */
export class FakeAiClient implements AiClient {
  extractResult: unknown = { categories: [] };
  async extractMenu(): Promise<unknown> {
    return this.extractResult;
  }
  async translate(items: TranslateItem[], locales: string[]) {
    const out: Record<string, Record<string, string>> = {};
    for (const l of locales) out[l] = Object.fromEntries(items.map((i) => [i.key, `[${l}] ${i.text}`]));
    return out;
  }
}
