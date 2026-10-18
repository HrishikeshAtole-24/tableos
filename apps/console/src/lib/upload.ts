'use client';

import type { UploadTicketDto } from '@tableos/schemas';
import { api } from './api';

/** Upload straight to storage through a signed URL issued by the API (files never touch the API host). */
export async function uploadFile(file: File, purpose: 'logo' | 'cover' | 'dish' | 'import'): Promise<UploadTicketDto> {
  if (file.size > 10 * 1024 * 1024) throw new Error('Files must be 10 MB or smaller');
  const ticket = await api<UploadTicketDto>('/uploads', { method: 'POST', body: { purpose, contentType: file.type, size: file.size } });
  const res = await fetch(ticket.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'true' }, body: file });
  if (!res.ok) throw new Error('Upload failed. Please try again.');
  return ticket;
}
