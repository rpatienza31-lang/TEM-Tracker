"use client";

import { Fragment, useActionState, useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RateCell } from "./rate-cell";
import { editTimeLogTimesAction, markHourlyPaidAction, type SetRateState } from "./actions";

export type ApprovedSession = {
  id: string;
  workDate: string;
  clockInIso: string | null;
  clockOutIso: string | null;
  hours: number;
  note: string | null;
};

export type HourlyRow = {
  userId: string;
  fullName: string;
  approvedHours: number;
  hoursPaid: number;
  hoursUnpaid: number;
  rate: number;
  salary: number;
  isPaid: boolean;
  lastPaidAt: string | null;
};

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const timeFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  month: "short",
  day: "numeric",
});
// 24-hour HH:MM in PH time, the value shape <input type="time"> expects.
const hhmmFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Manila",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const time = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : "—");
const hhmm = (iso: string | null) => (iso ? hhmmFmt.format(new Date(iso)) : "");
const day = (workDate: string) => dateFmt.format(new Date(`${workDate}T00:00:00+08:00`));
const paidFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

const initial: SetRateState = { status: "idle" };

/** Owner control that pays a staff member's unpaid hours and records the payout. */
function MarkHourlyPaidButton({
  userId,
  salary,
  isPaid,
  lastPaidAt,
  from,
  to,
}: {
  userId: string;
  salary: number;
  isPaid: boolean;
  lastPaidAt: string | null;
  from: string;
  to: string;
}) {
  const [state, formAction, pending] = useActionState(markHourlyPaidAction, initial);

  if (isPaid) {
    return (
      <span className="text-xs text-status-approved">
        Paid{lastPaidAt ? ` · ${paidFmt.format(new Date(lastPaidAt))}` : ""} ✓
      </span>
    );
  }
  if (salary <= 0) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm(`Mark ${peso.format(salary)} as paid for this staff member this period?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Mark paid"}
      </Button>
      {state.status === "error" && <span className="ml-1 text-xs text-destructive">{state.message}</span>}
    </form>
  );
}

/** One session, editable in place: owner corrects the clock times, hours recompute on save. */
export function EditableSessionRow({ session }: { session: ApprovedSession }) {
  const [state, formAction, pending] = useActionState(editTimeLogTimesAction, initial);
  const savedIn = hhmm(session.clockInIso);
  const savedOut = hhmm(session.clockOutIso);
  const [timeIn, setTimeIn] = useState(savedIn);
  const [timeOut, setTimeOut] = useState(savedOut);
  const dirty = timeIn !== savedIn || timeOut !== savedOut;
  // After a successful save the revalidated times match the inputs (dirty is
  // false), so a clean row that just saved shows the confirmation.
  const justSaved = state.status === "ok" && !dirty;

  return (
    <form
      action={formAction}
      className="grid grid-cols-[minmax(7rem,1fr)_auto_auto_4rem_auto] items-center gap-x-3 gap-y-1 border-t border-border/60 py-1.5 text-sm"
    >
      <input type="hidden" name="logId" value={session.id} />
      <span className="whitespace-nowrap">{day(session.workDate)}</span>
      <Input
        type="time"
        name="timeIn"
        value={timeIn}
        onChange={(e) => setTimeIn(e.target.value)}
        className="h-8 w-32"
        aria-label={`Time in for ${day(session.workDate)}`}
      />
      <Input
        type="time"
        name="timeOut"
        value={timeOut}
        onChange={(e) => setTimeOut(e.target.value)}
        className="h-8 w-32"
        aria-label={`Time out for ${day(session.workDate)}`}
      />
      <span className="text-right tabular-nums">{session.hours.toFixed(2)}</span>
      <span className="flex min-w-[4.5rem] items-center gap-2">
        {dirty && (
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        )}
        {!dirty && justSaved && <span className="text-xs text-status-approved">Saved ✓</span>}
        {state.status === "error" && <span className="text-xs text-destructive">{state.message}</span>}
      </span>
    </form>
  );
}

/**
 * Hourly-staff payroll table. Each "Approved hours" cell expands to reveal the
 * approved clock-in / clock-out sessions behind the total. The owner can edit a
 * session's clock times in place (for staff who forgot to clock in or out); the
 * hours recompute and the totals update.
 */
export function HourlyStaffTable({
  rows,
  sessions,
  isOwner,
  from,
  to,
}: {
  rows: HourlyRow[];
  sessions: Record<string, ApprovedSession[]>;
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
          <TableHead>Unpaid hours</TableHead>
          {isOwner && <TableHead>Rate (₱ / hour)</TableHead>}
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
                <TableCell>
                  {list.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : row.userId)}
                      className="inline-flex items-center gap-1 rounded text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
                      aria-expanded={isOpen}
                    >
                      <span className="tabular-nums">{row.hoursUnpaid.toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground">
                        {row.hoursPaid > 0 ? `(of ${row.approvedHours.toFixed(2)}) ` : ""}
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </button>
                  ) : (
                    <span className="tabular-nums">{row.hoursUnpaid.toFixed(2)}</span>
                  )}
                </TableCell>
                {isOwner && (
                  <TableCell>
                    <RateCell userId={row.userId} rate={row.rate} field="hourly" />
                  </TableCell>
                )}
                {isOwner && (
                  <TableCell className="text-right font-medium tabular-nums">{peso.format(row.salary)}</TableCell>
                )}
                {isOwner && (
                  <TableCell>
                    <MarkHourlyPaidButton
                      userId={row.userId}
                      salary={row.salary}
                      isPaid={row.isPaid}
                      lastPaidAt={row.lastPaidAt}
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
                        Approved clock-in / clock-out history
                        {isOwner && " — edit a session's times if a staffer forgot to clock in or out"}
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
                            <EditableSessionRow key={s.id} session={s} />
                          ))}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-muted-foreground">
                                <th className="py-1 pr-4 font-medium">Date</th>
                                <th className="py-1 pr-4 font-medium">Time in</th>
                                <th className="py-1 pr-4 font-medium">Time out</th>
                                <th className="py-1 pr-4 text-right font-medium">Hours</th>
                                <th className="py-1 font-medium">Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {list.map((s) => (
                                <tr key={s.id} className="border-t border-border/60">
                                  <td className="py-1.5 pr-4 whitespace-nowrap">{day(s.workDate)}</td>
                                  <td className="py-1.5 pr-4 whitespace-nowrap tabular-nums">{time(s.clockInIso)}</td>
                                  <td className="py-1.5 pr-4 whitespace-nowrap tabular-nums">{time(s.clockOutIso)}</td>
                                  <td className="py-1.5 pr-4 text-right tabular-nums">{s.hours.toFixed(2)}</td>
                                  <td className="py-1.5 text-muted-foreground">
                                    {s.note ?? (!s.clockInIso ? "Manual entry" : "")}
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
              No hourly staff yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
