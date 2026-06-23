import { Link } from "wouter";
import { Users, Shield, Mic } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <img src={`${basePath}/logo.svg`} alt="Qayd AI" className="w-8 h-8 rounded-lg" />
          <span className="font-bold text-foreground text-lg">Qayd AI</span>
        </div>
        <div className="flex gap-3">
          <Link href="/sign-in">
            <button className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2 rounded-lg hover:bg-muted">
              تسجيل الدخول
            </button>
          </Link>
          <Link href="/sign-up">
            <button className="text-sm font-semibold bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
              إنشاء حساب
            </button>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <img src={`${basePath}/logo.svg`} alt="Qayd AI" className="w-20 h-20 rounded-3xl mb-6 shadow-lg" />
        <h1 className="text-4xl font-bold text-foreground mb-4">
          Qayd AI
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mb-10">
          محاسبك الذكي — سجّل بصوتك، تتبع معاملاتك، وحلّل أرباحك في لحظات
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Link href="/sign-up">
            <button className="bg-primary text-primary-foreground px-8 py-3 rounded-xl font-semibold text-base hover:bg-primary/90 transition-colors">
              ابدأ مجاناً
            </button>
          </Link>
          <Link href="/sign-in">
            <button className="border border-border bg-card text-foreground px-8 py-3 rounded-xl font-semibold text-base hover:bg-muted transition-colors">
              تسجيل الدخول
            </button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-20 max-w-2xl w-full">
          {[
            { icon: Mic, title: "تسجيل صوتي", desc: "سجّل معاملاتك بصوتك — الذكاء الاصطناعي يفهم ويحفظ" },
            { icon: Users, title: "إدارة الزبائن", desc: "كشف حساب مفصّل وتقارير لكل زبون" },
            { icon: Shield, title: "بيانات محمية", desc: "كل مستخدم يشوف بياناته فقط" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-card border border-border rounded-2xl p-5 text-center">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
