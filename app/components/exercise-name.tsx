"use client";

import { useLanguage } from "./language-provider";
import { cardioNamePair, exerciseNamePair } from "@/lib/exercise-catalog";

// The name in the app language stays dominant; the other language is a smaller second line.
function Names({ primary, secondary }: { primary: string; secondary: string | null }) {
  return (
    <>
      {primary}
      {secondary && <span className="block text-[11px] font-normal leading-snug text-zinc-500">{secondary}</span>}
    </>
  );
}

export function ExerciseName({ id }: { id: string }) {
  const { language } = useLanguage();
  return <Names {...exerciseNamePair(id, language)} />;
}

export function CardioName({ id }: { id: string }) {
  const { language } = useLanguage();
  return <Names {...cardioNamePair(id, language)} />;
}
