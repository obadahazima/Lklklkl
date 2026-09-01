import * as XLSX from "xlsx";
import type { Lang } from "@/lib/i18n";

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
  language: Lang;
};

const EXPORT_STRINGS = {
  ar: {
    exportDate: "تاريخ التصدير:",
    date: "التاريخ",
    type: "النوع",
    description: "الوصف",
    debit: "مدين (مدفوع)",
    credit: "دائن (مقبوض)",
    currency: "العملة",
    totalsByCurrency: "الإجماليات حسب العملة",
    totalDebit: "إجمالي المدين",
    totalCredit: "إجمالي الدائن",
    balance: "الرصيد",
    totalIn: (c: string) => `الإجمالي بـ ${c}`,
    sheetName: "كشف الحساب",
    typeIncome: "إيراد",
    typeExpense: "مصروف",
    typePayment: "دفع",
    typeReceipt: "قبض",
    typeTransfer: "تحويل",
    noTransactions: "لا توجد معاملات",
    noData: "لا توجد بيانات",
    transactionDetails: "تفاصيل المعاملات",
    dateLocale: "ar-AE",
    numLocale: "ar",
    dir: "rtl" as const,
  },
  en: {
    exportDate: "Export date:",
    date: "Date",
    type: "Type",
    description: "Description",
    debit: "Debit (paid)",
    credit: "Credit (received)",
    currency: "Currency",
    totalsByCurrency: "Totals by Currency",
    totalDebit: "Total Debit",
    totalCredit: "Total Credit",
    balance: "Balance",
    totalIn: (c: string) => `Total in ${c}`,
    sheetName: "Statement",
    typeIncome: "Income",
    typeExpense: "Expense",
    typePayment: "Payment",
    typeReceipt: "Receipt",
    typeTransfer: "Transfer",
    noTransactions: "No transactions",
    noData: "No data",
    transactionDetails: "Transaction Details",
    dateLocale: "en-US",
    numLocale: "en",
    dir: "ltr" as const,
  },
};

function typeLabel(type: string, lang: Lang): string {
  const s = EXPORT_STRINGS[lang];
  switch (type) {
    case "income": return s.typeIncome;
    case "expense": return s.typeExpense;
    case "payment": return s.typePayment;
    case "receipt": return s.typeReceipt;
    case "transfer": return s.typeTransfer;
    default: return type;
  }
}

function fmtDate(dateStr: string, lang: Lang): string {
  try {
    return new Date(dateStr).toLocaleDateString(EXPORT_STRINGS[lang].dateLocale);
  } catch {
    return dateStr;
  }
}

function fmtNum(n: number, lang: Lang): string {
  return n.toLocaleString(EXPORT_STRINGS[lang].numLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isDebit(type: string): boolean {
  return type === "expense" || type === "payment";
}

export function exportToExcel(opts: ExportOptions): void {
  const s = EXPORT_STRINGS[opts.language];
  const wb = XLSX.utils.book_new();
  const rows: (string | number | null)[][] = [];

  rows.push([opts.title]);
  if (opts.subtitle) rows.push([opts.subtitle]);
  rows.push([s.exportDate, new Date().toLocaleDateString(s.dateLocale)]);
  rows.push([]);
  rows.push([s.date, s.type, s.description, s.debit, s.credit, s.currency]);

  for (const tx of opts.transactions) {
    const debit = isDebit(tx.type) ? tx.amount : null;
    const credit = !isDebit(tx.type) ? tx.amount : null;
    rows.push([fmtDate(tx.date, opts.language), typeLabel(tx.type, opts.language), tx.description || "", debit, credit, tx.currency]);
  }

  rows.push([]);
  rows.push([s.totalsByCurrency, "", "", "", "", ""]);
  rows.push([s.currency, s.totalDebit, s.totalCredit, s.balance, "", ""]);
  for (const t of opts.totals) {
    rows.push([t.currency, t.paid, t.received, t.openBalance, "", ""]);
  }
  rows.push([]);
  rows.push([s.totalIn(opts.primaryCurrency), "", "", opts.primaryTotal, "", ""]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 32 }, { wch: 16 }, { wch: 16 }, { wch: 8 }];

  XLSX.utils.book_append_sheet(wb, ws, s.sheetName);
  XLSX.writeFile(wb, `${opts.title}_${new Date().toISOString().split("T")[0]}.xlsx`);
}

export function exportToPDF(opts: ExportOptions): void {
  const s = EXPORT_STRINGS[opts.language];
  const lang = opts.language;

  const txRows = opts.transactions.length
    ? opts.transactions.map((tx) => {
        const debit = isDebit(tx.type) ? `${fmtNum(tx.amount, lang)} ${tx.currency}` : "";
        const credit = !isDebit(tx.type) ? `${fmtNum(tx.amount, lang)} ${tx.currency}` : "";
        return `<tr>
          <td>${fmtDate(tx.date, lang)}</td>
          <td class="${isDebit(tx.type) ? "debit" : "credit"}">${typeLabel(tx.type, lang)}</td>
          <td>${tx.description || "—"}</td>
          <td class="debit">${debit}</td>
          <td class="credit">${credit}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="5" class="empty">${s.noTransactions}</td></tr>`;

  const totalsRows = opts.totals.length
    ? opts.totals.map((t) => `<tr>
        <td><strong>${t.currency}</strong></td>
        <td class="debit">${fmtNum(t.paid, lang)} ${t.currency}</td>
        <td class="credit">${fmtNum(t.received, lang)} ${t.currency}</td>
        <td class="${t.openBalance >= 0 ? "credit" : "debit"}">${t.openBalance >= 0 ? "+" : ""}${fmtNum(t.openBalance, lang)} ${t.currency}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="empty">${s.noData}</td></tr>`;

  const isPos = opts.primaryTotal >= 0;
  const isRtl = s.dir === "rtl";
  const html = `<!DOCTYPE html>
<html dir="${s.dir}" lang="${lang}">
<head>
<meta charset="UTF-8">
<title>${opts.title}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:24px;color:#1e293b;direction:${s.dir};font-size:12px}
.hdr{border-bottom:2px solid #2563eb;padding-bottom:12px;margin-bottom:20px}
.hdr h1{font-size:22px;color:#2563eb;font-weight:700}
.hdr p{color:#64748b;font-size:11px;margin-top:4px}
.sec{font-size:13px;font-weight:700;margin:18px 0 8px;color:#1e293b;border-${isRtl ? "right" : "left"}:3px solid #2563eb;padding-${isRtl ? "right" : "left"}:8px}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th{background:#2563eb;color:#fff;padding:8px 10px;text-align:${isRtl ? "right" : "left"};font-size:11px;font-weight:600}
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
  <p>${s.exportDate} ${new Date().toLocaleDateString(s.dateLocale)}</p>
</div>

<div class="sec">${s.transactionDetails}</div>
<table>
  <thead><tr><th>${s.date}</th><th>${s.type}</th><th>${s.description}</th><th>${s.debit}</th><th>${s.credit}</th></tr></thead>
  <tbody>${txRows}</tbody>
</table>

<div class="sec">${s.totalsByCurrency}</div>
<table>
  <thead><tr><th>${s.currency}</th><th>${s.totalDebit}</th><th>${s.totalCredit}</th><th>${s.balance}</th></tr></thead>
  <tbody>${totalsRows}</tbody>
</table>

<div class="total ${isPos ? "pos" : "neg"}">
  <div class="lbl">${s.totalIn(opts.primaryCurrency)}</div>
  <div class="val">${isPos ? "+" : ""}${fmtNum(opts.primaryTotal, lang)} ${opts.primaryCurrency}</div>
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
