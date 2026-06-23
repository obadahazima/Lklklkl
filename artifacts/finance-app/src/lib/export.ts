import * as XLSX from "xlsx";

export type ExportTransaction = {
  date: string;
  type: string;
  description?: string | null;
  amount: number;
  currency: string;
};

export type ExportTotals = {
  currency: string;
  paid: number;
  received: number;
  openBalance: number;
}[];

export type ExportOptions = {
  title: string;
  subtitle?: string;
  transactions: ExportTransaction[];
  totals: ExportTotals;
  primaryCurrency: string;
  primaryTotal: number;
};

function typeLabel(type: string): string {
  switch (type) {
    case "income": return "إيراد";
    case "expense": return "مصروف";
    case "payment": return "دفع";
    case "receipt": return "قبض";
    default: return type;
  }
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("ar-AE");
  } catch {
    return dateStr;
  }
}

function fmtNum(n: number): string {
  return n.toLocaleString("ar", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isDebit(type: string): boolean {
  return type === "expense" || type === "payment";
}

export function exportToExcel(opts: ExportOptions): void {
  const wb = XLSX.utils.book_new();
  const rows: (string | number | null)[][] = [];

  rows.push([opts.title]);
  if (opts.subtitle) rows.push([opts.subtitle]);
  rows.push(["تاريخ التصدير:", new Date().toLocaleDateString("ar-AE")]);
  rows.push([]);
  rows.push(["التاريخ", "النوع", "الوصف", "مدين (مدفوع)", "دائن (مقبوض)", "العملة"]);

  for (const tx of opts.transactions) {
    const debit = isDebit(tx.type) ? tx.amount : null;
    const credit = !isDebit(tx.type) ? tx.amount : null;
    rows.push([fmtDate(tx.date), typeLabel(tx.type), tx.description || "", debit, credit, tx.currency]);
  }

  rows.push([]);
  rows.push(["الإجماليات حسب العملة", "", "", "", "", ""]);
  rows.push(["العملة", "إجمالي المدين", "إجمالي الدائن", "الرصيد", "", ""]);
  for (const t of opts.totals) {
    rows.push([t.currency, t.paid, t.received, t.openBalance, "", ""]);
  }
  rows.push([]);
  rows.push([`الإجمالي بـ ${opts.primaryCurrency}`, "", "", opts.primaryTotal, "", ""]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 32 }, { wch: 16 }, { wch: 16 }, { wch: 8 }];

  XLSX.utils.book_append_sheet(wb, ws, "كشف الحساب");
  XLSX.writeFile(wb, `${opts.title}_${new Date().toISOString().split("T")[0]}.xlsx`);
}

export function exportToPDF(opts: ExportOptions): void {
  const txRows = opts.transactions.length
    ? opts.transactions.map((tx) => {
        const debit = isDebit(tx.type) ? `${fmtNum(tx.amount)} ${tx.currency}` : "";
        const credit = !isDebit(tx.type) ? `${fmtNum(tx.amount)} ${tx.currency}` : "";
        return `<tr>
          <td>${fmtDate(tx.date)}</td>
          <td class="${isDebit(tx.type) ? "debit" : "credit"}">${typeLabel(tx.type)}</td>
          <td>${tx.description || "—"}</td>
          <td class="debit">${debit}</td>
          <td class="credit">${credit}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="5" class="empty">لا توجد معاملات</td></tr>`;

  const totalsRows = opts.totals.length
    ? opts.totals.map((t) => `<tr>
        <td><strong>${t.currency}</strong></td>
        <td class="debit">${fmtNum(t.paid)} ${t.currency}</td>
        <td class="credit">${fmtNum(t.received)} ${t.currency}</td>
        <td class="${t.openBalance >= 0 ? "credit" : "debit"}">${t.openBalance >= 0 ? "+" : ""}${fmtNum(t.openBalance)} ${t.currency}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="empty">لا توجد بيانات</td></tr>`;

  const isPos = opts.primaryTotal >= 0;
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${opts.title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:24px;color:#1e293b;direction:rtl;font-size:12px}
.hdr{border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px}
.hdr h1{font-size:22px;color:#2563eb;font-weight:700}
.hdr p{color:#64748b;font-size:11px;margin-top:4px}
.sec{font-size:13px;font-weight:700;margin:18px 0 8px;color:#1e293b;border-right:3px solid #2563eb;padding-right:8px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th{background:#2563eb;color:#fff;padding:8px 10px;text-align:right;font-size:11px;font-weight:600}
td{padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:11px}
tr:nth-child(even) td{background:#f8fafc}
.debit{color:#dc2626;font-weight:600}
.credit{color:#16a34a;font-weight:600}
.empty{text-align:center;color:#94a3b8;padding:16px}
.total{border-radius:10px;padding:14px 18px;margin-top:16px;border:1px solid}
.total .lbl{font-size:12px;font-weight:600;margin-bottom:4px}
.total .val{font-size:20px;font-weight:700}
.pos{background:#f0fdf4;border-color:#86efac;color:#15803d}
.neg{background:#fef2f2;border-color:#fca5a5;color:#dc2626}
@media print{body{padding:12px}}
</style>
</head>
<body>
<div class="hdr">
  <h1>${opts.title}</h1>
  ${opts.subtitle ? `<p>${opts.subtitle}</p>` : ""}
  <p>تاريخ التصدير: ${new Date().toLocaleDateString("ar-AE")}</p>
</div>

<div class="sec">تفاصيل المعاملات</div>
<table>
  <thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>مدين (مدفوع)</th><th>دائن (مقبوض)</th></tr></thead>
  <tbody>${txRows}</tbody>
</table>

<div class="sec">الإجماليات حسب العملة</div>
<table>
  <thead><tr><th>العملة</th><th>إجمالي المدين</th><th>إجمالي الدائن</th><th>الرصيد</th></tr></thead>
  <tbody>${totalsRows}</tbody>
</table>

<div class="total ${isPos ? "pos" : "neg"}">
  <div class="lbl">الإجمالي بـ ${opts.primaryCurrency}</div>
  <div class="val">${isPos ? "+" : ""}${fmtNum(opts.primaryTotal)} ${opts.primaryCurrency}</div>
</div>

<script>window.onload=function(){window.print()}</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}
