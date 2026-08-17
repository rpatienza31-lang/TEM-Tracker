import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { payrollPayments, users } from "@/db/schema";
import { getPointsBreakdown } from "@/lib/payroll/breakdown";

type Reader = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A project line snapshotted onto a payout at payment time. */
export type PaymentItem = {
  title: string;
  subtitle: string | null;
  points: number;
  dateIso: string;
  kind: "catalog" | "cot" | "adjustment";
};

export type PaymentKind = "quota" | "hourly";
export type PaymentSummary = { pointsPaid: number; lastPaidAt: Date | null };

/**
 * Each editor's lifetime paid watermark for one payout kind: total points (quota)
 * or hours (hourly) ever settled, and when last paid. This is the single
 * "already paid" baseline the whole app subtracts from earned points/hours to get
 * the UNPAID balance. Keyed by editor id.
 */
export async function getPaymentTotals(
  kind: PaymentKind = "quota",
  reader: Reader = db,
): Promise<Map<string, PaymentSummary>> {
  const rows = await reader
    .select({
      editorId: payrollPayments.editorId,
      pointsPaid: sql<string>`coalesce(sum(${payrollPayments.points}), 0)`,
      lastPaidAt: sql<Date | null>`max(${payrollPayments.paidAt})`,
    })
    .from(payrollPayments)
    .where(eq(payrollPayments.kind, kind))
    .groupBy(payrollPayments.editorId);
  return new Map(rows.map((r) => [r.editorId, { pointsPaid: Number(r.pointsPaid), lastPaidAt: r.lastPaidAt }]));
}

/**
 * Paid watermark for one kind scoped to a specific payroll period (matched by
 * from/to). Used for hourly pay, which is settled per period (weekly timesheet),
 * so the figures track the selected date filter. Keyed by editor id.
 */
export async function getPaymentsForPeriod(
  kind: PaymentKind,
  from: string,
  to: string,
  reader: Reader = db,
): Promise<Map<string, PaymentSummary>> {
  const rows = await reader
    .select({
      editorId: payrollPayments.editorId,
      pointsPaid: sql<string>`coalesce(sum(${payrollPayments.points}), 0)`,
      lastPaidAt: sql<Date | null>`max(${payrollPayments.paidAt})`,
    })
    .from(payrollPayments)
    .where(
      and(eq(payrollPayments.kind, kind), eq(payrollPayments.periodFrom, from), eq(payrollPayments.periodTo, to)),
    )
    .groupBy(payrollPayments.editorId);
  return new Map(rows.map((r) => [r.editorId, { pointsPaid: Number(r.pointsPaid), lastPaidAt: r.lastPaidAt }]));
}

