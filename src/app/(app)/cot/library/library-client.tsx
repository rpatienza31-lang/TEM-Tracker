"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight, Download, FileText, Library, Search, User } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CotLibraryOrder } from "@/lib/cot/queries";

// Standard "Lesson For" buckets shown as columns, in this order; anything else
// (or blank) is appended after these.
const LESSON_FOR_ORDER = ["Demo", "Reclass", "RQA"];
const UNSPECIFIED = "Unspecified";

/** Pulls "Week: N" out of the folded order notes (the public form stores it there). */
function parseWeek(notes: string | null): number | null {
  if (!notes) return null;
  const m = notes.match(/week\s*[:#-]?\s*(\d{1,2})/i);
  return m ? Number(m[1]) : null;
}

type PivotRow = {
  key: string;
  termName: string;
  termSortKey: string;
  grade: number | null;
  subjectName: string | null;
  topic: string | null;
  competency: string | null;
  week: number | null;
  // lessonFor bucket -> indicators done, and the orders behind them (for files).
  cells: Map<string, { indicators: Set<string>; orders: CotLibraryOrder[] }>;
  allOrders: CotLibraryOrder[];
};

export function LibraryClient({ orders }: { orders: CotLibraryOrder[] }) {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [indicator, setIndicator] = useState("");
  const [lessonFor, setLessonFor] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const bucketOf = (o: CotLibraryOrder) => (o.lessonFor?.trim() ? o.lessonFor.trim() : UNSPECIFIED);

  // Distinct option lists for the dropdown filters.
  const termOptions = useMemo(
    () => [...new Set(orders.map((o) => o.termName))].sort((a, b) => a.localeCompare(b)),
    [orders],
  );
  const gradeOptions = useMemo(
    () => [...new Set(orders.map((o) => o.grade).filter((g): g is number => g != null))].sort((a, b) => a - b),
    [orders],
  );
  const subjectOptions = useMemo(
    () => [...new Set(orders.map((o) => o.subjectName).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b)),
    [orders],
  );
  const indicatorOptions = useMemo(
    () => [...new Set(orders.map((o) => o.indicator).filter((i): i is string => !!i))].sort((a, b) => a.localeCompare(b)),
    [orders],
  );

  // Which "Lesson For" columns exist, Demo/Reclass/RQA first.
  const allLessonForCols = useMemo(() => {
    const present = new Set(orders.map(bucketOf));
    const ordered = LESSON_FOR_ORDER.filter((l) => present.has(l));
    const rest = [...present].filter((l) => !LESSON_FOR_ORDER.includes(l)).sort((a, b) => a.localeCompare(b));
    return [...ordered, ...rest];
  }, [orders]);
  const lessonForOptions = allLessonForCols.filter((l) => l !== UNSPECIFIED);

  // Build pivot rows: one per term|grade|subject|topic|competency, aggregating
  // the indicators done in each Lesson-For bucket.
  const rows = useMemo<PivotRow[]>(() => {
    const map = new Map<string, PivotRow>();
    for (const o of orders) {
      const key = [o.termName, o.grade, o.subjectName, o.topic, o.competency].join("||");
      let row = map.get(key);
      if (!row) {
        row = {
          key,
          termName: o.termName,
          termSortKey: o.termSortKey,
          grade: o.grade,
          subjectName: o.subjectName,
          topic: o.topic,
          competency: o.competency,
          week: parseWeek(o.notes),
          cells: new Map(),
          allOrders: [],
        };
        map.set(key, row);
      }
      if (row.week == null) row.week = parseWeek(o.notes);
      const bucket = bucketOf(o);
      const cell = row.cells.get(bucket) ?? { indicators: new Set<string>(), orders: [] };
      if (o.indicator) cell.indicators.add(o.indicator);
      cell.orders.push(o);
      row.cells.set(bucket, cell);
      row.allOrders.push(o);
    }
    return [...map.values()].sort(
      (a, b) =>
        a.termSortKey.localeCompare(b.termSortKey) ||
        a.termName.localeCompare(b.termName) ||
        (a.grade ?? 999) - (b.grade ?? 999) ||
        (a.subjectName ?? "").localeCompare(b.subjectName ?? "") ||
        (a.topic ?? "").localeCompare(b.topic ?? ""),
    );
  }, [orders]);

  // Columns to show: all, or just the one picked in the Lesson-For filter.
  const columns = lessonFor ? [lessonFor] : allLessonForCols;

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (term && r.termName !== term) return false;
      if (grade && r.grade !== Number(grade)) return false;
      if (subject && r.subjectName !== subject) return false;
      if (indicator && !columns.some((c) => r.cells.get(c)?.indicators.has(indicator))) return false;
      if (lessonFor && !r.cells.has(lessonFor)) return false;
      if (terms.length) {
        const hay = [
          r.grade != null ? `grade ${r.grade}` : "",
          r.subjectName,
          r.topic,
          r.competency,
          [...r.cells.values()].flatMap((c) => [...c.indicators]).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [rows, query, term, grade, subject, indicator, lessonFor, columns]);

  const lessonCount = filtered.reduce((n, r) => n + r.allOrders.length, 0);
  const hasActiveFilter = query !== "" || term !== "" || grade !== "" || subject !== "" || indicator !== "" || lessonFor !== "";
  function clearFilters() {
    setQuery("");
    setTerm("");
    setGrade("");
    setSubject("");
    setIndicator("");
    setLessonFor("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Library className="h-5 w-5 text-status-approved" />
          Available Library
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every finished COT, grouped by subject, topic and competency. Before making a new one, check which indicators are
          already done for Demo, Reclass and RQA — and only make what&apos;s missing.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topic, competency, subject, or indicator…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect value={term} onChange={setTerm} allLabel="All terms">
            {termOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={grade} onChange={setGrade} allLabel="All grades">
            {gradeOptions.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={subject} onChange={setSubject} allLabel="All subjects">
            {subjectOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </FilterSelect>
          {lessonForOptions.length > 0 && (
            <FilterSelect value={lessonFor} onChange={setLessonFor} allLabel="All lesson-for">
              {lessonForOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </FilterSelect>
          )}
          {indicatorOptions.length > 0 && (
            <FilterSelect value={indicator} onChange={setIndicator} allLabel="All indicators">
              {indicatorOptions.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </FilterSelect>
          )}
          {hasActiveFilter && (
            <button className="text-xs text-accent underline" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <p className="-mt-2 text-xs text-muted-foreground tabular-nums">
        <b className="font-semibold text-foreground">{filtered.length}</b> topic+competency group{filtered.length === 1 ? "" : "s"} ·{" "}
        <b className="font-semibold text-foreground">{lessonCount}</b> finished lesson{lessonCount === 1 ? "" : "s"} available
        {hasActiveFilter && ` · ${rows.length} total`}
      </p>

      {filtered.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">Grade</th>
                  <th className="px-3 py-2.5">Subject</th>
                  <th className="px-3 py-2.5">Topic</th>
                  <th className="px-3 py-2.5">Competency</th>
                  {columns.map((c) => (
                    <th key={c} className="min-w-[130px] px-3 py-2.5">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isOpen = openKey === r.key;
                  return (
                    <Fragment key={r.key}>
                      <tr
                        className="cursor-pointer border-t border-border align-top hover:bg-accent/40"
                        onClick={() => setOpenKey(isOpen ? null : r.key)}
                      >
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="inline-block rounded-md bg-primary/10 px-2 py-0.5 text-sm font-bold text-primary">
                            {r.grade != null ? `G${r.grade}` : "—"}
                          </span>
                          <div className="mt-1 text-[11px] text-muted-foreground">{r.termName}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold">{r.subjectName ?? "—"}</div>
                          {r.week != null && <div className="text-[11px] font-medium text-muted-foreground">Week {r.week}</div>}
                        </td>
                        <td className="max-w-[22ch] px-3 py-3">
                          <span className="inline-flex items-start gap-1 font-medium">
                            <ChevronRight
                              className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")}
                            />
                            {r.topic ?? "Untitled topic"}
                          </span>
                        </td>
                        <td className="max-w-[34ch] px-3 py-3 text-[13px] text-muted-foreground">{r.competency ?? "—"}</td>
                        {columns.map((c) => (
                          <td key={c} className="px-3 py-3">
                            <IndicatorCell inds={[...(r.cells.get(c)?.indicators ?? [])]} highlight={indicator} />
                          </td>
                        ))}
                      </tr>
                      {isOpen && (
                        <tr className="border-t border-border bg-muted/30">
                          <td colSpan={4 + columns.length} className="px-3 py-3">
                            <div className="flex flex-col gap-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Finished orders for this topic &amp; competency
                              </div>
                              <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
                                {r.allOrders.map((o) => (
                                  <DetailRow key={o.id} order={o} />
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <Search className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">
            {rows.length === 0 ? "No completed orders yet." : "No lessons match your filters."}
          </p>
          {rows.length > 0 && (
            <button className="text-xs text-accent underline" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </Card>
      )}
    </div>
  );
}

function IndicatorCell({ inds, highlight }: { inds: string[]; highlight: string }) {
  if (inds.length === 0) {
    return (
      <span className="inline-flex flex-col leading-tight">
        <span className="text-sm font-bold text-rose-600 dark:text-rose-400">—</span>
        <span className="text-[10px] text-muted-foreground">can make</span>
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {inds.sort((a, b) => a.localeCompare(b)).map((i) => (
        <span
          key={i}
          className={cn(
            "inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
            highlight && i === highlight && "outline outline-2 outline-emerald-500",
          )}
        >
          ✓ {i}
        </span>
      ))}
    </div>
  );
}

function DetailRow({ order }: { order: CotLibraryOrder }) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {order.lessonFor && (
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
              {order.lessonFor}
            </span>
          )}
          {order.indicator && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {order.indicator}
            </span>
          )}
          <span className="text-muted-foreground">{order.customerName}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {order.items.map((i) => {
          const label = i.type === "COT_DLP" || i.type === "DLP" ? "DLP" : "PPT";
          return (
            <span key={i.id} className="flex items-center gap-1.5 text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <User className="h-3 w-3" />
                {i.assigneeName ?? "—"}
              </span>
              {i.fileUrl ? (
                <a
                  href={i.fileUrl}
                  target="_blank"
                  rel="noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex w-14 items-center justify-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 font-medium hover:bg-accent"
                >
                  <Download className="h-3.5 w-3.5" />
                  {label}
                </a>
              ) : (
                <span className="inline-flex w-14 items-center justify-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  {label}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  allLabel,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
    >
      <option value="">{allLabel}</option>
      {children}
    </select>
  );
}
