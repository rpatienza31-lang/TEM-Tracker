"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { requestRevisionAction, setCotItemScheduleAction, setDueDateAction } from "@/lib/work-items/actions";
import { requestCotRevisionAction } from "@/app/(app)/cot/actions";

/**
 * Sends an in-review item back to its editor as a revision (back job) AND sets a
 * new deadline, so it's clear when the revision was asked for and by when it must
 * be redone — the card then lands on that day in the Project Schedule.
 *
 * Catalog items require a note (what to fix); COT items have no note field.
 */
export function RequestRevisionDialog({
  itemId,
  onDone,
  kind = "catalog",
  defaultDate,
}: {
  itemId: string;
  onDone: (message: string) => void;
  kind?: "catalog" | "cot";
  defaultDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(defaultDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const noteRequired = kind === "catalog";

  function submit() {
    startTransition(async () => {
      setError(null);
      if (kind === "cot") {
        const r1 = await requestCotRevisionAction(itemId);
        if (!r1.ok) return setError(r1.message ?? "Could not request a revision.");
        const r2 = await setCotItemScheduleAction(itemId, date);
        if (!r2.ok) return setError(r2.message ?? "Sent back, but could not set the new deadline.");
      } else {
        const r1 = await requestRevisionAction(itemId, note);
        if (!r1.ok) return setError(r1.error.message);
        const r2 = await setDueDateAction(itemId, date);
        if (!r2.ok) return setError(r2.message ?? "Sent back, but could not set the new deadline.");
      }
      setOpen(false);
      setNote("");
      onDone("Sent back for revision.");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Request revision
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request revision</DialogTitle>
          <DialogDescription>
            {noteRequired
              ? "A note is required so the editor knows what to fix. Set a new deadline for the revision."
              : "Set a new deadline for the revision."}
          </DialogDescription>
        </DialogHeader>

        {noteRequired && (
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs to change?" />
        )}

        <label className="flex flex-col gap-1 text-sm font-medium">
          New deadline
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-44 rounded-md border border-input bg-background px-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !date || (noteRequired && !note.trim())}>
            {isPending ? "Sending…" : "Send back"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
