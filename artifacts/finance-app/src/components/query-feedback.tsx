import { AlertCircle, RefreshCw } from "lucide-react";
import { useState } from "react";

export function QueryFeedback({ ar, retry, cached = false }: { ar: boolean; retry: () => unknown; cached?: boolean }) {
  const [busy, setBusy] = useState(false);
  return <div role="alert" className="m-3 rounded-xl border border-amber-300/60 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100 dark:border-amber-700/50">
    <div className="flex items-start gap-3"><AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" /><div className="flex-1 space-y-2">
      <p className="text-sm font-semibold">{ar ? "تعذّر تحديث البيانات" : "Could not refresh your data"}</p>
      <p className="text-sm">{cached ? (ar ? "المعروض آخر بيانات محمّلة، وقد لا يشمل التغييرات الأخيرة." : "Showing previously loaded data. Recent changes may be missing.") : (ar ? "تحقّق من الاتصال وحاول مجدداً. هذا لا يعني أن بياناتك انحذفت." : "Check your connection and try again. Your data has not been deleted.")}</p>
      <button type="button" disabled={busy} onClick={async () => { if (busy) return; setBusy(true); try { await retry(); } catch { /* Keep the failure notice available for another attempt. */ } finally { setBusy(false); } }} className="inline-flex items-center gap-2 rounded-lg border border-current/25 px-3 py-2 text-sm font-semibold disabled:opacity-60"><RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />{ar ? "إعادة المحاولة" : "Try again"}</button>
    </div></div>
  </div>;
}
