"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { lockOfflineAccount } from "@/lib/offline/store";
import { useLanguage } from "./language-provider";

export function SignOutButton() {
  const { t } = useLanguage();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function signOut() {
    setPending(true);
    setError(null);
    try {
      await lockOfflineAccount();
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      window.location.assign("/login");
    } catch (error) {
      setError(error instanceof Error ? error.message : t("Deconectarea a eșuat.", "Sign out failed."));
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={() => void signOut()} aria-label={t("Deconectare", "Sign out")}
        className="rounded-xl border border-zinc-200 bg-zinc-100 p-2.5 text-zinc-600 transition-all disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <LogOut className="size-4" />
      </button>
      {error && <p role="alert" className="max-w-52 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
