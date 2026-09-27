"use client";

// Cense Loan Desk — the payoff runway. Created with Claude Code.
//
// One job: show what extra money buys. Two lines on one axis, the balance with
// the extra payment and the balance without it, both running down to zero.
// The gap between where they land is the answer.
//
// Chart rules followed here, so nobody "improves" them away later:
//   * One y-axis, starting at zero. Zero is the whole point of the chart.
//   * Two series, told apart by a solid/dashed stroke as well as by colour.
//   * The takeaway is in the text above the chart and in the legend, so
//     nothing depends on hovering. Phones have no hover.
//   * A table of the same numbers sits underneath for anyone who wants it.

import { useEffect, useMemo, useRef, useState } from "react";
import { cn, money, shortMonthYearFromNow } from "@/lib/utils";
import { Disclosure, Money } from "@/components/shared/ui";

interface Props {
  /** Balance at the end of each month with the extra payment. Index 0 is today. */
  withExtra: number[];
  /** Same, paying only the required amount. Null when there is no extra. */
  requiredOnly: number[] | null;
  extra: number;
  className?: string;
}

const GREEN = "#26602D";
const BASELINE = "#5C7F5F";
const GRID = "#E4ECE0";
const AXIS_TEXT = "#4A6E4D";

const H = 232;
const PAD = { top: 14, right: 14, bottom: 30, left: 4 };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width))
    );
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A round number at or above n, for the top gridline. */
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const steps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const s of steps) if (s * mag >= n) return s * mag;
  return 10 * mag;
}

function compactMoney(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `$${Math.round(n)}`;
}

