import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { timeLogs } from "@/db/schema";
import {
  getActiveTimeLog,
  getApprovedHoursForPeriod,
  getApprovedTimeLogsForPeriod,
  getPendingTimeLogs,
} from "@/lib/time-logs/queries";
import { makeUser, resetDb, seedSettings } from "./helpers";

describe("time clock", () => {
  beforeEach(async () => {
    await resetDb();
    await seedSettings();
  });

  it("treats an open clock-in as active and keeps it out of approvals until clocked out", async () => {
    const staff = await makeUser("admin", "Clocker One"); // makeUser gives non-editors hourly pay

    // Open session: clocked in, not out, hours still null.
    await db.insert(timeLogs).values({
      userId: staff.id,
      workDate: "2020-01-10",
      clockIn: new Date("2020-01-10T01:00:00Z"),
      hours: null,
    });

    const active = await getActiveTimeLog(staff.id);
    expect(active).not.toBeNull();
    expect(active!.clockOut).toBeNull();

    // An open session must not appear in the approval queue yet.
    const pendingWhileOpen = await getPendingTimeLogs();
    expect(pendingWhileOpen.find((p) => p.userId === staff.id)).toBeUndefined();

    // Clock out: hours computed, session closed.
    await db
      .update(timeLogs)
      .set({ clockOut: new Date("2020-01-10T05:00:00Z"), hours: "4" })
      .where(eq(timeLogs.id, active!.id));

    expect(await getActiveTimeLog(staff.id)).toBeNull();

    const pendingAfterClockOut = await getPendingTimeLogs();
    const row = pendingAfterClockOut.find((p) => p.userId === staff.id);
    expect(row).toBeDefined();
    expect(Number(row!.hours)).toBe(4);
  });

  it("returns approved clock-in/out sessions that reconcile with the approved-hours total", async () => {
    const staff = await makeUser("admin", "Approved Clocker");

    await db.insert(timeLogs).values([
      {
        userId: staff.id,
        workDate: "2020-01-10",
        clockIn: new Date("2020-01-10T01:00:00Z"),
        clockOut: new Date("2020-01-10T05:00:00Z"),
        hours: "4",
        approvedBy: staff.id,
        approvedAt: new Date(),
      },
      {
        userId: staff.id,
        workDate: "2020-01-12",
        clockIn: new Date("2020-01-12T02:00:00Z"),
        clockOut: new Date("2020-01-12T05:30:00Z"),
        hours: "3.5",
        approvedBy: staff.id,
        approvedAt: new Date(),
      },
      // Unapproved: must be excluded from both the sessions and the total.
      { userId: staff.id, workDate: "2020-01-13", hours: "2" },
    ]);

    const sessions = await getApprovedTimeLogsForPeriod("2020-01-01", "2020-01-31");
    const mine = sessions.filter((s) => s.userId === staff.id);
    expect(mine).toHaveLength(2);
    // Newest work date first.
    expect(mine[0].workDate).toBe("2020-01-12");
    expect(mine[0].clockIn).not.toBeNull();
    expect(mine[0].clockOut).not.toBeNull();

    const [total] = await getApprovedHoursForPeriod("2020-01-01", "2020-01-31");
    const sessionSum = mine.reduce((s, r) => s + r.hours, 0);
    expect(sessionSum).toBe(total.hours); // 4 + 3.5 = 7.5
  });
});
