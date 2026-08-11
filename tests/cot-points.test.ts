import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { customOrderItems, customOrders, settings } from "@/db/schema";
import { updateCotOrderDetails } from "@/lib/cot/service";
import { DELIVERABLE_POINTS } from "@/lib/constants";
import { resetDb, seedSettings } from "./helpers";

const admin = { id: "00000000-0000-0000-0000-000000000001", role: "admin" as const };

async function setAlignPoints(dlp: number, ppt: number) {
  await db
    .update(settings)
    .set({ value: { ...DELIVERABLE_POINTS, COT_DLP_ALIGN: dlp, COT_PPT_ALIGN: ppt } })
    .where(eq(settings.key, "points"));
}

async function makeOrder() {
  const [order] = await db
    .insert(customOrders)
    .values({ customerName: "Test", orderDate: "2099-01-01", deadline: "2099-01-08" })
    .returning();
  const [dlp] = await db
    .insert(customOrderItems)
    .values({ orderId: order.id, type: "COT_DLP", status: "available", pointsValue: "0.5" })
    .returning();
  const [ppt] = await db
    .insert(customOrderItems)
    .values({ orderId: order.id, type: "COT_PPT", status: "approved", pointsValue: "0.5" })
    .returning();
  return { order, dlp, ppt };
}

describe("COT align-only points", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  it("re-prices unfinished items to the align rate and leaves approved ones alone", async () => {
    await setAlignPoints(0.3, 0.2);
    const { order, dlp, ppt } = await makeOrder();

    const res = await updateCotOrderDetails(
      order.id,
      { grade: null, subjectName: null, topic: null, lessonFor: null, workKind: "align" },
      admin,
    );
    expect(res.ok).toBe(true);

    const [dlpAfter] = await db.select().from(customOrderItems).where(eq(customOrderItems.id, dlp.id));
    const [pptAfter] = await db.select().from(customOrderItems).where(eq(customOrderItems.id, ppt.id));
    expect(Number(dlpAfter.pointsValue)).toBe(0.3); // available → re-priced
    expect(Number(pptAfter.pointsValue)).toBe(0.5); // approved → history kept
  });

  it("switches back to the new rate", async () => {
    await setAlignPoints(0.3, 0.2);
    const { order, dlp } = await makeOrder();

    await updateCotOrderDetails(
      order.id,
      { grade: null, subjectName: null, topic: null, lessonFor: null, workKind: "align" },
      admin,
    );
    await updateCotOrderDetails(
      order.id,
      { grade: null, subjectName: null, topic: null, lessonFor: null, workKind: "new" },
      admin,
    );

    const [dlpAfter] = await db.select().from(customOrderItems).where(eq(customOrderItems.id, dlp.id));
    expect(Number(dlpAfter.pointsValue)).toBe(DELIVERABLE_POINTS.COT_DLP); // 0.5
  });
});
