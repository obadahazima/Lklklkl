import React, { useState } from "react";
import { Link } from "wouter";
import { Menu, X, Sun, Moon } from "lucide-react";

export default function MobileHeaderMenu({ className = "", lang, isDark, t, updateSettings }: any) {
  const [open, setOpen] = useState(false);
  // t here is the content object (not a function)
  const content = typeof t === "object" && t ? t : {};

  const ariaLabel = lang === "ar" ? "القائمة" : "Menu";
  const lightLabel = lang === "ar" ? "وضع فاتح" : "Light";
  const darkLabel = lang === "ar" ? "وضع داكن" : "Dark";

  return (
    <div className={className + " relative"}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-md bg-transparent border border-border text-muted-foreground"
        aria-label={ariaLabel}
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-lg z-50">
          <div className="flex flex-col p-2 gap-2">
            <button
              onClick={() => {
                updateSettings({ language: lang === "ar" ? "en" : "ar" });
                setOpen(false);
              }}
              className="text-sm text-foreground px-2 py-2 text-left rounded hover:bg-muted"
            >
              <span className="flex items-center gap-2">{lang === "ar" ? "EN" : "عربي"}</span>
            </button>

            <button
              onClick={() => {
                updateSettings({ theme: isDark ? "light" : "dark" });
                setOpen(false);
              }}
              className="text-sm text-foreground px-2 py-2 text-left rounded hover:bg-muted flex items-center gap-2"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{isDark ? lightLabel : darkLabel}</span>
            </button>

            <Link href="/sign-in">
              <button onClick={() => setOpen(false)} className="text-sm text-foreground px-2 py-2 text-left rounded hover:bg-muted">{content.login ?? (lang === "ar" ? "دخول" : "Log in")}</button>
            </Link>
            <Link href="/sign-up">
              <button onClick={() => setOpen(false)} className="text-sm font-semibold bg-primary text-primary-foreground px-2 py-2 rounded hover:opacity-90">{content.signup ?? (lang === "ar" ? "ابدأ الآن" : "Get started")}</button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
