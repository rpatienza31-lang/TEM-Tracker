"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DELIVERABLE_TYPE_LABELS, type DeliverableType } from "@/lib/constants";
import { setScheduledDateAction } from "@/lib/work-items/actions";
import type { BoardItem } from "@/lib/work-items/queries";
import { cn } from "@/lib/utils";

type ScheduleItem = BoardItem & { plannedFor: string; isScheduled: boolean };
type Option = { id: string; name: string };

const UNASSIGNED = "__unassigned__";

const dayNameFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "long" });
const dayShortFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short" });
const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
const rangeFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

// Distinct, friendly accent per editor so a column is recognizable at a glance.
const EDITOR_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0d9488",
  "#16a34a", "#0891b2", "#ca8a04", "#dc2626", "#4f46e5", "#9333ea", "#0284c7",
];

function colorFor(id: string): string {
  if (id === UNASSIGNED) return "#64748b";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return EDITOR_COLORS[h % EDITOR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Deliverable-type look: solid badge + tinted card, both dark-mode aware.
const TYPE_STYLES: Record<DeliverableType, { badge: string; card: string; bar: string }> = {
  DLP: {
    badge: "bg-blue-600 text-white",
    card: "border-blue-200 bg-blue-50/70 dark:border-blue-900 dark:bg-blue-950/40",
    bar: "bg-blue-500",
  },
  PPT: {
    badge: "bg-violet-600 text-white",
    card: "border-violet-200 bg-violet-50/70 dark:border-violet-900 dark:bg-violet-950/40",
    bar: "bg-violet-500",
  },
  COT_DLP: {
    badge: "bg-amber-500 text-white",
    card: "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/40",
    bar: "bg-amber-500",
  },
  COT_PPT: {
    badge: "bg-rose-600 text-white",
    card: "border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/40",
    bar: "bg-rose-500",
  },
};

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWeekend(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

/**
 * One work item as a schedule card. Colored by deliverable type with a matching
 * accent bar; items only present because their deadline lands here (not yet
 * planned) get a dashed, dimmed treatment with a "due" flag so planned work
 * reads as the real plan. Admins get an inline date control to move it.
 */
function ScheduleCard({
  item,
  isAdmin,
  overdue,
  onReschedule,
  pending,
}: {
  item: ScheduleItem;
  isAdmin: boolean;
  overdue: boolean;
  onReschedule: (id: string, date: string | null) => void;
  pending: boolean;
}) {
  const style = TYPE_STYLES[item.type];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border pl-2.5 pr-2 py-2 shadow-sm transition-shadow hover:shadow-md",
        item.isScheduled ? style.card : "border-dashed border-border bg-muted/30",
        pending && "opacity-50",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1.5", item.isScheduled ? style.bar : "bg-muted-foreground/30")} />
      <div className="flex items-center justify-between gap-1">
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", style.badge)}>
          {DELIVERABLE_TYPE_LABELS[item.type]}
        </span>
        {overdue ? (
          <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive">
            overdue
          </span>
        ) : !item.isScheduled ? (
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">due</span>
        ) : null}
      </div>
      <div className="mt-1.5 text-sm font-semibold leading-tight text-foreground">
        {item.subjectCode || item.subjectName}
      </div>
      <div className="text-xs text-muted-foreground">
        Grade {item.grade} · Week {item.weekNumber}
      </div>
      {isAdmin && (
        <div className="mt-1.5 flex items-center gap-1 border-t border-border/60 pt-1.5">
          <input
            type="date"
            defaultValue={item.isScheduled ? item.plannedFor : ""}
            disabled={pending}
            onChange={(e) => onReschedule(item.id, e.target.value || null)}
            className="h-6 w-[7.5rem] rounded border border-input bg-background px-1 text-[11px]"
            aria-label="Planned date"
          />
          {item.isScheduled && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onReschedule(item.id, null)}
              className="text-[11px] text-muted-foreground underline hover:text-destructive"
              title="Clear planned date (revert to deadline)"
            >
              clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ScheduleClient({
  items,
  dates,
  from,
  days,
  today,
  terms,
  termId,
  isAdmin,
  currentUserId,
}: {
  items: ScheduleItem[];
  dates: string[];
  from: string;
  days: number;
  today: string;
  terms: Option[];
  termId: string;
  isAdmin: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setParam(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function reschedule(id: string, date: string | null) {
    setBusyId(id);
    setError(null);
    startTransition(async () => {
      const res = await setScheduledDateAction(id, date);
      setBusyId(null);
      if (!res.ok) setError(res.message ?? "Could not update the schedule.");
    });
  }

  // Columns: every assignee that appears in the window, plus an Unassigned
  // bucket when needed. The current user's own column sorts to the front.
  const columns = useMemo(() => {
    const map = new Map<string, string>();
    let hasUnassigned = false;
    for (const it of items) {
      if (it.assigneeId) map.set(it.assigneeId, it.assigneeName ?? "—");
      else hasUnassigned = true;
    }
    const cols = [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => {
        if (a.id === currentUserId) return -1;
        if (b.id === currentUserId) return 1;
        return a.name.localeCompare(b.name);
      });
    if (hasUnassigned) cols.push({ id: UNASSIGNED, name: "Unassigned" });
    return cols;
  }, [items, currentUserId]);

  // date -> column -> items
  const grid = useMemo(() => {
    const m = new Map<string, Map<string, ScheduleItem[]>>();
    for (const it of items) {
      const col = it.assigneeId ?? UNASSIGNED;
      const byCol = m.get(it.plannedFor) ?? new Map<string, ScheduleItem[]>();
      const list = byCol.get(col) ?? [];
      list.push(it);
      byCol.set(col, list);
      m.set(it.plannedFor, byCol);
    }
    return m;
  }, [items]);

  const perColumnCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const col = it.assigneeId ?? UNASSIGNED;
      m.set(col, (m.get(col) ?? 0) + 1);
    }
    return m;
  }, [items]);

  const rangeLabel = `${rangeFmt.format(new Date(`${from}T00:00:00`))} – ${rangeFmt.format(new Date(`${dates[dates.length - 1]}T00:00:00`))}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">📅 Project Schedule</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isAdmin
              ? "Set a planned date to pin work to a day. Items with no plan show on their deadline."
              : "What to prioritize each day — your own column is highlighted."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 shadow-sm">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-medium"
            value={termId}
            onChange={(e) => setParam({ term: e.target.value || null })}
          >
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="flex items-center overflow-hidden rounded-md border border-input">
            <button
              className="px-2.5 py-1.5 text-sm hover:bg-accent"
              onClick={() => setParam({ from: addDays(from, -days) })}
              aria-label="Previous"
            >
              ←
            </button>
            <button
              className="border-x border-input px-2.5 py-1.5 text-sm font-medium hover:bg-accent"
              onClick={() => setParam({ from: today })}
            >
              Today
            </button>
            <button
              className="px-2.5 py-1.5 text-sm hover:bg-accent"
              onClick={() => setParam({ from: addDays(from, days) })}
              aria-label="Next"
            >
              →
            </button>
          </div>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={days}
            onChange={(e) => setParam({ days: e.target.value })}
          >
            <option value="7">7 days</option>
            <option value="14">14 days</option>
          </select>
        </div>
      </div>

      <div className="text-sm font-medium text-muted-foreground">{rangeLabel}</div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      {columns.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-16 text-center">
          <span className="text-4xl">🗓️</span>
          <p className="text-sm font-medium text-muted-foreground">Nothing scheduled or due in this range.</p>
          <p className="text-xs text-muted-foreground">Try the Next arrow, or plan items from the Work Board.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 min-w-[7rem] border-b border-r border-border bg-muted p-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Date
                </th>
                {columns.map((c) => {
                  const color = colorFor(c.id);
                  const isMe = c.id === currentUserId;
                  return (
                    <th
                      key={c.id}
                      className={cn(
                        "min-w-[12rem] border-b border-l border-border bg-card p-2.5 text-left align-middle",
                        isMe && "bg-primary/5",
                      )}
                      style={{ borderBottomWidth: 3, borderBottomColor: color }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
                          style={{ backgroundColor: color }}
                        >
                          {initials(c.name)}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold leading-tight">
                            {c.name}
                            {isMe && <span className="ml-1 text-[10px] font-bold uppercase text-primary">you</span>}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {perColumnCount.get(c.id) ?? 0} item{(perColumnCount.get(c.id) ?? 0) === 1 ? "" : "s"}
                          </div>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => {
                const isToday = date === today;
                const weekend = isWeekend(date);
                const byCol = grid.get(date);
                const past = date < today;
                return (
                  <tr key={date} className={cn(isToday && "bg-primary/[0.04]")}>
                    <th
                      scope="row"
                      className={cn(
                        "sticky left-0 z-20 min-w-[7rem] border-b border-r border-border p-3 text-left align-top font-normal",
                        isToday ? "bg-primary text-primary-foreground" : weekend ? "bg-muted/70" : "bg-card",
                      )}
                    >
                      <div className={cn("text-lg font-bold leading-none", !isToday && "text-foreground")}>
                        {dateFmt.format(new Date(`${date}T00:00:00`))}
                      </div>
                      <div className={cn("mt-1 text-xs font-medium", isToday ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        <span className="md:hidden">{dayShortFmt.format(new Date(`${date}T00:00:00`))}</span>
                        <span className="hidden md:inline">{dayNameFmt.format(new Date(`${date}T00:00:00`))}</span>
                      </div>
                      {isToday && (
                        <div className="mt-1 inline-block rounded-full bg-primary-foreground/20 px-2 py-0.5 text-[10px] font-bold uppercase">
                          Today
                        </div>
                      )}
                    </th>
                    {columns.map((c) => {
                      const color = colorFor(c.id);
                      const cell = byCol?.get(c.id) ?? [];
                      const isMe = c.id === currentUserId;
                      return (
                        <td
                          key={c.id}
                          className={cn(
                            "border-b border-l border-border p-2 align-top",
                            weekend && "bg-muted/20",
                            isMe && "bg-primary/[0.03]",
                          )}
                          style={{ borderLeftColor: `${color}33` }}
                        >
                          {cell.length === 0 ? (
                            <div className="min-h-[2rem]" />
                          ) : (
                            <div className="flex flex-col gap-2">
                              {cell.map((it) => (
                                <ScheduleCard
                                  key={it.id}
                                  item={it}
                                  isAdmin={isAdmin}
                                  overdue={past && it.status !== "approved"}
                                  onReschedule={reschedule}
                                  pending={pending && busyId === it.id}
                                />
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-card p-3 text-xs">
        <span className="font-semibold uppercase tracking-wide text-muted-foreground">Legend</span>
        {(Object.keys(TYPE_STYLES) as DeliverableType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded", TYPE_STYLES[t].bar)} />
            {DELIVERABLE_TYPE_LABELS[t]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-3 w-3 rounded border border-dashed border-muted-foreground/50 bg-muted/30" /> Shown on deadline (not planned yet)
        </span>
      </div>
    </div>
  );
}
