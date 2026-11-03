import { Link } from "wouter";
import { useSettings } from "@/contexts/settings-context";
import { ArrowLeft, Home } from "lucide-react";
export default function NotFound() {
  const { settings } = useSettings(); const ar = settings.language === "ar";
  return <main dir={ar ? "rtl" : "ltr"} className="min-h-dvh flex items-center justify-center bg-background p-6"><div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center space-y-4"><Home className="w-10 h-10 text-primary mx-auto" /><p className="text-sm text-muted-foreground">404</p><h1 className="text-2xl font-bold">{ar ? "هالصفحة مو موجودة" : "This page isn’t here"}</h1><p className="text-muted-foreground">{ar ? "ممكن الرابط تغيّر. ارجع للرئيسية وتابع من هناك." : "The link may have changed. Return home to continue."}</p><Link href="/" className="inline-flex gap-2 items-center rounded-xl bg-primary text-primary-foreground px-4 py-3"><ArrowLeft className="w-4 h-4" />{ar ? "العودة للرئيسية" : "Back to home"}</Link></div></main>;
}
