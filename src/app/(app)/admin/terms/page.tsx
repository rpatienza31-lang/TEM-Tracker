import Link from "next/link";
import { asc, eq } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { terms, termWeeks } from "@/db/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { WEEK_NUMBERS } from "@/lib/constants";
import { createTermAction, setTermActiveAction } from "./actions";
import { WeekRow } from "./week-row";
import { ActiveToggle } from "./active-toggle";

export default async function TermsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ termId?: string }>;
}) {
  await requireRole("owner", "admin");
  const { termId: termIdParam } = await searchParams;

  const termRows = await db.select().from(terms).orderBy(asc(terms.name));
  const selectedTerm = termRows.find((t) => t.id === termIdParam) ?? termRows.find((t) => t.isActive) ?? termRows[0];

  const weekRows = selectedTerm
    ? await db.select().from(termWeeks).where(eq(termWeeks.termId, selectedTerm.id))
    : [];
  const deadlineByWeek = new Map(weekRows.map((w) => [w.weekNumber, w.uploadDeadline]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Terms &amp; weeks</h1>
        <p className="text-sm text-muted-foreground">Create terms and set each week&apos;s upload deadline.</p>
      </div>

      <form action={createTermAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="Term 2 SY 2026-27" required className="w-56" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="schoolYear">School year</Label>
          <Input id="schoolYear" name="schoolYear" placeholder="2026-27" required className="w-32" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="startDate">Start date</Label>
          <Input id="startDate" name="startDate" type="date" className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="endDate">End date</Label>
          <Input id="endDate" name="endDate" type="date" className="w-40" />
        </div>
        <Button type="submit">Create term</Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Term</TableHead>
            <TableHead>School year</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {termRows.map((term) => (
            <TableRow key={term.id} className={term.id === selectedTerm?.id ? "bg-accent" : undefined}>
              <TableCell>
                <Link href={`/admin/terms?termId=${term.id}`} className="font-medium hover:underline">
                  {term.name}
                </Link>
              </TableCell>
              <TableCell>{term.schoolYear}</TableCell>
              <TableCell>
                {term.isActive ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}
              </TableCell>
              <TableCell>
                <ActiveToggle termId={term.id} isActive={term.isActive} action={setTermActiveAction} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedTerm && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">{selectedTerm.name} — weekly deadlines</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Upload deadline</TableHead>
                <TableHead>Cascade</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {WEEK_NUMBERS.map((week) => (
                <WeekRow
                  key={week}
                  termId={selectedTerm.id}
                  weekNumber={week}
                  uploadDeadline={deadlineByWeek.get(week) ?? null}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
