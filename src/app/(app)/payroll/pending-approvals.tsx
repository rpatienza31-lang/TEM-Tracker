"use client";

import { useState, useTransition } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { approveTimeLogAction } from "@/lib/time-logs/actions";

type PendingLog = {
  id: string;
  userName: string;
  workDate: string;
  hours: string;
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
            <TableCell>{log.hours}</TableCell>
            <TableCell className="text-muted-foreground">{log.note}</TableCell>
            <TableCell>
              <Button
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await approveTimeLogAction(log.id);
                    if (result.ok) setApprovedIds((prev) => new Set(prev).add(log.id));
                  })
                }
              >
                Approve
              </Button>
            </TableCell>
          </TableRow>
        ))}
        {visible.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              Nothing pending approval.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
