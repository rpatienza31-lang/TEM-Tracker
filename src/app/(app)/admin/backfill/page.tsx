import { asc, eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { terms, subjects, users } from "@/db/schema";
import { getBackfillCandidates, type BoardFilters } from "@/lib/work-items/queries";
import { getCotBackfillCandidates } from "@/lib/cot/queries";
import { ALL_DELIVERABLE_TYPES, DELIVERABLE_TYPE_LABELS, WEEK_NUMBERS, type DeliverableType } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { BackfillClient } from "./backfill-client";
import { CotBackfillClient } from "./cot-backfill-client";

type SearchParams = Record<string, string | undefined>;

export default async function BackfillPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("owner", "admin");
  const sp = await searchParams;

  const termRows = await db.select().from(terms).orderBy(asc(terms.name));
  const activeTerm = termRows.find((t) => t.isActive) ?? termRows[0];
  const termId = sp.term || activeTerm?.id;

  const filters: BoardFilters = {
    termId: termId || undefined,
    grade: sp.grade ? Number(sp.grade) : undefined,
    subjectId: sp.subject || undefined,
    weekNumber: sp.week ? Number(sp.week) : undefined,
    type: (sp.type as DeliverableType) || undefined,
  };

  const [items, cotItems, subjectRows, editorRows] = await Promise.all([
    termId ? getBackfillCandidates(filters) : Promise.resolve([]),
    getCotBackfillCandidates(),
    db.select().from(subjects).where(eq(subjects.isActive, true)).orderBy(asc(subjects.name)),
    // Any active user can be credited (mirrors the Work Board, where anyone can
    // be assigned) — not just those with the editor role.
    db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.fullName)),
  ]);

  const grades = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Bulk backfill</h1>
        <p className="text-sm text-muted-foreground">
          Catch up on overdue work that was really done: pick the not-yet-finished items, choose who did them, and mark
          them done in one go. Their points are credited to that editor and show up in payroll. Already-finished items
          are never touched.
        </p>
      </div>

      <h2 className="text-lg font-semibold">Catalog work items</h2>

      <form className="flex flex-wrap items-end gap-3">
        <Field label="Term">
          <select name="term" defaultValue={termId} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            {termRows.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Grade">
          <select name="grade" defaultValue={sp.grade ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">All</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subject">
          <select name="subject" defaultValue={sp.subject ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">All</option>
            {subjectRows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Week">
          <select name="week" defaultValue={sp.week ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">All</option>
            {WEEK_NUMBERS.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select name="type" defaultValue={sp.type ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">All</option>
            {ALL_DELIVERABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {DELIVERABLE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <BackfillClient
        items={items.map((i) => ({
          id: i.id,
          grade: i.grade,
          subjectName: i.subjectName,
          weekNumber: i.weekNumber,
          type: i.type,
          status: i.status,
          points: i.pointsValue,
          dueDate: i.dueDate,
          assigneeName: i.assigneeName,
        }))}
        editors={editorRows}
      />

      <hr className="border-border" />

      <div>
        <h2 className="text-lg font-semibold">COT orders</h2>
        <p className="text-sm text-muted-foreground">
          Custom orders that were done offline. Pick the ones to credit, choose the editor, and mark them done — same as
          the catalog, but for COT.
        </p>
      </div>

      <CotBackfillClient
        items={cotItems.map((i) => ({
          id: i.id,
          customerName: i.customerName,
          subjectName: i.subjectName,
          topic: i.topic,
          type: i.type,
          status: i.status,
          deadline: i.deadline,
          points: i.pointsValue,
          assigneeName: i.assigneeName,
        }))}
        editors={editorRows}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
