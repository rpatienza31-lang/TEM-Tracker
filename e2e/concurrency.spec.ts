import { test, expect, type Browser } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../src/db/client";
import { terms, subjects, users, workItems } from "../src/db/schema";
import { loginAs } from "./helpers/login";

/**
 * Phase 1 acceptance check: "fire two simultaneous claim requests for the
 * same item from two sessions — exactly one succeeds, the other gets
 * 'already claimed by {name}', and the DB shows one assignee."
 *
 * This test drives two real, separately-authenticated browser sessions
 * against a running dev server, so it needs a real Supabase project (not the
 * placeholder used for local unit tests) with SUPABASE_SERVICE_ROLE_KEY set —
 * see e2e/helpers/login.ts. Run with `npm run test:e2e` once those env vars
 * point at a real project seeded via `npm run db:seed`.
 */
test("only one of two simultaneous claims on the same item succeeds", async ({ browser }: { browser: Browser }) => {
  const [editorA, editorB] = await db.select().from(users).where(eq(users.role, "editor")).limit(2);
  test.skip(!editorA || !editorB, "Seed the database first (npm run db:seed) — need at least two editor accounts.");

  const [term] = await db.select().from(terms).where(eq(terms.isActive, true)).limit(1);
  const [subject] = await db.select().from(subjects).limit(1);
  test.skip(!term || !subject, "Seed the database first (npm run db:seed).");

  const [item] = await db
    .insert(workItems)
    .values({
      termId: term.id,
      subjectId: subject.id,
      grade: 4,
      weekNumber: 9,
      type: "COT",
      dueDate: "2099-01-01",
      pointsValue: "0.5",
    })
    .returning();

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await loginAs(pageA, editorA.email);
  await loginAs(pageB, editorB.email);

  await pageA.goto(`/board?status=available`);
  await pageB.goto(`/board?status=available`);

  const claimButtonA = pageA.getByRole("row", { name: new RegExp(`Wk ${item.weekNumber}`) }).getByRole("button", { name: "Claim" });
  const claimButtonB = pageB.getByRole("row", { name: new RegExp(`Wk ${item.weekNumber}`) }).getByRole("button", { name: "Claim" });

  const [resultA, resultB] = await Promise.allSettled([claimButtonA.click(), claimButtonB.click()]);
  expect(resultA.status).toBe("fulfilled");
  expect(resultB.status).toBe("fulfilled");

  // Exactly one page should show the item as claimed (or gone from the
  // "available" filter); the other should surface the conflict banner.
  const conflictOnA = pageA.getByText(/already claimed/i);
  const conflictOnB = pageB.getByText(/already claimed/i);
  const oneConflictShown = (await conflictOnA.isVisible().catch(() => false)) || (await conflictOnB.isVisible().catch(() => false));
  expect(oneConflictShown).toBe(true);

  const [row] = await db.select().from(workItems).where(eq(workItems.id, item.id));
  expect(row.status).toBe("claimed");
  expect([editorA.id, editorB.id]).toContain(row.assigneeId);

  await contextA.close();
  await contextB.close();
});
