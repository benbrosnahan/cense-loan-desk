// Cense Loan Desk — formatting helpers. Created with Claude Code.

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function moneyCents(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${n.toFixed(2).replace(/\.00$/, "")}%`;
}

export function years(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n) || n <= 0) return "—";
  if (n < 1) return `${Math.round(n * 12)} mo`;
  const rounded = Math.round(n * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)} yr`;
}

export function monthsLabel(n: number): string {
  if (!isFinite(n) || n <= 0) return "—";
  const y = Math.floor(n / 12);
  const m = Math.round(n % 12);
  if (y === 0) return `${m} mo`;
  if (m === 0) return `${y} yr`;
  return `${y} yr ${m} mo`;
}

/** "Aug 18, 2026" from an ISO date or timestamp. */
export function niceDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function uid(): string {
  return `l_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

/**
 * "Aug 18, 2026 at 3:42 PM". Snapshots always carry a time: two saved on the
 * same day are common, and an evidence record that cannot tell them apart is
 * not evidence.
 */
export function niceDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })} at ${d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/** "March 2034", the calendar month that falls `months` from now. */
export function monthYearFromNow(months: number, from: Date = new Date()): string {
  if (!isFinite(months) || months < 0) return "—";
  const d = new Date(from.getFullYear(), from.getMonth() + Math.round(months), 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** "Mar 2034", for chart labels and tight rows. */
export function shortMonthYearFromNow(
  months: number,
  from: Date = new Date()
): string {
  if (!isFinite(months) || months < 0) return "—";
  const d = new Date(from.getFullYear(), from.getMonth() + Math.round(months), 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** "2 years 4 months", spelled out for sentences. */
export function monthsInWords(n: number): string {
  if (!isFinite(n) || n <= 0) return "no time";
  const y = Math.floor(n / 12);
  const m = Math.round(n % 12);
  const yPart = y ? `${y} year${y === 1 ? "" : "s"}` : "";
  const mPart = m ? `${m} month${m === 1 ? "" : "s"}` : "";
  return [yPart, mPart].filter(Boolean).join(" ");
}

/** Thousands separators while typing. Digits only, so the caret never fights it. */
export function formatWholeDollars(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

/** Dollars and optional cents while typing, e.g. "2,256.40". */
export function formatDollarsInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const [whole, ...rest] = cleaned.split(".");
  const w = whole ? Number(whole).toLocaleString("en-US") : "0";
  if (!rest.length) return w;
  return `${w}.${rest.join("").slice(0, 2)}`;
}

export function parseNumber(s: string | number | null | undefined): number {
  const n = Number(String(s ?? "").replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

/** "smooth" unless the person has asked their device for less motion. */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined" || !window.matchMedia) return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";
}
