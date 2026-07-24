import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { quotaCycles } from "@/db/schema";
import { transitionWorkItem } from "@/lib/work-items/transitions";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

async function approveViaLifecycle(itemId: string, editorId: string, adminId: string, type: "DLP" | "COT") {
  const admin = { id: adminId, role: "admin" } as never;
  const editor = { id: editorId, role: "editor" } as never;
  await transitionWorkItem({ action: "claim", itemId, actor: editor });
  await transitionWorkItem({
    action: "submit",
    itemId,
    actor: editor,
    dlpUrl: "https://x.test/f",
    pptUrl: type === "DLP" ? "https://x.test/p" : undefined,
  });
  return transitionWorkItem({ action: "approve", itemId, actor: admin });
}

async function getCycles(editorId: string) {
  return db.select().from(quotaCycles).where(eq(quotaCycles.editorId, editorId)).orderBy(quotaCycles.cycleNumber);
}

describe("quota cycles", () => {
  let editorId: string;
  let adminId: string;
  let termId: string;
  let subjectId: string;

  beforeEach(async () => {
    await resetDb();
    await seedSettings();
    const editor = await makeUser("editor", "Editor One");
    const admin = await makeUser("admin", "Admin One");
    const term = await makeTerm();
    const subject = await makeSubject();
    editorId = editor.id;
    adminId = admin.id;
    termId = term.id;
    subjectId = subject.id;
  });

  it("closes cycle 1 and opens cycle 2 at 0 after approving 21 DLP items", async () => {
    // Weeks only run 1-10, so spread 21 distinct work items across two
    // subjects and, for the 21st, a different grade of the first subject.
    for (let week = 1; week <= 10; week++) {
      const item = await makeWorkItem({ termId, subjectId, weekNumber: week, type: "DLP" });
      const result = await approveViaLifecycle(item.id, editorId, adminId, "DLP");
      expect(result.ok).toBe(true);
    }
    const subject2 = await makeSubject("Subject Two", "SUB2");
    for (let week = 1; week <= 10; week++) {
      const item = await makeWorkItem({ termId, subjectId: subject2.id, weekNumber: week, type: "DLP" });
      const result = await approveViaLifecycle(item.id, editorId, adminId, "DLP");
      expect(result.ok).toBe(true);
    }
    const item21 = await makeWorkItem({ termId, subjectId, grade: 5, weekNumber: 1, type: "DLP" });
    const result21 = await approveViaLifecycle(item21.id, editorId, adminId, "DLP");
    expect(result21.ok).toBe(true);

    const cycles = await getCycles(editorId);
    expect(cycles).toHaveLength(2);
    expect(cycles[0].isClosed).toBe(true);
    expect(Number(cycles[0].pointsTotal)).toBe(21);
    expect(cycles[1].isClosed).toBe(false);
    expect(Number(cycles[1].pointsTotal)).toBe(0);
    expect(Number(cycles[1].carriedIn)).toBe(0);
  });

  it("carries the overflow into cycle 2 when the 21st point crosses the line with a COT", async () => {
    // 20 DLP (20.0) + 1 COT (0.5) = 20.5, then one more DLP (+1.0) -> 21.5.
    for (let week = 1; week <= 10; week++) {
      const item = await makeWorkItem({ termId, subjectId, weekNumber: week, type: "DLP" });
      await approveViaLifecycle(item.id, editorId, adminId, "DLP");
    }
    const subject2 = await makeSubject("Subject Two", "SUB2");
    for (let week = 1; week <= 10; week++) {
      const item = await makeWorkItem({ termId, subjectId: subject2.id, weekNumber: week, type: "DLP" });
      await approveViaLifecycle(item.id, editorId, adminId, "DLP");
    }
    const cotItem = await makeWorkItem({ termId, subjectId, weekNumber: 1, type: "COT", pointsValue: "0.5" });
    await approveViaLifecycle(cotItem.id, editorId, adminId, "COT");

    let cycles = await getCycles(editorId);
    expect(cycles).toHaveLength(1);
    expect(Number(cycles[0].pointsTotal)).toBe(20.5);
    expect(cycles[0].isClosed).toBe(false);

    const crossingItem = await makeWorkItem({ termId, subjectId: subject2.id, weekNumber: 1, grade: 5, type: "DLP" });
    const result = await approveViaLifecycle(crossingItem.id, editorId, adminId, "DLP");
    expect(result.ok).toBe(true);

    cycles = await getCycles(editorId);
    expect(cycles).toHaveLength(2);
    expect(cycles[0].isClosed).toBe(true);
    expect(Number(cycles[0].pointsTotal)).toBe(21.5);
    expect(Number(cycles[1].pointsTotal)).toBe(0.5);
    expect(Number(cycles[1].carriedIn)).toBe(0.5);
  });

  it("un-approving the item that closed a cycle reopens it and rolls back the next cycle", async () => {
    const items = [];
    for (let week = 1; week <= 10; week++) {
      items.push(await makeWorkItem({ termId, subjectId, weekNumber: week, type: "DLP" }));
    }
    const subject2 = await makeSubject("Subject Two", "SUB2");
    for (let week = 1; week <= 10; week++) {
      items.push(await makeWorkItem({ termId, subjectId: subject2.id, weekNumber: week, type: "DLP" }));
    }
    items.push(await makeWorkItem({ termId, subjectId, grade: 5, weekNumber: 1, type: "DLP" }));
    for (const item of items) {
      await approveViaLifecycle(item.id, editorId, adminId, "DLP");
    }

    let cycles = await getCycles(editorId);
    expect(cycles).toHaveLength(2);
    expect(cycles[0].isClosed).toBe(true);

    const lastItem = items[items.length - 1];
    const admin = { id: adminId, role: "admin" } as never;
    const unapproved = await transitionWorkItem({ action: "unapprove", itemId: lastItem.id, actor: admin });
    expect(unapproved.ok).toBe(true);
    if (unapproved.ok) {
      expect(unapproved.item.status).toBe("in_review");
      expect(unapproved.item.pointsAwarded).toBeNull();
    }

    cycles = await getCycles(editorId);
    expect(cycles).toHaveLength(2);
    expect(cycles[0].isClosed).toBe(false);
    expect(Number(cycles[0].pointsTotal)).toBe(20);
    expect(Number(cycles[1].pointsTotal)).toBe(0);
  });

  it("reverses points when an approved item is released", async () => {
    const item = await makeWorkItem({ termId, subjectId, type: "DLP" });
    await approveViaLifecycle(item.id, editorId, adminId, "DLP");

    let cycles = await getCycles(editorId);
    expect(Number(cycles[0].pointsTotal)).toBe(1);

    const admin = { id: adminId, role: "admin" } as never;
    const released = await transitionWorkItem({ action: "release", itemId: item.id, actor: admin });
    expect(released.ok).toBe(true);
    if (released.ok) {
      expect(released.item.status).toBe("available");
      expect(released.item.pointsAwarded).toBeNull();
    }

    cycles = await getCycles(editorId);
    expect(Number(cycles[0].pointsTotal)).toBe(0);
  });

  it("never requires a human to type a point total: points_awarded always equals the snapshotted points_value", async () => {
    const item = await makeWorkItem({ termId, subjectId, type: "COT", pointsValue: "0.5" });
    const result = await approveViaLifecycle(item.id, editorId, adminId, "COT");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.pointsAwarded).toBe(result.item.pointsValue);
    }
  });
});
