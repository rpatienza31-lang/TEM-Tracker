"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { type CotOrderView } from "@/lib/cot/queries";
import { type PriorityLevel } from "@/lib/cot/deadline";
import { CotItemControls, type EditorOption } from "./cot-item-controls";
import { CotOrderEdit } from "./cot-order-edit";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

const PRIORITY_CLASS: Record<PriorityLevel, string> = {
  overdue: "border-l-red-600 bg-red-50 dark:bg-red-950/30",
  red: "border-l-red-500 bg-red-50 dark:bg-red-950/20",
  alert: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/20",
  normal: "border-l-transparent",
};

const PRIORITY_BADGE: Record<PriorityLevel, string> = {
  overdue: "bg-red-600 text-white",
  red: "bg-red-500 text-white",
  alert: "bg-amber-500 text-white",
  normal: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function daysLabel(level: PriorityLevel, daysLeft: number) {
  if (level === "overdue") return `${Math.abs(daysLeft)}d overdue`;
  if (daysLeft === 0) return "Due today";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}

type Filter = "all" | PriorityLevel | "due2" | "unclaimed" | "assigned";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "red", label: "Due now" },
  { key: "due2", label: "≤2 days" },
  { key: "alert", label: "Soon" },
  { key: "normal", label: "On track" },
  { key: "unclaimed", label: "Needs editor" },
  { key: "assigned", label: "Assigned" },
];

function isUnclaimed(o: CotOrderView) {
  return o.items.some((i) => i.status === "available");
}

/** Every deliverable now has an editor (nothing left in the available pool). */
function isFullyAssigned(o: CotOrderView) {
  return o.items.length > 0 && o.items.every((i) => i.status !== "available");
}

/** Short label for a COT deliverable ("DLP" / "PPT"). */
function shortType(type: CotOrderView["items"][number]["type"]) {
  return type === "COT_DLP" || type === "DLP" ? "DLP" : "PPT";
}

/** Due within the next two days (today, tomorrow, or the day after) — not yet overdue. */
function isDueWithin2(o: CotOrderView) {
  return o.daysLeft >= 0 && o.daysLeft <= 2;
}

function matchesFilter(o: CotOrderView, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "unclaimed") return isUnclaimed(o);
  if (filter === "assigned") return isFullyAssigned(o);
  if (filter === "due2") return isDueWithin2(o);
  return o.priority === filter;
}

export function CotOrderList({
  orders,
  editors,
  isAdmin,
  isOwner,
  canClaim,
}: {
  orders: CotOrderView[];
  editors: EditorOption[];
  isAdmin: boolean;
  isOwner: boolean;
  canClaim: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const c = { total: orders.length, overdue: 0, due2: 0, alert: 0, unclaimed: 0 };
    for (const o of orders) {
      if (o.priority === "overdue") c.overdue += 1;
      if (isDueWithin2(o)) c.due2 += 1;
      if (o.priority === "alert") c.alert += 1;
      if (isUnclaimed(o)) c.unclaimed += 1;
    }
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => matchesFilter(o, filter))
      .filter((o) => {
        if (!q) return true;
        return [o.customerName, o.subjectName, o.topic, o.competency, o.indicator, o.grade ? `grade ${o.grade}` : ""]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q));
      });
  }, [orders, query, filter]);

  const tiles: { key: Filter; label: string; value: number; className: string }[] = [
    { key: "overdue", label: "Overdue", value: counts.overdue, className: "text-red-600" },
    { key: "due2", label: "Due within 2 days", value: counts.due2, className: "text-red-500" },
    { key: "alert", label: "Due within 3 days", value: counts.alert, className: "text-amber-500" },
    { key: "unclaimed", label: "Needs an editor", value: counts.unclaimed, className: "text-foreground" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Priority summary — click a tile to filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter((f) => (f === t.key ? "all" : t.key))}
            className={`rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
              filter === t.key ? "border-foreground ring-1 ring-foreground" : ""
            }`}
          >
            <div className={`text-2xl font-semibold tabular-nums ${t.className}`}>{t.value}</div>
            <div className="text-xs text-muted-foreground">{t.label}</div>
          </button>
        ))}
      </div>

      {/* Filter chips + search */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              filter === f.key ? "border-foreground bg-foreground text-background" : "hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Input
        placeholder="Search customer, subject, topic, grade…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {counts.total} open order{counts.total === 1 ? "" : "s"}
      </p>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {orders.length === 0 ? "No open COT orders right now." : "No orders match this filter."}
        </p>
      )}

      {filtered.map((o) => (
        <Card key={o.id} className={`border-l-4 ${PRIORITY_CLASS[o.priority]}`}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{o.customerName}</span>
                <Badge variant="outline" className="uppercase">
                  {o.orderType}
                </Badge>
                {o.lessonFor && (
                  <Badge
                    className={
                      o.lessonFor.toLowerCase() === "demo"
                        ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                        : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                    }
                  >
                    {o.lessonFor}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge className={PRIORITY_BADGE[o.priority]}>{daysLabel(o.priority, o.daysLeft)}</Badge>
                <span className="text-xs text-muted-foreground">Deadline {o.deadline}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {[o.grade ? `Grade ${o.grade}` : null, o.subjectName, o.topic].filter(Boolean).join(" · ") || "—"}
            </p>
            {/* Who's on it — at a glance, without scrolling to the item controls. */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {o.items.map((it) => (
                <Badge
                  key={it.id}
                  variant={it.assigneeName ? "secondary" : "outline"}
                  className={it.assigneeName ? "font-normal" : "border-dashed font-normal text-muted-foreground"}
                >
                  {shortType(it.type)}: {it.assigneeName ?? "Unassigned"}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
              {o.competency && (
                <div>
                  <dt className="text-xs text-muted-foreground">Competency</dt>
                  <dd>{o.competency}</dd>
                </div>
              )}
              {o.indicator && (
                <div>
                  <dt className="text-xs text-muted-foreground">Indicator</dt>
                  <dd>{o.indicator}</dd>
                </div>
              )}
              {o.lessonFor && (
                <div>
                  <dt className="text-xs text-muted-foreground">Lesson For</dt>
                  <dd>{o.lessonFor}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">Ordered</dt>
                <dd>{o.orderDate}</dd>
              </div>
              {isOwner && o.payment && (
                <div>
                  <dt className="text-xs text-muted-foreground">Payment</dt>
                  <dd>{peso.format(Number(o.payment))}</dd>
                </div>
              )}
            </dl>
            {o.notes && <p className="text-sm text-muted-foreground">Note: {o.notes}</p>}

            {isAdmin && (
              <CotOrderEdit
                order={{
                  id: o.id,
                  orderType: o.orderType,
                  grade: o.grade,
                  subjectName: o.subjectName,
                  topic: o.topic,
                  lessonFor: o.lessonFor,
                  customerName: o.customerName,
                }}
              />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {o.items.map((item) => (
                <CotItemControls key={item.id} item={item} isAdmin={isAdmin} canClaim={canClaim} editors={editors} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
