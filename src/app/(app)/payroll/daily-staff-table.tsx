"use client";

import { useActionState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RateCell } from "./rate-cell";
import { markDailyPaidAction, type SetRateState } from "./actions";
import type { DailyStaffRow } from "@/lib/payroll/daily";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
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
  isOwner,
  from,
  to,
}: {
  rows: DailyStaffRow[];
  isOwner: boolean;
  from: string;
  to: string;
}) {
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
        {rows.map((row) => (
          <TableRow key={row.userId}>
            <TableCell>{row.fullName}</TableCell>
            <TableCell className="tabular-nums">
              {row.daysUnpaid}
              {row.daysPaid > 0 && <span className="ml-1 text-xs text-muted-foreground">(of {row.daysPresent})</span>}
            </TableCell>
            {isOwner && (
              <TableCell>
                <RateCell userId={row.userId} rate={row.dailyRate} field="daily" />
              </TableCell>
            )}
            {isOwner && <TableCell className="text-right font-medium tabular-nums">{peso.format(row.salary)}</TableCell>}
            {isOwner && (
              <TableCell>
                <MarkDailyPaidButton userId={row.userId} salary={row.salary} isPaid={row.isPaid} from={from} to={to} />
              </TableCell>
            )}
          </TableRow>
        ))}
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
