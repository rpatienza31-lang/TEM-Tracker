"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DELIVERABLE_TYPE_LABELS, STATUS_LABELS, type DeliverableType, type ItemStatus } from "@/lib/constants";
import {
  setAvailabilityAction,
  setCotDeadlineAction,
  setCotScheduleNoteAction,
  setDueDateAction,
  setScheduleNoteAction,
} from "@/lib/work-items/actions";
import type { AvailabilityKind, ScheduleEntry, StaffAvailability } from "@/lib/work-items/queries";
import { cn } from "@/lib/utils";
import { AvailabilityDialog } from "./availability-dialog";

type ScheduleItem = ScheduleEntry;
type Option = { id: string; name: string };

// Staff non-working-day markers shown in a cell. `box` styles the banner; `cell`
// tints the whole day cell so it's obvious at a glance.
const AVAILABILITY: Record<AvailabilityKind, { label: string; emoji: string; box: string; cell: string }> = {
  day_off: {
    label: "Day off",
    emoji: "😴",
    box: "border-sky-300 bg-sky-200 text-sky-800 dark:border-sky-800 dark:bg-sky-900 dark:text-sky-100",
    cell: "bg-sky-100 dark:bg-sky-950/40",
  },
  vacation: {
    label: "Vacation",
    emoji: "🌴",
    box: "border-yellow-300 bg-yellow-200 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
    cell: "bg-yellow-100 dark:bg-yellow-950/40",
  },
  school: {
    label: "School",
    emoji: "🎓",
    box: "border-purple-300 bg-purple-200 text-purple-800 dark:border-purple-800 dark:bg-purple-900 dark:text-purple-100",
    cell: "bg-purple-100 dark:bg-purple-950/40",
  },
  absent: {
    label: "Absent",
    emoji: "🚫",
    box: "border-red-300 bg-red-200 text-red-800 dark:border-red-800 dark:bg-red-900 dark:text-red-100",
    cell: "bg-red-100 dark:bg-red-950/40",
  },
};
const AVAILABILITY_KINDS = Object.keys(AVAILABILITY) as AvailabilityKind[];

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

// Small deliverable-type badge colour (DLP/PPT/COT), kept subtle so status is
// the dominant signal on the card.
const TYPE_BADGE: Record<DeliverableType, string> = {
  DLP: "bg-blue-600 text-white",
  PPT: "bg-violet-600 text-white",
  COT_DLP: "bg-amber-500 text-white",
  COT_PPT: "bg-rose-600 text-white",
};

