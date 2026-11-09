// Class recipes shared by client components and by server pages that render links or native controls.

import { cx, toneBorder, toneSoft, toneText, type Tone } from "./tone";

export type ButtonVariant = "primary" | "secondary" | "outline" | "soft" | "danger";

const variantClass: Record<Exclude<ButtonVariant, "soft">, string> = {
  primary: "bg-lime text-on-solid border-transparent",
  secondary: "bg-control text-foreground border-transparent",
  outline: "bg-transparent text-foreground border-line",
  danger: "bg-red text-white border-transparent",
};

// Pill button: 50px (60px when large, 40px when small), shrinks a little when pressed, half-transparent when disabled.
export function buttonClass({ variant = "primary", tone = "lime", large, small, className }: {
  variant?: ButtonVariant; tone?: Tone; large?: boolean; small?: boolean; className?: string;
} = {}) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full border font-semibold transition-transform active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    large ? "min-h-[60px] px-6 text-[17px]" : small ? "min-h-10 px-4 text-sm" : "min-h-[50px] px-5 text-[15px]",
    variant === "soft" ? cx(toneSoft[tone], toneBorder[tone]) : variantClass[variant],
    className,
  );
}

// 44px round icon button. `plain` drops the fill; a tone gives it a soft accent fill.
export function iconButtonClass({ tone, plain, className }: { tone?: Tone; plain?: boolean; className?: string } = {}) {
  return cx(
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-opacity active:opacity-60 disabled:opacity-30",
    plain ? cx("bg-transparent", tone ? toneText[tone] : "text-soft") : tone ? toneSoft[tone] : "bg-control text-soft",
    className,
  );
}

// Filled input: no border until focus. `big` is the bold centred variant for weight and reps.
// `compact` narrows the side padding for the small number fields of the set form.
export function inputClass({ big, center, compact, className }: { big?: boolean; center?: boolean; compact?: boolean; className?: string } = {}) {
  return cx(
    "min-h-[52px] w-full min-w-0 rounded-md border-[1.5px] border-transparent bg-inner text-foreground outline-none",
    compact ? "px-1" : "px-3.5",
    "transition-colors focus:border-lime focus-visible:outline-none disabled:opacity-50",
    big ? "text-[18px] font-bold" : "text-[15px]",
    (big || center) && "text-center font-bold tabular-nums",
    className,
  );
}

