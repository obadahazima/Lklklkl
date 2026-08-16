import { useState } from "react";
import { FileSpreadsheet, FileText, Share2 } from "lucide-react";
import { exportToExcel, exportToPDF, type ExportOptions } from "@/lib/export";
import { cn } from "@/lib/utils";

type Props = {
  exportOptions: ExportOptions;
  className?: string;
};

export function ShareButton({ exportOptions, className }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 transition-colors"
      >
        <Share2 className="w-3.5 h-3.5" />
        {exportOptions.language === "ar" ? "مشاركة" : "Share"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 end-0 bg-white border border-slate-200 rounded-xl shadow-xl z-50 min-w-[160px] overflow-hidden">
            <button
              onClick={() => { exportToPDF(exportOptions); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <FileText className="w-4 h-4 text-red-500 shrink-0" />
              {exportOptions.language === "ar" ? "تصدير PDF" : "Export PDF"}
            </button>
            <div className="border-t border-slate-100" />
            <button
              onClick={() => { exportToExcel(exportOptions); setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600 shrink-0" />
              {exportOptions.language === "ar" ? "تصدير Excel" : "Export Excel"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
