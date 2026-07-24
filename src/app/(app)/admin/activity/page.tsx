import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

import { requireRole } from "@/lib/auth";
import { db } from "@/db/client";
import { workItemEvents, workItems, subjects, users } from "@/db/schema";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { STATUS_BADGE_CLASS, STATUS_LABELS } from "@/lib/constants";

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<{ actorId?: string; from?: string; to?: string }>;
}) {
  await requireRole("owner", "admin");
  const { actorId, from, to } = await searchParams;

  const conditions = [
    actorId && actorId !== "all" ? eq(workItemEvents.actorId, actorId) : undefined,
    from ? gte(workItemEvents.createdAt, new Date(from)) : undefined,
    to ? lte(workItemEvents.createdAt, new Date(`${to}T23:59:59`)) : undefined,
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  const [events, staff] = await Promise.all([
    db
      .select({
        id: workItemEvents.id,
        fromStatus: workItemEvents.fromStatus,
        toStatus: workItemEvents.toStatus,
        note: workItemEvents.note,
        createdAt: workItemEvents.createdAt,
        actorName: users.fullName,
        grade: workItems.grade,
        weekNumber: workItems.weekNumber,
        type: workItems.type,
        subjectName: subjects.name,
      })
      .from(workItemEvents)
      .leftJoin(users, eq(users.id, workItemEvents.actorId))
      .leftJoin(workItems, eq(workItems.id, workItemEvents.workItemId))
      .leftJoin(subjects, eq(subjects.id, workItems.subjectId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(workItemEvents.createdAt))
      .limit(200),
    db.select().from(users).orderBy(asc(users.fullName)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Activity log</h1>
        <p className="text-sm text-muted-foreground">Every work-item status change, most recent first (last 200).</p>
      </div>

      <form className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="actorId">
            Actor
          </label>
          <select
            id="actorId"
            name="actorId"
            defaultValue={actorId ?? "all"}
            className="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
          >
            <option value="all">All staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="from">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={from} className="w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="to">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={to} className="w-40" />
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Item</TableHead>
            <TableHead>Change</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {event.createdAt?.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {event.subjectName ? `G${event.grade} · ${event.subjectName} · Wk${event.weekNumber} · ${event.type}` : "—"}
              </TableCell>
              <TableCell className="flex items-center gap-2 whitespace-nowrap">
                {event.fromStatus && (
                  <Badge className={STATUS_BADGE_CLASS[event.fromStatus]}>{STATUS_LABELS[event.fromStatus]}</Badge>
                )}
                {event.fromStatus && <span>→</span>}
                <Badge className={STATUS_BADGE_CLASS[event.toStatus]}>{STATUS_LABELS[event.toStatus]}</Badge>
              </TableCell>
              <TableCell>{event.actorName ?? "—"}</TableCell>
              <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{event.note}</TableCell>
            </TableRow>
          ))}
          {events.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No activity yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
