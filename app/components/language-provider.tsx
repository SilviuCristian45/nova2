"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type Language = "en" | "ro";
type LanguageContextValue = {
  language: Language;
  locale: string;
  t: (ro: string, en: string) => string;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ initialLanguage, children }: { initialLanguage: Language; children: ReactNode }) {
  const [language, updateLanguage] = useState(initialLanguage);
  const router = useRouter();
  const t = useCallback((ro: string, en: string) => language === "ro" ? ro : en, [language]);
  const setLanguage = (next: Language) => {
    document.cookie = `language=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    document.documentElement.lang = next;
    updateLanguage(next);
    router.refresh();
  };

  return <LanguageContext.Provider value={{ language, locale: language === "ro" ? "ro-RO" : "en-US", t, setLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}

export function Text({ ro, en }: { ro: string; en: string }) {
  return useLanguage().t(ro, en);
}

export function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <select
      aria-label={t("Limba interfeței", "Interface language")}
      value={language}
      onChange={(event) => setLanguage(event.target.value as Language)}
      className="h-10 rounded-xl border border-zinc-200 bg-zinc-100 px-3 text-sm font-medium text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <option value="en">English</option>
      <option value="ro">Română</option>
    </select>
  );
}
