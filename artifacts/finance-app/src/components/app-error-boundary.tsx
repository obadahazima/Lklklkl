import { Component, type ReactNode } from "react";
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    const ar = document.documentElement.lang === "ar";
    return <main role="alert" className="min-h-dvh flex items-center justify-center bg-background p-6"><div className="max-w-md rounded-2xl border border-border bg-card p-8 space-y-4 text-center"><h1 className="text-xl font-bold">{ar ? "تعذّر فتح الصفحة" : "This page could not load"}</h1><p className="text-muted-foreground">{ar ? "جرّب إعادة التحميل. مسوداتك ومعاملاتك المحفوظة على الجهاز رح تضل موجودة." : "Try reloading. Your saved device drafts and queued transactions will stay on this device."}</p><button onClick={() => window.location.reload()} className="rounded-xl bg-primary text-primary-foreground px-5 py-3 font-semibold">{ar ? "إعادة تحميل الصفحة" : "Reload page"}</button><a href="/" className="block p-3 text-primary underline">{ar ? "العودة للرئيسية" : "Back to home"}</a></div></main>;
  }
}
