import type { PaymentProvider } from './provider';

/** Factory + registry of provider adapters (travel project's AcquirerFactory pattern). */
export class ProviderRegistry {
  private readonly providers = new Map<string, PaymentProvider>();

  register(provider: PaymentProvider): this {
    this.providers.set(provider.name.toLowerCase(), provider);
    return this;
  }

  get(name: string): PaymentProvider {
    const p = this.providers.get(name.toLowerCase());
    if (!p) throw new Error(`Payment provider not registered: ${name}`);
    return p;
  }

  has(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }

  names(): string[] {
    return [...this.providers.keys()];
  }
}