export default function PayoffRunway({
  withExtra,
  requiredOnly,
  extra,
  className,
}: Props) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const monthsMain = withExtra.length - 1;
  const monthsBase = requiredOnly ? requiredOnly.length - 1 : monthsMain;
  const lastMonth = Math.max(monthsMain, monthsBase, 1);
  const showBase = !!requiredOnly && monthsBase !== monthsMain;

  const yMax = niceCeil(
    Math.max(withExtra[0] ?? 0, requiredOnly?.[0] ?? 0, 1)
  );

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const x = (m: number) => PAD.left + (m / lastMonth) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  const path = (series: number[]) =>
    series
      .map((v, m) => `${m === 0 ? "M" : "L"}${x(m).toFixed(1)},${y(v).toFixed(1)}`)
      .join("");

  const now = useMemo(() => new Date(), []);

  // Year gridlines: January of each year, thinned until at most five labels fit.
  const yearTicks = useMemo(() => {
    const ticks: { m: number; label: string }[] = [];
    const startMonth = now.getMonth();
    const startYear = now.getFullYear();
    const totalYears = Math.ceil((lastMonth + startMonth) / 12);
    const maxLabels = width < 420 ? 4 : 6;
    const every = Math.max(1, Math.ceil(totalYears / maxLabels));
    for (let i = 1; i <= totalYears; i++) {
      const m = i * 12 - startMonth;
      if (m <= 0 || m > lastMonth) continue;
      if (i % every !== 0) continue;
      ticks.push({ m, label: String(startYear + i) });
    }
    return ticks;
  }, [lastMonth, now, width]);

  const yTicks = [yMax, yMax / 2];

  const at = (series: number[] | null, m: number) =>
    !series ? null : m < series.length ? series[m] : 0;

  const onMove = (clientX: number, target: Element) => {
    const rect = target.getBoundingClientRect();
    const ratio = (clientX - rect.left - PAD.left) / Math.max(1, innerW);
    const m = Math.round(Math.min(1, Math.max(0, ratio)) * lastMonth);
    setHover(m);
  };

  // Yearly rows for the table view, ending on the final month.
  const rows = useMemo(() => {
    const out: number[] = [];
    for (let m = 0; m <= lastMonth; m += 12) out.push(m);
    if (out[out.length - 1] !== lastMonth) out.push(lastMonth);
    return out;
  }, [lastMonth]);

  const tipLeft =
    hover === null ? 0 : Math.min(Math.max(x(hover), 90), Math.max(90, width - 90));

  return (
    <figure className={cn("m-0", className)}>
      {/* Legend. Carries the dates, so the chart needs no labels that collide. */}
      <ul className="flex flex-col gap-1.5 text-sm text-slate-800">
        <li className="flex items-center gap-2.5">
          <svg aria-hidden width="28" height="10" className="flex-shrink-0">
            <line x1="1" y1="5" x2="27" y2="5" stroke={GREEN} strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span>
            {extra > 0 ? (
              <>
                Paying <Money value={extra} /> extra:
              </>
            ) : (
              "Required payment only:"
            )}{" "}
            <strong className="tnum font-semibold text-slate-900">
              done {shortMonthYearFromNow(monthsMain, now)}
            </strong>
          </span>
        </li>
        {showBase && (
          <li className="flex items-center gap-2.5">
            <svg aria-hidden width="28" height="10" className="flex-shrink-0">
              <line x1="1" y1="5" x2="27" y2="5" stroke={BASELINE} strokeWidth="2" strokeDasharray="5 4" />
            </svg>
            <span>
              Required payment only:{" "}
              <strong className="tnum font-semibold text-slate-900">
                done {shortMonthYearFromNow(monthsBase, now)}
              </strong>
            </span>
          </li>
        )}
      </ul>

      <div ref={wrapRef} className="relative mt-3">
        {width > 0 && (
          <svg
            width={width}
            height={H}
            viewBox={`0 0 ${width} ${H}`}
            role="img"
            aria-label={
              showBase
                ? `Line chart of your total balance falling to zero. With the extra payment you finish in ${shortMonthYearFromNow(
                    monthsMain,
                    now
                  )}. With the required payment only, ${shortMonthYearFromNow(
                    monthsBase,
                    now
                  )}. The same figures are in the table below.`
                : `Line chart of your total balance falling to zero in ${shortMonthYearFromNow(
                    monthsMain,
                    now
                  )}. The same figures are in the table below.`
            }
            className="block touch-pan-y select-none overflow-visible"
            onPointerMove={(e) => onMove(e.clientX, e.currentTarget)}
            onPointerDown={(e) => onMove(e.clientX, e.currentTarget)}
            onPointerLeave={() => setHover(null)}
          >
            {/* Gridlines: hairline, solid, recessive */}
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
                <text
                  x={PAD.left}
                  y={y(t) - 6}
                  fontSize="13"
                  fill={AXIS_TEXT}
                  className="amt tnum"
                >
                  {compactMoney(t)}
                </text>
              </g>
            ))}
            <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="#BFDCB8" strokeWidth="1" />

            {yearTicks.map((t) => (
              <g key={t.m}>
                <line x1={x(t.m)} x2={x(t.m)} y1={y(0)} y2={y(0) + 5} stroke="#BFDCB8" strokeWidth="1" />
                <text
                  x={x(t.m)}
                  y={H - 8}
                  fontSize="13"
                  fill={AXIS_TEXT}
                  textAnchor="middle"
                  className="tnum"
                >
                  {t.label}
                </text>
              </g>
            ))}

            {/* Required-only comparison, drawn first so the answer sits on top */}
            {showBase && requiredOnly && (
              <>
                <path
                  d={path(requiredOnly)}
                  fill="none"
                  stroke={BASELINE}
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  strokeLinejoin="round"
                />
                <circle cx={x(monthsBase)} cy={y(0)} r="5" fill={BASELINE} stroke="#fff" strokeWidth="2" />
              </>
            )}

            <path
              d={`${path(withExtra)}L${x(monthsMain).toFixed(1)},${y(0).toFixed(
                1
              )}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`}
              fill={GREEN}
              opacity="0.1"
            />
            <path
              d={path(withExtra)}
              fill="none"
              stroke={GREEN}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx={x(monthsMain)} cy={y(0)} r="6" fill={GREEN} stroke="#fff" strokeWidth="2" />

            {hover !== null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} stroke="#8CA98E" strokeWidth="1" />
                {showBase && (
                  <circle cx={x(hover)} cy={y(at(requiredOnly, hover) ?? 0)} r="4.5" fill={BASELINE} stroke="#fff" strokeWidth="2" />
                )}
                <circle cx={x(hover)} cy={y(at(withExtra, hover) ?? 0)} r="5" fill={GREEN} stroke="#fff" strokeWidth="2" />
              </g>
            )}
          </svg>
        )}

        {hover !== null && width > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-2xl border border-line bg-white px-3 py-2 shadow-lift"
            style={{ left: tipLeft }}
          >
            <p className="tnum text-xs font-semibold text-slate-600">
              {shortMonthYearFromNow(hover, now)}
            </p>
            <p className="mt-0.5 flex items-baseline justify-between gap-2 text-sm">
              <span className="text-slate-700">
                {extra > 0 ? "With extra" : "You owe"}
              </span>
              <span className="amt tnum font-bold text-slate-900">
                {money(at(withExtra, hover))}
              </span>
            </p>
            {showBase && (
              <p className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-slate-700">Required only</span>
                <span className="amt tnum font-semibold text-slate-800">
                  {money(at(requiredOnly, hover))}
                </span>
              </p>
            )}
          </div>
        )}
      </div>

      <figcaption className="sr-only">
        Balance over time. The table that follows has the same figures.
      </figcaption>

      <Disclosure
        summary="See these numbers as a table"
        openSummary="Hide the table"
        className="mt-1"
      >
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-700">
              <tr>
                <th scope="col" className="px-3.5 py-2.5 font-semibold">When</th>
                <th scope="col" className="px-3.5 py-2.5 text-right font-semibold">
                  {extra > 0 ? "With extra" : "You owe"}
                </th>
                {showBase && (
                  <th scope="col" className="px-3.5 py-2.5 text-right font-semibold">
                    Required only
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((m) => (
                <tr key={m}>
                  <th scope="row" className="tnum px-3.5 py-2.5 font-normal text-slate-800">
                    {m === 0 ? "Today" : shortMonthYearFromNow(m, now)}
                  </th>
                  <td className="px-3.5 py-2.5 text-right font-semibold text-slate-900">
                    <Money value={at(withExtra, m)} />
                  </td>
                  {showBase && (
                    <td className="px-3.5 py-2.5 text-right text-slate-800">
                      <Money value={at(requiredOnly, m)} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Disclosure>
    </figure>
  );
}
