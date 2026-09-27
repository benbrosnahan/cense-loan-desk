"use client";

// Cense Loan Desk — shared primitives. Created with Claude Code.
//
// Type floor is 13px, body and inputs are 16px. The 16px input size is not a
// style choice: iOS Safari zooms the page on focus for anything smaller.

import { useId, useState } from "react";
import { cn, money } from "@/lib/utils";

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-line bg-white shadow-card",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Small caps label above a section or a figure. */
export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.08em] text-slate-600",
        className
      )}
    >
      {children}
    </p>
  );
}

/**
 * A dollar figure. Everything that shows money goes through here so "Hide
 * amounts" can blur all of it at once, and so digits always line up.
 */
export function Money({
  value,
  className,
  tabular = true,
}: {
  value: number | null | undefined;
  className?: string;
  tabular?: boolean;
}) {
  return (
    <span className={cn("amt", tabular && "tnum", className)}>
      {money(value)}
    </span>
  );
}

/**
 * Every interactive control routes through here so focus, hover and target
 * size are consistent. 48px default and 40px small both clear the WCAG 2.2 AA
 * 24px target minimum with room to spare on touch.
 */
export function Button({
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        size === "sm"
          ? "min-h-[40px] px-4 py-2 text-sm"
          : "min-h-[48px] px-5 py-3 text-base",
        variant === "primary" &&
          "bg-navy text-white hover:bg-navy-hover active:bg-navy-hover",
        variant === "secondary" &&
          "border border-slate-300 bg-white text-slate-900 hover:border-navy hover:bg-slate-100",
        variant === "ghost" &&
          "text-slate-800 hover:bg-slate-100 hover:text-slate-900",
        variant === "danger" &&
          "border border-red-300 bg-white text-red-800 hover:border-red-500 hover:bg-red-50",
        className
      )}
      {...rest}
    />
  );
}

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "brand" | "warn" | "danger" | "accent" | "good";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "neutral" && "bg-slate-100 text-slate-800",
        tone === "brand" && "bg-navy text-white",
        tone === "warn" && "bg-amber-100 text-amber-900",
        tone === "danger" && "bg-red-100 text-red-900",
        // #A8531F on accent-light is 4.34:1, just under AA. #8A4213 is 5.93:1.
        tone === "accent" && "bg-accent-light text-[#8A4213]",
        tone === "good" && "bg-emerald-100 text-emerald-900",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Every tone pairs colour with an icon and a word, so hue is never the only cue. */
