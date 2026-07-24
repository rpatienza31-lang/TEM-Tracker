import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { terms, subjects, users, workItems, termWeeks, settings } from "@/db/schema";
import type { AppUser } from "@/lib/auth";

export async function resetDb() {
  await db.execute(sql`truncate table
    quota_cycle_items, quota_cycles, time_logs, work_item_events, work_items,
    term_weeks, term_offerings, terms, subjects, users, settings
    restart identity cascade`);
}

export async function seedSettings(overrides: { wipLimit?: number } = {}) {
  await db.insert(settings).values([
    { key: "quota_size", value: 21 },
    { key: "points", value: { DLP: 1, COT: 0.5 } },
    { key: "wip_limit", value: overrides.wipLimit ?? 5 },
  ]);
}

export async function makeUser(role: AppUser["role"], name: string): Promise<AppUser> {
  const [user] = await db
    .insert(users)
    .values({
      fullName: name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@test.local`,
      role,
      payType: role === "editor" ? "quota" : "hourly",
    })
    .returning();
  return user;
}

export async function makeTerm(name = "Test Term") {
  const [term] = await db.insert(terms).values({ name, schoolYear: "2099-00", isActive: true }).returning();
  return term;
}

export async function makeSubject(name = "Test Subject", shortCode = "TST") {
  const [subject] = await db.insert(subjects).values({ name, shortCode }).returning();
  return subject;
}

export async function makeWeek(termId: string, weekNumber: number, uploadDeadline: string) {
  const [week] = await db.insert(termWeeks).values({ termId, weekNumber, uploadDeadline }).returning();
  return week;
}

export async function makeWorkItem(params: {
  termId: string;
  subjectId: string;
  grade?: number;
  weekNumber?: number;
  type?: "DLP" | "COT";
  dueDate?: string;
  pointsValue?: string;
}) {
  const [item] = await db
    .insert(workItems)
    .values({
      termId: params.termId,
      subjectId: params.subjectId,
      grade: params.grade ?? 4,
      weekNumber: params.weekNumber ?? 1,
      type: params.type ?? "DLP",
      dueDate: params.dueDate ?? "2099-01-01",
      pointsValue: params.pointsValue ?? "1",
    })
    .returning();
  return item;
}
