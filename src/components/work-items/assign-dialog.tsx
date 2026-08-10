"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignItemAction } from "@/lib/work-items/actions";

type Editor = { id: string; fullName: string };

export function AssignDialog({
  itemIds,
  editors,
  label,
  onDone,
}: {
  itemIds: string[];
  editors: Editor[];
  label: string;
  onDone: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [overrideWip, setOverrideWip] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!assigneeId) return;
    startTransition(async () => {
      const results = await Promise.all(
        itemIds.map((id) => assignItemAction(id, assigneeId, overrideWip, dueDate || null)),
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        onDone(`${itemIds.length - failed.length} assigned, ${failed.length} failed: ${failed[0].ok ? "" : failed[0].error.message}`);
      } else {
        onDone(`Assigned ${itemIds.length} item${itemIds.length > 1 ? "s" : ""}.`);
      }
      setOpen(false);
      setAssigneeId("");
      setOverrideWip(false);
      setDueDate("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={itemIds.length === 0}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign {itemIds.length > 1 ? `${itemIds.length} items` : "item"}</DialogTitle>
          <DialogDescription>Assigning bypasses self-claim; the WIP limit still applies unless overridden.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger>
              <SelectValue placeholder="Select an editor" />
            </SelectTrigger>
            <SelectContent>
              {editors.map((editor) => (
                <SelectItem key={editor.id} value={editor.id}>
                  {editor.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium" htmlFor="assign-due">
              Deadline <span className="font-normal text-muted-foreground">(optional — sets the Project Schedule day)</span>
            </label>
            <input
              id="assign-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-9 w-44 rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={overrideWip} onCheckedChange={(c) => setOverrideWip(c === true)} />
            Override WIP limit
          </label>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !assigneeId}>
            {isPending ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
