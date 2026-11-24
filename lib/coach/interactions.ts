import {
  FEEDBACK_REACTIONS,
  type AppNotification,
  type FeedbackReaction,
} from "./types.ts";
import { exerciseName } from "../exercise-catalog.ts";

export type Translator = (ro: string, en: string) => string;

export const REACTION_META: Record<
  FeedbackReaction,
  { emoji: string; ro: string; en: string }
> = {
  fire: { emoji: "🔥", ro: "Foc", en: "Fire" },
  trophy: { emoji: "🏆", ro: "Record", en: "PR" },
  muscle: { emoji: "💪", ro: "Forță", en: "Strong" },
  check: { emoji: "✅", ro: "Super", en: "Great" },
  clap: { emoji: "👏", ro: "Bravo", en: "Props" },
};

export function isFeedbackReaction(value: unknown): value is FeedbackReaction {
  return typeof value === "string" && (FEEDBACK_REACTIONS as readonly string[]).includes(value);
}

// Returns the Monday (YYYY-MM-DD) of the ISO week containing `dateYmd`.
export function mondayOfWeek(dateYmd: string): string {
  const dt = new Date(`${dateYmd.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(dt.getTime())) return dateYmd.slice(0, 10);
  const offset = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - offset);
  return dt.toISOString().slice(0, 10);
}

export function validateFeedbackInput(
  body: string,
  reaction: unknown,
  t: Translator,
): { ok: true; body: string; reaction: FeedbackReaction | null } | { ok: false; error: string } {
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > 1000) {
    return {
      ok: false,
      error: t(
        "Mesajul trebuie să aibă între 1 și 1000 de caractere.",
        "Message must be between 1 and 1000 characters.",
      ),
    };
  }
  if (reaction !== null && reaction !== undefined && reaction !== "" && !isFeedbackReaction(reaction)) {
    return { ok: false, error: t("Reacție invalidă.", "Invalid reaction.") };
  }
  return {
    ok: true,
    body: trimmed,
    reaction: isFeedbackReaction(reaction) ? reaction : null,
  };
}

export type WeeklyCheckinPayload = {
  weightKg: number | null;
  energy: number;
  sleep: number;
  stress: number;
  clientNotes: string | null;
};

export function validateWeeklyCheckinInput(
  input: {
    weightKg: number | null;
    energy: number;
    sleep: number;
    stress: number;
    clientNotes: string;
  },
  t: Translator,
): { ok: true; data: WeeklyCheckinPayload } | { ok: false; error: string } {
  const validScore = (v: number) => Number.isInteger(v) && v >= 1 && v <= 5;
  if (!validScore(input.energy) || !validScore(input.sleep) || !validScore(input.stress)) {
    return {
      ok: false,
      error: t(
        "Scorurile pentru energie, somn și stres trebuie să fie între 1 și 5.",
        "Energy, sleep, and stress scores must be between 1 and 5.",
      ),
    };
  }
  let weightKg: number | null = null;
  if (input.weightKg !== null) {
    if (!Number.isFinite(input.weightKg) || input.weightKg < 0.01 || input.weightKg > 9999.99) {
      return {
        ok: false,
        error: t(
          "Greutatea trebuie să fie între 0.01 și 9999.99 kg.",
          "Weight must be between 0.01 and 9999.99 kg.",
        ),
      };
    }
    weightKg = Math.round(input.weightKg * 100) / 100;
  }
  const notes = input.clientNotes.trim();
  if (notes.length > 1500) {
    return {
      ok: false,
      error: t(
        "Notițele pot avea maxim 1500 de caractere.",
        "Notes can have at most 1500 characters.",
      ),
    };
  }
  return {
    ok: true,
    data: {
      weightKg,
      energy: input.energy,
      sleep: input.sleep,
      stress: input.stress,
      clientNotes: notes || null,
    },
  };
}

export type FormattedNotification = {
  title: string;
  body: string;
  tone?: "lime" | "coral" | "ice" | "lilac" | "gold" | "red";
};

function str(payload: Record<string, unknown>, key: string): string {
  const val = payload[key];
  return typeof val === "string" ? val.trim() : "";
}

export function formatNotification(
  item: Pick<AppNotification, "type" | "payload">,
  t: Translator,
  language: "ro" | "en",
): FormattedNotification {
  const p = item.payload ?? {};
  const clientName = str(p, "client_name") || t("Un client", "A client");
  const authorName = str(p, "author_name") || t("Antrenorul tău", "Your coach");
  const programTitle = str(p, "program_title");
  const split = str(p, "split");
  const performedOn = str(p, "performed_on");
  const weekStart = str(p, "week_start");
  const reactionRaw = p.reaction;
  const reactionEmoji = isFeedbackReaction(reactionRaw) ? `${REACTION_META[reactionRaw].emoji} ` : "";

  switch (item.type) {
    case "enroll_requested":
      return {
        title: t("Cerere nouă de înscriere", "New enrollment request"),
        body: programTitle
          ? t(`${clientName} cere înscrierea la „${programTitle}”.`, `${clientName} requested to join "${programTitle}".`)
          : t(`${clientName} a trimis o cerere de înscriere.`, `${clientName} sent an enrollment request.`),
        tone: "gold",
      };

    case "enroll_approved":
      if (str(p, "client_id")) {
        return {
          title: t("Client nou înscris", "New client enrolled"),
          body: programTitle
            ? t(`${clientName} s-a înscris în „${programTitle}”.`, `${clientName} enrolled in "${programTitle}".`)
            : t(`${clientName} este acum client activ.`, `${clientName} is now an active client.`),
          tone: "lime",
        };
      }
      return {
        title: t("Înscriere aprobată", "Enrollment approved"),
        body: programTitle
          ? t(`Ai acces acum la programul „${programTitle}”.`, `You now have access to "${programTitle}".`)
          : t("Cererea ta de înscriere a fost aprobată.", "Your enrollment request was approved."),
        tone: "lime",
      };

    case "enroll_rejected":
      return {
        title: t("Cerere respinsă", "Enrollment declined"),
        body: programTitle
          ? t(`Cererea ta pentru „${programTitle}” nu a fost aprobată.`, `Your request for "${programTitle}" was not approved.`)
          : t("Cererea ta de înscriere nu a fost aprobată.", "Your enrollment request was not approved."),
        tone: "red",
      };

    case "program_assigned":
      return {
        title: t("Program nou asignat", "New program assigned"),
        body: programTitle
          ? t(`Antrenorul ți-a asignat programul „${programTitle}”.`, `Your coach assigned you "${programTitle}".`)
          : t("Antrenorul ți-a asignat un program nou.", "Your coach assigned you a new program."),
        tone: "lime",
      };

    case "workout_feedback": {
      const sessionLabel = [split, performedOn].filter(Boolean).join(" · ");
      return {
        title: `${reactionEmoji}${t("Feedback nou pe antrenament", "New workout feedback")}`,
        body: sessionLabel
          ? t(`${authorName} a lăsat un mesaj la ${sessionLabel}.`, `${authorName} commented on ${sessionLabel}.`)
          : t(`${authorName} a lăsat un mesaj pe un antrenament.`, `${authorName} commented on a workout.`),
        tone: "ice",
      };
    }

    case "weekly_checkin_submitted":
      return {
        title: t("Check-in săptămânal primit", "Weekly check-in received"),
        body: weekStart
          ? t(`${clientName} a trimis check-in-ul pentru săptămâna ${weekStart}.`, `${clientName} submitted the check-in for week ${weekStart}.`)
          : t(`${clientName} a trimis un check-in săptămânal.`, `${clientName} submitted a weekly check-in.`),
        tone: "lilac",
      };

    case "weekly_checkin_reviewed":
      return {
        title: t("Răspuns la check-in-ul săptămânal", "Weekly check-in reviewed"),
        body: weekStart
          ? t(`Antrenorul a răspuns la check-in-ul tău din săptămâna ${weekStart}.`, `Your coach replied to your check-in for week ${weekStart}.`)
          : t("Antrenorul a răspuns la check-in-ul tău săptămânal.", "Your coach replied to your weekly check-in."),
        tone: "lime",
      };

    case "client_pr": {
      const exercises = Array.isArray(p.exercises)
        ? p.exercises
            .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
            .slice(0, 3)
            .map((ex) => exerciseName(ex, language))
        : [];
      return {
        title: t("Record personal nou (PR)!", "New personal record (PR)!"),
        body: exercises.length > 0
          ? t(`${clientName} a bătut un PR la ${exercises.join(", ")}.`, `${clientName} hit a PR on ${exercises.join(", ")}.`)
          : t(`${clientName} a bătut un record personal!`, `${clientName} hit a new personal record!`),
        tone: "lime",
      };
    }

    case "meal_plan_assigned": {
      const planTitle = str(p, "plan_title");
      const coachName = str(p, "coach_name");
      return {
        title: t("Plan alimentar nou", "New meal plan"),
        body: planTitle
          ? t(
              `${coachName || "Antrenorul"} ți-a asignat planul alimentar „${planTitle}”.`,
              `${coachName || "Your coach"} assigned you the meal plan "${planTitle}".`,
            )
          : t("Antrenorul ți-a asignat un plan alimentar nou.", "Your coach assigned you a new meal plan."),
        tone: "lime",
      };
    }

    case "meal_plan_updated": {
      const planTitle = str(p, "plan_title");
      return {
        title: t("Plan alimentar actualizat", "Meal plan updated"),
        body: planTitle
          ? t(
              `Antrenorul a actualizat planul alimentar „${planTitle}”.`,
              `Your coach updated your meal plan "${planTitle}".`,
            )
          : t("Antrenorul ți-a actualizat planul alimentar.", "Your coach updated your meal plan."),
        tone: "ice",
      };
    }
  }
}
