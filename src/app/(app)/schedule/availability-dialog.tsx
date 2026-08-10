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
import { setAvailabilityRangeAction } from "@/lib/work-items/actions";
import type { AvailabilityKind } from "@/lib/work-items/queries";

type Staff = { id: string; name: string };

const KINDS: { value: AvailabilityKind; label: string; emoji: string }[] = [
  { value: "day_off", label: "Day off", emoji: "😴" },
  { value: "vacation", label: "Vacation", emoji: "🌴" },
  { value: "school", label: "School", emoji: "🎓" },
  { value: "absent", label: "Absent", emoji: "🚫" },
];

/**
 * Owner/admin control to mark a staff member off across a date range in one go
 * (e.g. vacation Aug 12–16), rather than tapping each day in the grid.
 */
export function AvailabilityDialog({ allStaff, defaultFrom }: { allStaff: Staff[]; defaultFrom: string }) {
  const [open, setOpen] = useState(false);
  const [editorId, setEditorId] = useState("");
  const [kind, setKind] = useState<AvailabilityKind>("day_off");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultFrom);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!editorId) {
      setError("Pick a staff member.");
      return;
    }
    startTransition(async () => {
      const res = await setAvailabilityRangeAction(editorId, from, to, kind);
      if (!res.ok) {
        setError(res.message ?? "Could not save.");
        return;
      }
      setOpen(false);
      setEditorId("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Mark leave / day off
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark staff off</DialogTitle>
          <DialogDescription>Set a day off, vacation, school or absent across a range of days.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Staff</span>
            <select
              value={editorId}
              onChange={(e) => setEditorId(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Select a staff member…</option>
              {allStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Status</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as AvailabilityKind)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.emoji} {k.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  if (to < e.target.value) setTo(e.target.value);
                }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">To</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !editorId}>
            {pending ? "Saving…" : "Mark off"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
