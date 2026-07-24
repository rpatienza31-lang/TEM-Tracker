"use client";

import { useState, useTransition } from "react";

import { TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { setSubjectActiveAction } from "./actions";

export function SubjectRow({ subject }: { subject: { id: string; name: string; shortCode: string; isActive: boolean } }) {
  const [isActive, setIsActive] = useState(subject.isActive);
  const [, startTransition] = useTransition();

  return (
    <TableRow className={!isActive ? "opacity-50" : undefined}>
      <TableCell>{subject.name}</TableCell>
      <TableCell className="text-muted-foreground">{subject.shortCode}</TableCell>
      <TableCell>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const next = !isActive;
            setIsActive(next);
            startTransition(() => setSubjectActiveAction(subject.id, next));
          }}
        >
          {isActive ? "Deactivate" : "Reactivate"}
        </Button>
      </TableCell>
    </TableRow>
  );
}
