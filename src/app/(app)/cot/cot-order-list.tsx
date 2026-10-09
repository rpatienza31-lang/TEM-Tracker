"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type CotOrderView } from "@/lib/cot/queries";
import { type PriorityLevel } from "@/lib/cot/deadline";
import { CotItemControls, type EditorOption } from "./cot-item-controls";
import { archiveCotOrdersAction } from "./actions";
import { CotOrderEdit } from "./cot-order-edit";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

/**
 * Copies a value to the clipboard without toggling the surrounding clickable
 * card. Shows a brief "Copied ✓" so the user knows it worked — handy for
 * pasting the customer name into DepEd forms / chats.
 */
function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => {},
        );
      }}
      title={`Copy ${label ?? "to clipboard"}`}
      aria-label={`Copy ${label ?? value}`}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

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

// Two combinable filter groups: pick any mix across groups to narrow. Within a
// group the picks are OR'd; across groups (and with type/date/search) they're AND'd.
type TimeKey = "overdue" | "red" | "due2" | "alert" | "normal";
type AssignKey = "none_assigned" | "partial" | "assigned";

const TIME_FILTERS: { key: TimeKey; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "red", label: "Due now" },
  { key: "due2", label: "≤2 days" },
  { key: "alert", label: "Soon" },
  { key: "normal", label: "On track" },
];

const ASSIGN_FILTERS: { key: AssignKey; label: string }[] = [
  { key: "none_assigned", label: "No editor yet" },
  { key: "partial", label: "Missing 1 editor" },
  { key: "assigned", label: "Assigned" },
];

function isUnclaimed(o: CotOrderView) {
  return o.items.some((i) => i.status === "available");
}

/** Neither deliverable has an editor yet (both DLP and PPT unassigned). */
function isNoneAssigned(o: CotOrderView) {
  return o.items.length > 0 && o.items.every((i) => i.status === "available");
}

