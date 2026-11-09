// Accent families from globals.css. Lime carries primary actions; the others only separate data.
// Class names are spelled out in full so Tailwind can find them.

export type Tone = "lime" | "coral" | "ice" | "lilac" | "gold" | "red";

export const toneText: Record<Tone, string> = {
  lime: "text-lime-text",
  coral: "text-coral-text",
  ice: "text-ice-text",
  lilac: "text-lilac-text",
  gold: "text-gold-text",
  red: "text-red-text",
};

export const toneSolid: Record<Tone, string> = {
  lime: "bg-lime",
  coral: "bg-coral",
  ice: "bg-ice",
  lilac: "bg-lilac",
  gold: "bg-gold",
  red: "bg-red",
};

// Soft fill with the matching text colour.
export const toneSoft: Record<Tone, string> = {
  lime: "bg-lime-soft text-lime-text",
  coral: "bg-coral-soft text-coral-text",
  ice: "bg-ice-soft text-ice-text",
  lilac: "bg-lilac-soft text-lilac-text",
  gold: "bg-gold-soft text-gold-text",
  red: "bg-red-soft text-red-text",
};

export const toneBorder: Record<Tone, string> = {
  lime: "border-lime-border",
  coral: "border-coral-border",
  ice: "border-ice-border",
  lilac: "border-lilac-border",
  gold: "border-gold-border",
  red: "border-red-border",
};

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
