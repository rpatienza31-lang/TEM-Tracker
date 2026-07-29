"use client";

import { useMemo, useState } from "react";
import { Download, FileText, Library, Search } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CotLibraryOrder } from "@/lib/cot/queries";

type GradeGroup = { grade: number | null; orders: CotLibraryOrder[] };
type TermGroup = { termName: string; termSortKey: string; count: number; grades: GradeGroup[] };

export function LibraryClient({ orders }: { orders: CotLibraryOrder[] }) {
  const [query, setQuery] = useState("");

  // One lowercased haystack per order so the search box matches across grade,
  // subject, topic, competency, and indicators at once.
  const indexed = useMemo(
    () =>
      orders.map((o) => ({
        order: o,
        haystack: [o.grade != null ? `grade ${o.grade}` : "", o.subjectName, o.topic, o.competency, o.indicator, o.customerName]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      })),
    [orders],
  );

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return indexed.filter(({ haystack }) => terms.every((t) => haystack.includes(t))).map(({ order }) => order);
  }, [indexed, query]);

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

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search grade, subject, topic, competency, or indicator…"
          className="pl-9"
        />
      </div>

      <p className="-mt-2 text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "order" : "orders"}
        {query && ` · ${orders.length} total`}
      </p>

      {termGroups.length > 0 ? (
        <div className="flex flex-col gap-8">
          {termGroups.map((term) => (
            <section key={term.termName} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <h2 className="text-base font-semibold">{term.termName}</h2>
                <Badge variant="secondary" className="font-normal">
                  {term.count}
                </Badge>
              </div>
              <div className="flex flex-col gap-4">
                {term.grades.map((g) => (
                  <div key={String(g.grade)} className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.grade != null ? `Grade ${g.grade}` : "No grade"}
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
            {orders.length === 0 ? "No completed orders yet." : "No orders match your search."}
          </p>
          {orders.length > 0 && (
            <button className="text-xs text-accent underline" onClick={() => setQuery("")}>
              Clear search
            </button>
          )}
        </Card>
      )}
    </div>
  );
}

function OrderRow({ order }: { order: CotLibraryOrder }) {
  const files = order.items.filter((i) => i.fileUrl);
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{order.subjectName ?? "—"}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-medium">{order.topic ?? "Untitled topic"}</span>
        </div>
        {(order.competency || order.indicator) && (
          <div className="mt-0.5 flex flex-col gap-0.5 text-xs text-muted-foreground sm:flex-row sm:gap-4">
            {order.competency && (
              <span>
                <span className="font-medium">Competency:</span> {order.competency}
              </span>
            )}
            {order.indicator && (
              <span>
                <span className="font-medium">Indicator:</span> {order.indicator}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {files.length > 0 ? (
          files.map((i) => (
            <a
              key={i.id}
              href={i.fileUrl!}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              {i.type === "COT_DLP" || i.type === "DLP" ? "DLP" : "PPT"}
            </a>
          ))
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