/** Records a payout (quota or hourly) for an editor's work in a period. */
export async function recordPayrollPayment(params: {
  editorId: string;
  kind?: PaymentKind;
  points: number;
  cycles: number;
  amount: number;
  rate: number;
  cashAdvance?: number;
  items?: PaymentItem[];
  from?: string;
  to?: string;
  paidBy?: string | null;
}): Promise<void> {
  const { editorId, kind, points, cycles, amount, rate, cashAdvance, items, from, to, paidBy } = params;
  await db.insert(payrollPayments).values({
    editorId,
    kind: kind ?? "quota",
    cycles,
    points: points.toFixed(2),
    rate: rate.toFixed(2),
    amount: amount.toFixed(2),
    cashAdvance: (cashAdvance ?? 0).toFixed(2),
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
  kind: PaymentKind;
  points: number;
  amount: number;
  cashAdvance: number;
  net: number;
  rate: number;
  periodFrom: string | null;
  periodTo: string | null;
  paidByName: string | null;
  paidAtIso: string;
  // Set when the employee confirmed receipt.
  receivedAtIso: string | null;
  items: PaymentItem[];
  // True when the covered projects were reconstructed (payout predates snapshots).
  itemsReconstructed: boolean;
};

export type MyPayment = {
  id: string;
  kind: string;
  points: string;
  rate: string;
  amount: string;
  cashAdvance: string;
  periodFrom: string | null;
  periodTo: string | null;
  paidAt: Date;
  receivedAt: Date | null;
};

/** One staff member's own payouts, newest first — for the My Pay page. */
export async function getMyPayments(userId: string): Promise<MyPayment[]> {
  return db
    .select({
      id: payrollPayments.id,
      kind: payrollPayments.kind,
      points: payrollPayments.points,
      rate: payrollPayments.rate,
      amount: payrollPayments.amount,
      cashAdvance: payrollPayments.cashAdvance,
      periodFrom: payrollPayments.periodFrom,
      periodTo: payrollPayments.periodTo,
      paidAt: payrollPayments.paidAt,
      receivedAt: payrollPayments.receivedAt,
    })
    .from(payrollPayments)
    .where(eq(payrollPayments.editorId, userId))
    .orderBy(desc(payrollPayments.paidAt));
}

/** The employee confirms they received a payout. Only their own, and once. */
export async function confirmPaymentReceived(paymentId: string, userId: string): Promise<{ ok: boolean; message?: string }> {
  const [row] = await db
    .update(payrollPayments)
    .set({ receivedAt: new Date() })
    .where(and(eq(payrollPayments.id, paymentId), eq(payrollPayments.editorId, userId), sql`${payrollPayments.receivedAt} is null`))
    .returning({ id: payrollPayments.id });
  if (!row) return { ok: false, message: "Payout not found, not yours, or already confirmed." };
  return { ok: true };
}

/** All recorded payouts, newest first, with the payee and who recorded it. */
export async function getPaymentHistory(): Promise<PaymentHistoryRow[]> {
  const payee = users;
  const rows = await db
    .select({
      id: payrollPayments.id,
      editorId: payrollPayments.editorId,
      editorName: payee.fullName,
      kind: payrollPayments.kind,
      points: payrollPayments.points,
      amount: payrollPayments.amount,
      cashAdvance: payrollPayments.cashAdvance,
      rate: payrollPayments.rate,
      periodFrom: payrollPayments.periodFrom,
      periodTo: payrollPayments.periodTo,
      paidBy: payrollPayments.paidBy,
      paidAt: payrollPayments.paidAt,
      receivedAt: payrollPayments.receivedAt,
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

  // Reconstruct covered projects for QUOTA payouts recorded before snapshots
  // existed: partition each editor's whole breakdown across their payouts
  // oldest-first. Hourly payouts have no project breakdown.
  const quotaRows = rows.filter((r) => r.kind !== "hourly");
  const needsReconstruct = quotaRows.some((r) => !Array.isArray(r.items));
  const reconstructed = new Map<string, PaymentItem[]>();
  if (needsReconstruct) {
    const breakdown = await getPointsBreakdown("1970-01-01", new Date().toISOString().slice(0, 10));
    const byEditor = new Map<string, typeof quotaRows>();
    for (const r of quotaRows) (byEditor.get(r.editorId) ?? byEditor.set(r.editorId, []).get(r.editorId)!).push(r);
    for (const [editorId, editorPayments] of byEditor) {
      const lines = [...(breakdown.get(editorId) ?? [])].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
      let li = 0;
      // Oldest payout first so slices line up chronologically.
      for (const p of [...editorPayments].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime())) {
        const need = Number(p.points);
        let acc = 0;
        const slice: PaymentItem[] = [];
        while (li < lines.length && acc < need - 1e-9) {
          const l = lines[li];
          slice.push({ title: l.title, subtitle: l.subtitle, points: l.points, dateIso: l.dateIso, kind: l.kind });
          acc += l.points;
          li++;
        }
        if (!Array.isArray(p.items)) reconstructed.set(p.id, slice);
      }
    }
  }

  return rows.map((r) => {
    const amount = Number(r.amount);
    const cashAdvance = Number(r.cashAdvance);
    const stored = Array.isArray(r.items) ? (r.items as PaymentItem[]) : null;
    const kind: PaymentKind = r.kind === "hourly" ? "hourly" : "quota";
    return {
      id: r.id,
      editorId: r.editorId,
      editorName: r.editorName,
      kind,
      points: Number(r.points),
      amount,
      cashAdvance,
      net: Math.round((amount - cashAdvance) * 100) / 100,
      rate: Number(r.rate),
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      paidByName: r.paidBy ? actorNames.get(r.paidBy) ?? null : null,
      paidAtIso: new Date(r.paidAt).toISOString(),
      receivedAtIso: r.receivedAt ? new Date(r.receivedAt).toISOString() : null,
      items: stored ?? reconstructed.get(r.id) ?? [],
      itemsReconstructed: kind === "quota" && !stored,
    };
  });
}
