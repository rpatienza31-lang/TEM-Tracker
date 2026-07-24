import { asc } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { subjects } from "@/db/schema";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSubjectAction } from "./actions";
import { SubjectRow } from "./subject-row";

export default async function SubjectsAdminPage() {
  await requireRole("owner", "admin");
  const rows = await db.select().from(subjects).orderBy(asc(subjects.name));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Subjects</h1>
        <p className="text-sm text-muted-foreground">Master subject list used by the catalog generator.</p>
      </div>

      <form action={createSubjectAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required className="w-56" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="shortCode">Short code</Label>
          <Input id="shortCode" name="shortCode" required className="w-28" maxLength={10} />
        </div>
        <Button type="submit">Add subject</Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Code</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((subject) => (
            <SubjectRow key={subject.id} subject={subject} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
