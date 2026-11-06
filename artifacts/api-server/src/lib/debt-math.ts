export type Allocation = { debtId: number; amount: number };
export type DebtRow = { id: number; date: string; type: string; currency: string; amount: string | number; clientId?: number | null; debtKind?: string | null; allocations?: Allocation[] | null };
export const canonicalType = (type: string) => type === "payment" ? "expense" : type === "receipt" ? "income" : type;
export const cents = (n: number | string) => Math.round(Number(n) * 100);
export function debtBalances(rows: DebtRow[]) {
  const paid = new Map<number, number>();
  for (const row of rows) for (const a of row.allocations ?? []) paid.set(a.debtId, (paid.get(a.debtId) ?? 0) + cents(a.amount));
  return rows.filter(r => r.type === "receivable").sort((a,b) => a.date.localeCompare(b.date) || a.id-b.id).map(r => ({ ...r, amount: Number(r.amount), collected: (paid.get(r.id) ?? 0)/100, remaining: Math.max(0,cents(r.amount)-(paid.get(r.id) ?? 0))/100 }));
}
export function allocateFIFO(rows: DebtRow[], clientId: number | null | undefined, currency: string, amount: number): Allocation[] {
  const debts = debtBalances(rows).filter(d => d.clientId === clientId && d.currency === currency && d.remaining > 0);
  if (!clientId) return [];
  if (!debts.length && debtBalances(rows).some(d=>d.clientId === clientId && d.remaining > 0 && d.currency !== currency)) throw new Error("للشخص ذمم بعملة مختلفة. حدّد عملة التحصيل الصحيحة؛ لن نحوّل الذمم تلقائياً.");
  if (!debts.length) return [];
  const total = debts.reduce((s,d) => s+cents(d.remaining),0);
  if (cents(amount) > total) throw new Error("المبلغ أكبر من الذمم المتبقية. سجّل الزيادة كإيراد منفصل.");
  let left = cents(amount);
  const allocations: Allocation[] = [];
  for (const debt of debts) { const used = Math.min(left,cents(debt.remaining)); if (used) allocations.push({debtId:debt.id,amount:used/100}); left -= used; }
  return allocations;
}
/** Accrual income: invoice recognized once; collections and returned principal are excluded. */
export function revenueAmount(row: DebtRow): number {
  if (row.type === "receivable") return row.debtKind === "sale" ? Number(row.amount) : 0;
  return canonicalType(row.type) === "income" ? (cents(row.amount)-(row.allocations ?? []).reduce((s,a)=>s+cents(a.amount),0))/100 : 0;
}

/** Validate restored links before committing a workbook; never accept orphan or cross-person allocations. */
export function validateDebtLinks(rows: DebtRow[]): boolean {
  const byId = new Map(rows.map(r=>[r.id,r]));
  const totals = new Map<number,number>();
  for (const row of rows) {
    if (!row.allocations?.length) continue;
    if (canonicalType(row.type) !== "income") return false;
    let allocated=0;
    for (const a of row.allocations) {
      const debt=byId.get(a.debtId);
      if (!debt || debt.type !== "receivable" || debt.clientId !== row.clientId || debt.currency !== row.currency || !Number.isFinite(a.amount) || a.amount <= 0 || cents(a.amount)/100 !== a.amount) return false;
      allocated+=cents(a.amount); totals.set(a.debtId,(totals.get(a.debtId)??0)+cents(a.amount));
    }
    if(allocated>cents(row.amount))return false;
  }
  return [...totals].every(([id,total])=>total<=cents(byId.get(id)!.amount));
}
