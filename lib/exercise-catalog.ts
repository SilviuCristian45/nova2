// Exercise and cardio catalog.
//
// The English `id` is what gets stored in workout_sets.exercise / cardio_sessions.activity, so it is the
// stable identifier: never rename an existing id, only add new ones. Romanian names are display-only and
// resolved at render time through exerciseName() / cardioName(), so saved workouts never change.

export const MUSCLE_GROUPS = [
  "chest", "back", "lower_back", "traps", "shoulders", "biceps", "triceps", "forearms",
  "quads", "hamstrings", "glutes", "adductors", "abductors", "calves", "abs", "full_body",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EQUIPMENT = [
  "barbell", "ez_bar", "trap_bar", "dumbbell", "kettlebell", "cable", "machine", "plate_loaded",
  "smith_machine", "bodyweight", "band", "other",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EXERCISE_TYPES = ["compound", "isolation", "isometric", "olympic"] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export type ExerciseGroup = "Push" | "Pull" | "Legs" | "Core" | "FullBody";

export type ExerciseDefinition = {
  id: string;
  ro: string;
  primary: MuscleGroup;
  secondary: MuscleGroup[];
  equipment: Equipment;
  type: ExerciseType;
  group: ExerciseGroup;
};

const GROUP_BY_MUSCLE: Record<MuscleGroup, ExerciseGroup> = {
  chest: "Push", shoulders: "Push", triceps: "Push",
  back: "Pull", lower_back: "Pull", traps: "Pull", biceps: "Pull", forearms: "Pull",
  quads: "Legs", hamstrings: "Legs", glutes: "Legs", adductors: "Legs", abductors: "Legs", calves: "Legs",
  abs: "Core", full_body: "FullBody",
};

type Row = [id: string, ro: string, primary: MuscleGroup, secondary: MuscleGroup[], equipment: Equipment, type: ExerciseType];

const C = "compound", I = "isolation", S = "isometric", O = "olympic";

// Order matters: the first exercise of each group is the default in the pickers.
const ROWS: Row[] = [
  // --- Chest ---
  ["Bench Press (Barbell)", "Împins la piept cu bara", "chest", ["triceps", "shoulders"], "barbell", C],
  ["Incline Bench Press (Barbell)", "Împins la piept înclinat cu bara", "chest", ["shoulders", "triceps"], "barbell", C],
  ["Decline Bench Press (Barbell)", "Împins la piept declinat cu bara", "chest", ["triceps", "shoulders"], "barbell", C],
  ["Flat Bench Press (Dumbbell)", "Împins la piept cu gantere", "chest", ["triceps", "shoulders"], "dumbbell", C],
  ["Incline Bench Press (Dumbbell)", "Împins la piept înclinat cu gantere", "chest", ["shoulders", "triceps"], "dumbbell", C],
  ["Decline Bench Press (Dumbbell)", "Împins la piept declinat cu gantere", "chest", ["triceps", "shoulders"], "dumbbell", C],
  ["Chest Flyes (Dumbbell)", "Fluturări cu gantere", "chest", ["shoulders"], "dumbbell", I],
  ["Incline Chest Flyes (Dumbbell)", "Fluturări înclinate cu gantere", "chest", ["shoulders"], "dumbbell", I],
  ["Floor Press (Barbell / Dumbbell)", "Împins de pe podea (bară / gantere)", "chest", ["triceps", "shoulders"], "barbell", C],
  ["Dumbbell Pullover (Chest focus)", "Pullover cu ganteră (accent piept)", "chest", ["back", "triceps"], "dumbbell", I],
  ["Bench Press (Smith Machine)", "Împins la piept la Smith", "chest", ["triceps", "shoulders"], "smith_machine", C],
  ["Incline Bench Press (Smith Machine)", "Împins la piept înclinat la Smith", "chest", ["shoulders", "triceps"], "smith_machine", C],
  ["Flat Chest Press (Hammer Strength / Plate Loaded)", "Presă piept orizontală (Hammer Strength / discuri)", "chest", ["triceps", "shoulders"], "plate_loaded", C],
  ["Incline Chest Press (Hammer Strength / Plate Loaded)", "Presă piept înclinată (Hammer Strength / discuri)", "chest", ["shoulders", "triceps"], "plate_loaded", C],
  ["Decline Chest Press (Machine)", "Presă piept declinată la aparat", "chest", ["triceps"], "machine", C],
  ["Chest Press (Hoist Machine)", "Presă piept la aparat Hoist", "chest", ["triceps", "shoulders"], "machine", C],
  ["Pec Deck Fly (Machine)", "Fluturări la aparat (Pec Deck)", "chest", ["shoulders"], "machine", I],
  ["Cable Crossovers (High to Low)", "Crossover la scripeți (de sus în jos)", "chest", ["shoulders"], "cable", I],
  ["Cable Crossovers (Low to High)", "Crossover la scripeți (de jos în sus)", "chest", ["shoulders"], "cable", I],
  ["Cable Crossovers (Middle)", "Crossover la scripeți (la mijloc)", "chest", ["shoulders"], "cable", I],
  ["Seated Cable Chest Press", "Presă piept la scripete, așezat", "chest", ["triceps", "shoulders"], "cable", C],
  ["Push-ups (Bodyweight)", "Flotări", "chest", ["triceps", "shoulders", "abs"], "bodyweight", C],
  ["Incline Push-ups (Bodyweight)", "Flotări cu mâinile ridicate", "chest", ["triceps", "shoulders"], "bodyweight", C],
  ["Decline Push-ups (Bodyweight)", "Flotări cu picioarele ridicate", "chest", ["shoulders", "triceps"], "bodyweight", C],
  ["Landmine Press (Barbell)", "Landmine Press (împins cu bara în landmine)", "shoulders", ["chest", "triceps"], "barbell", C],

  // --- Shoulders ---
  ["Overhead Press / Military Press (Barbell)", "Împins deasupra capului / Military Press (bară)", "shoulders", ["triceps", "traps"], "barbell", C],
  ["Seated Shoulder Press (Dumbbell)", "Împins umeri cu gantere, așezat", "shoulders", ["triceps"], "dumbbell", C],
  ["Standing Shoulder Press (Dumbbell)", "Împins umeri cu gantere, în picioare", "shoulders", ["triceps", "abs"], "dumbbell", C],
  ["Push Press (Barbell)", "Push Press cu bara", "shoulders", ["triceps", "quads"], "barbell", C],
  ["Arnold Press (Dumbbell)", "Arnold Press cu gantere", "shoulders", ["triceps"], "dumbbell", C],
  ["Lateral Raises (Dumbbell)", "Ridicări laterale cu gantere", "shoulders", ["traps"], "dumbbell", I],
  ["Front Raises (Dumbbell / Barbell / Plate)", "Ridicări frontale (gantere / bară / disc)", "shoulders", ["chest"], "dumbbell", I],
  ["Rear Delt Flyes (Dumbbell)", "Fluturări inverse cu gantere (deltoid posterior)", "shoulders", ["back", "traps"], "dumbbell", I],
  ["Upright Row (Barbell / EZ Bar)", "Ramat vertical (bară / bară EZ)", "shoulders", ["traps", "biceps"], "barbell", C],
  ["Upright Row (Dumbbell)", "Ramat vertical cu gantere", "shoulders", ["traps", "biceps"], "dumbbell", C],
  ["Overhead Press (Smith Machine)", "Împins deasupra capului la Smith", "shoulders", ["triceps"], "smith_machine", C],
  ["Shoulder Press (Hammer Strength / Plate Loaded)", "Presă umeri (Hammer Strength / discuri)", "shoulders", ["triceps"], "plate_loaded", C],
  ["Shoulder Press (Hoist Machine)", "Presă umeri la aparat Hoist", "shoulders", ["triceps"], "machine", C],
  ["Lateral Raises (Cable - Single Arm)", "Ridicări laterale la scripete, un braț", "shoulders", [], "cable", I],
  ["Lateral Raises (Cable - Dual Arm)", "Ridicări laterale la scripete, ambele brațe", "shoulders", [], "cable", I],
  ["Lateral Raises (Machine)", "Ridicări laterale la aparat", "shoulders", [], "machine", I],
  ["Front Raises (Cable - Rope / Straight Bar)", "Ridicări frontale la scripete (coardă / bară dreaptă)", "shoulders", ["chest"], "cable", I],
  ["Rear Delt Reverse Pec Deck (Machine)", "Fluturări inverse la aparat (Pec Deck invers)", "shoulders", ["back", "traps"], "machine", I],
  ["Rear Delt Face Pulls (Cable - Rope)", "Face Pull la scripete cu coardă", "shoulders", ["back", "traps"], "cable", I],
  ["Rear Delt Flyes (Cable - Dual High Pulley)", "Fluturări inverse la scripeți (deltoid posterior)", "shoulders", ["back", "traps"], "cable", I],
  ["Pike Push-ups (Bodyweight)", "Flotări Pike", "shoulders", ["triceps", "chest"], "bodyweight", C],

  // --- Triceps ---
  ["Close-Grip Bench Press (Barbell)", "Împins la piept priză îngustă cu bara", "triceps", ["chest", "shoulders"], "barbell", C],
  ["Skull Crushers (EZ Bar / Barbell)", "Skull Crushers (bară EZ / bară)", "triceps", [], "ez_bar", I],
  ["Skull Crushers (Dumbbell)", "Skull Crushers cu gantere", "triceps", [], "dumbbell", I],
  ["Overhead Triceps Extension (Dumbbell - Single/Double)", "Extensie triceps deasupra capului cu ganteră (una / două mâini)", "triceps", [], "dumbbell", I],
  ["Triceps Kickbacks (Dumbbell)", "Kickbacks triceps cu ganteră", "triceps", [], "dumbbell", I],
  ["Dips (Bodyweight)", "Dips la paralele", "triceps", ["chest", "shoulders"], "bodyweight", C],
  ["Dips (Weighted)", "Dips la paralele cu greutate", "triceps", ["chest", "shoulders"], "bodyweight", C],
  ["Triceps Pushdown (Cable - Straight Bar)", "Extensii triceps la scripete cu bară dreaptă", "triceps", [], "cable", I],
  ["Triceps Pushdown (Cable - V-Bar)", "Extensii triceps la scripete cu bară V", "triceps", [], "cable", I],
  ["Triceps Pushdown (Cable - Rope)", "Extensii triceps la scripete cu coardă", "triceps", [], "cable", I],
  ["Triceps Pushdown (Cable - Reverse Grip)", "Extensii triceps la scripete, priză inversă", "triceps", ["forearms"], "cable", I],
  ["Overhead Triceps Extension (Cable - Rope)", "Extensie triceps deasupra capului la scripete cu coardă", "triceps", [], "cable", I],
  ["Overhead Triceps Extension (Cable - V-Bar / Straight Bar)", "Extensie triceps deasupra capului la scripete (bară V / dreaptă)", "triceps", [], "cable", I],
  ["Triceps Kickbacks (Cable)", "Kickbacks triceps la scripete", "triceps", [], "cable", I],
  ["Dips (Assisted Machine)", "Dips asistate la aparat", "triceps", ["chest", "shoulders"], "machine", C],
  ["Triceps Press (Machine)", "Presă triceps la aparat", "triceps", [], "machine", I],
  ["Triceps Extension (Hoist Machine)", "Extensie triceps la aparat Hoist", "triceps", [], "machine", I],
  ["Close-Grip Push-ups (Bodyweight)", "Flotări priză îngustă", "triceps", ["chest", "shoulders"], "bodyweight", C],
  ["Bench Dips (Bodyweight)", "Dips pe bancă", "triceps", ["chest", "shoulders"], "bodyweight", C],
  ["JM Press (Barbell)", "JM Press cu bara", "triceps", ["chest"], "barbell", C],
  ["Overhead Triceps Extension (EZ Bar)", "Extensie triceps deasupra capului cu bara EZ", "triceps", [], "ez_bar", I],
  ["Triceps Pushdown (Cable - Single Arm)", "Extensii triceps la scripete, un braț", "triceps", [], "cable", I],

  // --- Back ---
  ["Deadlift (Conventional Barbell)", "Îndreptări clasice cu bara", "back", ["glutes", "hamstrings", "lower_back", "traps", "forearms"], "barbell", C],
  ["Deadlift (Sumo Barbell)", "Îndreptări sumo cu bara", "back", ["glutes", "quads", "adductors", "hamstrings"], "barbell", C],
  ["Deadlift (Trap/Hex Bar)", "Îndreptări cu bara hexagonală", "back", ["quads", "glutes", "hamstrings", "traps"], "trap_bar", C],
  ["Rack Pull (Barbell)", "Rack Pull cu bara", "back", ["traps", "glutes", "lower_back", "forearms"], "barbell", C],
  ["Bent Over Row (Barbell)", "Ramat aplecat cu bara", "back", ["biceps", "lower_back", "shoulders"], "barbell", C],
  ["Underhand Bent Over Row (Barbell)", "Ramat aplecat cu bara, priză supinată", "back", ["biceps", "lower_back"], "barbell", C],
  ["Pendlay Row (Barbell)", "Ramat Pendlay cu bara", "back", ["biceps", "lower_back", "shoulders"], "barbell", C],
  ["Single Arm Row (Dumbbell)", "Ramat cu ganteră, un braț", "back", ["biceps", "shoulders"], "dumbbell", C],
  ["Incline Chest-Supported Row (Dumbbell)", "Ramat cu gantere, piept sprijinit pe bancă înclinată", "back", ["biceps", "shoulders", "traps"], "dumbbell", C],
  ["Seal Row (Barbell / Dumbbell)", "Seal Row (bară / gantere)", "back", ["biceps", "shoulders", "traps"], "barbell", C],
  ["T-Bar Row (Landmine / Free)", "Ramat T-Bar (Landmine / liber)", "back", ["biceps", "lower_back", "traps"], "barbell", C],
  ["Meadows Row (Landmine)", "Ramat Meadows (Landmine)", "back", ["biceps", "shoulders"], "barbell", C],
  ["Inverted Row (Bodyweight)", "Ramat inversat cu greutatea corpului", "back", ["biceps", "shoulders", "abs"], "bodyweight", C],
  ["Pull-ups (Pronated Grip)", "Tracțiuni la bară, priză pronată", "back", ["biceps", "forearms"], "bodyweight", C],
  ["Chin-ups (Supinated Grip)", "Tracțiuni la bară, priză supinată", "back", ["biceps", "forearms"], "bodyweight", C],
  ["Neutral Grip Pull-ups", "Tracțiuni la bară, priză neutră", "back", ["biceps", "forearms"], "bodyweight", C],
  ["Weighted Pull-ups", "Tracțiuni la bară cu greutate", "back", ["biceps", "forearms"], "bodyweight", C],
  ["Lat Pulldown (Cable - Wide Grip)", "Tracțiuni la helcometru, priză largă", "back", ["biceps", "shoulders"], "cable", C],
  ["Lat Pulldown (Cable - Close Grip / V-Handle)", "Tracțiuni la helcometru, priză îngustă / mâner V", "back", ["biceps"], "cable", C],
  ["Lat Pulldown (Cable - Reverse Grip)", "Tracțiuni la helcometru, priză inversă", "back", ["biceps"], "cable", C],
  ["Lat Pulldown (Cable - Single Arm)", "Tracțiuni la helcometru, un braț", "back", ["biceps"], "cable", C],
  ["Front Pulldown (Hammer Strength / Plate Loaded)", "Tracțiuni frontale (Hammer Strength / discuri)", "back", ["biceps"], "plate_loaded", C],
  ["Lat Pulldown (Hoist Machine)", "Tracțiuni la aparat Hoist", "back", ["biceps"], "machine", C],
  ["Seated Cable Row (V-Handle)", "Ramat la scripete, așezat, mâner V", "back", ["biceps", "traps"], "cable", C],
  ["Seated Cable Row (Wide Grip)", "Ramat la scripete, așezat, priză largă", "back", ["biceps", "traps", "shoulders"], "cable", C],
  ["Single-Arm Cable Row", "Ramat la scripete, un braț", "back", ["biceps", "shoulders"], "cable", C],
  ["Chest-Supported T-Bar Row (Machine)", "Ramat T-Bar cu piept sprijinit, la aparat", "back", ["biceps", "traps"], "machine", C],
  ["Low Row (Hammer Strength / Plate Loaded)", "Ramat jos (Hammer Strength / discuri)", "back", ["biceps", "traps"], "plate_loaded", C],
  ["Mid Row (Hoist Machine)", "Ramat la mijloc, aparat Hoist", "back", ["biceps", "traps"], "machine", C],
  ["High Row (Machine / Plate Loaded)", "Ramat sus (aparat / discuri)", "back", ["biceps", "shoulders"], "machine", C],
  ["Straight Arm Lat Pulldown (Cable - Rope / Straight Bar)", "Pullover la scripete cu brațele întinse (coardă / bară)", "back", ["triceps"], "cable", I],
  ["Machine Pullover", "Pullover la aparat", "back", ["chest", "triceps"], "machine", I],
  ["Assisted Pull-up (Machine)", "Tracțiuni asistate la aparat", "back", ["biceps"], "machine", C],
  ["Back Extension (Bodyweight)", "Extensii lombare (greutatea corpului)", "lower_back", ["glutes", "hamstrings"], "bodyweight", C],
  ["Back Extension (Machine)", "Extensii lombare la aparat", "lower_back", ["glutes", "hamstrings"], "machine", C],

  // --- Traps ---
  ["Shrugs (Barbell)", "Shrugs (ridicări de umeri) cu bara", "traps", ["forearms"], "barbell", I],
  ["Shrugs (Dumbbell)", "Shrugs (ridicări de umeri) cu gantere", "traps", ["forearms"], "dumbbell", I],
  ["Shrugs (Smith Machine)", "Shrugs (ridicări de umeri) la Smith", "traps", ["forearms"], "smith_machine", I],
  ["Shrugs (Trap/Hex Bar)", "Shrugs (ridicări de umeri) cu bara hexagonală", "traps", ["forearms"], "trap_bar", I],
  ["Shrugs (Cable)", "Shrugs (ridicări de umeri) la scripete", "traps", [], "cable", I],

  // --- Biceps ---
  ["Bicep Curls (Barbell)", "Flexii biceps cu bara", "biceps", ["forearms"], "barbell", I],
  ["Bicep Curls (EZ Bar)", "Flexii biceps cu bara EZ", "biceps", ["forearms"], "ez_bar", I],
  ["Alternating Bicep Curls (Dumbbell)", "Flexii biceps alternative cu gantere", "biceps", ["forearms"], "dumbbell", I],
  ["Simultaneous Bicep Curls (Dumbbell)", "Flexii biceps simultane cu gantere", "biceps", ["forearms"], "dumbbell", I],
  ["Hammer Curls (Dumbbell)", "Flexii ciocan cu gantere", "biceps", ["forearms"], "dumbbell", I],
  ["Cross-Body Hammer Curls (Dumbbell)", "Flexii ciocan peste corp cu gantere", "biceps", ["forearms"], "dumbbell", I],
  ["Incline Bicep Curls (Dumbbell)", "Flexii biceps pe bancă înclinată cu gantere", "biceps", ["forearms"], "dumbbell", I],
  ["Spider Curls (Dumbbell / EZ Bar)", "Spider Curls (gantere / bară EZ)", "biceps", [], "dumbbell", I],
  ["Preacher Curls (EZ Bar)", "Flexii la banca Scott cu bara EZ", "biceps", ["forearms"], "ez_bar", I],
  ["Preacher Curls (Dumbbell)", "Flexii la banca Scott cu ganteră", "biceps", ["forearms"], "dumbbell", I],
  ["Concentration Curls (Dumbbell)", "Flexii concentrate cu ganteră", "biceps", [], "dumbbell", I],
  ["Zottman Curls (Dumbbell)", "Flexii Zottman cu gantere", "biceps", ["forearms"], "dumbbell", I],
  ["Drag Curls (Barbell)", "Drag Curls cu bara", "biceps", ["forearms"], "barbell", I],
  ["Reverse Curls (Barbell / EZ Bar)", "Flexii inverse (bară / bară EZ)", "forearms", ["biceps"], "barbell", I],
  ["Bicep Curls (Cable - Straight Bar)", "Flexii biceps la scripete cu bară dreaptă", "biceps", ["forearms"], "cable", I],
  ["Bicep Curls (Cable - Rope)", "Flexii biceps la scripete cu coardă", "biceps", ["forearms"], "cable", I],
  ["Bicep Curls (Cable - Single Arm D-Handle)", "Flexii biceps la scripete, un braț, mâner D", "biceps", [], "cable", I],
  ["Hammer Curls (Cable - Rope)", "Flexii ciocan la scripete cu coardă", "biceps", ["forearms"], "cable", I],
  ["High Pulley Bicep Curls / Crucifix Curls (Cable)", "Flexii biceps la scripete sus / Crucifix Curls", "biceps", [], "cable", I],
  ["Bayesian Curls (Cable)", "Flexii Bayesian la scripete", "biceps", [], "cable", I],
  ["Preacher Curl (Machine)", "Flexii la banca Scott, aparat", "biceps", [], "machine", I],
  ["Preacher Curl (Hoist Machine)", "Flexii la banca Scott, aparat Hoist", "biceps", [], "machine", I],
  ["Bicep Curl (Hammer Strength / Plate Loaded)", "Flexii biceps (Hammer Strength / discuri)", "biceps", [], "plate_loaded", I],
  ["Behind-the-back Cable Curls", "Flexii la scripete cu brațul în spatele corpului", "biceps", [], "cable", I],

  // --- Forearms ---
  ["Wrist Curls (Barbell / Dumbbell)", "Flexii de încheietură (bară / ganteră)", "forearms", [], "barbell", I],
  ["Reverse Wrist Curls (Barbell / Dumbbell)", "Extensii de încheietură (bară / ganteră)", "forearms", [], "barbell", I],
  ["Wrist Curls (Cable)", "Flexii de încheietură la scripete", "forearms", [], "cable", I],
  ["Reverse Curls (Cable)", "Flexii inverse la scripete", "forearms", ["biceps"], "cable", I],
  ["Wrist Roller", "Rulou pentru antebrațe", "forearms", [], "other", I],
  ["Plate Pinch (Plates)", "Menținere discuri cu priză în clește", "forearms", [], "other", S],
  ["Dead Hang (Bodyweight)", "Atârnat la bară", "forearms", ["back", "shoulders"], "bodyweight", S],

  // --- Quads / Legs ---
  ["Squat (Barbell - High Bar)", "Genuflexiuni cu bara pe trapez (High Bar)", "quads", ["glutes", "adductors", "lower_back"], "barbell", C],
  ["Squat (Barbell - Low Bar)", "Genuflexiuni cu bara jos pe spate (Low Bar)", "quads", ["glutes", "hamstrings", "adductors", "lower_back"], "barbell", C],
  ["Front Squat (Barbell)", "Genuflexiuni frontale cu bara", "quads", ["glutes", "abs"], "barbell", C],
  ["Box Squat (Barbell)", "Genuflexiuni la cutie cu bara", "quads", ["glutes", "hamstrings"], "barbell", C],
  ["Zercher Squat (Barbell)", "Genuflexiuni Zercher cu bara", "quads", ["glutes", "abs", "biceps"], "barbell", C],
  ["Goblet Squat (Dumbbell / Kettlebell)", "Genuflexiuni Goblet (ganteră / kettlebell)", "quads", ["glutes", "abs"], "dumbbell", C],
  ["Bodyweight Squats", "Genuflexiuni cu greutatea corpului", "quads", ["glutes"], "bodyweight", C],
  ["Bulgarian Split Squats (Dumbbell / Barbell)", "Genuflexiuni bulgărești (gantere / bară)", "quads", ["glutes", "adductors"], "dumbbell", C],
  ["Split Squats (Dumbbell)", "Genuflexiuni split cu gantere", "quads", ["glutes", "adductors"], "dumbbell", C],
  ["Walking Lunges (Dumbbell / Barbell)", "Fandări în mers (gantere / bară)", "quads", ["glutes", "hamstrings"], "dumbbell", C],
  ["Reverse Lunges (Dumbbell / Barbell)", "Fandări înapoi (gantere / bară)", "quads", ["glutes", "hamstrings"], "dumbbell", C],
  ["Lateral Lunges (Dumbbell)", "Fandări laterale cu gantere", "quads", ["glutes", "adductors"], "dumbbell", C],
  ["Step-ups (Dumbbell / Box)", "Urcări pe cutie (gantere / cutie)", "quads", ["glutes", "hamstrings"], "dumbbell", C],
  ["Sissy Squats (Bodyweight / Machine)", "Sissy Squats (greutatea corpului / aparat)", "quads", [], "bodyweight", I],
  ["Wall Sit (Bodyweight)", "Poziția scaunului la perete", "quads", ["glutes"], "bodyweight", S],
  ["Squat (Smith Machine)", "Genuflexiuni la Smith", "quads", ["glutes", "adductors"], "smith_machine", C],
  ["Leg Press (45 Degree)", "Presă picioare la 45 de grade", "quads", ["glutes", "adductors", "hamstrings"], "machine", C],
  ["Leg Press (Horizontal / Seated)", "Presă picioare orizontală / așezat", "quads", ["glutes", "adductors", "hamstrings"], "machine", C],
  ["Leg Press (Single Leg)", "Presă picioare, un picior", "quads", ["glutes", "adductors", "hamstrings"], "machine", C],
  ["Hack Squat (Machine)", "Hack Squat la aparat", "quads", ["glutes"], "machine", C],
  ["Pendulum Squat (Machine)", "Genuflexiuni pendul la aparat", "quads", ["glutes"], "machine", C],
  ["V-Squat (Machine)", "V-Squat la aparat", "quads", ["glutes"], "machine", C],
  ["Leg Extension (Machine)", "Extensii de picioare (cvadriceps) la aparat", "quads", [], "machine", I],
  ["Leg Extension (Hoist Machine)", "Extensii de picioare (cvadriceps) la aparat Hoist", "quads", [], "machine", I],
  ["Leg Extension (Single Leg Machine)", "Extensii de picioare (cvadriceps) la aparat, un picior", "quads", [], "machine", I],

  // --- Hamstrings ---
  ["Romanian Deadlift / RDL (Barbell)", "Îndreptări românești / RDL (bară)", "hamstrings", ["glutes", "lower_back"], "barbell", C],
  ["Romanian Deadlift / RDL (Dumbbell)", "Îndreptări românești / RDL (gantere)", "hamstrings", ["glutes", "lower_back"], "dumbbell", C],
  ["Romanian Deadlift (Smith Machine)", "Îndreptări românești la Smith", "hamstrings", ["glutes", "lower_back"], "smith_machine", C],
  ["Single-Leg Romanian Deadlift (Dumbbell)", "Îndreptări românești pe un picior cu gantere", "hamstrings", ["glutes", "lower_back", "abs"], "dumbbell", C],
  ["Stiff-Legged Deadlift (Barbell)", "Îndreptări cu picioarele drepte (bară)", "hamstrings", ["glutes", "lower_back"], "barbell", C],
  ["Good Mornings (Barbell)", "Good Mornings cu bara", "hamstrings", ["glutes", "lower_back"], "barbell", C],
  ["Seated Leg Curl (Machine)", "Flexii femurale la aparat, așezat", "hamstrings", ["calves"], "machine", I],
  ["Lying Leg Curl (Machine)", "Flexii femurale la aparat, culcat", "hamstrings", ["calves"], "machine", I],
  ["Standing Single Leg Curl (Machine)", "Flexii femurale la aparat, în picioare, un picior", "hamstrings", ["calves"], "machine", I],
  ["Nordic Hamstring Curl (Bodyweight)", "Flexii nordice pentru femurali", "hamstrings", ["glutes", "calves"], "bodyweight", C],
  ["Glute Ham Raise (GHR Machine)", "Glute Ham Raise la aparat", "hamstrings", ["glutes", "lower_back"], "machine", C],

  // --- Glutes ---
  ["Hip Thrust (Barbell)", "Hip Thrust cu bara", "glutes", ["hamstrings", "quads", "adductors"], "barbell", C],
  ["Hip Thrust (Dumbbell)", "Hip Thrust cu ganteră", "glutes", ["hamstrings", "quads"], "dumbbell", C],
  ["Hip Thrust (Smith Machine)", "Hip Thrust la Smith", "glutes", ["hamstrings", "quads"], "smith_machine", C],
  ["Hip Thrust (Machine)", "Hip Thrust la aparat", "glutes", ["hamstrings", "quads"], "machine", C],
  ["Single-Leg Hip Thrust (Bodyweight)", "Hip Thrust pe un picior", "glutes", ["hamstrings"], "bodyweight", C],
  ["Glute Bridge (Barbell / Bodyweight)", "Pod pentru fesieri (bară / greutatea corpului)", "glutes", ["hamstrings"], "barbell", C],
  ["Kettlebell Swings", "Swing cu kettlebell", "glutes", ["hamstrings", "lower_back", "shoulders"], "kettlebell", C],
  ["Sumo Squat (Dumbbell)", "Genuflexiuni sumo cu ganteră", "glutes", ["quads", "adductors"], "dumbbell", C],
  ["Glute Kickbacks (Cable)", "Kickbacks pentru fesieri la scripete", "glutes", ["hamstrings"], "cable", I],
  ["Glute Kickbacks (Machine)", "Kickbacks pentru fesieri la aparat", "glutes", ["hamstrings"], "machine", I],
  ["Donkey Kicks (Bodyweight)", "Donkey Kicks", "glutes", ["hamstrings"], "bodyweight", I],
  ["Fire Hydrants (Bodyweight)", "Fire Hydrants", "glutes", ["abductors"], "bodyweight", I],
  ["Cable Pull-throughs (Rope)", "Pull-through la scripete cu coardă", "glutes", ["hamstrings", "lower_back"], "cable", C],
  ["Hip Abductor (Machine - Outward)", "Abducții șold la aparat (spre exterior)", "abductors", ["glutes"], "machine", I],
  ["Hip Abductor (Cable)", "Abducții șold la scripete", "abductors", ["glutes"], "cable", I],
  ["Banded Lateral Walks (Resistance Band)", "Mers lateral cu bandă elastică", "abductors", ["glutes"], "band", I],
  ["Hip Adductor (Machine - Inward)", "Adducții șold la aparat (spre interior)", "adductors", [], "machine", I],
  ["Reverse Hyperextensions", "Hiperextensii inverse", "glutes", ["hamstrings", "lower_back"], "machine", I],

  // --- Calves ---
  ["Standing Calf Raises (Machine)", "Ridicări pe vârfuri în picioare la aparat", "calves", [], "machine", I],
  ["Standing Calf Raises (Smith Machine)", "Ridicări pe vârfuri în picioare la Smith", "calves", [], "smith_machine", I],
  ["Standing Calf Raises (Dumbbell / Single Leg)", "Ridicări pe vârfuri în picioare (ganteră / un picior)", "calves", [], "dumbbell", I],
  ["Seated Calf Raises (Machine - Plate Loaded)", "Ridicări pe vârfuri așezat (aparat cu discuri)", "calves", [], "plate_loaded", I],
  ["Seated Calf Raises (Machine - Pin Loaded)", "Ridicări pe vârfuri așezat (aparat cu placă)", "calves", [], "machine", I],
  ["Seated Calf Raises (Dumbbell)", "Ridicări pe vârfuri așezat cu gantere", "calves", [], "dumbbell", I],
  ["Leg Press Calf Raises", "Ridicări pe vârfuri la presa de picioare", "calves", [], "machine", I],
  ["Donkey Calf Raises (Machine / Free)", "Donkey Calf Raises (aparat / liber)", "calves", [], "machine", I],
  ["Calf Raises (Bodyweight)", "Ridicări pe vârfuri cu greutatea corpului", "calves", [], "bodyweight", I],

  // --- Abs / Core ---
  ["Crunches (Bodyweight)", "Crunch-uri", "abs", [], "bodyweight", I],
  ["Decline Crunches", "Crunch-uri pe plan înclinat", "abs", [], "bodyweight", I],
  ["Crunch (Machine)", "Crunch la aparat", "abs", [], "machine", I],
  ["Crunch (Hoist Machine)", "Crunch la aparat Hoist", "abs", [], "machine", I],
  ["Cable Crunches (Rope)", "Crunch la scripete cu coardă", "abs", [], "cable", I],
  ["Sit-ups (Bodyweight)", "Abdomene (Sit-ups)", "abs", [], "bodyweight", C],
  ["Reverse Crunches (Bodyweight)", "Crunch-uri inverse", "abs", [], "bodyweight", I],
  ["V-Ups (Bodyweight)", "V-Ups", "abs", [], "bodyweight", C],
  ["Hanging Leg Raises (Straight Legs)", "Ridicări de picioare din atârnat (picioare drepte)", "abs", ["forearms"], "bodyweight", C],
  ["Hanging Knee Raises", "Ridicări de genunchi din atârnat", "abs", ["forearms"], "bodyweight", C],
  ["Toes-to-Bar", "Toes-to-Bar", "abs", ["forearms", "back"], "bodyweight", C],
  ["Hanging Windshield Wipers", "Ștergătoare din atârnat", "abs", ["forearms"], "bodyweight", C],
  ["Captain's Chair Leg Raises", "Ridicări de picioare la scaunul căpitanului", "abs", [], "bodyweight", C],
  ["Lying Leg Raises", "Ridicări de picioare culcat", "abs", [], "bodyweight", I],
  ["Flutter Kicks (Bodyweight)", "Flutter Kicks", "abs", [], "bodyweight", I],
  ["Plank (Bodyweight / Weighted)", "Plank (greutatea corpului / cu greutate)", "abs", ["shoulders"], "bodyweight", S],
  ["Side Plank (Bodyweight)", "Plank lateral", "abs", ["shoulders"], "bodyweight", S],
  ["Hollow Body Hold (Bodyweight)", "Menținere Hollow Body", "abs", [], "bodyweight", S],
  ["L-Sit Hold (Bodyweight)", "Menținere L-Sit", "abs", ["triceps", "shoulders"], "bodyweight", S],
  ["Dead Bug (Bodyweight)", "Dead Bug", "abs", [], "bodyweight", I],
  ["Bird Dog (Bodyweight)", "Bird Dog", "abs", ["lower_back", "glutes"], "bodyweight", I],
  ["Dragon Flag (Bodyweight)", "Dragon Flag", "abs", [], "bodyweight", C],
  ["Mountain Climbers (Bodyweight)", "Mountain Climbers", "abs", ["shoulders", "quads"], "bodyweight", C],
  ["Ab Wheel Rollouts", "Rulări cu roata abdominală", "abs", ["shoulders", "back"], "other", C],
  ["Russian Twists (Dumbbell / Medicine Ball)", "Răsuciri rusești (ganteră / minge medicinală)", "abs", [], "dumbbell", I],
  ["Dumbbell Side Bend", "Flexii laterale cu ganteră", "abs", [], "dumbbell", I],
  ["Cable Woodchoppers (High to Low)", "Woodchoppers la scripete (de sus în jos)", "abs", ["shoulders"], "cable", C],
  ["Cable Woodchoppers (Low to High)", "Woodchoppers la scripete (de jos în sus)", "abs", ["shoulders"], "cable", C],
  ["Pallof Press (Cable)", "Pallof Press la scripete", "abs", ["shoulders"], "cable", S],
  ["Bicycle Crunches", "Crunch-uri bicicletă", "abs", [], "bodyweight", I],

  // --- Full body ---
  ["Power Clean (Barbell)", "Power Clean cu bara", "full_body", ["back", "traps", "quads", "glutes", "shoulders"], "barbell", O],
  ["Clean and Jerk (Barbell)", "Clean and Jerk cu bara", "full_body", ["shoulders", "quads", "glutes", "traps"], "barbell", O],
  ["Snatch (Barbell)", "Snatch (Smuls) cu bara", "full_body", ["shoulders", "quads", "glutes", "back"], "barbell", O],
  ["Thrusters (Barbell / Dumbbell)", "Thrusters (bară / gantere)", "full_body", ["quads", "shoulders", "glutes", "triceps"], "barbell", C],
  ["Wall Balls", "Wall Balls", "full_body", ["quads", "shoulders", "glutes"], "other", C],
  ["Burpees", "Burpees", "full_body", ["chest", "quads", "shoulders", "triceps"], "bodyweight", C],
  ["Farmer's Walk (Dumbbells / Kettlebells)", "Mersul fermierului (gantere / kettlebells)", "full_body", ["forearms", "traps", "abs"], "dumbbell", C],
];

export const EXERCISE_CATALOG: readonly ExerciseDefinition[] = ROWS.map(
  ([id, ro, primary, secondary, equipment, type]) => ({
    id, ro, primary, secondary, equipment, type, group: GROUP_BY_MUSCLE[primary],
  }),
);

export type CardioDefinition = { id: string; ro: string; intensity: "LISS" | "HIIT" | "other" };

type CardioRow = [id: string, ro: string, intensity: CardioDefinition["intensity"]];

const CARDIO_ROWS: CardioRow[] = [
  ["Outdoor Walk - LISS", "Mers în aer liber - LISS", "LISS"],
  ["Outdoor Running - LISS", "Alergare în aer liber - LISS", "LISS"],
  ["Outdoor Running - HIIT / Sprints", "Alergare în aer liber - HIIT / sprinturi", "HIIT"],
  ["Treadmill - LISS (Walking / Jogging)", "Bandă de alergare - LISS (mers / jogging)", "LISS"],
  ["Treadmill - HIIT (Sprints)", "Bandă de alergare - HIIT (sprinturi)", "HIIT"],
  ["Treadmill - Incline Walk (12-3-30)", "Bandă de alergare - mers pe înclinare (12-3-30)", "LISS"],
  ["Stationary Bike - LISS", "Bicicletă staționară - LISS", "LISS"],
  ["Stationary Bike - HIIT", "Bicicletă staționară - HIIT", "HIIT"],
  ["Assault Bike / Air Bike - HIIT", "Assault Bike / Air Bike - HIIT", "HIIT"],
  ["Rowing Machine / Ergometer - LISS", "Aparat de vâslit / ergometru - LISS", "LISS"],
  ["Rowing Machine / Ergometer - HIIT", "Aparat de vâslit / ergometru - HIIT", "HIIT"],
  ["Stairmaster / Step Machine - LISS", "Stairmaster / aparat de trepte - LISS", "LISS"],
  ["Stairmaster / Step Machine - HIIT", "Stairmaster / aparat de trepte - HIIT", "HIIT"],
  ["Elliptical / Cross Trainer - LISS", "Orbitrek / aparat eliptic - LISS", "LISS"],
  ["Elliptical / Cross Trainer - HIIT", "Orbitrek / aparat eliptic - HIIT", "HIIT"],
  ["SkiErg - HIIT", "SkiErg - HIIT", "HIIT"],
  ["Jump Rope / Skipping", "Coardă de sărit", "other"],
  ["Swimming - LISS", "Înot - LISS", "LISS"],
  ["Swimming - HIIT", "Înot - HIIT", "HIIT"],
  ["Outdoor Cycling - LISS", "Ciclism în aer liber - LISS", "LISS"],
  ["Outdoor Cycling - HIIT", "Ciclism în aer liber - HIIT", "HIIT"],
  ["Hiking - LISS", "Drumeție - LISS", "LISS"],
  ["Rucking - LISS", "Mers cu rucsac încărcat - LISS", "LISS"],
  ["Battle Ropes - HIIT", "Corzi de luptă (Battle Ropes) - HIIT", "HIIT"],
  ["Sled Push / Pull - HIIT", "Împins / tras sanie (Sled) - HIIT", "HIIT"],
  ["Boxing / Shadow Boxing - HIIT", "Box / box în gol - HIIT", "HIIT"],
];

export const CARDIO_CATALOG: readonly CardioDefinition[] = CARDIO_ROWS.map(([id, ro, intensity]) => ({
  id, ro, intensity,
}));

const exerciseById = new Map(EXERCISE_CATALOG.map((exercise) => [exercise.id, exercise]));
const cardioById = new Map(CARDIO_CATALOG.map((activity) => [activity.id, activity]));

export function getExercise(id: string): ExerciseDefinition | undefined {
  return exerciseById.get(id);
}

// Unknown ids (custom or removed exercises) fall back to the stored name, so history never breaks.
export function exerciseName(id: string, language: "ro" | "en"): string {
  return language === "ro" ? exerciseById.get(id)?.ro ?? id : id;
}

export type NamePair = { primary: string; secondary: string | null };

// Main name in the UI language plus the other language as a smaller second line. The English id is the
// original, so a Romanian user always sees it too; there is no second line when both names are the same.
function namePair(id: string, ro: string | undefined, language: "ro" | "en"): NamePair {
  const other = ro ?? id;
  if (language === "ro") return { primary: other, secondary: other === id ? null : id };
  return { primary: id, secondary: other === id ? null : other };
}

export function exerciseNamePair(id: string, language: "ro" | "en"): NamePair {
  return namePair(id, exerciseById.get(id)?.ro, language);
}

export function cardioNamePair(id: string, language: "ro" | "en"): NamePair {
  return namePair(id, cardioById.get(id)?.ro, language);
}

export function cardioName(id: string, language: "ro" | "en"): string {
  return language === "ro" ? cardioById.get(id)?.ro ?? id : id;
}

function fold(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

// Search works in both languages and ignores diacritics, whichever language the UI is in.
function matchesQuery(names: string[], query: string) {
  const needle = fold(query.trim());
  return !needle || names.some((name) => fold(name).includes(needle));
}

export function matchesExerciseQuery(id: string, query: string) {
  return matchesQuery([id, exerciseById.get(id)?.ro ?? ""], query);
}

export function matchesCardioQuery(id: string, query: string) {
  return matchesQuery([id, cardioById.get(id)?.ro ?? ""], query);
}
