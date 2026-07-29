"use client";

import { useMemo, useState } from "react";
import { FileText, GraduationCap, Search, Target, Flag, Download, Library } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CotOrderView } from "@/lib/cot/queries";

export function LibraryClient({ orders }: { orders: CotOrderView[] }) {
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState<number | "all">("all");

  const grades = useMemo(
    () => [...new Set(orders.map((o) => o.grade).filter((g): g is number => g != null))].sort((a, b) => a - b),
    [orders],
  );

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
    return indexed
      .filter(({ order }) => grade === "all" || order.grade === grade)
      .filter(({ haystack }) => terms.every((t) => haystack.includes(t)))
      .map(({ order }) => order);
  }, [indexed, query, grade]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Library className="h-5 w-5 text-status-approved" />
          Available Library
        </h1>
        <p className="text-sm text-muted-foreground">
          Finished customized orders — the grades, subjects, topics, competencies, and indicators already produced.
        </p>
      </div>

      {/* Search + grade filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search grade, subject, topic, competency, or indicator…"
            className="pl-9"
          />
        </div>
        {grades.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip active={grade === "all"} onClick={() => setGrade("all")}>
              All grades
            </FilterChip>
            {grades.map((g) => (
              <FilterChip key={g} active={grade === g} onClick={() => setGrade(g)}>
                G{g}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      <p className="-mt-2 text-xs text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "order" : "orders"}
        {(query || grade !== "all") && ` · ${orders.length} total`}
      </p>

      {/* Card grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((o) => (
            <LibraryCard key={o.id} order={o} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Search className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">
              {orders.length === 0 ? "No completed orders yet." : "No orders match your search."}
            </p>
            {orders.length > 0 && (
              <button className="text-xs text-accent underline" onClick={() => { setQuery(""); setGrade("all"); }}>
                Clear filters
              </button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LibraryCard({ order }: { order: CotOrderView }) {
  const files = order.items.filter((i) => i.fileUrl);
  return (
    <Card className="flex h-full flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {order.grade != null && (
              <Badge className="gap-1 bg-status-approved/10 text-status-approved hover:bg-status-approved/10">
                <GraduationCap className="h-3 w-3" />
                Grade {order.grade}
              </Badge>
            )}
            <span className="text-sm font-semibold">{order.subjectName ?? "—"}</span>
          </div>
        </div>

        <p className="text-base font-semibold leading-snug">{order.topic ?? "Untitled topic"}</p>

        <div className="flex flex-col gap-2 text-sm">
          <Field icon={Target} label="Competency" value={order.competency} />
          <Field icon={Flag} label="Indicator" value={order.indicator} />
        </div>

        <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
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
              No files attached
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <p className={cn("leading-snug", value ? "text-foreground/90" : "text-muted-foreground")}>{value ?? "—"}</p>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}
