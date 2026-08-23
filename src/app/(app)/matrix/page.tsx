import { and, asc, eq, ne } from "drizzle-orm";

import { requireEditorialUser } from "@/lib/auth";
import { db } from "@/db/client";
import { terms, users } from "@/db/schema";
import { getGradeSubjects, getMatrixItems, getTermGrades } from "@/lib/work-items/queries";
import type { DeliverableType } from "@/lib/constants";
import { MatrixClient } from "./matrix-client";

type SearchParams = { term?: string; grade?: string; type?: string };

export default async function MatrixPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireEditorialUser();
  const sp = await searchParams;

  const termRows = await db.select().from(terms).orderBy(asc(terms.name));
  const activeTerm = termRows.find((t) => t.isActive) ?? termRows[0];
  const termId = sp.term || activeTerm?.id;

  const grades = termId ? await getTermGrades(termId) : [];
  const grade = sp.grade ? Number(sp.grade) : grades[0];
  const type = (sp.type as DeliverableType) || "DLP";

  const [subjects, items, editors] = await Promise.all([
    termId && grade ? getGradeSubjects(termId, grade) : Promise.resolve([]),
    termId && grade ? getMatrixItems(termId, grade, type) : Promise.resolve([]),
    db.select().from(users).where(and(eq(users.isActive, true), ne(users.role, "staff"))).orderBy(asc(users.fullName)),
  ]);

  return (
    <MatrixClient
      terms={termRows.map((t) => ({ id: t.id, name: t.name }))}
      termId={termId}
      grades={grades}
      grade={grade}
      type={type}
      subjects={subjects}
      items={items}
      editors={editors.map((e) => ({ id: e.id, fullName: e.fullName }))}
      currentUser={{ id: user.id, role: user.role }}
    />
  );
}
