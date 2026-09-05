"use client";

import { useState, useTransition } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { approveTimeLogAction } from "@/lib/time-logs/actions";

type PendingLog = {
  id: string;
  userName: string;
  workDate: string;
  timeIn: string | null;
  timeOut: string | null;
  hours: string | null;
  note: string | null;
};

export function PendingApprovals({ logs }: { logs: PendingLog[] }) {
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const visible = logs.filter((log) => !approvedIds.has(log.id));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Staff</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Time in</TableHead>
          <TableHead>Time out</TableHead>
          <TableHead>Hours</TableHead>
          <TableHead>Note</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map((log) => (
          <TableRow key={log.id}>
            <TableCell>{log.userName}</TableCell>
            <TableCell>{log.workDate}</TableCell>
            <TableCell className="text-muted-foreground">{log.timeIn ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{log.timeOut ?? "—"}</TableCell>
            <TableCell>{log.hours ?? "—"}</TableCell>
            <TableCell className="text-muted-foreground">{log.note}</TableCell>
            <TableCell>
              <div className="flex flex-wrap justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  title="Approve for monitoring only — recorded and visible, but not paid hourly (use for quota-staff attendance)."
                  onClick={() =>
                    startTransition(async () => {
                      const result = await approveTimeLogAction(log.id, false);
                      if (result.ok) setApprovedIds((prev) => new Set(prev).add(log.id));
                    })
                  }
                >
                  Attendance only
                </Button>
                <Button
                  size="sm"
                  disabled={isPending}
                  title="Approve as paid hourly work — these hours count toward hourly salary."
                  onClick={() =>
                    startTransition(async () => {
                      const result = await approveTimeLogAction(log.id, true);
                      if (result.ok) setApprovedIds((prev) => new Set(prev).add(log.id));
                    })
                  }
                >
                  Hourly (paid)
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
        {visible.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground">
              Nothing pending approval.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
