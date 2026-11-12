import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

type DbExecutor = Prisma.TransactionClient | typeof prisma;

export const DEFAULT_BANGLADESHI_EXPENSE_CATEGORIES = [
  { nameBn: 'বিদ্যুৎ বিল', nameEn: 'Electricity Bill', sortOrder: 10 },
  { nameBn: 'দোকান ভাড়া', nameEn: 'Shop Rent', sortOrder: 20 },
  { nameBn: 'পরিবহন ও যাতায়াত', nameEn: 'Transportation', sortOrder: 30 },
  { nameBn: 'কর্মচারী বেতন', nameEn: 'Employee Salary', sortOrder: 40 },
  { nameBn: 'প্যাকেজিং ও ঠোঙা', nameEn: 'Packaging & Bags', sortOrder: 50 },
  { nameBn: 'মেরামত ও রক্ষণাবেক্ষণ', nameEn: 'Maintenance & Repairs', sortOrder: 60 },
  { nameBn: 'অন্যান্য খরচ', nameEn: 'Other Expenses', sortOrder: 70 },
] as const;

export async function ensureDefaultExpenseCategoriesForShop(
  shopId: string,
  executor: DbExecutor = prisma,
): Promise<void> {
  const existingCount = await executor.expenseCategory.count({
    where: { shopId },
  });

  if (existingCount === 0) {
    await executor.expenseCategory.createMany({
      data: DEFAULT_BANGLADESHI_EXPENSE_CATEGORIES.map((category) => ({
        shopId,
        nameBn: category.nameBn,
        nameEn: category.nameEn,
        isDefault: true,
        sortOrder: category.sortOrder,
        isActive: true,
      })),
      skipDuplicates: true,
    });
  }
}
