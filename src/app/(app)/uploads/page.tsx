import { asc } from "drizzle-orm";
import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { terms } from "@/db/schema";
import { getTermGrades, getUploadMatrix, type UploadRow } from "@/lib/work-items/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ItemStatus } from "@/lib/constants";

type SearchParams = { term?: string; grade?: string };

const STATUS_LABEL: Record<ItemStatus, string> = {
  available: "Not started",
  claimed: "In progress",
  in_review: "In review",
  revision: "Revision",
  approved: "Approved",
  uploaded: "Uploaded",
  cancelled: "Cancelled",
};

// One DLP or PPT cell: uploaded shows a green check + uploader; otherwise the
// current status in muted/red so it's clear what's still missing.
function DeliverableCell({ row }: { row?: UploadRow }) {
  if (!row) return <span className="text-muted-foreground">—</span>;
  const uploaded = row.status === "uploaded";
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
          uploaded
            ? "border-green-600 bg-green-600 text-white"
            : "border-muted-foreground/40 text-transparent"
        }`}
        aria-label={uploaded ? "Uploaded" : "Not uploaded"}
      >
        ✓
      </span>
      <span className="flex flex-col leading-tight">
        <span className={uploaded ? "" : "text-muted-foreground"}>{row.assigneeName ?? "Unassigned"}</span>
        {!uploaded && <span className="text-[11px] text-amber-700 dark:text-amber-400">{STATUS_LABEL[row.status]}</span>}
      </span>
    </div>
  );
}

export default async function UploadTrackerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("owner", "admin");
  const sp = await searchParams;

  const termRows = await db.select().from(terms).orderBy(asc(terms.name));
  const activeTerm = termRows.find((t) => t.isActive) ?? termRows[0];
  const termId = sp.term || activeTerm?.id;

  const grades = termId ? await getTermGrades(termId) : [];
  const grade = sp.grade ? Number(sp.grade) : grades[0];

  const rows = termId && grade ? await getUploadMatrix(termId, grade) : [];

  // week -> subject -> { name, DLP?, PPT? }
  const weeks = new Map<number, Map<string, { name: string; DLP?: UploadRow; PPT?: UploadRow; note: string | null }>>();
  for (const r of rows) {
    const bySubject = weeks.get(r.week) ?? new Map();
    const cell = bySubject.get(r.subjectId) ?? { name: r.subjectName, note: null };
    if (r.type === "DLP") cell.DLP = r;
    else if (r.type === "PPT") cell.PPT = r;
    cell.note = cell.note ?? r.scheduleNote;
    bySubject.set(r.subjectId, cell);
    weeks.set(r.week, bySubject);
  }
  const weekNumbers = [...weeks.keys()].sort((a, b) => a - b);

  const totalItems = rows.length;
  const uploadedItems = rows.filter((r) => r.status === "uploaded").length;

  function linkFor(patch: { term?: string; grade?: string }) {
    const params = new URLSearchParams({
      term: patch.term ?? termId ?? "",
      grade: patch.grade ?? (grade ? String(grade) : ""),
    });
    return `/uploads?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Upload Tracker</h1>
        <p className="text-sm text-muted-foreground">
          Per term and grade — which DLP and PPT are uploaded, who uploaded them, and what&apos;s still missing.
        </p>
      </div>

      {/* Term + grade pickers */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Term:</span>
          {termRows.map((t) => (
            <Link
              key={t.id}
              href={linkFor({ term: t.id, grade: "" })}
              className={`rounded-full border px-3 py-1 text-sm ${
                t.id === termId ? "border-foreground bg-foreground text-background" : "hover:bg-accent"
              }`}
            >
              {t.name}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Grade:</span>
          {grades.map((g) => (
            <Link
              key={g}
              href={linkFor({ grade: String(g) })}
              className={`rounded-full border px-3 py-1 text-sm ${
                g === grade ? "border-foreground bg-foreground text-background" : "hover:bg-accent"
              }`}
            >
              Grade {g}
            </Link>
          ))}
        </div>
      </div>

      {totalItems > 0 && (
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="rounded-md bg-green-100 px-3 py-1 text-green-800 dark:bg-green-950 dark:text-green-300">
            {uploadedItems} uploaded
          </span>
          <span className="rounded-md bg-amber-100 px-3 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {totalItems - uploadedItems} still to upload
          </span>
        </div>
      )}

      {weekNumbers.length === 0 && <p className="text-muted-foreground">No DLP/PPT items for this term and grade yet.</p>}

      {weekNumbers.map((week) => {
        const bySubject = weeks.get(week)!;
        const subjects = [...bySubject.values()].sort((a, b) => a.name.localeCompare(b.name));
        return (
          <Card key={week}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Week {week}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Subject</TableHead>
                    <TableHead>DLP</TableHead>
                    <TableHead>PPT</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subjects.map((s) => (
                    <TableRow key={s.name}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        <DeliverableCell row={s.DLP} />
                      </TableCell>
                      <TableCell>
                        <DeliverableCell row={s.PPT} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.note ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
