import { asc, eq } from "drizzle-orm";

import { requireUser } from "@/lib/auth";
import { db } from "@/db/client";
import { terms, subjects, users } from "@/db/schema";
import { getBoardItems, type BoardFilters } from "@/lib/work-items/queries";
import type { ItemStatus } from "@/lib/constants";
import { BoardClient } from "./board-client";

type SearchParams = Record<string, string | undefined>;

function parseFilters(sp: SearchParams): BoardFilters {
  return {
    termId: sp.term || undefined,
    grade: sp.grade ? Number(sp.grade) : undefined,
    subjectId: sp.subject || undefined,
    weekNumber: sp.week ? Number(sp.week) : undefined,
    type: (sp.type as "DLP" | "COT") || undefined,
    status: (sp.status as ItemStatus) || undefined,
    assigneeId: sp.assignee || undefined,
    availableOnly: sp.availableOnly === "1",
    overdueOnly: sp.overdueOnly === "1",
  };
}

export default async function BoardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [items, termRows, subjectRows, staffRows] = await Promise.all([
    getBoardItems(filters),
    db.select().from(terms).orderBy(asc(terms.name)),
    db.select().from(subjects).where(eq(subjects.isActive, true)).orderBy(asc(subjects.name)),
    db.select().from(users).where(eq(users.isActive, true)).orderBy(asc(users.fullName)),
  ]);

  return (
    <BoardClient
      items={items}
      terms={termRows.map((t) => ({ id: t.id, name: t.name }))}
      subjects={subjectRows.map((s) => ({ id: s.id, name: s.name }))}
      staff={staffRows.map((u) => ({ id: u.id, fullName: u.fullName, role: u.role }))}
      currentUser={{ id: user.id, role: user.role }}
    />
  );
}
