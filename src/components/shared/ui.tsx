"use client";

// Cense Loan Desk — shared primitives. Created with Claude Code.

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-white shadow-sm",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * Every interactive control routes through here so focus, hover and target
 * size are consistent. Minimum height 44px on the default size clears the
 * WCAG 2.2 AA 24px target minimum with room to spare on touch.
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
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold",
        "transition-[background-color,border-color,color,box-shadow] duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "min-h-[36px] px-3 py-1.5 text-xs" : "min-h-[44px] px-4 py-2.5 text-sm",
        variant === "primary" &&
          "bg-navy text-white hover:bg-navy-hover active:bg-navy-hover",
        variant === "secondary" &&
          "border border-slate-300 bg-white text-slate-900 hover:border-navy hover:bg-slate-100",
        variant === "ghost" && "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
        variant === "danger" &&
          "border border-red-300 bg-white text-red-800 hover:bg-red-50 hover:border-red-500",
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
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
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
        "rounded-xl border p-3.5",
        tone === "info" && "border-brand-border bg-brand-light",
        tone === "warn" && "border-amber-300 bg-amber-50",
        tone === "danger" && "border-red-300 bg-red-50",
        tone === "good" && "border-emerald-300 bg-emerald-50",
        className
      )}
    >
      <div className="flex gap-2.5">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
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
                "text-xs font-bold",
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
              "text-xs leading-relaxed",
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
      <p
        className={cn(
          "font-semibold uppercase tracking-wide text-slate-600",
          hero ? "text-[11px]" : "text-[10px]"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "tnum font-bold text-slate-900",
          hero ? "mt-1 text-3xl sm:text-4xl" : "mt-0.5 text-lg"
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-600">{sub}</p>}
    </div>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-xs font-bold text-slate-900">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-[11px] text-slate-600">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export const inputClass = cn(
  "w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900",
  "placeholder:text-slate-500 transition-colors",
  "hover:border-slate-400",
  "focus:outline-none focus:border-navy focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-1"
);

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
  const reduce = useReducedMotion();

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2 py-1.5",
          "text-xs font-semibold text-navy underline decoration-brand-border underline-offset-4",
          "transition-colors hover:bg-brand-light hover:decoration-navy",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-navy focus-visible:ring-offset-2"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block text-[9px] transition-transform duration-200",
            open && "rotate-90"
          )}
        >
          ▶
        </span>
        {open ? openSummary ?? summary : summary}
      </button>
      {open && (
        <motion.div
          id={id}
          initial={reduce ? false : { opacity: 0, height: 0 }}
          animate={reduce ? undefined : { opacity: 1, height: "auto" }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="pt-2.5">{children}</div>
        </motion.div>
      )}
    </div>
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
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
