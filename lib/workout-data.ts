export const SPLITS = ["Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Core"] as const;
export type Split = typeof SPLITS[number];

export const SET_TYPES = ["Warmup", "Feeder", "Working Set", "Drop Set", "Myo-Reps", "Rest-Pause"] as const;
export type SetType = typeof SET_TYPES[number];

export const WORKOUT_MODES = ["strength", "cardio", "mobility"] as const;
export type WorkoutMode = typeof WORKOUT_MODES[number];

// Grupăm exercițiile pe categorii logice
export const EXERCISES_BY_GROUP = {
  Push: [
    "Bench Press (Barbell)", "Incline Bench Press (Barbell)", "Decline Bench Press (Barbell)", "Flat Bench Press (Dumbbell)", "Incline Bench Press (Dumbbell)", "Decline Bench Press (Dumbbell)", "Chest Flyes (Dumbbell)", "Incline Chest Flyes (Dumbbell)", "Floor Press (Barbell / Dumbbell)", "Dumbbell Pullover (Chest focus)", "Bench Press (Smith Machine)", "Incline Bench Press (Smith Machine)", "Flat Chest Press (Hammer Strength / Plate Loaded)", "Incline Chest Press (Hammer Strength / Plate Loaded)", "Decline Chest Press (Machine)", "Chest Press (Hoist Machine)", "Pec Deck Fly (Machine)", "Cable Crossovers (High to Low)", "Cable Crossovers (Low to High)", "Cable Crossovers (Middle)", "Seated Cable Chest Press",
    "Overhead Press / Military Press (Barbell)", "Seated Shoulder Press (Dumbbell)", "Arnold Press (Dumbbell)", "Lateral Raises (Dumbbell)", "Front Raises (Dumbbell / Barbell / Plate)", "Rear Delt Flyes (Dumbbell)", "Upright Row (Barbell / EZ Bar)", "Upright Row (Dumbbell)", "Overhead Press (Smith Machine)", "Shoulder Press (Hammer Strength / Plate Loaded)", "Shoulder Press (Hoist Machine)", "Lateral Raises (Cable - Single Arm)", "Lateral Raises (Cable - Dual Arm)", "Lateral Raises (Machine)", "Front Raises (Cable - Rope / Straight Bar)", "Rear Delt Reverse Pec Deck (Machine)", "Rear Delt Face Pulls (Cable - Rope)", "Rear Delt Flyes (Cable - Dual High Pulley)",
    "Close-Grip Bench Press (Barbell)", "Skull Crushers (EZ Bar / Barbell)", "Skull Crushers (Dumbbell)", "Overhead Triceps Extension (Dumbbell - Single/Double)", "Triceps Kickbacks (Dumbbell)", "Dips (Bodyweight)", "Dips (Weighted)", "Triceps Pushdown (Cable - Straight Bar)", "Triceps Pushdown (Cable - V-Bar)", "Triceps Pushdown (Cable - Rope)", "Triceps Pushdown (Cable - Reverse Grip)", "Overhead Triceps Extension (Cable - Rope)", "Overhead Triceps Extension (Cable - V-Bar / Straight Bar)", "Triceps Kickbacks (Cable)", "Dips (Assisted Machine)", "Triceps Press (Machine)", "Triceps Extension (Hoist Machine)"
  ],
  Pull: [
    "Deadlift (Conventional Barbell)", "Deadlift (Sumo Barbell)", "Deadlift (Trap/Hex Bar)", "Bent Over Row (Barbell)", "Pendlay Row (Barbell)", "Single Arm Row (Dumbbell)", "Incline Chest-Supported Row (Dumbbell)", "T-Bar Row (Landmine / Free)", "Pull-ups (Pronated Grip)", "Chin-ups (Supinated Grip)", "Neutral Grip Pull-ups", "Weighted Pull-ups", "Lat Pulldown (Cable - Wide Grip)", "Lat Pulldown (Cable - Close Grip / V-Handle)", "Lat Pulldown (Cable - Reverse Grip)", "Lat Pulldown (Cable - Single Arm)", "Front Pulldown (Hammer Strength / Plate Loaded)", "Lat Pulldown (Hoist Machine)", "Seated Cable Row (V-Handle)", "Seated Cable Row (Wide Grip)", "Chest-Supported T-Bar Row (Machine)", "Low Row (Hammer Strength / Plate Loaded)", "Mid Row (Hoist Machine)", "High Row (Machine / Plate Loaded)", "Straight Arm Lat Pulldown (Cable - Rope / Straight Bar)", "Machine Pullover", "Assisted Pull-up (Machine)",
    "Shrugs (Barbell)", "Shrugs (Dumbbell)", "Shrugs (Smith Machine)", "Shrugs (Trap/Hex Bar)", "Shrugs (Cable)",
    "Bicep Curls (Barbell)", "Bicep Curls (EZ Bar)", "Alternating Bicep Curls (Dumbbell)", "Simultaneous Bicep Curls (Dumbbell)", "Hammer Curls (Dumbbell)", "Incline Bicep Curls (Dumbbell)", "Spider Curls (Dumbbell / EZ Bar)", "Preacher Curls (EZ Bar)", "Concentration Curls (Dumbbell)", "Reverse Curls (Barbell / EZ Bar)", "Wrist Curls (Barbell / Dumbbell)", "Reverse Wrist Curls (Barbell / Dumbbell)", "Bicep Curls (Cable - Straight Bar)", "Bicep Curls (Cable - Rope)", "Bicep Curls (Cable - Single Arm D-Handle)", "Hammer Curls (Cable - Rope)", "High Pulley Bicep Curls / Crucifix Curls (Cable)", "Preacher Curl (Machine)", "Preacher Curl (Hoist Machine)", "Bicep Curl (Hammer Strength / Plate Loaded)", "Behind-the-back Cable Curls"
  ],
  Legs: [
    "Squat (Barbell - High Bar)", "Squat (Barbell - Low Bar)", "Front Squat (Barbell)", "Goblet Squat (Dumbbell / Kettlebell)", "Bulgarian Split Squats (Dumbbell / Barbell)", "Walking Lunges (Dumbbell / Barbell)", "Reverse Lunges (Dumbbell / Barbell)", "Step-ups (Dumbbell / Box)", "Sissy Squats (Bodyweight / Machine)", "Squat (Smith Machine)", "Leg Press (45 Degree)", "Leg Press (Horizontal / Seated)", "Leg Press (Single Leg)", "Hack Squat (Machine)", "Pendulum Squat (Machine)", "V-Squat (Machine)", "Leg Extension (Machine)", "Leg Extension (Hoist Machine)", "Leg Extension (Single Leg Machine)",
    "Romanian Deadlift / RDL (Barbell)", "Romanian Deadlift / RDL (Dumbbell)", "Stiff-Legged Deadlift (Barbell)", "Good Mornings (Barbell)", "Hip Thrust (Barbell)", "Glute Bridge (Barbell / Bodyweight)", "Kettlebell Swings", "Romanian Deadlift (Smith Machine)", "Seated Leg Curl (Machine)", "Lying Leg Curl (Machine)", "Standing Single Leg Curl (Machine)", "Hip Thrust (Machine)", "Glute Kickbacks (Cable)", "Glute Kickbacks (Machine)", "Cable Pull-throughs (Rope)", "Hip Abductor (Machine - Outward)", "Hip Adductor (Machine - Inward)", "Glute Ham Raise (GHR Machine)", "Reverse Hyperextensions",
    "Standing Calf Raises (Machine)", "Standing Calf Raises (Smith Machine)", "Standing Calf Raises (Dumbbell / Single Leg)", "Seated Calf Raises (Machine - Plate Loaded)", "Leg Press Calf Raises", "Donkey Calf Raises (Machine / Free)"
  ],
  Core: [
    "Crunches (Bodyweight)", "Decline Crunches", "Crunch (Machine)", "Crunch (Hoist Machine)", "Cable Crunches (Rope)", "Hanging Leg Raises (Straight Legs)", "Hanging Knee Raises", "Captain's Chair Leg Raises", "Lying Leg Raises", "Plank (Bodyweight / Weighted)", "Ab Wheel Rollouts", "Russian Twists (Dumbbell / Medicine Ball)", "Cable Woodchoppers (High to Low)", "Cable Woodchoppers (Low to High)", "Bicycle Crunches"
  ],
  FullBody: [
    "Power Clean (Barbell)", "Clean and Jerk (Barbell)", "Snatch (Barbell)", "Thrusters (Barbell / Dumbbell)", "Wall Balls", "Burpees", "Farmer's Walk (Dumbbells / Kettlebells)"
  ]
};

