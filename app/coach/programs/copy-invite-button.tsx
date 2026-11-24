"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { useLanguage } from "@/app/components/language-provider";
import { Button } from "@/app/components/ui";

export function CopyInviteButton({ code, small = true }: { code: string; small?: boolean }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/explore?code=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback when clipboard permission is denied.
      window.prompt(t("Copiază linkul de invitație:", "Copy invite link:"), url);
    }
  }

  return (
    <Button
      variant="secondary"
      small={small}
      icon={copied ? Check : Link2}
      onClick={handleCopy}
    >
      {copied ? t("Link copiat!", "Link copied!") : t("Link invitație", "Invite link")}
    </Button>
  );
}
