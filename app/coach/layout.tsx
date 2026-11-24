import type { ReactNode } from "react";
import { requireCoach } from "@/lib/coach/auth";

export const dynamic = "force-dynamic";

export default async function CoachLayout({ children }: { children: ReactNode }) {
  await requireCoach();
  return <>{children}</>;
}
