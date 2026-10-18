import { z } from 'zod';
import { diet, paise } from './common';

export const IMPORT_LIMITS = {
  maxFiles: 10,
  maxFileBytes: 10 * 1024 * 1024,
  perDay: 5,
  mimeTypes: ['image/jpeg', 'image/png', 'application/pdf'] as const,
  lowConfidence: 0.8,
};

export const uploadRequestInput = z.object({
  purpose: z.enum(['logo', 'cover', 'dish', 'import']),
  contentType: z.string().min(3).max(100),
  size: z.number().int().min(1).max(IMPORT_LIMITS.maxFileBytes),
});
export interface UploadTicketDto {
  path: string;
  signedUrl: string;
  token: string;
  publicUrl: string;
}

const conf = z.number().min(0).max(1);

/** Shape the AI service must return (validated again by the API). */
export const extractedMenu = z.object({
  categories: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        confidence: conf,
        items: z
          .array(
            z.object({
              name: z.string().min(1).max(80),
              nameConfidence: conf,
              description: z.string().max(400).nullable(),
              pricePaise: paise.nullable(),
              priceConfidence: conf,
              diet: diet.nullable(),
              variants: z
                .array(z.object({ name: z.string().min(1).max(40), pricePaise: paise, confidence: conf }))
                .max(10)
                .default([]),
            }),
          )
          .max(300),
      }),
    )
    .max(60),
});
export type ExtractedMenu = z.infer<typeof extractedMenu>;

export const createImportInput = z.object({
  filePaths: z.array(z.string().min(3).max(300)).min(1).max(IMPORT_LIMITS.maxFiles),
});
export const updateImportInput = z.object({ result: extractedMenu });

export interface MenuImportDto {
  id: string;
  status: 'queued' | 'processing' | 'ready' | 'failed' | 'published';
  fileCount: number;
  result: ExtractedMenu | null;
  error: string | null;
  createdAt: string;
  publishedAt: string | null;
}
