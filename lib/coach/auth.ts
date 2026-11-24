import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { coachSelfServeEnabled, parseUserRole, type CoachProfile, type UserRole } from "./types";

export function isCoachSelfServeEnabled(): boolean {
  return coachSelfServeEnabled(process.env.COACH_SELF_SERVE);
}

export type AuthRoleContext = {
  userId: string;
  email: string | null;
  role: UserRole;
  displayName: string | null;
  migrationMissing: boolean;
};

// Gracefully falls back to "client" before the coach migration is applied on hosted Supabase.
export const getCurrentAuthRole = cache(async (): Promise<AuthRoleContext | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    if (/column.*role|schema cache|does not exist/i.test(error.message)) {
      const { data: fallback } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      return {
        userId: user.id,
        email: user.email ?? null,
        role: "client",
        displayName: (fallback?.display_name as string | null | undefined) ?? null,
        migrationMissing: true,
      };
    }
    throw new Error(error.message);
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    role: parseUserRole(data?.role),
    displayName: (data?.display_name as string | null | undefined) ?? null,
    migrationMissing: false,
  };
});

export async function getOwnCoachProfile(userId: string): Promise<CoachProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coach_profiles")
    .select("user_id, display_name, bio, specialties, is_public, accepting_clients, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  return (data as CoachProfile | null) ?? null;
}

// Defense-in-depth guard for /coach layouts, pages, and server actions.
export async function requireCoach() {
  const context = await getCurrentAuthRole();
  if (!context) redirect("/login");
  if (context.role !== "coach") redirect("/");
  const supabase = await createClient();
  return { supabase, ...context };
}