/** Some but not all deliverables are assigned (e.g. DLP has an editor, PPT doesn't). */
function isPartlyAssigned(o: CotOrderView) {
  return o.items.some((i) => i.status === "available") && o.items.some((i) => i.status !== "available");
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

const matchesTime = (o: CotOrderView, keys: Set<TimeKey>) =>
  keys.size === 0 || [...keys].some((k) => (k === "due2" ? isDueWithin2(o) : o.priority === k));
const matchesAssign = (o: CotOrderView, keys: Set<AssignKey>) =>
  keys.size === 0 ||
  [...keys].some((k) =>
    k === "none_assigned" ? isNoneAssigned(o) : k === "partial" ? isPartlyAssigned(o) : isFullyAssigned(o),
  );

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
  const [timeFilter, setTimeFilter] = useState<Set<TimeKey>>(new Set());
  const [assignFilter, setAssignFilter] = useState<Set<AssignKey>>(new Set());
  const [typeFilter, setTypeFilter] = useState<"all" | "rush" | "regular">("all");
  const [dateFilter, setDateFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [archiving, startArchive] = useTransition();
  const [archiveMsg, setArchiveMsg] = useState<string | null>(null);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleTime(key: TimeKey) {
    setTimeFilter((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function toggleAssign(key: AssignKey) {
    setAssignFilter((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  const anyChip = timeFilter.size > 0 || assignFilter.size > 0;
  function clearChips() {
    setTimeFilter(new Set());
    setAssignFilter(new Set());
  }

  function archiveShown(ids: string[]) {
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Mark ${ids.length} shown order(s) as DONE?\n\nThey move to Completed and the Available Library. No points are awarded (the editor is unknown). You can send any of them back as a back job later from the Completed tab.`,
      )
    )
      return;
    setArchiveMsg(null);
    startArchive(async () => {
      const res = await archiveCotOrdersAction(ids);
      if (res.ok) {
        setArchiveMsg(`✓ Marked ${res.done} order(s) as done — now in Completed & the Library.`);
        setSelected(new Set());
        router.refresh();
      } else {
        setArchiveMsg(res.message ?? "Could not mark as done.");
      }
    });
  }

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const counts = useMemo(() => {
    const c = { total: orders.length, overdue: 0, due2: 0, alert: 0, unclaimed: 0, none_assigned: 0, partial: 0, assigned: 0, rush: 0, regular: 0 };
    for (const o of orders) {
      if (o.priority === "overdue") c.overdue += 1;
      if (isDueWithin2(o)) c.due2 += 1;
      if (o.priority === "alert") c.alert += 1;
      if (isUnclaimed(o)) c.unclaimed += 1;
      if (isNoneAssigned(o)) c.none_assigned += 1;
      if (isPartlyAssigned(o)) c.partial += 1;
      if (isFullyAssigned(o)) c.assigned += 1;
      if (o.orderType === "rush") c.rush += 1;
      else c.regular += 1;
    }
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => matchesTime(o, timeFilter))
      .filter((o) => matchesAssign(o, assignFilter))
      .filter((o) => typeFilter === "all" || o.orderType === typeFilter)
      .filter((o) => !dateFilter || o.orderDate === dateFilter)
      .filter((o) => {
        if (!q) return true;
        return [o.customerName, o.subjectName, o.topic, o.competency, o.indicator, o.grade ? `grade ${o.grade}` : ""]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q));
      });
  }, [orders, query, timeFilter, assignFilter, typeFilter, dateFilter]);

  const tiles: { onClick: () => void; active: boolean; label: string; value: number; className: string }[] = [
    { onClick: () => toggleTime("overdue"), active: timeFilter.has("overdue"), label: "Overdue", value: counts.overdue, className: "text-red-600" },
    { onClick: () => toggleTime("due2"), active: timeFilter.has("due2"), label: "Due within 2 days", value: counts.due2, className: "text-red-500" },
    { onClick: () => toggleTime("alert"), active: timeFilter.has("alert"), label: "Due within 3 days", value: counts.alert, className: "text-amber-500" },
    { onClick: () => { toggleAssign("none_assigned"); }, active: assignFilter.has("none_assigned"), label: "No editor yet", value: counts.none_assigned, className: "text-foreground" },
  ];

  const assignCount = (k: AssignKey) =>
    k === "none_assigned" ? counts.none_assigned : k === "partial" ? counts.partial : counts.assigned;

  return (
    <div className="flex flex-col gap-4">
      {/* Priority summary — click a tile to toggle that filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={t.onClick}
            className={`rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
              t.active ? "border-foreground ring-1 ring-foreground" : ""
            }`}
          >
            <div className={`text-2xl font-semibold tabular-nums ${t.className}`}>{t.value}</div>
            <div className="text-xs text-muted-foreground">{t.label}</div>
          </button>
        ))}
      </div>

      {/* Combinable filter chips — pick any mix of Time and Editor to narrow */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time</span>
          {TIME_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => toggleTime(f.key)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                timeFilter.has(f.key) ? "border-foreground bg-foreground text-background" : "hover:bg-accent"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Editor</span>
          {ASSIGN_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => toggleAssign(f.key)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                assignFilter.has(f.key) ? "border-foreground bg-foreground text-background" : "hover:bg-accent"
              }`}
            >
              {f.label}
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                  assignFilter.has(f.key) ? "bg-background/20" : "bg-muted text-muted-foreground"
                }`}
              >
                {assignCount(f.key)}
              </span>
            </button>
          ))}
          {anyChip && (
            <button className="ml-1 text-xs text-muted-foreground underline hover:text-foreground" onClick={clearChips}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Order type (Rush / Regular) + ordered-on date filter */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          {(
            [
              { key: "all", label: `All types (${counts.total})` },
              { key: "rush", label: `Rush (${counts.rush})` },
              { key: "regular", label: `Regular (${counts.regular})` },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTypeFilter(t.key)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                typeFilter === t.key ? "border-foreground bg-foreground text-background" : "hover:bg-accent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Ordered on</span>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-9 w-auto"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter("")}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Clear
            </button>
          )}
        </label>
      </div>

      <Input
        placeholder="Search customer, subject, topic, grade…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="max-w-sm"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {counts.total} open order{counts.total === 1 ? "" : "s"}
          {typeFilter !== "all" && ` · ${typeFilter}`}
          {dateFilter && ` · ordered ${dateFilter}`}
        </p>
        {isOwner && filtered.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelected(new Set(filtered.map((o) => o.id)))}
              className="text-primary underline hover:no-underline"
            >
              Select all shown ({filtered.length})
            </button>
            {selected.size > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className="text-muted-foreground underline hover:text-foreground">
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {isOwner && selected.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-2 shadow-sm">
          <span className="text-sm font-medium tabular-nums">{selected.size} selected</span>
          <button
            type="button"
            disabled={archiving}
            onClick={() => archiveShown([...selected])}
            className="rounded-md border border-status-approved/50 bg-status-approved/10 px-3 py-1 text-sm font-medium text-status-approved hover:bg-status-approved/20 disabled:opacity-50"
            title="Force-complete the selected orders (no points) so they move to Completed and the Available Library"
          >
            {archiving ? "Marking…" : `Mark ${selected.size} as done`}
          </button>
          {archiveMsg && <span className="text-xs text-status-approved">{archiveMsg}</span>}
        </div>
      )}
      {isOwner && selected.size === 0 && archiveMsg && (
        <p className="text-xs text-status-approved">{archiveMsg}</p>
      )}

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {orders.length === 0 ? "No open COT orders right now." : "No orders match this filter."}
        </p>
      )}

      {filtered.map((o) => {
        const isOpen = expanded.has(o.id);
        return (
          <Card
            key={o.id}
            className={cn(
              `border-l-4 ${PRIORITY_CLASS[o.priority]}`,
              o.workKind === "align" && "ring-1 ring-orange-400 dark:ring-orange-500",
            )}
          >
            {/* Collapsed summary row — click to expand full details */}
            <CardHeader
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => toggleExpanded(o.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleExpanded(o.id);
                }
              }}
              className="cursor-pointer select-none pb-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {isOwner && (
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSelected(o.id)}
                      className="h-4 w-4 rounded border-input"
                      aria-label={`Select ${o.customerName}`}
                    />
                  )}
                  <span className="text-muted-foreground transition-transform" aria-hidden>
                    {isOpen ? "▾" : "▸"}
                  </span>
                  <span className={`select-text font-semibold ${isOpen ? "text-xl" : "text-base"}`}>
                    {o.customerName}
                  </span>
                  <CopyButton value={o.customerName} label="customer name" />
                  <Badge variant="outline" className="uppercase">
                    {o.orderType}
                  </Badge>
                  <Badge className={o.workKind === "align" ? "bg-orange-500 text-white ring-1 ring-orange-600" : "bg-emerald-600 text-white"}>
                    {o.workKind === "align" ? "⬦ Align only" : "New"}
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
              <p className={`text-muted-foreground ${isOpen ? "text-base" : "text-sm"}`}>
                {[o.grade ? `Grade ${o.grade}` : null, o.subjectName, o.topic].filter(Boolean).join(" · ") || "—"}
              </p>
              {/* Who's on it — at a glance, without expanding. */}
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

            {isOpen && (
              <CardContent className="flex flex-col gap-4">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-base sm:grid-cols-2">
                  {o.competency && (
                    <div>
                      <dt className="text-sm text-muted-foreground">Competency</dt>
                      <dd className="font-medium">{o.competency}</dd>
                    </div>
                  )}
                  {o.indicator && (
                    <div>
                      <dt className="text-sm text-muted-foreground">Indicator</dt>
                      <dd className="font-medium">{o.indicator}</dd>
                    </div>
                  )}
                  {o.lessonFor && (
                    <div>
                      <dt className="text-sm text-muted-foreground">Lesson For</dt>
                      <dd className="font-medium">{o.lessonFor}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-sm text-muted-foreground">Ordered</dt>
                    <dd className="font-medium">{o.orderDate}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Deadline</dt>
                    <dd className="font-medium">{o.deadline}</dd>
                  </div>
                  {isOwner && o.payment && (
                    <div>
                      <dt className="text-sm text-muted-foreground">Payment</dt>
                      <dd className="font-medium">{peso.format(Number(o.payment))}</dd>
                    </div>
                  )}
                </dl>
                {o.notes && (
                  <div>
                    <dt className="text-sm text-muted-foreground">Note</dt>
                    <dd className="whitespace-pre-line text-base">{o.notes}</dd>
                  </div>
                )}

                {isAdmin && (
                  <CotOrderEdit
                    order={{
                      id: o.id,
                      orderType: o.orderType,
                      workKind: o.workKind,
                      grade: o.grade,
                      subjectName: o.subjectName,
                      topic: o.topic,
                      competency: o.competency,
                      indicator: o.indicator,
                      lessonFor: o.lessonFor,
                      deadline: o.deadline,
                      customerName: o.customerName,
                    }}
                  />
                )}

                <div>
                  <p className="mb-2 text-sm font-medium text-muted-foreground">Editors &amp; deadlines</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {o.items.map((item) => (
                      <CotItemControls
                        key={item.id}
                        item={item}
                        isAdmin={isAdmin}
                        isOwner={isOwner}
                        canClaim={canClaim}
                        editors={editors}
                        orderDeadline={o.deadline}
                      />
                    ))}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
