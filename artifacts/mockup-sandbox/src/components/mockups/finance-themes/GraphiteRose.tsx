export function GraphiteRose() {
  const txs = [
    { label: "قبض من أحمد محمد", amount: "+5,200", currency: "AED", date: "اليوم", positive: true },
    { label: "دفع لرحلة دبي - حلب", amount: "-1,800", currency: "USD", date: "أمس", positive: false },
    { label: "إيراد استديو النور", amount: "+3,400", currency: "AED", date: "20 يون", positive: true },
    { label: "فاتورة كهرباء المكتب", amount: "-420", currency: "AED", date: "19 يون", positive: false },
    { label: "قبض من سامي خوري", amount: "+2,100", currency: "USD", date: "18 يون", positive: true },
  ];
  const navItems = [
    { icon: "⊟", label: "لوحة التحكم", active: true },
    { icon: "↕", label: "المعاملات", active: false },
    { icon: "👤", label: "الزبائن", active: false },
    { icon: "✈", label: "الرحلات", active: false },
    { icon: "🎬", label: "الاستديوهات", active: false },
  ];
  return (
    <div style={{ fontFamily: "'Noto Sans Arabic', 'Inter', sans-serif", direction: "rtl", display: "flex", minHeight: "100vh", background: "#0f0f14" }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: "#16161f", borderLeft: "1px solid #252530", display: "flex", flexDirection: "column", padding: "24px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 20px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #f43f5e, #fb7185)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>◆</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#f8fafc", letterSpacing: -0.5 }}>FinanceAI</div>
              <div style={{ fontSize: 9, color: "#52525b" }}>نظام الحسابات الذكي</div>
            </div>
          </div>
        </div>
        {navItems.map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "11px 20px",
            color: item.active ? "#f8fafc" : "#52525b",
            background: item.active ? "#1e1e2a" : "transparent",
            borderRight: item.active ? "2px solid #f43f5e" : "2px solid transparent",
            cursor: "pointer", fontSize: 13, fontWeight: item.active ? 600 : 400,
          }}>
            <span style={{ fontSize: 15 }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
        <div style={{ marginTop: "auto", padding: "20px", borderTop: "1px solid #252530" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #f43f5e, #fb7185)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff" }}>أح</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>أحمد الخطيب</div>
              <div style={{ fontSize: 10, color: "#52525b" }}>مدير الحساب</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", margin: 0 }}>لوحة التحكم</h1>
            <p style={{ fontSize: 13, color: "#52525b", margin: "4px 0 0" }}>الأحد، 20 يونيو 2026</p>
          </div>
          <button style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg, #f43f5e, #e11d48)", color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(244,63,94,0.35)" }}>
            <span>+</span> معاملة جديدة
          </button>
        </div>

        {/* Balance Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { currency: "AED", balance: "128,450", label: "درهم إماراتي", accent: "#f59e0b", glow: "rgba(245,158,11,0.15)" },
            { currency: "USD", balance: "34,200", label: "دولار أمريكي", accent: "#22c55e", glow: "rgba(34,197,94,0.15)" },
            { currency: "SYP", balance: "4.2M", label: "ليرة سورية", accent: "#a78bfa", glow: "rgba(167,139,250,0.15)" },
          ].map((card, i) => (
            <div key={i} style={{
              background: "#16161f",
              border: `1px solid ${card.accent}30`,
              borderRadius: 16, padding: "20px 22px",
              boxShadow: `0 0 30px ${card.glow}`,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", bottom: -10, left: -10, width: 80, height: 80, borderRadius: "50%", background: card.accent, opacity: 0.07 }} />
              <div style={{ fontSize: 11, color: "#52525b", marginBottom: 8, fontWeight: 500 }}>{card.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#f8fafc", letterSpacing: -0.5 }}>{card.balance}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                <div style={{ fontSize: 11, color: card.accent, fontWeight: 700, background: `${card.accent}18`, padding: "2px 8px", borderRadius: 20, display: "inline-block" }}>{card.currency}</div>
                <div style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>+8.2%</div>
              </div>
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
          <div style={{ background: "#16161f", border: "1px solid #252530", borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "#52525b", marginBottom: 4 }}>إجمالي الدخل هذا الشهر</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#22c55e" }}>+10,700 <span style={{ fontSize: 12, color: "#52525b" }}>AED</span></div>
          </div>
          <div style={{ background: "#16161f", border: "1px solid #252530", borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ fontSize: 11, color: "#52525b", marginBottom: 4 }}>إجمالي المصاريف هذا الشهر</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#f43f5e" }}>-2,220 <span style={{ fontSize: 12, color: "#52525b" }}>AED</span></div>
          </div>
        </div>

        {/* Transactions */}
        <div style={{ background: "#16161f", border: "1px solid #252530", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #1e1e2a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>آخر المعاملات</div>
            <span style={{ fontSize: 12, color: "#f43f5e", cursor: "pointer", fontWeight: 600 }}>عرض الكل ←</span>
          </div>
          {txs.map((tx, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "13px 22px", borderBottom: i < txs.length - 1 ? "1px solid #1a1a24" : "none", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: tx.positive ? "rgba(34,197,94,0.1)" : "rgba(244,63,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, color: tx.positive ? "#22c55e" : "#f43f5e" }}>
                {tx.positive ? "↓" : "↑"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{tx.label}</div>
                <div style={{ fontSize: 11, color: "#52525b", marginTop: 2 }}>{tx.date}</div>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: tx.positive ? "#22c55e" : "#f43f5e" }}>{tx.amount}</div>
                <div style={{ fontSize: 10, color: "#52525b", marginTop: 1 }}>{tx.currency}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
