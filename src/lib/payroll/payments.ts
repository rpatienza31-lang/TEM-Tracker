import { desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { payrollPayments, users } from "@/db/schema";

type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A project line snapshotted onto a payout at payment time. */
export type PaymentItem = {
  title: string;
  subtitle: string | null;
  points: number;
  dateIso: string;
  kind: "catalog" | "cot" | "adjustment";
};

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
  items?: PaymentItem[];
  from?: string;
  to?: string;
  paidBy?: string | null;
}): Promise<void> {
  const { editorId, points, cycles, amount, rate, items, from, to, paidBy } = params;
  await db.insert(payrollPayments).values({
    editorId,
    cycles,
    points: points.toFixed(2),
    rate: rate.toFixed(2),
    amount: amount.toFixed(2),
    items: items ?? null,
    periodFrom: from ?? null,
    periodTo: to ?? null,
    paidBy: paidBy ?? null,
  });
}

export type PaymentHistoryRow = {
  id: string;
  editorId: string;
  editorName: string;
  points: number;
  amount: number;
  rate: number;
  periodFrom: string | null;
  periodTo: string | null;
  paidByName: string | null;
  paidAtIso: string;
  items: PaymentItem[];
};

/** All recorded payouts, newest first, with the payee and who recorded it. */
export async function getPaymentHistory(): Promise<PaymentHistoryRow[]> {
  const payee = users;
  const rows = await db
    .select({
      id: payrollPayments.id,
      editorId: payrollPayments.editorId,
      editorName: payee.fullName,
      points: payrollPayments.points,
      amount: payrollPayments.amount,
      rate: payrollPayments.rate,
      periodFrom: payrollPayments.periodFrom,
      periodTo: payrollPayments.periodTo,
      paidBy: payrollPayments.paidBy,
      paidAt: payrollPayments.paidAt,
      items: payrollPayments.items,
    })
    .from(payrollPayments)
    .innerJoin(payee, eq(payee.id, payrollPayments.editorId))
    .orderBy(desc(payrollPayments.paidAt));

  // Resolve "paid by" names in a second pass to avoid a self-join alias.
  const actorIds = [...new Set(rows.map((r) => r.paidBy).filter((x): x is string => !!x))];
  const actorRows = actorIds.length
    ? await db.select({ id: users.id, fullName: users.fullName }).from(users).where(inArray(users.id, actorIds))
    : [];
  const actorNames = new Map(actorRows.map((u) => [u.id, u.fullName]));

  return rows.map((r) => ({
    id: r.id,
    editorId: r.editorId,
    editorName: r.editorName,
    points: Number(r.points),
    amount: Number(r.amount),
    rate: Number(r.rate),
    periodFrom: r.periodFrom,
    periodTo: r.periodTo,
    paidByName: r.paidBy ? actorNames.get(r.paidBy) ?? null : null,
    paidAtIso: new Date(r.paidAt).toISOString(),
    items: Array.isArray(r.items) ? (r.items as PaymentItem[]) : [],
  }));
}
