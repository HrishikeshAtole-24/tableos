import { z } from 'zod';
import { basisPoints, diet, locale, paise, uuid } from './common';

export const MENU_TAGS = ['bestseller', 'chef_special', 'new', 'must_try'] as const;
export const menuTag = z.enum(MENU_TAGS);
export type MenuTag = z.infer<typeof menuTag>;

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(60),
  visible: z.boolean().default(true),
});
export const updateCategoryInput = categoryInput.partial();

export const variantInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(40),
  pricePaise: paise,
});

export const addonInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(60),
  pricePaise: paise,
  available: z.boolean().default(true),
});

export const addonGroupInput = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1).max(60),
    minSelect: z.number().int().min(0).max(10).default(0),
    maxSelect: z.number().int().min(1).max(20).default(1),
    addons: z.array(addonInput).min(1).max(30),
  })
  .refine((g) => g.minSelect <= g.maxSelect, { message: 'Minimum cannot exceed maximum' })
  .refine((g) => g.minSelect <= g.addons.length, { message: 'Not enough add-ons for the minimum' });

export const itemInput = z.object({
  categoryId: uuid,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).nullable().default(null),
  diet: diet.default('veg'),
  jainAvailable: z.boolean().default(false),
  spiceLevel: z.number().int().min(0).max(3).default(0),
  tags: z.array(menuTag).max(4).default([]),
  basePricePaise: paise.min(100),
  taxRateBp: basisPoints.default(500),
  photoUrl: z.url().nullable().default(null),
  available: z.boolean().default(true),
  visible: z.boolean().default(true),
  variants: z.array(variantInput).max(10).default([]),
  addonGroups: z.array(addonGroupInput).max(8).default([]),
});
export type ItemInput = z.infer<typeof itemInput>;
export const updateItemInput = itemInput.partial();
export type UpdateItemInput = z.infer<typeof updateItemInput>;

export const availabilityInput = z.object({ available: z.boolean() });

export const reorderInput = z.object({
  categories: z.array(uuid).max(200).optional(),
  items: z
    .array(z.object({ categoryId: uuid, itemIds: z.array(uuid).max(500) }))
    .max(200)
    .optional(),
});

export const bulkPriceInput = z
  .object({
    itemIds: z.array(uuid).min(1).max(500),
    mode: z.enum(['percent', 'amount']),
    /** percent: basis points (e.g. 1000 = +10%); amount: paise. Negative lowers prices. */
    value: z.number().int().min(-100_000).max(100_000),
    roundTo: z.enum(['none', 'rupee', 'five']).default('rupee'),
  })
  .refine((v) => v.mode !== 'percent' || v.value > -10_000, {
    message: 'Cannot lower prices by 100% or more',
  });

export const translationInput = z.object({
  entityType: z.enum(['category', 'item', 'variant', 'addon_group', 'addon']),
  entityId: uuid,
  locale: locale.exclude(['en']),
  field: z.enum(['name', 'description']),
  value: z.string().trim().min(1).max(400),
});

// ───── DTOs ─────

export interface VariantDto {
  id: string;
  name: string;
  pricePaise: number;
}
export interface AddonDto {
  id: string;
  name: string;
  pricePaise: number;
  available: boolean;
}
export interface AddonGroupDto {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  addons: AddonDto[];
}
export interface MenuItemDto {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  diet: z.infer<typeof diet>;
  jainAvailable: boolean;
  spiceLevel: number;
  tags: MenuTag[];
  basePricePaise: number;
  taxRateBp: number;
  photoUrl: string | null;
  available: boolean;
  visible: boolean;
  sortOrder: number;
  variants: VariantDto[];
  addonGroups: AddonGroupDto[];
}
export interface MenuCategoryDto {
  id: string;
  name: string;
  visible: boolean;
  sortOrder: number;
  items: MenuItemDto[];
}

/** Public menu: original names plus an optional translated name/description per entity. */
export interface PublicTranslated {
  name: string;
  nameLocal: string | null;
}
export interface PublicMenuItem extends Omit<MenuItemDto, 'visible' | 'sortOrder' | 'variants' | 'addonGroups'> {
  nameLocal: string | null;
  descriptionLocal: string | null;
  variants: Array<VariantDto & { nameLocal: string | null }>;
  addonGroups: Array<
    Omit<AddonGroupDto, 'addons'> & { nameLocal: string | null; addons: Array<AddonDto & { nameLocal: string | null }> }
  >;
}
export interface PublicMenuCategory {
  id: string;
  name: string;
  nameLocal: string | null;
  items: PublicMenuItem[];
}
export interface PublicMenuDto {
  restaurant: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    coverUrl: string | null;
    address: string | null;
    city: string | null;
    cuisine: string[];
    languages: string[];
    theme: { primary: string };
    serviceChargeBp: number;
    isOpen: boolean;
    nextOpenLabel: string | null;
    openingHoursLabel: string | null;
    orderingAvailable: boolean;
    googleReviewUrl: string | null;
  };
  locale: z.infer<typeof locale>;
  categories: PublicMenuCategory[];
  version: string;
}
