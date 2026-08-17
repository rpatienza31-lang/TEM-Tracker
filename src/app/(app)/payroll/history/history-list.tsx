"use client";

import { Fragment, useMemo, useState } from "react";

import type { PaymentHistoryRow } from "@/lib/payroll/payments";
import { DELIVERABLE_TYPE_LABELS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateFmt = new Intl.DateTimeFormat("en-PH", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const lineDateFmt = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });

export function PaymentHistoryList({ payments }: { payments: PaymentHistoryRow[] }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? payments.filter((p) => p.editorName.toLowerCase().includes(q)) : payments;
  }, [payments, query]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a staff name…"
        className="max-w-xs"
        aria-label="Search payments by staff name"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Paid on</TableHead>
            <TableHead>Staff</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Period</TableHead>
            <TableHead className="text-right">Pts / Hrs</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">CA</TableHead>
            <TableHead className="text-right">Net</TableHead>
            <TableHead>Paid by</TableHead>
            <TableHead>Received</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((p) => {
            const isOpen = openId === p.id;
            return (
              <Fragment key={p.id}>
                <TableRow>
                  <TableCell className="whitespace-nowrap">{dateFmt.format(new Date(p.paidAtIso))}</TableCell>
                  <TableCell className="font-medium">{p.editorName}</TableCell>
                  <TableCell>
                    <Badge variant={p.kind === "hourly" ? "outline" : "secondary"}>
                      {p.kind === "hourly" ? "Hourly" : "Quota"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {p.periodFrom && p.periodTo ? `${p.periodFrom} → ${p.periodTo}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.items.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : p.id)}
                        className="rounded text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
                        aria-expanded={isOpen}
                      >
                        {p.points.toFixed(1)} {isOpen ? "▲" : "▼"}
                      </button>
                    ) : (
                      p.points.toFixed(1)
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{peso.format(p.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {p.cashAdvance > 0 ? `−${peso.format(p.cashAdvance)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{peso.format(p.net)}</TableCell>
                  <TableCell className="text-muted-foreground">{p.paidByName ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {p.receivedAtIso ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        ✓ {dateFmt.format(new Date(p.receivedAtIso))}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        Pending
                      </span>
                    )}
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={10} className="py-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Projects covered by this payout
                        {p.itemsReconstructed && (
                          <span className="ml-1 font-normal normal-case text-muted-foreground/80">
                            (reconstructed — recorded before snapshots)
                          </span>
                        )}
                      </div>
                      <ul className="mt-2 flex flex-col gap-1">
                        {p.items.map((line, i) => (
                          <li
                            key={i}
                            className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2 text-sm"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <Badge variant={line.kind === "adjustment" ? "outline" : "secondary"}>
                                {line.kind === "adjustment"
                                  ? "Adjustment"
                                  : DELIVERABLE_TYPE_LABELS[line.title as keyof typeof DELIVERABLE_TYPE_LABELS] ??
                                    line.title}
                              </Badge>
                              <span className="truncate text-muted-foreground">{line.subtitle ?? line.title}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <span className="text-xs text-muted-foreground">
                                {lineDateFmt.format(new Date(line.dateIso))}
                              </span>
                              <span className="w-12 text-right tabular-nums">
                                {line.points > 0 ? "+" : ""}
                                {line.points.toFixed(1)}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground">
                {payments.length === 0 ? "No payouts recorded yet." : "No payments match that name."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
