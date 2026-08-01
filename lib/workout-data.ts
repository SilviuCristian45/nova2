export const SPLITS = ["Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Core"] as const;
export type Split = typeof SPLITS[number];

export const SET_TYPES = ["Warmup", "Working Set", "Drop Set", "Failure"] as const;
export type SetType = typeof SET_TYPES[number];

export const WORKOUT_MODES = ["strength", "cardio"] as const;
export type WorkoutMode = typeof WORKOUT_MODES[number];

// Lista extinsă de exerciții și aparate
export const EXERCISES = [
  // --- PUSH (Piept, Umeri, Triceps) ---
  "Bench Press (Barbell)",
  "Incline Bench Press (Dumbbell)",
  "Chest Press Machine",
  "Pec Deck Fly",
  "Cable Crossovers",
  "Overhead Press (Barbell / Dumbbell)",
  "Shoulder Press Machine",
  "Lateral Raises (Dumbbell)",
  "Lateral Raises (Cable)",
  "Triceps Pushdown straight bar (Cable)",
  "Triceps Pushdown V bar (Cable)",
  "Skull Crushers (EZ Bar)",
  "Dips Bodyweight",
  "Dips machine",
  "Dips with added weight",
  
  // --- PULL (Spate, Biceps, Trapez) ---
  "Deadlift (Barbell)",
  "Pull-ups / Chin-ups",
  "Lat Pulldown (Cable)",
  "Barbell Row",
  "Seated Cable Row",
  "T-Bar Row",
  "Face Pulls",
  "Bicep Curls (Dumbbell / Barbell)",
  "Hammer Curls",
  "Preacher Curl Machine",
  "Shrugs",
  "Bicep curl cable",

  // --- LEGS (Picioare) ---
  "Squat (Barbell)",
  "Leg Press",
  "Hack Squat Machine",
  "Bulgarian Split Squats",
  "Romanian Deadlift (RDL)",
  "Leg Extension Machine",
  "Seated / Lying Hamstring Curl",
  "Hip Thrust (Barbell / Machine)",
  "Standing Calf Raises",
  "Seated Calf Raises",
  "Pendulum Squat",

  // --- CORE & FULL BODY ---
  "Crunch Machine",
  "Cable Woodchoppers",
  "Hanging Leg Raises",
  "Plank",
  "Kettlebell Swings"
];

// Tipurile de Cardio (LISS = Low Intensity, HIIT = High Intensity)
export const CARDIO_ACTIVITIES = [
  "Outdoor walk LISS",
  "Treadmill - LISS (Mers / Jogging ușor)",
  "Treadmill - HIIT (Sprinturi)",
  "Stationary Bike - LISS",
  "Stationary Bike - HIIT",
  "Rowing Machine - LISS",
  "Rowing Machine - HIIT",
  "Stairmaster (Scări)",
  "Elliptical",
  "Outdoor Running"
];