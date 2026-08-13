import { formatInTimeZone } from "date-fns-tz";

import { requireRole } from "@/lib/auth";
import { getScheduleItems, type ScheduleEntry } from "@/lib/work-items/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DELIVERABLE_TYPE_LABELS, type ItemStatus } from "@/lib/constants";

type SearchParams = { date?: string };

const PH_TZ = "Asia/Manila";

// How each work status reads on a daily report, plus its colour.
const REPORT_STATUS: Record<ItemStatus, { label: string; className: string; done: boolean }> = {
  available: { label: "Unassigned", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", done: false },
  claimed: { label: "Pending", className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", done: false },
  in_review: { label: "Submitted", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", done: false },
  revision: { label: "Revision", className: "bg-red-600 text-white", done: false },
  approved: { label: "Done", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", done: true },
  uploaded: { label: "Done", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300", done: true },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", done: true },
};

function taskLabel(item: ScheduleEntry): string {
  if (item.kind === "cot") return `${item.title} — ${item.subtitle}`;
  // Catalog: "Grade 8 · Week 10 · MATH"
  return `${item.subtitle} · ${item.title}`;
}

export default async function DailyReportPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("owner", "admin");
  const sp = await searchParams;
  const today = formatInTimeZone(new Date(), PH_TZ, "yyyy-MM-dd");
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  const items = await getScheduleItems(date, date, { today: date });

  // Group by editor (assignee), Unassigned last.
  const byEditor = new Map<string, ScheduleEntry[]>();
  for (const it of items) {
    const key = it.assigneeName ?? "— Unassigned";
    const list = byEditor.get(key) ?? [];
    list.push(it);
    byEditor.set(key, list);
  }
  const editors = [...byEditor.keys()].sort((a, b) => {
    if (a.startsWith("—")) return 1;
    if (b.startsWith("—")) return -1;
    return a.localeCompare(b);
  });

  const totalPending = items.filter((i) => !REPORT_STATUS[i.status].done).length;
  const totalDone = items.length - totalPending;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Daily Report</h1>
        <p className="text-sm text-muted-foreground">
          Each staff&apos;s work scheduled for the day, with what&apos;s done and what&apos;s still pending.
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
        <span className="rounded-md bg-muted px-3 py-1">
          {items.length} item{items.length === 1 ? "" : "s"} on {date}
        </span>
        <span className="rounded-md bg-green-100 px-3 py-1 text-green-800 dark:bg-green-950 dark:text-green-300">
          {totalDone} done
        </span>
        <span className="rounded-md bg-blue-100 px-3 py-1 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          {totalPending} pending
        </span>
      </div>

      {editors.length === 0 && <p className="text-muted-foreground">No work scheduled for this day.</p>}

      {editors.map((editor) => {
        const list = byEditor.get(editor)!;
        const pending = list.filter((i) => !REPORT_STATUS[i.status].done).length;
        return (
          <Card key={editor}>
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {editor}
                <span className="text-xs font-normal text-muted-foreground">
                  {list.length} item{list.length === 1 ? "" : "s"}
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
                    .sort((a, b) => Number(REPORT_STATUS[a.status].done) - Number(REPORT_STATUS[b.status].done))
                    .map((it) => {
                      const rs = REPORT_STATUS[it.status];
                      return (
                        <TableRow key={it.id} className={rs.done ? "" : "bg-blue-50/40 dark:bg-blue-950/10"}>
                          <TableCell className="font-medium">{DELIVERABLE_TYPE_LABELS[it.type]}</TableCell>
                          <TableCell>
                            {it.termName && <span className="mr-1 text-xs text-muted-foreground">{it.termName}</span>}
                            {taskLabel(it)}
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
