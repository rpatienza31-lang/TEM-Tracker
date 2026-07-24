"use client";

import { useState, useTransition } from "react";

import { TableCell, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { upsertWeekAction } from "./actions";

export function WeekRow({
  termId,
  weekNumber,
  uploadDeadline,
}: {
  termId: string;
  weekNumber: number;
  uploadDeadline: string | null;
}) {
  const [deadline, setDeadline] = useState(uploadDeadline ?? "");
  const [cascade, setCascade] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <TableRow>
      <TableCell>Week {weekNumber}</TableCell>
      <TableCell>
        <Input type="date" value={deadline} onChange={(e) => { setDeadline(e.target.value); setSaved(false); }} className="w-40" />
      </TableCell>
      <TableCell>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={cascade} onCheckedChange={(c) => setCascade(c === true)} />
          Cascade to existing items
        </label>
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          disabled={!deadline || isPending}
          onClick={() =>
            startTransition(async () => {
              await upsertWeekAction(termId, weekNumber, deadline, cascade);
              setSaved(true);
            })
          }
        >
          {isPending ? "Saving…" : saved ? "Saved" : "Save"}
        </Button>
      </TableCell>
    </TableRow>
  );
}
