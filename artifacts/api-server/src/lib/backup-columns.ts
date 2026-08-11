/**
 * Single source of truth for the Arabic column headers used in the backup/restore Excel file.
 *
 * backup.ts writes these labels as the sheet headers, and restore.ts reads rows back out by
 * these same labels (row["الاسم"], etc). Previously each file hardcoded its own copies of these
 * strings — if one side was renamed without updating the other, restore would silently drop
 * every row for that column instead of failing loudly. Importing from here means a rename only
 * has to happen in one place, and both sides stay in sync by construction.
 */
export const SHEET_NAMES = {
  transactions: "المعاملات",
  clients: "الزبائن",
  trips: "الرحلات",
  accounts: "الحسابات",
} as const;

export const TX_COLUMNS = {
  id: "رقم",
  date: "التاريخ",
  type: "النوع",
  amount: "المبلغ",
  currency: "العملة",
  clientName: "الزبون",
  clientId: "رقم الزبون",
  tripName: "الرحلة",
  tripId: "رقم الرحلة",
  accountName: "الحساب",
  accountId: "رقم الحساب",
  description: "الوصف",
  status: "الحالة",
  createdAt: "تاريخ الإنشاء",
} as const;

export const CLIENT_COLUMNS = {
  id: "رقم",
  name: "الاسم",
  phone: "الهاتف",
  notes: "ملاحظات",
  createdAt: "تاريخ الإنشاء",
} as const;

export const TRIP_COLUMNS = {
  id: "رقم",
  name: "الاسم",
  shared: "مشترك",
  status: "الحالة",
  notes: "ملاحظات",
  createdAt: "تاريخ الإنشاء",
} as const;

export const ACCOUNT_COLUMNS = {
  id: "رقم",
  name: "الاسم",
  type: "النوع",
  currency: "العملة",
  initialBalance: "الرصيد الابتدائي",
  notes: "ملاحظات",
  createdAt: "تاريخ الإنشاء",
} as const;
