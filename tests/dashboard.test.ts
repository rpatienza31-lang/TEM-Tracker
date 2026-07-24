import { beforeEach, describe, expect, it } from "vitest";

import { getDashboardCounts } from "@/lib/work-items/queries";
import { transitionWorkItem } from "@/lib/work-items/transitions";
import { makeSubject, makeTerm, makeUser, makeWorkItem, resetDb, seedSettings } from "./helpers";

function isoDate(offsetDays: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe("dashboard deadline buckets (spec §6.3)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  it("matches a hand-checked sample of overdue / due-soon / at-risk items", async () => {
    const term = await makeTerm();
    const subject = await makeSubject();
    const editor = await makeUser("editor", "Editor One");

    // Hand-checked expectations, by (due date offset, status):
    //  -2, available -> overdue AND at-risk (available + due within 5 days, past or future)
    //  -1, claimed    -> overdue only (not available, so not at-risk)
    //   0, available  -> due-soon (today) AND at-risk
    //   2, available  -> due-soon AND at-risk
    //   4, available  -> at-risk only (outside the 3-day due-soon window)
    //   6, available  -> none of the three (outside every window)
    //  10, claimed     -> none
    //   1, uploaded    -> none (uploaded is excluded from every bucket)
    const fixtures: { offset: number; status: "available" | "claimed" | "uploaded"; week: number }[] = [
      { offset: -2, status: "available", week: 1 },
      { offset: -1, status: "claimed", week: 2 },
      { offset: 0, status: "available", week: 3 },
      { offset: 2, status: "available", week: 4 },
      { offset: 4, status: "available", week: 5 },
      { offset: 6, status: "available", week: 6 },
      { offset: 10, status: "claimed", week: 7 },
      { offset: 1, status: "uploaded", week: 8 },
    ];

    for (const fixture of fixtures) {
      const item = await makeWorkItem({
        termId: term.id,
        subjectId: subject.id,
        weekNumber: fixture.week,
        dueDate: isoDate(fixture.offset),
      });
      if (fixture.status === "claimed" || fixture.status === "uploaded") {
        const claimed = await transitionWorkItem({ action: "claim", itemId: item.id, actor: editor });
        if (fixture.status === "uploaded" && claimed.ok) {
          const admin = { id: (await makeUser("admin", `Admin ${fixture.week}`)).id, role: "admin" } as never;
          await transitionWorkItem({
            action: "submit",
            itemId: item.id,
            actor: editor,
            fileUrl: "https://x.test/f",
          });
          await transitionWorkItem({ action: "approve", itemId: item.id, actor: admin });
          await transitionWorkItem({ action: "upload", itemId: item.id, actor: admin });
        }
      }
    }

    const counts = await getDashboardCounts(term.id);

    expect(counts.overdue).toBe(2); // offset -2 (available) and -1 (claimed)
    expect(counts.dueSoon).toBe(2); // offset 0 and 2
    expect(counts.atRisk).toBe(3); // offset -2, 0, 2 (all available and within 5 days, past or future)
  });
});
