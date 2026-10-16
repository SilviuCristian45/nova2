"use client";

import { useLanguage } from "./language-provider";

const labels: Record<string, [string, string]> = {
  Push: ["Împins", "Push"],
  Pull: ["Tras", "Pull"],
  Legs: ["Picioare", "Legs"],
  Upper: ["Partea superioară", "Upper"],
  Lower: ["Partea inferioară", "Lower"],
  "Full Body": ["Tot corpul", "Full Body"],
  Core: ["Trunchi", "Core"],
  CARDIO: ["Cardio", "Cardio"],
  Warmup: ["Încălzire", "Warmup"],
  Feeder: ["Pregătire", "Feeder"],
  "Working Set": ["Set de lucru", "Working Set"],
  "Top Set": ["Set maxim", "Top Set"],
  Backoff: ["Set redus", "Backoff"],
  "Drop Set": ["Set descrescător", "Drop Set"],
  "Myo-Reps": ["Myo-Reps", "Myo-Reps"],
  "Rest-Pause": ["Pauză scurtă", "Rest-Pause"],
};

export function WorkoutLabel({ value }: { value: string }) {
  const { t } = useLanguage();
  const pair = labels[value];
  return pair ? t(...pair) : value;
}
