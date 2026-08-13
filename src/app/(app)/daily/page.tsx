import { formatInTimeZone } from "date-fns-tz";

import { requireRole } from "@/lib/auth";
import { getDailyLog, type DailyEntry } from "@/lib/work-items/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DELIVERABLE_TYPE_LABELS, type ItemStatus } from "@/lib/constants";

type SearchParams = { date?: string };

const PH_TZ = "Asia/Manila";

// How each status reads on the daily log, plus its colour.
const REPORT_STATUS: Record<ItemStatus, { label: string; className: string }> = {
  available: { label: "Unassigned", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  claimed: { label: "Pending", className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  in_review: { label: "Submitted", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  revision: { label: "Revision", className: "bg-red-600 text-white" },
  approved: { label: "Done", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  uploaded: { label: "Done", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

export default async function DailyReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("owner", "admin", "sales", "editor");
  const sp = await searchParams;
  const today = formatInTimeZone(new Date(), PH_TZ, "yyyy-MM-dd");
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  const entries = await getDailyLog(date);

  // Group by editor, Unassigned last; submitted rows before pending within each.
  const byEditor = new Map<string, DailyEntry[]>();
  for (const e of entries) {
    const key = e.editorName ?? "— Unassigned";
    const list = byEditor.get(key) ?? [];
    list.push(e);
    byEditor.set(key, list);
  }
  const editors = [...byEditor.keys()].sort((a, b) => {
    if (a.startsWith("—")) return 1;
    if (b.startsWith("—")) return -1;
    return a.localeCompare(b);
  });

  const totalSubmitted = entries.filter((e) => e.bucket === "submitted").length;
  const totalPending = entries.length - totalSubmitted;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Daily Report</h1>
        <p className="text-sm text-muted-foreground">
          What each staff actually submitted on the selected day, plus any work still pending (due on or before that day).
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="date">
            Date
          </label>
          <Input id="date" name="date" type="date" defaultValue={date} className="w-44" />
        </div>
        <Button type="submit" variant="secondary">
          View
        </Button>
      </form>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-md bg-amber-100 px-3 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {totalSubmitted} submitted on {date}
        </span>
        <span className="rounded-md bg-blue-100 px-3 py-1 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          {totalPending} pending
        </span>
      </div>

      {editors.length === 0 && <p className="text-muted-foreground">No submissions or pending work for this day.</p>}

      {editors.map((editor) => {
        const list = byEditor.get(editor)!;
        const submitted = list.filter((e) => e.bucket === "submitted").length;
        const pending = list.length - submitted;
        return (
          <Card key={editor}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {editor}
                <span className="text-xs font-normal text-muted-foreground">
                  {submitted} submitted
                  {pending > 0 && (
                    <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      {pending} pending
                    </span>
                  )}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list
                    .slice()
                    // Submitted first, then pending.
                    .sort((a, b) => (a.bucket === b.bucket ? 0 : a.bucket === "submitted" ? -1 : 1))
                    .map((e) => {
                      const rs = REPORT_STATUS[e.status];
                      return (
                        <TableRow key={e.id} className={e.bucket === "pending" ? "bg-blue-50/40 dark:bg-blue-950/10" : ""}>
                          <TableCell className="font-medium">{DELIVERABLE_TYPE_LABELS[e.type]}</TableCell>
                          <TableCell>
                            {e.termName && <span className="mr-1 text-xs text-muted-foreground">{e.termName}</span>}
                            {e.task}
                          </TableCell>
                          <TableCell>
                            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${rs.className}`}>{rs.label}</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
