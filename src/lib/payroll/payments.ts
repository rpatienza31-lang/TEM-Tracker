import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { payrollPayments } from "@/db/schema";

type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type PaymentSummary = { pointsPaid: number; lastPaidAt: Date | null };

/**
 * Each editor's lifetime paid watermark: total points ever settled and when
 * last paid. This is the single "already paid" baseline the whole app subtracts
 * from earned points to get the UNPAID balance — so the dashboard, productivity,
 * and payroll all show the same current-cycle number. Keyed by editor id.
 */
export async function getPaymentTotals(reader: Reader = db): Promise<Map<string, PaymentSummary>> {
  const rows = await reader
    .select({
      editorId: payrollPayments.editorId,
      pointsPaid: sql<string>`coalesce(sum(${payrollPayments.points}), 0)`,
      lastPaidAt: sql<Date | null>`max(${payrollPayments.paidAt})`,
    })
    .from(payrollPayments)
    .groupBy(payrollPayments.editorId);
  return new Map(rows.map((r) => [r.editorId, { pointsPaid: Number(r.pointsPaid), lastPaidAt: r.lastPaidAt }]));
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