// Păstrăm și lista completă pentru compatibilitate în restul aplicației
export const EXERCISES = [
  ...EXERCISES_BY_GROUP.Push,
  ...EXERCISES_BY_GROUP.Pull,
  ...EXERCISES_BY_GROUP.Legs,
  ...EXERCISES_BY_GROUP.Core,
  ...EXERCISES_BY_GROUP.FullBody
];

// FUNCȚIA MAGICĂ: Alege exercițiile potrivite în funcție de Split-ul selectat
export function getExercisesForSplit(split: Split): string[] {
  switch (split) {
    case "Push": return EXERCISES_BY_GROUP.Push;
    case "Pull": return EXERCISES_BY_GROUP.Pull;
    case "Legs": return EXERCISES_BY_GROUP.Legs;
    case "Upper": return [...EXERCISES_BY_GROUP.Push, ...EXERCISES_BY_GROUP.Pull];
    case "Lower": return EXERCISES_BY_GROUP.Legs;
    case "Core": return EXERCISES_BY_GROUP.Core;
    case "Full Body": return EXERCISES; // Returnează tot
    default: return EXERCISES;
  }
}

export const CARDIO_ACTIVITIES = [
  "Outdoor Walk - LISS", "Outdoor Running - LISS", "Outdoor Running - HIIT / Sprints", "Treadmill - LISS (Walking / Jogging)", "Treadmill - HIIT (Sprints)", "Treadmill - Incline Walk (12-3-30)", "Stationary Bike - LISS", "Stationary Bike - HIIT", "Assault Bike / Air Bike - HIIT", "Rowing Machine / Ergometer - LISS", "Rowing Machine / Ergometer - HIIT", "Stairmaster / Step Machine - LISS", "Stairmaster / Step Machine - HIIT", "Elliptical / Cross Trainer - LISS", "Elliptical / Cross Trainer - HIIT", "SkiErg - HIIT", "Jump Rope / Skipping", "Swimming - LISS", "Swimming - HIIT"
];