// Progress-status look: the card body/border tint, the left accent bar, and the
// status pill — so a glance down a column reads as available → uploaded.
const STATUS_STYLES: Record<ItemStatus, { card: string; bar: string; pill: string }> = {
  available: {
    card: "border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/40",
    bar: "bg-slate-400",
    pill: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  claimed: {
    card: "border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/40",
    bar: "bg-blue-500",
    pill: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  in_review: {
    card: "border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/40",
    bar: "bg-amber-500",
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  revision: {
    card: "border-orange-200 bg-orange-50/80 dark:border-orange-900 dark:bg-orange-950/40",
    bar: "bg-orange-500",
    pill: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  },
  approved: {
    card: "border-green-200 bg-green-50/80 dark:border-green-900 dark:bg-green-950/40",
    bar: "bg-green-500",
    pill: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  },
  uploaded: {
    card: "border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/50",
    bar: "bg-emerald-600",
    pill: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200",
  },
  cancelled: {
    card: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40",
    bar: "bg-slate-300",
    pill: "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
};

// Lifecycle order shown in the legend (cancelled work never reaches the grid).
const SCHEDULE_STATUSES: ItemStatus[] = ["available", "claimed", "in_review", "revision", "approved", "uploaded"];

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
 * The staff non-working-day marker at the top of a cell. Shows a coloured
 * banner (Day off / Vacation / School / Absent) when set. Admins can pick a
 * status from a small menu, or clear the current one.
 */
function AvailabilityCell({
  editorId,
  date,
  current,
  isAdmin,
  onSet,
  pending,
}: {
  editorId: string;
  date: string;
  current: AvailabilityKind | null;
  isAdmin: boolean;
  onSet: (editorId: string, date: string, kind: AvailabilityKind | null) => void;
  pending: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (current) {
    const a = AVAILABILITY[current];
    return (
      <div className={cn("mb-1 flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-sm font-bold", a.box)}>
        <span aria-hidden className="text-base">
          {a.emoji}
        </span>
        <span className="uppercase tracking-wide">{a.label}</span>
        {isAdmin && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onSet(editorId, date, null)}
            className="ml-auto text-sm opacity-70 hover:opacity-100"
            title="Clear"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  if (!isAdmin) return null;

  if (!menuOpen) {
    return (
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className="mb-1 w-full rounded border border-dashed border-border/70 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:bg-muted/50 focus:opacity-100 group-hover:opacity-100"
      >
        ＋ off
      </button>
    );
  }

  return (
    <div className="mb-1 flex flex-wrap gap-1 rounded-md border border-border bg-background p-1">
      {AVAILABILITY_KINDS.map((k) => (
        <button
          key={k}
          type="button"
          disabled={pending}
          onClick={() => {
            onSet(editorId, date, k);
            setMenuOpen(false);
          }}
          className={cn("rounded px-1 py-0.5 text-[10px] font-medium", AVAILABILITY[k].box)}
          title={AVAILABILITY[k].label}
        >
          {AVAILABILITY[k].emoji}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setMenuOpen(false)}
        className="rounded px-1 py-0.5 text-[10px] text-muted-foreground"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * One work item as a schedule card, colour-coded by progress status (available →
 * uploaded) via the card tint, left accent bar and status pill, so it's easy to
 * see at a glance what's claimed, in review, or done. A small type badge keeps
 * DLP/PPT/COT identifiable, and past-due items get an "overdue" flag. Admins get
 * an inline date control to move the deadline or clear it off the schedule.
 */
function ScheduleCard({
  item,
  isAdmin,
  overdue,
  onReschedule,
  onSaveNote,
  pending,
}: {
  item: ScheduleItem;
  isAdmin: boolean;
  overdue: boolean;
  onReschedule: (item: ScheduleItem, date: string | null) => void;
  onSaveNote: (item: ScheduleItem, note: string) => void;
  pending: boolean;
}) {
  const status = STATUS_STYLES[item.status];
  const isCot = item.kind === "cot";
  const [noteOpen, setNoteOpen] = useState(false);
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border pl-2.5 pr-2 py-2 shadow-sm transition-shadow hover:shadow-md",
        status.card,
        pending && "opacity-50",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1.5", status.bar)} />
      <div className="flex flex-wrap items-center gap-1">
        {isCot ? (
          <>
            <span className="rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              COT
            </span>
            {item.cotWorkKind && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  item.cotWorkKind === "align"
                    ? "bg-orange-500 text-white"
                    : "bg-emerald-600 text-white",
                )}
              >
                {item.cotWorkKind === "align" ? "Align" : "New"}
              </span>
            )}
          </>
        ) : (
          <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/80">
            {item.termName}
          </span>
        )}
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", TYPE_BADGE[item.type])}>
          {DELIVERABLE_TYPE_LABELS[item.type]}
        </span>
        <span className={cn("ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold", status.pill)}>
          {STATUS_LABELS[item.status]}
        </span>
      </div>
      <div className="mt-1.5 text-sm font-semibold leading-tight text-foreground">{item.title}</div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>{item.subtitle}</span>
        {overdue && item.status !== "uploaded" && (
          <span className="rounded bg-destructive/15 px-1 py-0.5 text-[10px] font-semibold uppercase text-destructive">
            overdue
          </span>
        )}
      </div>

      {item.scheduleNote && !noteOpen && (
        <div className="mt-1.5 flex items-start gap-1 rounded bg-background/70 px-1.5 py-1 text-[11px] leading-snug text-foreground">
          <span aria-hidden>📝</span>
          <span className="whitespace-pre-wrap break-words">{item.scheduleNote}</span>
        </div>
      )}

      {isAdmin && (
        <div className="mt-1.5 flex flex-col gap-1 border-t border-border/60 pt-1.5">
          <div className="flex items-center gap-1">
            <input
              type="date"
              defaultValue={item.dueDate}
              disabled={pending}
              onChange={(e) => onReschedule(item, e.target.value || null)}
              className="h-6 w-[7.5rem] rounded border border-input bg-background px-1 text-[11px]"
              aria-label="Deadline"
            />
            {!isCot && (
              <button
                type="button"
                disabled={pending}
                onClick={() => onReschedule(item, null)}
                className="text-[11px] text-muted-foreground underline hover:text-destructive"
                title="Remove from schedule (clears the deadline)"
              >
                clear
              </button>
            )}
            {!noteOpen && (
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="ml-auto text-[11px] text-primary underline"
              >
                {item.scheduleNote ? "Edit note" : "+ Note"}
              </button>
            )}
          </div>
          {noteOpen && (
            <div className="flex flex-col gap-1">
              <textarea
                defaultValue={item.scheduleNote ?? ""}
                disabled={pending}
                rows={2}
                placeholder="Note for this project…"
                onBlur={(e) => {
                  if ((e.target.value.trim() || "") !== (item.scheduleNote ?? "")) {
                    onSaveNote(item, e.target.value);
                  }
                  setNoteOpen(false);
                }}
                autoFocus
                className="w-full rounded border border-input bg-background px-1.5 py-1 text-[11px] leading-snug"
              />
              <span className="text-[10px] text-muted-foreground">Click away to save.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ScheduleClient({
  items,
  availability,
  allStaff,
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
  availability: StaffAvailability[];
  allStaff: Option[];
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
  const [showAllStaff, setShowAllStaff] = useState(false);

  // key `${editorId}|${date}` -> kind
  const availByKey = useMemo(() => {
    const m = new Map<string, AvailabilityKind>();
    for (const a of availability) m.set(`${a.editorId}|${a.date}`, a.kind);
    return m;
  }, [availability]);

  function setAvailability(editorId: string, date: string, kind: AvailabilityKind | null) {
    setBusyId(`${editorId}|${date}`);
    setError(null);
    startTransition(async () => {
      const res = await setAvailabilityAction(editorId, date, kind);
      setBusyId(null);
      if (!res.ok) setError(res.message ?? "Could not update availability.");
    });
  }

  function setParam(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function reschedule(item: ScheduleItem, date: string | null) {
    setBusyId(item.id);
    setError(null);
    startTransition(async () => {
      const res =
        item.kind === "cot"
          ? await setCotDeadlineAction(item.actionRefId, date)
          : await setDueDateAction(item.actionRefId, date);
      setBusyId(null);
      if (!res.ok) setError(res.message ?? "Could not update the schedule.");
    });
  }

  function saveNote(item: ScheduleItem, note: string) {
    setBusyId(item.id);
    setError(null);
    startTransition(async () => {
      const res =
        item.kind === "cot"
          ? await setCotScheduleNoteAction(item.actionRefId, note)
          : await setScheduleNoteAction(item.actionRefId, note);
      setBusyId(null);
      if (!res.ok) setError(res.message ?? "Could not save the note.");
    });
  }

  // Columns: staff with work or a day-off marker in the window (or every active
  // staffer when "Show all staff" is on, so anyone can be marked off), plus an
  // Unassigned bucket when needed. The current user's own column sorts first.
  const columns = useMemo(() => {
    const nameById = new Map<string, string>();
    for (const s of allStaff) nameById.set(s.id, s.name);
    for (const it of items) if (it.assigneeId && it.assigneeName) nameById.set(it.assigneeId, it.assigneeName);
    for (const a of availability) nameById.set(a.editorId, a.editorName);

    let hasUnassigned = false;
    const present = new Set<string>();
    for (const it of items) {
      if (it.assigneeId) present.add(it.assigneeId);
      else hasUnassigned = true;
    }
    for (const a of availability) present.add(a.editorId);

    const ids = showAllStaff ? allStaff.map((s) => s.id) : [...present];
    const cols = [...new Set(ids)]
      .map((id) => ({ id, name: nameById.get(id) ?? "—" }))
      .sort((a, b) => {
        if (a.id === currentUserId) return -1;
        if (b.id === currentUserId) return 1;
        return a.name.localeCompare(b.name);
      });
    if (hasUnassigned) cols.push({ id: UNASSIGNED, name: "Unassigned" });
    return cols;
  }, [items, availability, allStaff, showAllStaff, currentUserId]);

  // date -> column -> items
  const grid = useMemo(() => {
    const m = new Map<string, Map<string, ScheduleItem[]>>();
    for (const it of items) {
      const col = it.assigneeId ?? UNASSIGNED;
      const byCol = m.get(it.dueDate) ?? new Map<string, ScheduleItem[]>();
      const list = byCol.get(col) ?? [];
      list.push(it);
      byCol.set(col, list);
      m.set(it.dueDate, byCol);
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
              ? "All terms and COT orders in one calendar, on their deadline. Set a deadline when assigning on the Work Board, or move a card here to change it."
              : "What to prioritize each day — all terms and COT in one view; your own column is highlighted."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2 shadow-sm">
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-medium"
            value={termId}
            onChange={(e) => setParam({ term: e.target.value || null })}
          >
            <option value="">All terms</option>
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
          {isAdmin && (
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showAllStaff}
                onChange={(e) => setShowAllStaff(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Show all staff
            </label>
          )}
          {isAdmin && <AvailabilityDialog allStaff={allStaff} defaultFrom={from} />}
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
          <p className="text-sm font-medium text-muted-foreground">Nothing scheduled in this range.</p>
          <p className="text-xs text-muted-foreground">Try the Next arrow, or set deadlines when you assign work on the Work Board.</p>
        </div>
      ) : (
        <div className="max-h-[calc(100vh-11rem)] overflow-auto rounded-xl border border-border shadow-sm">
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
                      className="sticky top-0 z-10 min-w-[12rem] border-b border-l border-border bg-card p-2.5 text-left align-middle"
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
                      const availKey = `${c.id}|${date}`;
                      const avail = c.id === UNASSIGNED ? null : availByKey.get(availKey) ?? null;
                      return (
                        <td
                          key={c.id}
                          className={cn(
                            "group border-b border-l border-border p-2 align-top",
                            weekend && "bg-muted/20",
                            isMe && "bg-primary/[0.03]",
                            // Whole-cell tint when the staffer is off this day — wins over the above.
                            avail && AVAILABILITY[avail].cell,
                          )}
                          style={{ borderLeftColor: `${color}33` }}
                        >
                          {c.id !== UNASSIGNED && (
                            <AvailabilityCell
                              editorId={c.id}
                              date={date}
                              current={avail}
                              isAdmin={isAdmin}
                              onSet={setAvailability}
                              pending={pending && busyId === availKey}
                            />
                          )}
                          {cell.length === 0 ? (
                            <div className="min-h-[1.5rem]" />
                          ) : (
                            <div className="flex flex-col gap-2">
                              {cell.map((it) => (
                                <ScheduleCard
                                  key={it.id}
                                  item={it}
                                  isAdmin={isAdmin}
                                  overdue={past && it.status !== "uploaded"}
                                  onReschedule={reschedule}
                                  onSaveNote={saveNote}
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
        <span className="font-semibold uppercase tracking-wide text-muted-foreground">Status</span>
        {SCHEDULE_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded", STATUS_STYLES[s].bar)} />
            {STATUS_LABELS[s]}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-destructive">
          <span className="h-3 w-3 rounded bg-destructive/70" /> Overdue tag = past deadline
        </span>
        <span className="ml-2 border-l border-border pl-3 font-semibold uppercase tracking-wide text-muted-foreground">
          Off
        </span>
        {AVAILABILITY_KINDS.map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span aria-hidden>{AVAILABILITY[k].emoji}</span>
            {AVAILABILITY[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}
