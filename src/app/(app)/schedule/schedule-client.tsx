"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DELIVERABLE_TYPE_LABELS } from "@/lib/constants";
import { setScheduledDateAction } from "@/lib/work-items/actions";
import type { BoardItem } from "@/lib/work-items/queries";
import { cn } from "@/lib/utils";

type ScheduleItem = BoardItem & { plannedFor: string; isScheduled: boolean };
type Option = { id: string; name: string };

const UNASSIGNED = "__unassigned__";

const dayFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short" });
const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
const rangeFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * One work item as it appears in a schedule cell. Scheduled items are solid;
 * items only showing because their deadline falls here are dimmed with a "due"
 * hint, so the owner can tell planned work from work that merely lands today.
 * Admins get a date input to move the item to another day (or clear the plan).
 */
function ScheduleCard({
  item,
  isAdmin,
  onReschedule,
  pending,
}: {
  item: ScheduleItem;
  isAdmin: boolean;
  onReschedule: (id: string, date: string | null) => void;
  pending: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5 text-xs",
        item.isScheduled
          ? "border-primary/30 bg-primary/5"
          : "border-dashed border-border bg-background text-muted-foreground",
        pending && "opacity-50",
      )}
    >
      <div className="flex items-center gap-1">
        <Badge variant={item.type.startsWith("COT") ? "outline" : "secondary"} className="shrink-0">
          {DELIVERABLE_TYPE_LABELS[item.type]}
        </Badge>
        {!item.isScheduled && <span className="text-[10px] uppercase tracking-wide">due</span>}
      </div>
      <div className="mt-1 font-medium text-foreground">
        G{item.grade} · {item.subjectCode || item.subjectName} · W{item.weekNumber}
      </div>
      {isAdmin && (
        <div className="mt-1 flex items-center gap-1">
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

  const rangeLabel = `${rangeFmt.format(new Date(`${from}T00:00:00`))} – ${rangeFmt.format(new Date(`${dates[dates.length - 1]}T00:00:00`))}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Project Schedule</h1>
        <p className="text-sm text-muted-foreground">
          What each editor should prioritize per day. {isAdmin ? "Set a planned date to pin an item to a day; items with no plan show on their deadline." : "Your own column is highlighted."}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
          <button className="ml-2 underline" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={termId}
          onChange={(e) => setParam({ term: e.target.value || null })}
        >
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setParam({ from: addDays(from, -days) })}>
            ← Prev
          </Button>
          <Button variant="outline" size="sm" onClick={() => setParam({ from: today })}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setParam({ from: addDays(from, days) })}>
            Next →
          </Button>
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={days}
          onChange={(e) => setParam({ days: e.target.value })}
        >
          <option value="7">7 days</option>
          <option value="14">14 days</option>
        </select>
        <span className="text-sm text-muted-foreground">{rangeLabel}</span>
      </div>

      {columns.length === 0 ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
          Nothing scheduled or due in this range.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60">
                <th className="sticky left-0 z-10 min-w-[7rem] border-b border-r border-border bg-muted/60 p-2 text-left font-medium">
                  Date
                </th>
                {columns.map((c) => (
                  <th
                    key={c.id}
                    className={cn(
                      "min-w-[11rem] border-b border-l border-border p-2 text-left font-medium",
                      c.id === currentUserId && "bg-primary/10",
                    )}
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => {
                const isToday = date === today;
                const byCol = grid.get(date);
                return (
                  <tr key={date} className={cn(isToday && "bg-primary/5")}>
                    <th
                      scope="row"
                      className={cn(
                        "sticky left-0 z-10 border-b border-r border-border bg-card p-2 text-left align-top font-normal",
                        isToday && "bg-primary/10",
                      )}
                    >
                      <div className="font-medium">{dayFmt.format(new Date(`${date}T00:00:00`))}</div>
                      <div className="text-xs text-muted-foreground">{dateFmt.format(new Date(`${date}T00:00:00`))}</div>
                      {isToday && <div className="text-[10px] font-semibold uppercase text-primary">Today</div>}
                    </th>
                    {columns.map((c) => {
                      const cell = byCol?.get(c.id) ?? [];
                      return (
                        <td
                          key={c.id}
                          className={cn(
                            "border-b border-l border-border p-1.5 align-top",
                            c.id === currentUserId && "bg-primary/[0.03]",
                          )}
                        >
                          <div className="flex flex-col gap-1.5">
                            {cell.map((it) => (
                              <ScheduleCard
                                key={it.id}
                                item={it}
                                isAdmin={isAdmin}
                                onReschedule={reschedule}
                                pending={pending && busyId === it.id}
                              />
                            ))}
                          </div>
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

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border border-primary/30 bg-primary/5" /> Planned for this day
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border border-dashed border-border bg-background" /> Shown on its deadline (not yet planned)
        </span>
      </div>
    </div>
  );
}
