import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

type DbExecutor = Prisma.TransactionClient | typeof prisma;

export const DEFAULT_BANGLADESHI_CATEGORIES = [
  { nameBn: 'পান ও সুপারি', nameEn: 'Pan & Supari', sortOrder: 10 },
  { nameBn: 'জর্দা ও পান মশলা', nameEn: 'Jorda & Pan Masala', sortOrder: 20 },
  { nameBn: 'মুদি ও চাল-ডাল', nameEn: 'Groceries & Staples', sortOrder: 30 },
  { nameBn: 'বিস্কুট ও স্ন্যাকস', nameEn: 'Snacks & Biscuits', sortOrder: 40 },
  { nameBn: 'পানীয় ও চা-কফি', nameEn: 'Beverages & Tea', sortOrder: 50 },
  { nameBn: 'বাচ্চাদের খেলনা', nameEn: "Children's Toys", sortOrder: 60 },
  { nameBn: 'প্রসাধনী ও গৃহস্থালি', nameEn: 'Personal & Household Care', sortOrder: 70 },
  { nameBn: 'অন্যান্য', nameEn: 'Miscellaneous', sortOrder: 80 },
] as const;

export const DEFAULT_BANGLADESHI_UNITS = [
  { code: 'PIECE', nameBn: 'টি', nameEn: 'Piece', isFractional: false },
  { code: 'BIRA', nameBn: 'বিড়া', nameEn: 'Bira (Bundle)', isFractional: true },
  { code: 'GRAM', nameBn: 'গ্রাম', nameEn: 'Gram', isFractional: true },
  { code: 'KG', nameBn: 'কেজি', nameEn: 'Kilogram', isFractional: true },
  { code: 'POYA', nameBn: 'পোয়া', nameEn: 'Poya (250g)', isFractional: true },
  { code: 'PACKET', nameBn: 'প্যাকেট', nameEn: 'Packet', isFractional: false },
  { code: 'KOUTA', nameBn: 'কৌটা', nameEn: 'Container', isFractional: false },
  { code: 'BOX', nameBn: 'বক্স', nameEn: 'Box', isFractional: false },
  { code: 'DOZEN', nameBn: 'ডজন', nameEn: 'Dozen', isFractional: false },
  { code: 'LITER', nameBn: 'লিটার', nameEn: 'Liter', isFractional: true },
  { code: 'ML', nameBn: 'মিলি', nameEn: 'Milliliter', isFractional: true },
] as const;

export async function ensureDefaultCatalogForShop(
  shopId: string,
  executor: DbExecutor = prisma,
): Promise<void> {
  await executor.unit.createMany({
    data: DEFAULT_BANGLADESHI_UNITS.map((unit) => ({
      shopId,
      code: unit.code,
      nameBn: unit.nameBn,
      nameEn: unit.nameEn,
      isFractional: unit.isFractional,
      isDefault: true,
    })),
    skipDuplicates: true,
  });

  const existingCategoryCount = await executor.category.count({
    where: { shopId },
  });

  if (existingCategoryCount === 0) {
    await executor.category.createMany({
      data: DEFAULT_BANGLADESHI_CATEGORIES.map((category) => ({
        shopId,
        nameBn: category.nameBn,
        nameEn: category.nameEn,
        sortOrder: category.sortOrder,
        isActive: true,
      })),
      skipDuplicates: true,
    });
  }
}
