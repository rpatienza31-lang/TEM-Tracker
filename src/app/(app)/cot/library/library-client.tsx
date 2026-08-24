"use client";

import { useMemo, useState } from "react";
import { Download, FileText, Library, Search, User } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CotLibraryOrder } from "@/lib/cot/queries";

type GradeGroup = { grade: number | null; orders: CotLibraryOrder[] };
type TermGroup = { termName: string; termSortKey: string; count: number; grades: GradeGroup[] };

export function LibraryClient({ orders }: { orders: CotLibraryOrder[] }) {
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [indicator, setIndicator] = useState("");
  const [lessonFor, setLessonFor] = useState("");
  const [editor, setEditor] = useState("");

  // Distinct option lists for the dropdown filters.
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
  const editorOptions = useMemo(
    () =>
      [
        ...new Set(
          orders.flatMap((o) => o.items.map((i) => i.assigneeName).filter((n): n is string => !!n)),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [orders],
  );
  const lessonForOptions = useMemo(
    () => [...new Set(orders.map((o) => o.lessonFor).filter((l): l is string => !!l))].sort((a, b) => a.localeCompare(b)),
    [orders],
  );

  // One lowercased haystack per order so the search box matches across grade,
  // subject, topic, competency, indicators, and lesson-for at once.
  const indexed = useMemo(
    () =>
      orders.map((o) => ({
        order: o,
        haystack: [
          o.grade != null ? `grade ${o.grade}` : "",
          o.subjectName,
          o.topic,
          o.competency,
          o.indicator,
          o.lessonFor,
          o.customerName,
          ...o.items.map((i) => i.assigneeName),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      })),
    [orders],
  );

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return indexed
      .filter(({ order }) => grade === "" || order.grade === Number(grade))
      .filter(({ order }) => subject === "" || order.subjectName === subject)
      .filter(({ order }) => indicator === "" || order.indicator === indicator)
      .filter(({ order }) => lessonFor === "" || order.lessonFor === lessonFor)
      .filter(({ order }) => editor === "" || order.items.some((i) => i.assigneeName === editor))
      .filter(({ haystack }) => terms.every((t) => haystack.includes(t)))
      .map(({ order }) => order);
  }, [indexed, query, grade, subject, indicator, lessonFor, editor]);

  const hasActiveFilter =
    query !== "" || grade !== "" || subject !== "" || indicator !== "" || lessonFor !== "" || editor !== "";
  function clearFilters() {
    setQuery("");
    setGrade("");
    setSubject("");
    setIndicator("");
    setLessonFor("");
    setEditor("");
  }

  // Group filtered orders into Term -> Grade -> orders.
  const termGroups = useMemo<TermGroup[]>(() => {
    const byTerm = new Map<string, CotLibraryOrder[]>();
    for (const o of filtered) {
      const list = byTerm.get(o.termName) ?? [];
      list.push(o);
      byTerm.set(o.termName, list);
    }
    const groups: TermGroup[] = [...byTerm.entries()].map(([termName, list]) => {
      const byGrade = new Map<number | null, CotLibraryOrder[]>();
      for (const o of list) {
        const g = o.grade ?? null;
        const gl = byGrade.get(g) ?? [];
        gl.push(o);
        byGrade.set(g, gl);
      }
      const grades: GradeGroup[] = [...byGrade.entries()]
        .map(([grade, orders]) => ({ grade, orders }))
        .sort((a, b) => (a.grade ?? 999) - (b.grade ?? 999));
      return { termName, termSortKey: list[0].termSortKey, count: list.length, grades };
    });
    return groups.sort((a, b) => a.termSortKey.localeCompare(b.termSortKey) || a.termName.localeCompare(b.termName));
  }, [filtered]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Library className="h-5 w-5 text-status-approved" />
          Available Library
        </h1>
        <p className="text-sm text-muted-foreground">
          Finished customized orders, organized per term and grade — the topics, competencies, and indicators already produced.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search grade, subject, topic, competency, or indicator…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {indicatorOptions.length > 0 && (
            <FilterSelect value={indicator} onChange={setIndicator} allLabel="All indicators">
              {indicatorOptions.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </FilterSelect>
          )}
          {lessonForOptions.length > 0 && (
            <FilterSelect value={lessonFor} onChange={setLessonFor} allLabel="All lesson-for">
              {lessonForOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </FilterSelect>
          )}
          {editorOptions.length > 0 && (
            <FilterSelect value={editor} onChange={setEditor} allLabel="All editors">
              {editorOptions.map((e) => (
                <option key={e} value={e}>
                  {e}
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

      <p className="-mt-2 text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "order" : "orders"}
        {hasActiveFilter && ` · ${orders.length} total`}
      </p>

      {termGroups.length > 0 ? (
        <div className="flex flex-col gap-8">
          {termGroups.map((term) => (
            <section key={term.termName} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 rounded-lg border-l-4 border-status-approved bg-muted/50 px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-status-approved">Term</span>
                <h2 className="text-lg font-bold tracking-tight">{term.termName}</h2>
                <Badge variant="secondary" className="ml-auto font-normal">
                  {term.count} order{term.count === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="flex flex-col gap-4">
                {term.grades.map((g) => (
                  <div key={String(g.grade)} className="flex flex-col gap-2">
                    <h3>
                      <span className="inline-block rounded-md bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">
                        {g.grade != null ? `Grade ${g.grade}` : "No grade"}
                      </span>
                    </h3>
                    <Card className="divide-y divide-border overflow-hidden">
                      {g.orders.map((o) => (
                        <OrderRow key={o.id} order={o} />
                      ))}
                    </Card>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <Search className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">
            {orders.length === 0 ? "No completed orders yet." : "No orders match your filters."}
          </p>
          {orders.length > 0 && (
            <button className="text-xs text-accent underline" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </Card>
      )}
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

function OrderRow({ order }: { order: CotLibraryOrder }) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{order.subjectName ?? "—"}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium">{order.topic ?? "Untitled topic"}</span>
          {order.lessonFor && (
            <Badge
              variant="secondary"
              className={cn(
                "px-2.5 py-0.5 text-sm font-semibold",
                order.lessonFor.toLowerCase() === "demo"
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                  : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
              )}
            >
              {order.lessonFor}
            </Badge>
          )}
        </div>
        {(order.competency || order.indicator) && (
          <div className="mt-1 flex flex-col gap-1 text-sm">
            {order.competency && (
              <span>
                <span className="font-semibold text-foreground">Competency:</span>{" "}
                <span className="text-muted-foreground">{order.competency}</span>
              </span>
            )}
            {order.indicator && (
              <span className="flex flex-wrap items-center gap-1.5 text-base">
                <span className="font-semibold text-foreground">Indicator:</span>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-base font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  {order.indicator}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        {order.items.length > 0 ? (
          order.items.map((i) => {
            const label = i.type === "COT_DLP" || i.type === "DLP" ? "DLP" : "PPT";
            return (
              <div key={i.id} className="flex items-center justify-end gap-2 text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <User className="h-3 w-3" />
                  {i.assigneeName ?? "—"}
                </span>
                {i.fileUrl ? (
                  <a
                    href={i.fileUrl}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex w-16 items-center justify-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {label}
                  </a>
                ) : (
                  <span className="inline-flex w-16 items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    {label}
                  </span>
                )}
              </div>
            );
          })
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            No files
          </span>
        )}
      </div>
    </div>
  );
}
