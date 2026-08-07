import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { payrollPayments } from "@/db/schema";

type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PaymentSummary = { amount: number; lastPaidAt: Date | null };

/**
 * What each editor has already been paid FOR a specific payroll period (matched
 * by the period's from/to): total amount and when. This scopes "paid" to the
 * period being viewed, so paying one period never marks another as paid. Keyed
 * by editor id.
 */
export async function getPaymentsForPeriod(from: string, to: string, reader: Reader = db): Promise<Map<string, PaymentSummary>> {
  const rows = await reader
    .select({
      editorId: payrollPayments.editorId,
      amount: sql<string>`coalesce(sum(${payrollPayments.amount}), 0)`,
      lastPaidAt: sql<Date | null>`max(${payrollPayments.paidAt})`,
    })
    .from(payrollPayments)
    .where(and(eq(payrollPayments.periodFrom, from), eq(payrollPayments.periodTo, to)))
    .groupBy(payrollPayments.editorId);
  return new Map(rows.map((r) => [r.editorId, { amount: Number(r.amount), lastPaidAt: r.lastPaidAt }]));
}

/** Records a quota payout for an editor's work in a period. */
export async function recordPayrollPayment(params: {
  editorId: string;
  points: number;
  cycles: number;
  amount: number;
  rate: number;
  from?: string;
  to?: string;
  paidBy?: string | null;
}): Promise<void> {
  const { editorId, points, cycles, amount, rate, from, to, paidBy } = params;
  await db.insert(payrollPayments).values({
    editorId,
    cycles,
    points: points.toFixed(2),
    rate: rate.toFixed(2),
    amount: amount.toFixed(2),
    periodFrom: from ?? null,
    periodTo: to ?? null,
    paidBy: paidBy ?? null,
  });
}
