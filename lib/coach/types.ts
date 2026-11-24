export const USER_ROLES = ["client", "coach"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PROGRAM_DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type ProgramDifficulty = (typeof PROGRAM_DIFFICULTIES)[number];

export const PROGRAM_GOALS = ["hypertrophy", "strength", "fat_loss", "endurance", "general_fitness"] as const;
export type ProgramGoal = (typeof PROGRAM_GOALS)[number];

export const PROGRAM_STATUSES = ["draft", "published", "archived"] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

export const PROGRAM_ACCESS_TYPES = ["public", "invite_only"] as const;
export type ProgramAccessType = (typeof PROGRAM_ACCESS_TYPES)[number];

export const ENROLLMENT_STATUSES = ["pending", "active", "paused", "completed", "rejected"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const FEEDBACK_REACTIONS = ["fire", "trophy", "muscle", "check", "clap"] as const;
export type FeedbackReaction = (typeof FEEDBACK_REACTIONS)[number];

export const NOTIFICATION_TYPES = [
  "enroll_requested",
  "enroll_approved",
  "enroll_rejected",
  "program_assigned",
  "workout_feedback",
  "weekly_checkin_submitted",
  "weekly_checkin_reviewed",
  "client_pr",
  "meal_plan_assigned",
  "meal_plan_updated",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type CoachProfile = {
  user_id: string;
  display_name: string;
  bio: string | null;
  specialties: string[];
  is_public: boolean;
  accepting_clients: boolean;
  created_at: string;
  updated_at: string;
};

export type Program = {
  id: string;
  coach_id: string;
  assigned_client_id: string | null;
  title: string;
  description: string | null;
  difficulty: ProgramDifficulty;
  duration_weeks: number;
  goal: ProgramGoal;
  status: ProgramStatus;
  access_type: ProgramAccessType;
  requires_approval: boolean;
  invite_code: string | null;
  created_at: string;
  updated_at: string;
};

export type ProgramWorkout = {
  id: string;
  program_id: string;
  week_number: number;
  day_number: number;
  position: number;
  title: string;
  workout_mode: "strength" | "cardio";
  split: string;
  notes: string | null;
  created_at: string;
};

export type ProgramWorkoutExercise = {
  id: string;
  program_workout_id: string;
  position: number;
  exercise: string;
  set_type: string;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  target_rir: number | null;
  target_weight_kg: number | null;
  rest_seconds: number | null;
  notes: string | null;
};

export type ProgramWorkoutCardio = {
  id: string;
  program_workout_id: string;
  position: number;
  activity: string;
  target_duration_min: number;
  notes: string | null;
};

export type Enrollment = {
  id: string;
  client_id: string;
  coach_id: string;
  program_id: string | null;
  status: EnrollmentStatus;
  share_nutrition: boolean;
  current_week: number;
  assigned_by_coach: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CoachClientNote = {
  coach_id: string;
  client_id: string;
  note: string;
  updated_at: string;
};

export type WorkoutFeedback = {
  id: string;
  workout_id: string;
  author_id: string;
  body: string;
  reaction: FeedbackReaction | null;
  created_at: string;
  updated_at: string;
};

export const CHECKIN_PHOTO_SLOTS = ["front", "back", "side"] as const;
export type CheckinPhotoSlot = (typeof CHECKIN_PHOTO_SLOTS)[number];

export type CheckinPhotoUrls = Partial<Record<CheckinPhotoSlot, string>>;

export type WeeklyCheckin = {
  id: string;
  client_id: string;
  coach_id: string;
  enrollment_id: string | null;
  week_start: string;
  weight_kg: number | null;
  energy: number;
  sleep: number;
  stress: number;
  client_notes: string | null;
  photo_front_path?: string | null;
  photo_back_path?: string | null;
  photo_side_path?: string | null;
  coach_reply: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WeeklyCheckinWithPhotos = WeeklyCheckin & {
  photoUrls?: CheckinPhotoUrls;
};

export type AppNotification = {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  payload: Record<string, unknown>;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type ProgramInvitePreview = {
  id: string;
  coach_id: string;
  coach_name: string;
  title: string;
  description: string | null;
  difficulty: ProgramDifficulty;
  duration_weeks: number;
  goal: ProgramGoal;
  requires_approval: boolean;
};

export function parseUserRole(value: unknown): UserRole {
  return value === "coach" ? "coach" : "client";
}

// Self-serve coach role activation is enabled by default unless COACH_SELF_SERVE is explicitly disabled.
export function coachSelfServeEnabled(envValue: string | undefined): boolean {
  if (envValue === undefined) return true;
  const normalized = envValue.trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "off" && normalized !== "no";
}

export function isCoachRoute(pathname: string): boolean {
  return pathname === "/coach" || pathname.startsWith("/coach/");
}

export function canAccessCoachRoute(role: UserRole): boolean {
  return role === "coach";
}

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidInviteCode(code: string): boolean {
  return /^[A-Z0-9]{6,16}$/.test(code);
}

export function parseSpecialties(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(",")) {
    const cleaned = part.trim().slice(0, 40);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= 10) break;
  }
  return result;
}
