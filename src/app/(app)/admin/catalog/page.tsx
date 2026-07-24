import { asc } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { terms, subjects } from "@/db/schema";
import { CatalogWizard } from "./catalog-wizard";

export default async function CatalogGeneratorPage() {
  await requireRole("owner", "admin");

  const [termRows, subjectRows] = await Promise.all([
    db.select().from(terms).orderBy(asc(terms.name)),
    db.select().from(subjects).orderBy(asc(subjects.name)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Catalog generator</h1>
        <p className="text-sm text-muted-foreground">
          Create work items for a term in bulk. Re-running is safe — existing items are never duplicated.
        </p>
      </div>
      <CatalogWizard
        terms={termRows.map((t) => ({ id: t.id, name: t.name, schoolYear: t.schoolYear }))}
        subjects={subjectRows.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name, shortCode: s.shortCode }))}
      />
    </div>
  );
}