export function Notice({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "danger" | "good";
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const icon = { info: "i", warn: "!", danger: "!", good: "✓" }[tone];
  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        tone === "info" && "border-brand-border bg-brand-light",
        tone === "warn" && "border-amber-300 bg-amber-50",
        tone === "danger" && "border-red-300 bg-red-50",
        tone === "good" && "border-emerald-300 bg-emerald-50",
        className
      )}
    >
      <div className="flex gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
            tone === "info" && "bg-navy",
            tone === "warn" && "bg-amber-700",
            tone === "danger" && "bg-red-700",
            tone === "good" && "bg-emerald-700"
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          {title && (
            <p
              className={cn(
                "text-sm font-bold",
                tone === "info" && "text-navy",
                tone === "warn" && "text-amber-900",
                tone === "danger" && "text-red-900",
                tone === "good" && "text-emerald-900"
              )}
            >
              {title}
            </p>
          )}
          <div
            className={cn(
              "text-sm leading-relaxed",
              title && "mt-1",
              tone === "info" && "text-slate-800",
              tone === "warn" && "text-amber-900",
              tone === "danger" && "text-red-900",
              tone === "good" && "text-emerald-900"
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  hero = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  hero?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Eyebrow>{label}</Eyebrow>
      <p
        className={cn(
          "font-bold text-slate-900",
          hero
            ? "figure mt-1 text-[2.75rem] leading-none sm:text-6xl"
            : "tnum mt-1 text-xl"
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-sm text-slate-600">{sub}</p>}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  optional = false,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  /** Shown in place of the hint, and announced, once the field has a problem. */
  error?: string | null;
  htmlFor?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-bold text-slate-900"
      >
        {label}
        {optional && (
          <span className="ml-1.5 font-normal text-slate-600">optional</span>
        )}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p
          id={htmlFor ? `${htmlFor}-msg` : undefined}
          role="alert"
          className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold text-red-800"
        >
          <span aria-hidden>!</span>
          {error}
        </p>
      ) : (
        hint && (
          <p
            id={htmlFor ? `${htmlFor}-msg` : undefined}
            className="mt-1.5 text-sm leading-snug text-slate-600"
          >
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export const inputClass = cn(
  "w-full min-h-[48px] rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-900",
  "placeholder:text-slate-500 transition-colors",
  "hover:border-slate-400",
  "focus:outline-none focus:border-navy focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-1",
  "aria-[invalid=true]:border-red-600 aria-[invalid=true]:bg-red-50/40"
);

/**
 * A text input with a fixed unit on one side, "$" before or "%" after. The
 * unit is part of the field so nobody has to wonder whether to type it.
 */
export function AffixInput({
  prefix,
  suffix,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-semibold text-slate-600"
        >
          {prefix}
        </span>
      )}
      <input
        className={cn(
          inputClass,
          "tnum",
          prefix && "pl-8",
          suffix && "pr-9",
          className
        )}
        {...rest}
      />
      {suffix && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-base font-semibold text-slate-600"
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

/**
 * A short list of choices, all visible at once. Used instead of a dropdown
 * whenever there are five or fewer options, because a dropdown hides the
 * choices and costs two extra taps on a phone.
 */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 2,
  className,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string; sub?: string }[];
  onChange: (v: T) => void;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "grid gap-2",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-3",
        columns === 4 && "grid-cols-2 sm:grid-cols-4",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-[48px] rounded-2xl border px-3 py-2 text-left text-sm font-semibold leading-tight transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2",
              active
                ? "border-navy bg-navy text-white"
                : "border-slate-300 bg-white text-slate-900 hover:border-navy hover:bg-slate-100"
            )}
          >
            <span className="block">{o.label}</span>
            {o.sub && (
              <span
                className={cn(
                  "mt-0.5 block text-xs font-normal",
                  active ? "text-white/85" : "text-slate-600"
                )}
              >
                {o.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Progressive disclosure, per the W3C APG disclosure pattern.
 *
 * Used for anything secondary: the rules footnotes, and the "model a different
 * plan" control. Hidden by default keeps the primary answer uncluttered;
 * aria-expanded and aria-controls keep it findable by screen reader.
 */
export function Disclosure({
  summary,
  openSummary,
  children,
  defaultOpen = false,
  className,
}: {
  summary: string;
  openSummary?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "-mx-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-2 py-2 text-left",
          "text-sm font-semibold text-navy underline decoration-brand-border underline-offset-4",
          "transition-colors hover:bg-brand-light hover:decoration-navy",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
        )}
      >
        <Chevron open={open} />
        {open ? openSummary ?? summary : summary}
      </button>
      {open && (
        <div id={id} className="unfold pt-2">
          {children}
        </div>
      )}
    </div>
  );
}

export function Chevron({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn(
        "h-4 w-4 flex-shrink-0 transition-transform duration-200",
        open && "rotate-90",
        className
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

export function FadeIn({
  delay = 0,
  children,
  className,
}: {
  delay?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("rise", className)}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}

/**
 * The one thing to do next, at the bottom of each section. The interviews were
 * consistent on this: an order of operations beats a menu.
 */
export function NextStep({
  eyebrow = "Next",
  title,
  body,
  action,
  onClick,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "no-print group flex w-full items-center gap-4 rounded-3xl bg-navy p-5 text-left text-white",
        "transition-colors hover:bg-navy-hover",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-white/80">
          {eyebrow}
        </span>
        <span className="mt-1 block font-display text-xl font-bold leading-tight">
          {title}
        </span>
        {body && (
          <span className="mt-1 block text-sm leading-snug text-white/85">
            {body}
          </span>
        )}
        <span className="sr-only">. {action}</span>
      </span>
      <span
        aria-hidden
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white text-navy transition-transform group-hover:translate-x-0.5"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </span>
    </button>
  );
}

export interface ToastState {
  message: string;
  /** Optional undo. A toast with an action stays up longer. */
  action?: { label: string; run: () => void };
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
    >
      <div
        className="rise pointer-events-auto flex items-center gap-1 rounded-full bg-slate-900 py-1.5 pl-5 pr-1.5 text-sm font-semibold text-white shadow-lift"
      >
        <span className="py-1.5 pr-3">{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action!.run();
              onDismiss();
            }}
            className="min-h-[40px] rounded-full bg-white px-4 text-sm font-bold text-navy transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
          >
            {toast.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
