"use client";

import { useState, useTransition } from "react";

import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteTimeLogAction } from "@/lib/time-logs/actions";

type Log = {
  id: string;
  workDate: string;
  hours: string | null;
  timeIn: string | null;
  timeOut: string | null;
  approvedAt: Date | null;
};

export function LogRow({ log }: { log: Log }) {
  const [deleted, setDeleted] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (deleted) return null;

  const inProgress = log.hours === null;

  return (
    <TableRow>
      <TableCell>{log.workDate}</TableCell>
      <TableCell className="text-muted-foreground">{log.timeIn ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{log.timeOut ?? "—"}</TableCell>
      <TableCell className="tabular-nums">{log.hours ?? "—"}</TableCell>
      <TableCell>
        {inProgress ? (
          <Badge variant="outline">In progress</Badge>
        ) : log.approvedAt ? (
          <Badge>Approved</Badge>
        ) : (
          <Badge variant="outline">Pending</Badge>
        )}
      </TableCell>
      <TableCell>
        {!log.approvedAt && !inProgress && (
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteTimeLogAction(log.id);
                if (result.ok) setDeleted(true);
              })
            }
          >
            Delete
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
