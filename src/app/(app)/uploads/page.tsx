import { asc } from "drizzle-orm";
import Link from "next/link";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { terms } from "@/db/schema";
import { getTermGrades, getUploadMatrix, type UploadRow } from "@/lib/work-items/queries";
import type { ItemStatus } from "@/lib/constants";

type SearchParams = { term?: string; grade?: string };

type Cell = { name: string; DLP?: UploadRow; PPT?: UploadRow; note: string | null };

// Visual treatment per status: pill colour + short label.
const STATUS_META: Record<ItemStatus, { label: string; pill: string; dot: string }> = {
  uploaded: { label: "Uploaded", pill: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", dot: "bg-emerald-500" },
  approved: { label: "Approved", pill: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300", dot: "bg-blue-500" },
  in_review: { label: "In review", pill: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", dot: "bg-amber-500" },
  revision: { label: "Revision", pill: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", dot: "bg-red-500" },
  claimed: { label: "In progress", pill: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300", dot: "bg-indigo-500" },
  available: { label: "Not started", pill: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", dot: "bg-slate-400" },
  cancelled: { label: "Cancelled", pill: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", dot: "bg-slate-300" },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Deterministic soft colour for an avatar, keyed on the name.
const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${avatarColor(name)}`}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

function DeliverableCell({ row }: { row?: UploadRow }) {
  if (!row) return <span className="text-sm text-muted-foreground">—</span>;
  const meta = STATUS_META[row.status];
  const uploaded = row.status === "uploaded";
  const signedBy = uploaded ? row.uploadedByName : row.status === "approved" ? row.approvedByName : null;
  const editor = row.assigneeName;

  return (
    <div className="flex items-center gap-2.5">
      {editor ? <Avatar name={editor} /> : <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] text-slate-500 dark:bg-slate-700">–</span>}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.pill}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
        <span className="mt-0.5 truncate text-sm">{editor ?? <span className="text-muted-foreground">Unassigned</span>}</span>
        {signedBy && <span className="truncate text-[11px] text-muted-foreground">{uploaded ? "uploaded" : "approved"} by {signedBy}</span>}
      </div>
    </div>
  );
}

function ProgressRing({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-muted-foreground">
        {value}/{total} · {pct}%
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

  const weeks = new Map<number, Map<string, Cell>>();
  for (const r of rows) {
    const bySubject = weeks.get(r.week) ?? new Map<string, Cell>();
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
  const overallPct = totalItems ? Math.round((uploadedItems / totalItems) * 100) : 0;
  const activeTermName = termRows.find((t) => t.id === termId)?.name ?? "";

  function linkFor(patch: { term?: string; grade?: string }) {
    const params = new URLSearchParams({
      term: patch.term ?? termId ?? "",
      grade: patch.grade ?? (grade ? String(grade) : ""),
    });
    return `/uploads?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header + overall progress */}
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-emerald-50 to-sky-50 p-6 dark:from-emerald-950/30 dark:to-sky-950/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">📤 Upload Tracker</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              DLP &amp; PPT upload completion per term and grade — who made it, who signed off, and what&apos;s still missing.
            </p>
          </div>
          {totalItems > 0 && (
            <div className="flex flex-col items-end">
              <span className="text-3xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{overallPct}%</span>
              <span className="text-xs text-muted-foreground">
                {uploadedItems} of {totalItems} uploaded
                {activeTermName && ` · ${activeTermName} · Grade ${grade}`}
              </span>
              <div className="mt-2 h-2.5 w-52 overflow-hidden rounded-full bg-white/60 dark:bg-black/30">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${overallPct}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Term + grade pickers */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Term</span>
          {termRows.map((t) => (
            <Link
              key={t.id}
              href={linkFor({ term: t.id, grade: "" })}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                t.id === termId ? "border-foreground bg-foreground text-background shadow-sm" : "hover:bg-accent"
              }`}
            >
              {t.name}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grade</span>
          {grades.map((g) => (
            <Link
              key={g}
              href={linkFor({ grade: String(g) })}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                g === grade ? "border-foreground bg-foreground text-background shadow-sm" : "hover:bg-accent"
              }`}
            >
              Grade {g}
            </Link>
          ))}
        </div>
      </div>

      {weekNumbers.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No DLP/PPT items for this term and grade yet.
        </div>
      )}

      {weekNumbers.map((week) => {
        const bySubject = weeks.get(week)!;
        const subjects = [...bySubject.values()].sort((a, b) => a.name.localeCompare(b.name));
        const cells = subjects.flatMap((s) => [s.DLP, s.PPT].filter(Boolean) as UploadRow[]);
        const done = cells.filter((c) => c.status === "uploaded").length;

        return (
          <div key={week} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3">
              <h2 className="text-base font-semibold">Week {week}</h2>
              <ProgressRing value={done} total={cells.length} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2.5 font-semibold">Subject</th>
                    <th className="px-5 py-2.5 font-semibold">DLP</th>
                    <th className="px-5 py-2.5 font-semibold">PPT</th>
                    <th className="px-5 py-2.5 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s, i) => {
                    const rowDone = [s.DLP, s.PPT].every((d) => !d || d.status === "uploaded") && (s.DLP || s.PPT);
                    return (
                      <tr
                        key={s.name}
                        className={`border-t border-border/60 transition-colors hover:bg-muted/40 ${i % 2 ? "bg-muted/20" : ""}`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${rowDone ? "bg-emerald-500" : "bg-amber-400"}`} />
                            <span className="font-medium">{s.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <DeliverableCell row={s.DLP} />
                        </td>
                        <td className="px-5 py-3">
                          <DeliverableCell row={s.PPT} />
                        </td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">{s.note ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
