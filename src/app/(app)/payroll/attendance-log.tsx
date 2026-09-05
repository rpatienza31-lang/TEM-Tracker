"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { reclassifyTimeLogAction } from "@/lib/time-logs/actions";

type AttendanceRow = {
  id: string;
  userName: string;
  workDate: string;
  timeIn: string | null;
  timeOut: string | null;
  hours: string | null;
};

/**
 * Sessions approved as "Attendance only" — recorded presence for quota staff
 * that is NOT paid hourly. This is where those records live for monitoring; an
 * admin can move one to "Hourly (paid)" if it was classified by mistake.
 */
export function AttendanceLog({ rows, isAdmin }: { rows: AttendanceRow[]; isAdmin: boolean }) {
  const [movedIds, setMovedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const visible = rows.filter((r) => !movedIds.has(r.id));

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
        aria-expanded={open}
      >
        {open ? "Hide" : "Show"} records
        <span className="text-xs text-muted-foreground">
          ({visible.length}) {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Staff</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Time in</TableHead>
          <TableHead>Time out</TableHead>
          <TableHead>Hours</TableHead>
          {isAdmin && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{r.userName}</TableCell>
            <TableCell>{r.workDate}</TableCell>
            <TableCell className="text-muted-foreground">{r.timeIn ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{r.timeOut ?? "—"}</TableCell>
            <TableCell className="tabular-nums text-muted-foreground">{r.hours ?? "—"}</TableCell>
            {isAdmin && (
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  title="Classified by mistake? Move this session to paid hourly — it will then count toward hourly pay."
                  onClick={() =>
                    startTransition(async () => {
                      const result = await reclassifyTimeLogAction(r.id, true);
                      if (result.ok) {
                        setMovedIds((prev) => new Set(prev).add(r.id));
                        router.refresh();
                      }
                    })
                  }
                >
                  Move to hourly (pay)
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
        {visible.length === 0 && (
          <TableRow>
            <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground">
              No attendance-only records this period.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
      )}
    </div>
  );
}
