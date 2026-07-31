"use client";

import { Fragment, useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RateCell } from "./rate-cell";

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
  rate: number;
  salary: number;
};

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const timeFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  weekday: "short",
  month: "short",
  day: "numeric",
});

const time = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : "—");

/**
 * Hourly-staff payroll table. Each "Approved hours" cell expands to reveal the
 * individual approved clock-in / clock-out sessions behind the total, so the
 * login/logout history stays visible after approval. Manual entries (no clock
 * times) still list their date and hours.
 */
export function HourlyStaffTable({
  rows,
  sessions,
  isOwner,
}: {
  rows: HourlyRow[];
  sessions: Record<string, ApprovedSession[]>;
  isOwner: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const colSpan = isOwner ? 4 : 2;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Approved hours</TableHead>
          {isOwner && <TableHead>Rate (₱ / hour)</TableHead>}
          {isOwner && <TableHead className="text-right">Salary</TableHead>}
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
                      <span className="tabular-nums">{row.approvedHours.toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground">
                        ({list.length} {list.length === 1 ? "session" : "sessions"}) {isOpen ? "▲" : "▼"}
                      </span>
                    </button>
                  ) : (
                    <span className="tabular-nums">{row.approvedHours.toFixed(2)}</span>
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
              </TableRow>
              {isOpen && (
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={colSpan} className="py-3">
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Approved clock-in / clock-out history
                      </div>
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
                                <td className="py-1.5 pr-4 whitespace-nowrap">
                                  {dateFmt.format(new Date(`${s.workDate}T00:00:00+08:00`))}
                                </td>
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
