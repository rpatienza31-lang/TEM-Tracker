"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CashAdvanceCell } from "./cash-advance-cell";

export type PayslipRowData = {
  userId: string;
  fullName: string;
  quotaSalary: number;
  hourlySalary: number;
  cashAdvance: number;
};

type Include = "both" | "quota" | "hourly";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

const INCLUDE_LABEL: Record<Include, string> = {
  both: "Quota + Hourly",
  quota: "Quota only",
  hourly: "Hourly only",
};

/**
 * Payslips summary. Each row can be paid as Quota + Hourly, quota only, or hourly
 * only — the selector recomputes that person's gross/net and carries the choice
 * into the payslip printout, so an editor who's only getting hourly this period
 * gets an hourly-only slip.
 */
export function PayslipsTable({ rows, from, to }: { rows: PayslipRowData[]; from: string; to: string }) {
  const [include, setInclude] = useState<Record<string, Include>>({});

  const inc = (id: string): Include => include[id] ?? "both";
  const effQuota = (r: PayslipRowData) => (inc(r.userId) === "hourly" ? 0 : r.quotaSalary);
  const effHourly = (r: PayslipRowData) => (inc(r.userId) === "quota" ? 0 : r.hourlySalary);
  const effGross = (r: PayslipRowData) => effQuota(r) + effHourly(r);
  const effNet = (r: PayslipRowData) => effGross(r) - r.cashAdvance;

  const totals = rows.reduce(
    (acc, r) => {
      acc.quota += effQuota(r);
      acc.hourly += effHourly(r);
      acc.gross += effGross(r);
      acc.ca += r.cashAdvance;
      acc.net += effNet(r);
      return acc;
    },
    { quota: 0, hourly: 0, gross: 0, ca: 0, net: 0 },
  );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Name</TableHead>
            <TableHead>Pay for</TableHead>
            <TableHead className="text-right">Quota</TableHead>
            <TableHead className="text-right">Hourly</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead>Cash advance (CA)</TableHead>
            <TableHead className="text-right">Net pay</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const dropQuota = inc(r.userId) === "hourly";
            const dropHourly = inc(r.userId) === "quota";
            return (
              <TableRow key={r.userId}>
                <TableCell className="font-medium">{r.fullName}</TableCell>
                <TableCell>
                  <select
                    value={inc(r.userId)}
                    onChange={(e) => setInclude((prev) => ({ ...prev, [r.userId]: e.target.value as Include }))}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    aria-label="What to pay"
                  >
                    {(Object.keys(INCLUDE_LABEL) as Include[]).map((k) => (
                      <option key={k} value={k}>
                        {INCLUDE_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums text-muted-foreground",
                    dropQuota && "line-through opacity-50",
                  )}
                >
                  {peso.format(r.quotaSalary)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums text-muted-foreground",
                    dropHourly && "line-through opacity-50",
                  )}
                >
                  {peso.format(r.hourlySalary)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{peso.format(effGross(r))}</TableCell>
                <TableCell>
                  <CashAdvanceCell userId={r.userId} amount={r.cashAdvance} />
                </TableCell>
                <TableCell className="text-right font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {peso.format(effNet(r))}
                </TableCell>
                <TableCell>
                  <a
                    href={`/payroll/payslip/${r.userId}?from=${from}&to=${to}&include=${inc(r.userId)}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    Payslip
                  </a>
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                No payslips for this period yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {rows.length > 0 && (
          <tfoot>
            <TableRow className="border-t-2 border-border bg-muted/40 font-semibold">
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right tabular-nums">{peso.format(totals.quota)}</TableCell>
              <TableCell className="text-right tabular-nums">{peso.format(totals.hourly)}</TableCell>
              <TableCell className="text-right tabular-nums">{peso.format(totals.gross)}</TableCell>
              <TableCell className="text-right tabular-nums">{peso.format(totals.ca)}</TableCell>
              <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                {peso.format(totals.net)}
              </TableCell>
              <TableCell />
            </TableRow>
          </tfoot>
        )}
      </Table>
    </div>
  );
}
