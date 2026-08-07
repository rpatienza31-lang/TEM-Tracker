import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { payrollPayments } from "@/db/schema";

type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PaymentSummary = { cyclesPaid: number; lastPaidAt: Date | null };

/**
 * Cycles paid to each editor FOR a specific payroll period (matched by the
 * period's from/to), and when. This scopes "paid" to the period being viewed,
 * so paying one period never suppresses a cycle earned in another. Keyed by
 * editor id.
 */
export async function getPaymentsForPeriod(from: string, to: string, reader: Reader = db): Promise<Map<string, PaymentSummary>> {
  const rows = await reader
    .select({
      editorId: payrollPayments.editorId,
      cyclesPaid: sql<number>`coalesce(sum(${payrollPayments.cycles}), 0)::int`,
      lastPaidAt: sql<Date | null>`max(${payrollPayments.paidAt})`,
    })
    .from(payrollPayments)
    .where(and(eq(payrollPayments.periodFrom, from), eq(payrollPayments.periodTo, to)))
    .groupBy(payrollPayments.editorId);
  return new Map(rows.map((r) => [r.editorId, { cyclesPaid: r.cyclesPaid, lastPaidAt: r.lastPaidAt }]));
}

/** Cycles already paid for one editor (the watermark). */
export async function getCyclesPaidFor(editorId: string, reader: Reader = db): Promise<number> {
  const [row] = await reader
    .select({ cyclesPaid: sql<number>`coalesce(sum(${payrollPayments.cycles}), 0)::int` })
    .from(payrollPayments)
    .where(eq(payrollPayments.editorId, editorId));
  return row?.cyclesPaid ?? 0;
}

/** Records a quota payout. `cycles` is whole completed cycles being paid now. */
export async function recordPayrollPayment(params: {
  editorId: string;
  cycles: number;
  rate: number;
  quotaSize: number;
  from?: string;
  to?: string;
  paidBy?: string | null;
}): Promise<void> {
  const { editorId, cycles, rate, quotaSize, from, to, paidBy } = params;
  await db.insert(payrollPayments).values({
    editorId,
    cycles,
    points: (cycles * quotaSize).toFixed(2),
    rate: rate.toFixed(2),
    amount: (cycles * rate).toFixed(2),
    periodFrom: from ?? null,
    periodTo: to ?? null,
    paidBy: paidBy ?? null,
  });
}
