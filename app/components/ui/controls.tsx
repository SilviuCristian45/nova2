"use client";

import { forwardRef, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Check, ChevronDown, Loader2, Search, X, type LucideIcon } from "lucide-react";
import { useLanguage } from "@/app/components/language-provider";
import { buttonClass, iconButtonClass, inputClass, type ButtonVariant } from "./styles";
import { cx, type Tone } from "./tone";

// Short tap feedback on phones that support it (the web counterpart of the mobile app's haptics).
export function tap() {
  if (typeof navigator !== "undefined") navigator.vibrate?.(10);
}

type ButtonProps = Omit<ComponentProps<"button">, "onClick"> & {
  variant?: ButtonVariant; tone?: Tone; large?: boolean; small?: boolean; icon?: LucideIcon; busy?: boolean;
  // A returned promise shows the spinner and ignores further presses until it settles (no double saves).
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => unknown;
};

export function Button({ variant = "primary", tone, large, small, icon: Icon, busy, disabled, onClick, className, children, type = "button", ...rest }: ButtonProps) {
  const [running, setRunning] = useState(false);
  const loading = busy || running;
  async function press(event: React.MouseEvent<HTMLButtonElement>) {
    if (loading) {
      event.preventDefault();
      return;
    }
    if (variant === "primary" || large) tap();
    const result = onClick?.(event);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setRunning(true);
      try { await result; } finally { setRunning(false); }
    }
  }
  return (
    <button {...rest} type={type} disabled={disabled || loading} aria-busy={loading || undefined} onClick={press}
      className={buttonClass({ variant, tone, large, small, className })}>
      {loading ? <Loader2 className="size-[18px] animate-spin" /> : Icon ? <Icon className={large ? "size-5" : "size-[18px]"} /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, tone, plain, className, type = "button", ...rest }: Omit<ComponentProps<"button">, "children"> & {
  icon: LucideIcon; label: string; tone?: Tone; plain?: boolean;
}) {
  return (
    <button {...rest} type={type} aria-label={label} title={label} className={iconButtonClass({ tone, plain, className })}>
      <Icon className="size-5" />
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, ComponentProps<"input"> & { big?: boolean; center?: boolean; compact?: boolean }>(
  function Input({ big, center, compact, className, ...rest }, ref) {
    return <input ref={ref} {...rest} className={inputClass({ big, center, compact, className })} />;
  },
);

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea {...rest} className={inputClass({ className: cx("min-h-[88px] resize-y py-3", className) })} />;
}

// Pill track of options; the active one is filled lime. Use `inCard` when it sits on a card.
export function Segmented<T extends string>({ value, options, onChange, inCard, label, className }: {
  value: T; options: { value: T; label: ReactNode; icon?: LucideIcon }[]; onChange: (value: T) => void;
  inCard?: boolean; label?: string; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("flex flex-wrap gap-1 rounded-full p-1", inCard ? "bg-inner" : "bg-card", className)}>
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button key={option.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(option.value)}
            className={cx(
              "flex min-h-11 grow items-center justify-center gap-1.5 rounded-full px-2.5 text-sm font-semibold whitespace-nowrap transition-colors",
              options.length > 4 ? "basis-[22%]" : "basis-0",
              active ? "bg-lime text-on-solid" : "text-muted",
            )}>
            {Icon && <Icon className="size-4" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export type Option = { value: string; label: string; subtitle?: string };

// Looks like an input; opens a bottom sheet (a centred dialog on wide screens) with optional search.
// With `name` it also submits its value as a hidden field, so it works inside plain forms.
export function Select({ value, defaultValue, options, onChange, name, title, placeholder, searchable, required, disabled, id, className }: {
  value?: string; defaultValue?: string; options: Option[]; onChange?: (value: string) => void; name?: string;
  title?: string; placeholder?: string; searchable?: boolean; required?: boolean; disabled?: boolean; id?: string; className?: string;
}) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [own, setOwn] = useState(defaultValue ?? "");
  const [query, setQuery] = useState("");
  const current = value ?? own;
  const selected = options.find((option) => option.value === current);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? options.filter((option) => `${option.label} ${option.subtitle ?? ""}`.toLowerCase().includes(needle)) : options;
  }, [options, query]);

  function choose(next: string) {
    setOwn(next);
    onChange?.(next);
    dialog.current?.close();
  }

  // Close when the backdrop (the dialog element itself, outside the panel) is clicked.
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const onClick = (event: MouseEvent) => { if (event.target === element) element.close(); };
    element.addEventListener("click", onClick);
    return () => element.removeEventListener("click", onClick);
  }, []);

  return (
    <>
      {name && <input type="hidden" name={name} value={current} required={required} />}
      <button type="button" id={id} disabled={disabled} aria-haspopup="dialog"
        onClick={() => { setQuery(""); dialog.current?.showModal(); }}
        className={inputClass({ className: cx("flex items-center gap-2 text-left", className) })}>
        <span className="flex min-w-0 flex-1 flex-col py-1.5">
          <span className={cx("truncate font-medium", !selected && "text-placeholder")}>{selected?.label ?? placeholder ?? ""}</span>
          {selected?.subtitle && <span className="truncate text-xs text-muted">{selected.subtitle}</span>}
        </span>
        {searchable ? <Search className="size-4 shrink-0 text-muted" /> : <ChevronDown className="size-4 shrink-0 text-muted" />}
      </button>
      <dialog ref={dialog} aria-labelledby={titleId}
        className="fixed inset-x-0 bottom-0 top-auto m-0 mx-auto hidden max-h-[85vh] w-full max-w-xl flex-col rounded-t-xl bg-background p-0 text-foreground backdrop:bg-[#000000a6] open:flex sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-xl">
        <div className="flex items-center gap-2 p-4">
          <h2 id={titleId} className="flex-1 text-[17px] font-bold">{title ?? placeholder ?? ""}</h2>
          <IconButton icon={X} label={t("Închide", "Close")} onClick={() => dialog.current?.close()} />
        </div>
        {searchable && (
          <div className="px-4 pb-2">
            <Input type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Caută...", "Search...")} />
          </div>
        )}
        <div role="listbox" aria-labelledby={titleId} className="flex-1 overflow-y-auto px-3 pb-6">
          {filtered.length === 0 && <p className="p-5 text-center text-muted">{t("Niciun rezultat.", "No results.")}</p>}
          {filtered.map((option) => {
            const isSelected = option.value === current;
            return (
              <button key={option.value} type="button" role="option" aria-selected={isSelected} onClick={() => choose(option.value)}
                className={cx("flex min-h-12 w-full items-center gap-2 rounded-sm px-3 text-left transition-colors",
                  isSelected ? "bg-lime-soft text-lime-text" : "active:bg-inner")}>
                <span className="flex flex-1 flex-col py-2">
                  <span className={isSelected ? "font-bold" : ""}>{option.label}</span>
                  {option.subtitle && <span className="text-xs text-muted">{option.subtitle}</span>}
                </span>
                {isSelected && <Check className="size-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      </dialog>
    </>
  );
}
