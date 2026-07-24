import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

import * as schema from "../src/db/schema";
import { getPointsTable } from "../src/lib/settings";
import { generateCatalog } from "../src/lib/catalog/generator";
import { awardPointsForApproval } from "../src/lib/quota/cycles";

const { users, terms, subjects, termWeeks, workItems, workItemEvents, settings } = schema;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill in your Supabase connection string.");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const db = drizzle(sql, { schema });

const SUBJECT_LIST = [
  { name: "English", shortCode: "ENG" },
  { name: "Filipino", shortCode: "FIL" },
  { name: "Mathematics", shortCode: "MATH" },
  { name: "Science", shortCode: "SCI" },
  { name: "Araling Panlipunan", shortCode: "AP" },
  { name: "GMRC/ESP", shortCode: "ESP" },
  { name: "MAPEH", shortCode: "MAPEH" },
  { name: "EPP/TLE", shortCode: "TLE" },
  { name: "Reading & Literacy", shortCode: "READ" },
  { name: "Makabansa", shortCode: "MAKA" },
];

const TERM1_GRADES = [2, 3, 4, 5, 7, 10];
const TERM2_GRADES = [3, 4, 5, 6, 7, 8];

const STAFF = [
  { fullName: "Eva Villanueva", email: "eva.owner@temtracker.test", role: "owner" as const, payType: "hourly" as const },
  { fullName: "Manuel Cruz", email: "manuel.admin@temtracker.test", role: "admin" as const, payType: "hourly" as const },
  { fullName: "Grace Domingo", email: "grace.sales@temtracker.test", role: "sales" as const, payType: "hourly" as const },
  { fullName: "Paolo Reyes", email: "paolo.sales@temtracker.test", role: "sales" as const, payType: "hourly" as const },
  { fullName: "Ana Santos", email: "ana.editor@temtracker.test", role: "editor" as const, payType: "quota" as const },
  { fullName: "Ben Torres", email: "ben.editor@temtracker.test", role: "editor" as const, payType: "quota" as const },
  { fullName: "Carla Mendoza", email: "carla.editor@temtracker.test", role: "editor" as const, payType: "quota" as const },
  { fullName: "Dennis Aquino", email: "dennis.editor@temtracker.test", role: "editor" as const, payType: "quota" as const },
  { fullName: "Ella Ramos", email: "ella.editor@temtracker.test", role: "editor" as const, payType: "quota" as const },
  { fullName: "Fidel Garcia", email: "fidel.editor@temtracker.test", role: "editor" as const, payType: "quota" as const },
];

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  async function runNext(): Promise<void> {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) return;
    await worker(items[index], index);
    await runNext();
  }
  await Promise.all(Array.from({ length: concurrency }, () => runNext()));
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seedSettings() {
  await db
    .insert(settings)
    .values([
      { key: "quota_size", value: 21 },
      { key: "points", value: { DLP: 1, COT: 0.5 } },
      { key: "wip_limit", value: 5 },
    ])
    .onConflictDoNothing();
}

async function seedSubjects() {
  await db.insert(subjects).values(SUBJECT_LIST).onConflictDoNothing();
  return db.select().from(subjects);
}

async function seedStaff() {
  const rows = STAFF.map((s) => ({ ...s, authUserId: randomUUID() }));
  await db.insert(users).values(rows).onConflictDoNothing();
  return db.select().from(users);
}

async function seedTerm(name: string, schoolYear: string, isActive: boolean, week1Deadline: string) {
  const [existing] = await db.select().from(terms).where(eq(terms.name, name)).limit(1);
  const term = existing ?? (await db.insert(terms).values({ name, schoolYear, isActive }).returning())[0];

  const weeks = Array.from({ length: 10 }, (_, i) => ({
    termId: term.id,
    weekNumber: i + 1,
    uploadDeadline: addDays(week1Deadline, i * 7),
  }));
  await db.insert(termWeeks).values(weeks).onConflictDoNothing();

  return term;
}

