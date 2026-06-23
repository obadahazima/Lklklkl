export function MidnightPremium() {
  const txs = [
    { type: "receipt", label: "قبض من أحمد محمد", amount: "+5,200", currency: "AED", date: "اليوم", color: "#22c55e" },
    { type: "payment", label: "دفع لرحلة دبي - حلب", amount: "-1,800", currency: "USD", date: "أمس", color: "#f87171" },
    { type: "income", label: "إيراد استديو النور", amount: "+3,400", currency: "AED", date: "20 يون", color: "#22c55e" },
    { type: "expense", label: "فاتورة كهرباء المكتب", amount: "-420", currency: "AED", date: "19 يون", color: "#f87171" },
    { type: "receipt", label: "قبض من سامي خوري", amount: "+2,100", currency: "USD", date: "18 يون", color: "#22c55e" },
  ];
  const navItems = [
    { icon: "⊟", label: "لوحة التحكم", active: true },
    { icon: "↕", label: "المعاملات", active: false },
    { icon: "👤", label: "الزبائن", active: false },
    { icon: "✈", label: "الرحلات", active: false },
    { icon: "🎬", label: "الاستديوهات", active: false },
  ];
  return (
    <div style={{ fontFamily: "'Noto Sans Arabic', 'Inter', sans-serif", direction: "rtl", display: "flex", minHeight: "100vh", background: "#070d1a" }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: "#0d1526", borderLeft: "1px solid #1a2a45", display: "flex", flexDirection: "column", padding: "24px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 20px 28px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, background: "linear-gradient(135deg, #f59e0b, #fbbf24)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            FinanceAI
          </div>
          <div style={{ fontSize: 11, color: "#4a6080", marginTop: 2 }}>نظام الحسابات الذكي</div>
        </div>
        {navItems.map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "11px 20px",
            color: item.active ? "#f59e0b" : "#4a6080",
            background: item.active ? "rgba(245,158,11,0.08)" : "transparent",
            borderRight: item.active ? "3px solid #f59e0b" : "3px solid transparent",
            cursor: "pointer", fontSize: 13, fontWeight: item.active ? 600 : 400,
            transition: "all 0.2s",
          }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
        <div style={{ marginTop: "auto", padding: "20px", borderTop: "1px solid #1a2a45" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg, #f59e0b, #d97706)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#07120d" }}>أح</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#c0cfe8" }}>أحمد الخطيب</div>
              <div style={{ fontSize: 10, color: "#3a5070" }}>مدير الحساب</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#e2eeff", margin: 0 }}>لوحة التحكم</h1>
            <p style={{ fontSize: 13, color: "#3a5070", margin: "4px 0 0" }}>الأحد، 20 يونيو 2026</p>
          </div>
          <button style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#07120d", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            <span>+</span> معاملة جديدة
          </button>
        </div>

        {/* Balance Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
          {[
            { currency: "AED", balance: "128,450", label: "الرصيد بالدرهم", trend: "+12.4%", icon: "🇦🇪", color: "#f59e0b" },
            { currency: "USD", balance: "34,200", label: "الرصيد بالدولار", trend: "+8.1%", icon: "🇺🇸", color: "#22c55e" },
            { currency: "SYP", balance: "4.2M", label: "الرصيد بالليرة", trend: "-2.3%", icon: "🇸🇾", color: "#a78bfa" },
          ].map((card, i) => (
            <div key={i} style={{
              background: "linear-gradient(145deg, #0d1a2e, #111f38)",
              border: "1px solid #1a2d4a",
              borderRadius: 16, padding: "20px 22px",
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: -20, left: -20, width: 100, height: 100, background: card.color, opacity: 0.06, borderRadius: "50%" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 11, color: "#3a5070", marginBottom: 6, fontWeight: 500 }}>{card.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#e2eeff", letterSpacing: -0.5 }}>{card.balance}</div>
                  <div style={{ fontSize: 12, color: card.currency === "AED" ? "#f59e0b" : card.currency === "USD" ? "#22c55e" : "#a78bfa", marginTop: 2 }}>{card.currency}</div>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 20 }}>{card.icon}</div>
                  <div style={{ marginTop: 8, fontSize: 11, color: card.trend.startsWith("+") ? "#22c55e" : "#f87171", fontWeight: 600, background: card.trend.startsWith("+") ? "rgba(34,197,94,0.1)" : "rgba(248,113,113,0.1)", padding: "2px 8px", borderRadius: 20 }}>
                    {card.trend}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Transactions */}
        <div style={{ background: "#0d1526", border: "1px solid #1a2a45", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", borderBottom: "1px solid #1a2a45", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#c0cfe8" }}>آخر المعاملات</div>
            <span style={{ fontSize: 12, color: "#f59e0b", cursor: "pointer", fontWeight: 500 }}>عرض الكل ←</span>
          </div>
          {txs.map((tx, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "14px 22px", borderBottom: i < txs.length - 1 ? "1px solid #111c30" : "none", gap: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: tx.color === "#22c55e" ? "rgba(34,197,94,0.1)" : "rgba(248,113,113,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                {tx.color === "#22c55e" ? "↓" : "↑"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#c0cfe8" }}>{tx.label}</div>
                <div style={{ fontSize: 11, color: "#3a5070", marginTop: 2 }}>{tx.date}</div>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: tx.color }}>{tx.amount}</div>
                <div style={{ fontSize: 10, color: "#3a5070", marginTop: 1 }}>{tx.currency}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
