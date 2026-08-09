import { beforeEach, describe, expect, it } from "vitest";

import { splitPaidUnpaid } from "@/lib/payroll/paid-split";
import { recordPayrollPayment, getPaymentHistory, type PaymentItem } from "@/lib/payroll/payments";
import { recordPointAdjustment } from "@/lib/quota/adjustments";
import type { PointLine } from "@/lib/payroll/breakdown";
import { makeUser, resetDb, seedSettings } from "./helpers";

function line(dateIso: string, points: number, title = "DLP"): PointLine {
  return { kind: "catalog", refId: `${dateIso}-${points}`, type: "DLP", title, subtitle: "x", points, dateIso };
}

describe("paid/unpaid split", () => {
  it("marks the oldest points paid and leaves the rest unpaid", () => {
    const lines = [line("2026-08-01", 1), line("2026-08-02", 1), line("2026-08-03", 1), line("2026-08-04", 1)];
    const { paidLines, unpaidLines } = splitPaidUnpaid(lines, 2);
    expect(paidLines.map((l) => l.dateIso)).toEqual(["2026-08-01", "2026-08-02"]);
    expect(unpaidLines.map((l) => l.dateIso)).toEqual(["2026-08-03", "2026-08-04"]);
  });

  it("keeps a line that straddles the boundary on the unpaid side", () => {
    const lines = [line("2026-08-01", 1), line("2026-08-02", 1)];
    const { paidLines, unpaidLines } = splitPaidUnpaid(lines, 0.5);
    expect(paidLines).toHaveLength(0);
    expect(unpaidLines).toHaveLength(2);
  });
});

describe("payment history", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  it("records a payout with its covered projects and lists it newest-first", async () => {
    const editor = await makeUser("editor", "History Editor");
    const owner = await makeUser("owner", "The Owner");
    const items: PaymentItem[] = [
      { title: "DLP", subtitle: "Grade 3 · Math · Week 1", points: 1, dateIso: "2026-08-07T00:00:00.000Z", kind: "catalog" },
      { title: "Manual adjustment", subtitle: "Grade 4 EPP-AFA", points: 0.6, dateIso: "2026-08-07T00:00:00.000Z", kind: "adjustment" },
    ];
    await recordPayrollPayment({
      editorId: editor.id,
      points: 1.6,
      cycles: 0,
      amount: 266.67,
      rate: 3500,
      cashAdvance: 100,
      items,
      from: "2026-08-01",
      to: "2026-08-31",
      paidBy: owner.id,
    });

    const history = await getPaymentHistory();
    expect(history).toHaveLength(1);
    const row = history[0];
    expect(row.editorName).toBe("History Editor");
    expect(row.paidByName).toBe("The Owner");
    expect(row.points).toBe(1.6);
    expect(row.amount).toBeCloseTo(266.67, 2);
    expect(row.cashAdvance).toBe(100);
    expect(row.net).toBeCloseTo(166.67, 2); // gross − CA
    expect(row.items).toHaveLength(2);
    expect(row.itemsReconstructed).toBe(false);
  });

  it("reconstructs the covered projects for a payout recorded without a snapshot", async () => {
    const editor = await makeUser("editor", "Legacy Pay");
    // Three earned points via adjustments (become breakdown lines).
    await recordPointAdjustment({ editorId: editor.id, points: 1, note: "Alpha" });
    await recordPointAdjustment({ editorId: editor.id, points: 1, note: "Beta" });
    await recordPointAdjustment({ editorId: editor.id, points: 1, note: "Gamma" });

    // Legacy payout: no items snapshot, paid for 2 points.
    await recordPayrollPayment({ editorId: editor.id, points: 2, cycles: 0, amount: 200, rate: 2100 });

    const [row] = await getPaymentHistory();
    expect(row.itemsReconstructed).toBe(true);
    expect(row.items.length).toBeGreaterThanOrEqual(2); // the oldest ~2 points worth
    const total = row.items.reduce((s, i) => s + i.points, 0);
    expect(total).toBeGreaterThanOrEqual(2);
  });
});
