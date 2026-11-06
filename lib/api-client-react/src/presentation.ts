const formatters = new Map<number, Intl.NumberFormat>();
/** Group displayed amounts only; never use formatted strings in ledger calculations. */
export function formatNumber(value: number, digits = 2): string {
 if (!Number.isFinite(value)) return "—";
 const precision=Math.min(6,Math.max(0,Math.trunc(digits)));
 let formatter=formatters.get(precision);
 if(!formatter){formatter=new Intl.NumberFormat("en-US",{useGrouping:true,minimumFractionDigits:precision,maximumFractionDigits:precision});formatters.set(precision,formatter);}
 return formatter.format(value);
}
export function moveAccount<T>(rows: T[], from: number, to: number): T[] {
 if(from<0||from>=rows.length||to<0||to>=rows.length||from===to)return rows;
 const next=[...rows];const [item]=next.splice(from,1);next.splice(to,0,item);return next;
}
