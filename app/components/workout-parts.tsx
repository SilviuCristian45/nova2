"use client";

// Workout pieces shared by /insert, /offline and /edit so the three look the same: set-type badges and the
// session list (every set in one card, flat rows separated by hairlines).

import type { ReactNode } from "react";
import { Pencil, Trash2, Trophy } from "lucide-react";
import { useLanguage } from "./language-provider";
import { useUnits } from "./units-provider";
import { CardioName, ExerciseName } from "./exercise-name";
import { WorkoutLabel } from "./workout-label";
import { Badge, IconButton, cx, type Tone } from "./ui";

// Colour family of a set type: Working → lime, Warmup → ice, Feeder → gold, Top set / Backoff → lilac,
// Drop / Failure → red; anything else stays neutral.
export function setTypeTone(type: string): Tone | undefined {
  const value = type?.toLowerCase() ?? "";
  if (value.includes("warm") || value.includes("încălzire")) return "ice";
  if (value.includes("feeder")) return "gold";
  if (value.includes("work")) return "lime";
  if (value.includes("top") || value.includes("back")) return "lilac";
  if (value.includes("drop") || value.includes("fail")) return "red";
  return undefined;
}

export function SetTypeBadge({ type }: { type: string }) {
  return <Badge tone={setTypeTone(type)}><WorkoutLabel value={type} /></Badge>;
}

export function RecordBadge() {
  const { t } = useLanguage();
  return (
    <Badge tone="lime" className="gap-1">
      <Trophy className="size-3" aria-hidden="true" />
      {t("Record personal", "Personal best")}
    </Badge>
  );
}

export type SetRowData = {
  key: string;
  ordinal: number;
  exercise: string;
  weightKg: number;
  reps: number;
  rir: number | null;
  setType: string;
  notes?: string | null;
  record?: boolean;
  extra?: ReactNode;
};

// One card holding every set of the session. `onEdit` / `onRemove` add plain pencil / bin buttons.
export function SetRows({ rows, onEdit, onRemove, editingKey, empty }: {
  rows: SetRowData[]; onEdit?: (key: string) => void; onRemove?: (key: string) => void; editingKey?: string | null; empty?: ReactNode;
}) {
  const { t } = useLanguage();
  const { format } = useUnits();
  if (rows.length === 0) return empty ? <p className="rounded-lg bg-card px-[18px] py-6 text-center font-medium text-muted">{empty}</p> : null;
  return (
    <ul className="flex flex-col overflow-hidden rounded-lg bg-card">
      {rows.map((row, index) => (
        <li key={row.key} className={cx("flex items-start gap-3 px-[18px] py-3.5", index > 0 && "border-t border-line", editingKey === row.key && "bg-lime-soft")}>
          <span className="w-6 shrink-0 pt-0.5 text-sm text-muted tabular-nums">{row.ordinal}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="break-words font-medium"><ExerciseName id={row.exercise} /></p>
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[20px] font-semibold tabular-nums">
                {row.weightKg > 0 ? `${format(row.weightKg)} × ` : ""}{row.reps}
                {row.weightKg > 0 ? "" : <span className="text-[15px] font-normal text-muted"> {t("repetări", "reps")}</span>}
              </span>
              {row.rir !== null && <span className="text-[13px] text-muted">RIR {row.rir}</span>}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <SetTypeBadge type={row.setType} />
              {row.record && <RecordBadge />}
              {row.extra}
            </div>
            {row.notes && <p className="whitespace-pre-wrap break-words text-[13px] text-muted">{row.notes}</p>}
          </div>
          {(onEdit || onRemove) && (
            <div className="-mr-2 flex shrink-0">
              {onEdit && <IconButton plain icon={Pencil} label={`${t("Editează setul", "Edit set")} ${row.ordinal}`} onClick={() => onEdit(row.key)} />}
              {onRemove && <IconButton plain icon={Trash2} label={`${t("Elimină setul", "Remove set")} ${row.ordinal}`} onClick={() => onRemove(row.key)} />}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function CardioRows({ rows, onRemove, empty }: {
  rows: { key: string; activity: string; durationMin: number }[]; onRemove?: (key: string) => void; empty?: ReactNode;
}) {
  const { t, locale } = useLanguage();
  if (rows.length === 0) return empty ? <p className="rounded-lg bg-card px-[18px] py-6 text-center font-medium text-muted">{empty}</p> : null;
  return (
    <ul className="flex flex-col overflow-hidden rounded-lg bg-card">
      {rows.map((row, index) => (
        <li key={row.key} className={cx("flex items-center gap-3 px-[18px] py-3.5", index > 0 && "border-t border-line")}>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="break-words font-medium"><CardioName id={row.activity} /></p>
            <p className="text-[20px] font-semibold tabular-nums text-coral-text">{row.durationMin.toLocaleString(locale)} <span className="text-[15px] font-normal text-muted">min</span></p>
          </div>
          {onRemove && <IconButton plain icon={Trash2} className="-mr-2" label={`${t("Elimină activitatea", "Remove activity")} ${index + 1}`} onClick={() => onRemove(row.key)} />}
        </li>
      ))}
    </ul>
  );
}
