"use client";

import { Fragment, useActionState, useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RateCell } from "./rate-cell";
import { EditableSessionRow } from "./hourly-staff-table";
import { markDailyPaidAction, type SetRateState } from "./actions";
import type { DailyStaffRow, DailySession } from "@/lib/payroll/daily";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const timeFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
const time = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : "—");
const day = (workDate: string) => dateFmt.format(new Date(`${workDate}T00:00:00+08:00`));
const initial: SetRateState = { status: "idle" };

/** Owner control that records a daily-staff payout for the period. */
function MarkDailyPaidButton({
  userId,
  salary,
  isPaid,
  from,
  to,
}: {
  userId: string;
  salary: number;
  isPaid: boolean;
  from: string;
  to: string;
}) {
  const [state, formAction, pending] = useActionState(markDailyPaidAction, initial);

  if (isPaid) return <span className="text-xs text-status-approved">Paid ✓</span>;
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
                    <MarkDailyPaidButton userId={row.userId} salary={row.salary} isPaid={row.isPaid} from={from} to={to} />
                  </TableCell>
                )}
              </TableRow>
              {isOpen && (
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={colSpan} className="py-3">
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Clock-in / clock-out (attendance)
                        {isOwner && " — edit a time if a staffer forgot to clock in or out"}
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
