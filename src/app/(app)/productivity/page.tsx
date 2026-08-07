import { Fragment } from "react";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { getProductivityStats, sortProductivity, type ProductivitySort } from "@/lib/quota/productivity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/progress-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ALL_DELIVERABLE_TYPES, DELIVERABLE_TYPE_LABELS } from "@/lib/constants";

type SearchParams = { from?: string; to?: string; sort?: string; dir?: string };

const SORT_COLUMNS: { key: ProductivitySort; label: string }[] = [
  { key: "name", label: "Editor" },
  { key: "cycle", label: "Current cycle" },
  { key: "completed", label: "Completed cycles" },
  { key: "points", label: "Total points" },
  { key: "turnaround", label: "Avg turnaround" },
  { key: "revision", label: "Revision rate" },
];

function formatHours(hours: number | null) {
  if (hours === null) return "—";
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function formatRate(rate: number | null) {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

export default async function ProductivityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const range = { from: sp.from, to: sp.to };
  const sort = (sp.sort as ProductivitySort) || "name";
  const dir = sp.dir === "desc" ? "desc" : "asc";

  const stats = await getProductivityStats(range);

  if (user.role === "editor") {
    const mine = stats.find((s) => s.editorId === user.id);
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-semibold">Productivity &amp; Quota</h1>
        {!mine ? (
          <p className="text-muted-foreground">No approved items yet — your first cycle starts once something is approved.</p>
        ) : (
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>
                {mine.ledgerCyclePoints.toFixed(1)} / {mine.targetPoints.toFixed(0)} · cycle #{mine.ledgerCycleNumber}
              </CardTitle>
              <CardDescription>Current quota cycle progress</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ProgressBar value={mine.ledgerCyclePoints} max={mine.targetPoints} />
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Completed cycles</dt>
                <dd className="text-right">{mine.completedCycles}</dd>
                <dt className="text-muted-foreground">Total points (all time)</dt>
                <dd className="text-right">{mine.totalPoints.toFixed(1)}</dd>
                {ALL_DELIVERABLE_TYPES.map((type) => (
                  <Fragment key={type}>
                    <dt className="text-muted-foreground">{DELIVERABLE_TYPE_LABELS[type]} points</dt>
                    <dd className="text-right">{mine.pointsByType[type].toFixed(1)}</dd>
                  </Fragment>
                ))}
                <dt className="text-muted-foreground">Avg turnaround (claim → approved)</dt>
                <dd className="text-right">{formatHours(mine.avgTurnaroundHours)}</dd>
                <dt className="text-muted-foreground">Revision rate</dt>
                <dd className="text-right">{formatRate(mine.revisionRate)}</dd>
              </dl>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const sorted = sortProductivity(stats, sort, dir);

  function sortLink(column: ProductivitySort) {
    const nextDir = sort === column && dir === "asc" ? "desc" : "asc";
    const params = new URLSearchParams({ ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}), sort: column, dir: nextDir });
    return `/productivity?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Productivity &amp; Quota</h1>
        <p className="text-sm text-muted-foreground">Points-based stats reflect the selected date range; cycle progress is always current.</p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="from">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={sp.from} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="to">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={sp.to} className="w-40" />
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            {SORT_COLUMNS.map((col) => (
              <TableHead key={col.key}>
                <Link href={sortLink(col.key)} className="flex items-center gap-1 hover:underline">
                  {col.label}
                  {sort === col.key && <span>{dir === "asc" ? "↑" : "↓"}</span>}
                </Link>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.editorId}>
              <TableCell className="font-medium">{row.fullName}</TableCell>
              <TableCell className="w-48">
                <div className="flex items-center gap-2">
                  <ProgressBar value={row.ledgerCyclePoints} max={row.targetPoints} className="w-24" />
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {row.ledgerCyclePoints.toFixed(1)}/{row.targetPoints.toFixed(0)} · #{row.ledgerCycleNumber}
                  </span>
                </div>
              </TableCell>
              <TableCell>{row.completedCycles}</TableCell>
              <TableCell>
                {row.totalPoints.toFixed(1)}
                <span className="text-muted-foreground">
                  {" "}
                  (
                  {ALL_DELIVERABLE_TYPES.map((type, i) => (
                    <span key={type}>
                      {i > 0 && " / "}
                      {row.pointsByType[type].toFixed(1)} {DELIVERABLE_TYPE_LABELS[type]}
                    </span>
                  ))}
                  )
                </span>
              </TableCell>
              <TableCell>{formatHours(row.avgTurnaroundHours)}</TableCell>
              <TableCell>{formatRate(row.revisionRate)}</TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No editors yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
