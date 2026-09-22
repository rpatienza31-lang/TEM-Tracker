"use client";

import { Fragment, useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RateCell } from "./rate-cell";
import { EditableSessionRow } from "./hourly-staff-table";
import { markDailyPaidAction, type SetRateState } from "./actions";
import { addAttendanceDayAction, deleteTimeLogAction } from "@/lib/time-logs/actions";
import type { DailyStaffRow, DailySession } from "@/lib/payroll/daily";

/** Owner control to remove one attendance day (a wrong or duplicate clock-in). */
function RemoveDayButton({ logId }: { logId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      title="Remove this attendance day"
      onClick={() => {
        if (!window.confirm("Remove this attendance day? It will lower the day count.")) return;
        startTransition(async () => {
          const res = await deleteTimeLogAction(logId);
          if (res.ok) router.refresh();
        });
      }}
      className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/10"
    >
      Remove
    </button>
  );
}

/** Owner control to add a missing attendance day for a daily staffer. */
function AddDayForm({ userId }: { userId: string }) {
  const [date, setDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2">
      <span className="text-xs text-muted-foreground">Add a missing day:</span>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-1.5 text-xs"
        aria-label="Attendance date to add"
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending || !date}
        onClick={() => {
          setErr(null);
          startTransition(async () => {
            const res = await addAttendanceDayAction(userId, date);
            if (res.ok) {
              setDate("");
              router.refresh();
            } else setErr(res.message);
          });
        }}
      >
        {pending ? "Adding…" : "Add day"}
      </Button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const timeFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
const time = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : "—");
const day = (workDate: string) => dateFmt.format(new Date(`${workDate}T00:00:00+08:00`));
const initial: SetRateState = { status: "idle" };

/**
 * Owner control that records a daily-staff payout for the period. The number of
 * days is editable here, so the owner can adjust it (e.g. a staffer forgot to
 * clock in, or a clocked-in day shouldn't be paid) before recording the payout.
 */
function MarkDailyPaidButton({
  userId,
  daysUnpaid,
  dailyRate,
  isPaid,
  from,
  to,
}: {
  userId: string;
  daysUnpaid: number;
  dailyRate: number;
  isPaid: boolean;
  from: string;
  to: string;
}) {
  const [state, formAction, pending] = useActionState(markDailyPaidAction, initial);
  const [days, setDays] = useState(daysUnpaid);

  if (isPaid) return <span className="text-xs text-status-approved">Paid ✓</span>;
  if (daysUnpaid <= 0 && dailyRate <= 0) return <span className="text-xs text-muted-foreground">—</span>;

  const amount = Math.round(days * dailyRate * 100) / 100;

  return (
    <form
      action={formAction}
      className="flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (!window.confirm(`Mark ${days} day(s) = ${peso.format(amount)} as paid for this staff member?`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="days" value={days} />
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          step="0.5"
          min={0}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-8 w-16 rounded-md border border-input bg-background px-1.5 text-right text-sm tabular-nums"
          aria-label="Days to pay"
        />
        <span className="text-xs text-muted-foreground">days</span>
        <Button type="submit" size="sm" variant="secondary" disabled={pending || days <= 0}>
          {pending ? "Saving…" : "Mark paid"}
        </Button>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {peso.format(amount)}
        {days !== daysUnpaid && (
          <button type="button" onClick={() => setDays(daysUnpaid)} className="ml-1.5 text-primary underline">
            reset ({daysUnpaid})
          </button>
        )}
      </div>
      {state.status === "error" && <span className="text-xs text-destructive">{state.message}</span>}
    </form>
  );
}

/**
 * Fixed-daily staff payroll table: days present (attendance) × daily rate. Clock
 * in/out only feeds the day count — pay is a fixed amount per day worked.
 */
export function DailyStaffTable({
  rows,
  sessions,
  isOwner,
  from,
  to,
}: {
  rows: DailyStaffRow[];
  sessions: Record<string, DailySession[]>;
  isOwner: boolean;
  from: string;
  to: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const colSpan = isOwner ? 5 : 2;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Days present (unpaid)</TableHead>
          {isOwner && <TableHead>Rate (₱ / day)</TableHead>}
          {isOwner && <TableHead className="text-right">Salary</TableHead>}
          {isOwner && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const list = sessions[row.userId] ?? [];
          const isOpen = openId === row.userId;
          return (
            <Fragment key={row.userId}>
              <TableRow>
                <TableCell>{row.fullName}</TableCell>
                <TableCell className="tabular-nums">
                  {list.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : row.userId)}
                      className="inline-flex items-center gap-1 rounded text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
                      aria-expanded={isOpen}
                    >
                      {row.daysUnpaid}
                      <span className="text-xs text-muted-foreground">
                        {row.daysPaid > 0 ? `(of ${row.daysPresent}) ` : ""}
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </button>
                  ) : (
                    <span>{row.daysUnpaid}</span>
                  )}
                </TableCell>
                {isOwner && (
                  <TableCell>
                    <RateCell userId={row.userId} rate={row.dailyRate} field="daily" />
                  </TableCell>
                )}
                {isOwner && (
                  <TableCell className="text-right font-medium tabular-nums">{peso.format(row.salary)}</TableCell>
                )}
                {isOwner && (
                  <TableCell>
                    <MarkDailyPaidButton
                      userId={row.userId}
                      daysUnpaid={row.daysUnpaid}
                      dailyRate={row.dailyRate}
                      isPaid={row.isPaid}
                      from={from}
                      to={to}
                    />
                  </TableCell>
                )}
              </TableRow>
              {isOpen && (
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={colSpan} className="py-3">
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Clock-in / clock-out (attendance)
                        {isOwner && " — edit a time, or add / remove a day so the day count is correct"}
                      </div>
                      {isOwner ? (
                        <div className="flex flex-col">
                          <div className="grid grid-cols-[minmax(7rem,1fr)_auto_auto_4rem_auto] gap-x-3 pb-1 text-xs text-muted-foreground">
                            <span>Date</span>
                            <span className="w-32">Time in</span>
                            <span className="w-32">Time out</span>
                            <span className="text-right">Hours</span>
                            <span className="min-w-[4.5rem]" />
                          </div>
                          {list.map((s) => (
                            <div key={s.id} className="flex items-center gap-1">
                              <div className="flex-1">
                                <EditableSessionRow session={s} />
                              </div>
                              <RemoveDayButton logId={s.id} />
                            </div>
                          ))}
                          <AddDayForm userId={row.userId} />
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-muted-foreground">
                                <th className="py-1 pr-4 font-medium">Date</th>
                                <th className="py-1 pr-4 font-medium">Time in</th>
                                <th className="py-1 pr-4 font-medium">Time out</th>
                              </tr>
                            </thead>
                            <tbody>
                              {list.map((s) => (
                                <tr key={s.id} className="border-t border-border/60">
                                  <td className="py-1.5 pr-4 whitespace-nowrap">{day(s.workDate)}</td>
                                  <td className="py-1.5 pr-4 whitespace-nowrap tabular-nums">{time(s.clockInIso)}</td>
                                  <td className="py-1.5 pr-4 whitespace-nowrap tabular-nums">
                                    {s.clockOutIso ? time(s.clockOutIso) : "— (open)"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
              No daily staff yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
