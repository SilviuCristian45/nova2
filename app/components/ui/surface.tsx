// Server-safe building blocks: filled surfaces instead of outlines, sentence-case labels, large numbers.

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react";
import { Text } from "@/app/components/language-provider";
import { cx, toneBorder, toneSoft, toneText, type Tone } from "./tone";

// Shared page width: one column on phones, widening with the viewport. The layout's top bar and the offline strip
// use it too, so everything lines up. Wide content is arranged with `Columns` below.
export const pageWidth = "mx-auto w-full max-w-xl md:max-w-3xl lg:max-w-6xl";

// Page frame: optional back arrow + 28px title, then the content column. The dashboard passes `back={false}`.
export function Screen({ title, back = "/", right, children, className }: {
  title?: ReactNode; back?: string | false; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <main className={cx(pageWidth, "flex flex-col gap-4 p-5 pb-12 text-foreground lg:gap-5 lg:px-8", className)}>
      {(title || back) && (
        <header className="mb-2 flex items-center gap-1.5">
          {back && (
            <Link href={back} className="-ml-2.5 flex size-11 shrink-0 items-center justify-center rounded-full text-soft transition-opacity active:opacity-60">
              <ArrowLeft className="size-5" />
              <span className="sr-only"><Text ro="Înapoi" en="Back" /></span>
            </Link>
          )}
          {title ? <h1 className="min-w-0 flex-1 text-[28px] font-bold leading-tight tracking-[-0.8px]">{title}</h1> : <div className="flex-1" />}
          {right}
        </header>
      )}
      {children}
    </main>
  );
}

// Responsive grid for cards: one column on phones, `two` from md, `three` from lg (default: same as `two`).
// `top` aligns items to the top so cards of different heights don't stretch.
export function Columns({ children, className, three, top = true }: { children: ReactNode; className?: string; three?: boolean; top?: boolean }) {
  return (
    <div className={cx("grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5", three && "lg:grid-cols-3", top && "items-start", className)}>
      {children}
    </div>
  );
}

// A vertical stack of cards: one column of a `Columns` grid.
export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("flex min-w-0 flex-col gap-4 lg:gap-5", className)}>{children}</div>;
}

export function Card({ children, tone, padded = true, className, ...rest }: ComponentProps<"section"> & { tone?: Tone; padded?: boolean }) {
  return (
    <section {...rest} className={cx(
      "flex flex-col gap-3.5 rounded-lg",
      tone ? cx(toneSoft[tone], toneBorder[tone], "border") : "bg-card",
      padded ? "p-[18px]" : "gap-0 overflow-hidden",
      className,
    )}>
      {children}
    </section>
  );
}

export function Inner({ children, className, ...rest }: ComponentProps<"div">) {
  return <div {...rest} className={cx("flex flex-col gap-2 rounded-md bg-inner p-3", className)}>{children}</div>;
}

export function Label({ children, className, ...rest }: ComponentProps<"label">) {
  return <label {...rest} className={cx("pl-0.5 text-[13px] font-medium text-muted", className)}>{children}</label>;
}

// Section title inside a card (settings and similar), with an optional 13px description.
export function CardTitle({ children, description }: { children: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-[20px] font-semibold tracking-[-0.4px]">{children}</h2>
      {description && <p className="text-[13px] text-soft">{description}</p>}
    </div>
  );
}

export function Field({ label, htmlFor, children, className }: { label: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function Badge({ children, tone, className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cx("inline-flex w-fit items-center rounded-full px-[9px] py-[3px] text-[11px] font-semibold",
      tone ? toneSoft[tone] : "bg-control text-soft", className)}>
      {children}
    </span>
  );
}

export function Message({ children, tone = "red", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <div role={tone === "red" ? "alert" : "status"} className={cx("rounded-md p-3.5 text-sm font-semibold", toneSoft[tone], className)}>
      {children}
    </div>
  );
}

const barFill: Record<Tone, string> = {
  lime: "bg-lime", coral: "bg-coral", ice: "bg-ice", lilac: "bg-lilac", gold: "bg-gold", red: "bg-red",
};

export function ProgressBar({ value, tone = "lime", className }: { value: number; tone?: Tone; className?: string }) {
  const width = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-inner", className)}>
      <div className={cx("h-full rounded-full transition-[width] duration-500", barFill[tone])} style={{ width: `${width}%` }} />
    </div>
  );
}

export function Empty({ icon: Icon, children, tone = "lime" }: { icon: LucideIcon; children: ReactNode; tone?: Tone }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-lg bg-card px-5 py-10 text-center">
      <Icon className={cx("size-8 opacity-50", toneText[tone])} strokeWidth={1.75} />
      <p className="font-medium text-muted">{children}</p>
    </div>
  );
}

// Quiet text link inside a card ("Chart ›").
export function TextLink({ href, children, tone = "lime", className }: { href: string; children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <Link href={href} className={cx("inline-flex items-center gap-0.5 text-sm font-semibold transition-opacity active:opacity-60", toneText[tone], className)}>
      {children}
      <ChevronRight className="size-4" />
    </Link>
  );
}

// Large lime call to action ("Start workout", "Add meal").
export function CtaCard({ href, label, title }: { href: string; label: ReactNode; title: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-[132px] flex-col justify-between rounded-xl bg-lime p-[22px] text-on-solid transition-transform active:scale-[0.985]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[15px] font-medium opacity-65">{label}</span>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-on-solid">
          <ArrowUpRight className="size-[22px] text-lime" strokeWidth={2.25} />
        </span>
      </div>
      <span className="text-[30px] font-bold leading-tight tracking-[-1px]">{title}</span>
    </Link>
  );
}

// One card holding a list of navigation rows separated by hairlines.
export function LinkList({ items }: { items: { href: string; title: ReactNode; subtitle?: ReactNode }[] }) {
  return (
    <Card padded={false}>
      {items.map((item, index) => (
        <div key={item.href}>
          {index > 0 && <div className="mx-[18px] h-px bg-line" />}
          <Link href={item.href} className="flex items-center gap-3 px-[18px] py-4 transition-colors active:bg-inner">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[17px] font-medium">{item.title}</span>
              {item.subtitle && <span className="text-[13px] text-muted">{item.subtitle}</span>}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted" />
          </Link>
        </div>
      ))}
    </Card>
  );
}

// Big bold number followed by a muted unit or goal, aligned on the baseline.
export function BigNumber({ value, unit, className }: { value: ReactNode; unit?: ReactNode; className?: string }) {
  return (
    <p className={cx("flex flex-wrap items-baseline gap-x-2", className)}>
      <span className="text-[44px] font-bold leading-none tracking-[-1.5px] tabular-nums">{value}</span>
      {unit && <span className="text-[15px] text-muted">{unit}</span>}
    </p>
  );
}
