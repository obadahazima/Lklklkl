export function OceanTeal() {
  const txs = [
    { type: "receipt", label: "قبض من أحمد محمد", amount: "+5,200", currency: "AED", date: "اليوم", positive: true },
    { type: "payment", label: "دفع لرحلة دبي - حلب", amount: "-1,800", currency: "USD", date: "أمس", positive: false },
    { type: "income", label: "إيراد استديو النور", amount: "+3,400", currency: "AED", date: "20 يون", positive: true },
    { type: "expense", label: "فاتورة كهرباء المكتب", amount: "-420", currency: "AED", date: "19 يون", positive: false },
    { type: "receipt", label: "قبض من سامي خوري", amount: "+2,100", currency: "USD", date: "18 يون", positive: true },
  ];
  const navItems = [
    { icon: "⊟", label: "لوحة التحكم", active: true },
    { icon: "↕", label: "المعاملات", active: false },
    { icon: "👤", label: "الزبائن", active: false },
    { icon: "✈", label: "الرحلات", active: false },
    { icon: "🎬", label: "الاستديوهات", active: false },
  ];
  return (
    <div style={{ fontFamily: "'Noto Sans Arabic', 'Inter', sans-serif", direction: "rtl", display: "flex", minHeight: "100vh", background: "#f0faf9" }}>
      {/* Sidebar */}
      <div style={{ width: 230, background: "#0f766e", display: "flex", flexDirection: "column", padding: "24px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 22px 30px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#ffffff", letterSpacing: -0.5 }}>FinanceAI</div>
          <div style={{ fontSize: 11, color: "#5eead4", marginTop: 2 }}>نظام الحسابات الذكي</div>
        </div>
        {navItems.map((item, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 22px",
            color: item.active ? "#ffffff" : "#99f6e4",
            background: item.active ? "rgba(255,255,255,0.15)" : "transparent",
            borderRight: item.active ? "3px solid #ffffff" : "3px solid transparent",
            cursor: "pointer", fontSize: 13, fontWeight: item.active ? 600 : 400,
            borderRadius: item.active ? "0 8px 8px 0" : 0,
            marginLeft: item.active ? 0 : 0,
          }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
        <div style={{ marginTop: "auto", padding: "20px 22px", borderTop: "1px solid rgba(255,255,255,0.15)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>أح</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>أحمد الخطيب</div>
              <div style={{ fontSize: 10, color: "#5eead4" }}>مدير الحساب</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#134e4a", margin: 0 }}>لوحة التحكم</h1>
            <p style={{ fontSize: 13, color: "#5eada8", margin: "4px 0 0" }}>الأحد، 20 يونيو 2026</p>
          </div>
          <button style={{ display: "flex", alignItems: "center", gap: 8, background: "#0f766e", color: "#ffffff", border: "none", borderRadius: 12, padding: "11px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(15,118,110,0.3)" }}>
            <span style={{ fontSize: 18 }}>+</span> معاملة جديدة
          </button>
        </div>

        {/* Summary bar */}
        <div style={{ background: "linear-gradient(135deg, #0f766e, #0d9488)", borderRadius: 18, padding: "22px 26px", marginBottom: 22, color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: "#99f6e4", marginBottom: 4 }}>إجمالي الأصول</div>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>128,450 <span style={{ fontSize: 16, fontWeight: 500, opacity: 0.8 }}>AED</span></div>
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#5eead4" }}>الدخل</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#a7f3d0" }}>+10,700</div>
            </div>
            <div style={{ width: 1, background: "rgba(255,255,255,0.15)" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#5eead4" }}>المصروف</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#fca5a5" }}>-2,220</div>
            </div>
          </div>
        </div>

        {/* Balance Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { currency: "AED", balance: "128,450", label: "درهم إماراتي", color: "#0f766e", light: "#ccfbf1" },
            { currency: "USD", balance: "34,200", label: "دولار أمريكي", color: "#16a34a", light: "#dcfce7" },
            { currency: "SYP", balance: "4.2M", label: "ليرة سورية", color: "#7c3aed", light: "#ede9fe" },
          ].map((card, i) => (
            <div key={i} style={{ background: "#ffffff", border: "1px solid #e0f5f3", borderRadius: 14, padding: "18px 20px", boxShadow: "0 1px 4px rgba(15,118,110,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#5eada8", fontWeight: 500 }}>{card.label}</div>
                <span style={{ background: card.light, color: card.color, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>{card.currency}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#134e4a" }}>{card.balance}</div>
            </div>
          ))}
        </div>

        {/* Transactions */}
        <div style={{ background: "#ffffff", border: "1px solid #e0f5f3", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(15,118,110,0.06)" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #f0faf9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#134e4a" }}>آخر المعاملات</div>
            <span style={{ fontSize: 12, color: "#0f766e", cursor: "pointer", fontWeight: 600 }}>عرض الكل ←</span>
          </div>
          {txs.map((tx, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "13px 22px", borderBottom: i < txs.length - 1 ? "1px solid #f0faf9" : "none", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: tx.positive ? "#dcfce7" : "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0, color: tx.positive ? "#16a34a" : "#dc2626" }}>
                {tx.positive ? "↓" : "↑"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#134e4a" }}>{tx.label}</div>
                <div style={{ fontSize: 11, color: "#5eada8", marginTop: 2 }}>{tx.date}</div>
              </div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: tx.positive ? "#16a34a" : "#dc2626" }}>{tx.amount}</div>
                <div style={{ fontSize: 10, color: "#5eada8", marginTop: 1 }}>{tx.currency}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
