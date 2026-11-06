import type { Transaction } from "./generated/api.schemas";
export function receivableBalances(rows: Transaction[]) {
  const paid = new Map<number,number>();
  for (const row of rows) for (const a of row.allocations ?? []) paid.set(a.debtId,(paid.get(a.debtId) ?? 0)+Math.round(a.amount*100));
  return rows.filter(r=>r.type === "receivable").sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id).map(r=>({...r,collected:(paid.get(r.id) ?? 0)/100,remaining:Math.max(0,Math.round(r.amount*100)-(paid.get(r.id) ?? 0))/100}));
}
export const receivableStatus = (remaining:number, collected:number, due:string|null|undefined, today:string, ar=true) => remaining === 0 ? (ar ? "محصّلة بالكامل" : "Collected") : due && due < today ? (ar ? "متأخرة السداد" : "Overdue") : collected > 0 ? (ar ? "محصّلة جزئياً" : "Partially collected") : (ar ? "غير محصّلة" : "Uncollected");
