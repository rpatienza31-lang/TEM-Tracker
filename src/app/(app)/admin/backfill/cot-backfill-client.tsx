"use client";

import { useActionState, useMemo, useState } from "react";

import { DELIVERABLE_TYPE_LABELS, STATUS_LABELS, type DeliverableType, type ItemStatus } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bulkBackfillCotAction, type BackfillState } from "./actions";

export type CotBackfillItem = {
  id: string;
  customerName: string;
  subjectName: string | null;
  topic: string | null;
  type: DeliverableType;
  status: ItemStatus;
  deadline: string;
  points: string;
  assigneeName: string | null;
};

const initial: BackfillState = { status: "idle" };

export function CotBackfillClient({
  items,
  editors,
}: {
  items: CotBackfillItem[];
  editors: { id: string; fullName: string }[];
}) {
  const [state, formAction, pending] = useActionState(bulkBackfillCotAction, initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editorId, setEditorId] = useState("");
  const [markUploaded, setMarkUploaded] = useState(true);

  const allSelected = items.length > 0 && selected.size === items.length;
  const totalPoints = useMemo(
    () => items.filter((i) => selected.has(i.id)).reduce((s, i) => s + Number(i.points), 0),
    [items, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No not-yet-finished COT orders to backfill.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted-foreground">Credit points to</span>
          <select
            name="editorId"
            value={editorId}
            onChange={(e) => setEditorId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Choose an editor…</option>
            {editors.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="markUploaded"
            value="1"
            checked={markUploaded}
            onChange={(e) => setMarkUploaded(e.target.checked)}
          />
          Mark as uploaded (fully done)
        </label>
        <div className="ml-auto text-sm text-muted-foreground">
          {selected.size} selected · {totalPoints.toFixed(1)} pts
        </div>
        <Button type="submit" disabled={pending || selected.size === 0 || !editorId}>
          {pending ? "Backfilling…" : `Backfill ${selected.size} order(s)`}
        </Button>
      </div>

      {state.status === "ok" && <p className="text-sm text-status-approved">{state.message}</p>}
      {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}

      {[...selected].map((id) => (
        <input key={id} type="hidden" name="itemIds" value={id} />
      ))}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
            </TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Subject / topic</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assignee</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead className="text-right">Pts</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((i) => (
            <TableRow key={i.id} data-selected={selected.has(i.id)}>
              <TableCell>
                <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggle(i.id)} aria-label="Select order" />
              </TableCell>
              <TableCell className="font-medium">{i.customerName}</TableCell>
              <TableCell className="text-muted-foreground">
                {[i.subjectName, i.topic].filter(Boolean).join(" · ") || "—"}
              </TableCell>
              <TableCell>{DELIVERABLE_TYPE_LABELS[i.type]}</TableCell>
              <TableCell className="text-muted-foreground">{STATUS_LABELS[i.status]}</TableCell>
              <TableCell className="text-muted-foreground">{i.assigneeName ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{i.deadline}</TableCell>
              <TableCell className="text-right tabular-nums">{Number(i.points).toFixed(1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </form>
  );
}
