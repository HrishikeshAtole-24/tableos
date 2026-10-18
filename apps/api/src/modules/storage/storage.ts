import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface UploadTicket {
  path: string;
  signedUrl: string;
  token: string;
  publicUrl: string;
}

export interface Storage {
  /** Signed URL the browser uploads to directly (files never pass through the API host). */
  createUploadTicket(restaurantId: string, folder: string, ext: string): Promise<UploadTicket>;
  publicUrl(path: string): string;
  download(path: string): Promise<Buffer>;
  upload(path: string, body: Buffer, contentType: string): Promise<string>;
  /** Resolve a path we issued for this restaurant; rejects paths outside the tenant prefix. */
  ownsPath(restaurantId: string, path: string): boolean;
}

export class SupabaseStorage implements Storage {
  private readonly client: SupabaseClient;

  constructor(
    url: string,
    serviceRoleKey: string,
    private readonly bucket: string,
  ) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async ensureBucket(): Promise<void> {
    const { data } = await this.client.storage.getBucket(this.bucket);
    if (!data) {
      await this.client.storage.createBucket(this.bucket, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf'],
      });
    }
  }

  async createUploadTicket(restaurantId: string, folder: string, ext: string): Promise<UploadTicket> {
    const path = `r/${restaurantId}/${folder}/${randomUUID()}.${ext}`;
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`Could not create upload URL: ${error?.message ?? 'unknown'}`);
    return { path, signedUrl: data.signedUrl, token: data.token, publicUrl: this.publicUrl(path) };
  }

  publicUrl(path: string): string {
    return this.client.storage.from(this.bucket).getPublicUrl(path).data.publicUrl;
  }

  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    if (error || !data) throw new Error(`Download failed: ${error?.message ?? 'unknown'}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async upload(path: string, body: Buffer, contentType: string): Promise<string> {
    const { error } = await this.client.storage.from(this.bucket).upload(path, body, { contentType, upsert: true });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    return this.publicUrl(path);
  }

  ownsPath(restaurantId: string, path: string): boolean {
    return path.startsWith(`r/${restaurantId}/`) && !path.includes('..');
  }
}

/** In-memory storage for tests. */
export class MemoryStorage implements Storage {
  readonly files = new Map<string, { body: Buffer; contentType: string }>();
  async createUploadTicket(restaurantId: string, folder: string, ext: string): Promise<UploadTicket> {
    const path = `r/${restaurantId}/${folder}/${randomUUID()}.${ext}`;
    return { path, signedUrl: `memory://${path}`, token: 'test', publicUrl: this.publicUrl(path) };
  }
  publicUrl(path: string): string {
    return `https://storage.test/${path}`;
  }
  async download(path: string): Promise<Buffer> {
    const f = this.files.get(path);
    if (!f) throw new Error('not found');
    return f.body;
  }
  async upload(path: string, body: Buffer, contentType: string): Promise<string> {
    this.files.set(path, { body, contentType });
    return this.publicUrl(path);
  }
  ownsPath(restaurantId: string, path: string): boolean {
    return path.startsWith(`r/${restaurantId}/`) && !path.includes('..');
  }
}