async function main() {
  console.log("Seeding settings...");
  await seedSettings();

  console.log("Seeding subjects...");
  const subjectRows = await seedSubjects();

  console.log("Seeding staff...");
  const staffRows = await seedStaff();
  const editors = staffRows.filter((u) => u.role === "editor");
  const admin = staffRows.find((u) => u.role === "admin")!;

  console.log("Seeding terms & weeks...");
  // "Today" is treated as 2026-07-24: Term 1 weeks 1-8 fall due before then
  // (overdue backlog), week 9 lands within the 3-day due-soon window, week 10 is future.
  const term1 = await seedTerm("Term 1 SY 2026-27", "2026-27", true, "2026-06-01");
  // Term 2 starts in September, entirely in the future.
  const term2 = await seedTerm("Term 2 SY 2026-27", "2026-27", false, "2026-09-07");

  console.log("Generating catalog for Term 1...");
  const cotSubjectIds = subjectRows.filter((s) => ["MATH", "ENG"].includes(s.shortCode)).map((s) => s.id);
  const term1Weeks = (await db.select().from(termWeeks).where(eq(termWeeks.termId, term1.id))).map((w) => ({
    weekNumber: w.weekNumber,
    uploadDeadline: w.uploadDeadline,
  }));

  const term1Result = await generateCatalog({
    termId: term1.id,
    grades: TERM1_GRADES,
    subjectsByGrade: Object.fromEntries(TERM1_GRADES.map((g) => [g, subjectRows.map((s) => s.id)])),
    cotByGrade: Object.fromEntries(TERM1_GRADES.map((g) => [g, cotSubjectIds])),
    weeks: term1Weeks.filter((w) => w.weekNumber === 4 || w.weekNumber === 8),
  });
  console.log(`  COT items (weeks 4 & 8, Math/English): created ${term1Result.created}, skipped ${term1Result.skipped}`);

  const term1DlpResult = await generateCatalog({
    termId: term1.id,
    grades: TERM1_GRADES,
    subjectsByGrade: Object.fromEntries(TERM1_GRADES.map((g) => [g, subjectRows.map((s) => s.id)])),
    cotByGrade: {},
    weeks: term1Weeks,
  });
  console.log(`  DLP items (all weeks): created ${term1DlpResult.created}, skipped ${term1DlpResult.skipped}`);

  console.log("Generating catalog for Term 2 (offerings & weeks only, no items yet)...");
  await db
    .insert(schema.termOfferings)
    .values(TERM2_GRADES.flatMap((grade) => subjectRows.map((s) => ({ termId: term2.id, grade, subjectId: s.id }))))
    .onConflictDoNothing();

  console.log("Applying a realistic spread of statuses to Term 1 items...");
  const pointsTable = await getPointsTable();
  const items = await db.select().from(workItems).where(eq(workItems.termId, term1.id));

  let editorIdx = 0;
  function nextEditor() {
    const editor = editors[editorIdx % editors.length];
    editorIdx += 1;
    return editor;
  }

  // Sequential (not concurrent): quota-cycle math reads-then-writes each
  // editor's current open cycle, so awarding points for the same editor from
  // two overlapping transactions would race.
  let processed = 0;
  await runWithConcurrency(items, 1, async (item, i) => {
    const bucket = i % 10;
    processed += 1;
    if (processed % 100 === 0) console.log(`  ...${processed}/${items.length}`);
    if (bucket <= 1) return; // stays available

    const editor = nextEditor();
    const claimedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    if (bucket <= 3) {
      // claimed
      await db
        .update(workItems)
        .set({ status: "claimed", assigneeId: editor.id, claimedAt, version: 1 })
        .where(eq(workItems.id, item.id));
      await db.insert(workItemEvents).values({ workItemId: item.id, actorId: editor.id, fromStatus: "available", toStatus: "claimed" });
    } else if (bucket === 4) {
      // in_review
      await db
        .update(workItems)
        .set({
          status: "in_review",
          assigneeId: editor.id,
          claimedAt,
          submittedAt: new Date(),
          dlpUrl: "https://drive.google.com/seed-placeholder",
          pptUrl: item.type === "DLP" ? "https://drive.google.com/seed-placeholder-ppt" : null,
          version: 2,
        })
        .where(eq(workItems.id, item.id));
      await db.insert(workItemEvents).values([
        { workItemId: item.id, actorId: editor.id, fromStatus: "available", toStatus: "claimed" },
        { workItemId: item.id, actorId: editor.id, fromStatus: "claimed", toStatus: "in_review" },
      ]);
    } else if (bucket === 5) {
      // revision
      await db
        .update(workItems)
        .set({ status: "revision", assigneeId: editor.id, claimedAt, submittedAt: new Date(), revisionCount: 1, version: 3 })
        .where(eq(workItems.id, item.id));
      await db.insert(workItemEvents).values([
        { workItemId: item.id, actorId: editor.id, fromStatus: "available", toStatus: "claimed" },
        { workItemId: item.id, actorId: editor.id, fromStatus: "claimed", toStatus: "in_review" },
        { workItemId: item.id, actorId: admin.id, fromStatus: "in_review", toStatus: "revision", note: "Please double-check the objectives section." },
      ]);
    } else if (bucket <= 7) {
      // approved
      await db
        .update(workItems)
        .set({
          status: "approved",
          assigneeId: editor.id,
          claimedAt,
          submittedAt: new Date(),
          approvedAt: new Date(),
          pointsAwarded: String(pointsTable[item.type]),
          dlpUrl: "https://drive.google.com/seed-placeholder",
          pptUrl: item.type === "DLP" ? "https://drive.google.com/seed-placeholder-ppt" : null,
          version: 3,
        })
        .where(eq(workItems.id, item.id));
      await db.transaction((tx) => awardPointsForApproval(tx, editor.id, item.id, pointsTable[item.type]));
      await db.insert(workItemEvents).values([
        { workItemId: item.id, actorId: editor.id, fromStatus: "available", toStatus: "claimed" },
        { workItemId: item.id, actorId: editor.id, fromStatus: "claimed", toStatus: "in_review" },
        { workItemId: item.id, actorId: admin.id, fromStatus: "in_review", toStatus: "approved" },
      ]);
    } else {
      // uploaded
      await db
        .update(workItems)
        .set({
          status: "uploaded",
          assigneeId: editor.id,
          claimedAt,
          submittedAt: new Date(),
          approvedAt: new Date(),
          uploadedAt: new Date(),
          pointsAwarded: String(pointsTable[item.type]),
          dlpUrl: "https://drive.google.com/seed-placeholder",
          pptUrl: item.type === "DLP" ? "https://drive.google.com/seed-placeholder-ppt" : null,
          version: 4,
        })
        .where(eq(workItems.id, item.id));
      await db.transaction((tx) => awardPointsForApproval(tx, editor.id, item.id, pointsTable[item.type]));
      await db.insert(workItemEvents).values([
        { workItemId: item.id, actorId: editor.id, fromStatus: "available", toStatus: "claimed" },
        { workItemId: item.id, actorId: editor.id, fromStatus: "claimed", toStatus: "in_review" },
        { workItemId: item.id, actorId: admin.id, fromStatus: "in_review", toStatus: "approved" },
        { workItemId: item.id, actorId: admin.id, fromStatus: "approved", toStatus: "uploaded" },
      ]);
    }
  });

  console.log("Seed complete.");
  console.log(`Staff: ${staffRows.length}, Subjects: ${subjectRows.length}, Term 1 items: ${items.length}`);
  console.log("Note: seeded users have random auth_user_id placeholders and cannot log in until invited for real");
  console.log("via /admin/users (which creates a matching Supabase Auth account).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
