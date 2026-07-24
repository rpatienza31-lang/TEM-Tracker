"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTimeLogAction } from "@/lib/time-logs/actions";

export function LogForm() {
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    const parsedHours = Number(hours);
    startTransition(async () => {
      const result = await createTimeLogAction(workDate, parsedHours, note || undefined);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setHours("");
      setNote("");
    });
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="workDate">Date</Label>
        <Input id="workDate" type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="w-40" />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="hours">Hours</Label>
        <Input
          id="hours"
          type="number"
          step="0.25"
          min="0.25"
          max="24"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-24"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} className="w-64" />
      </div>
      <Button type="submit" disabled={isPending || !hours}>
        {isPending ? "Logging…" : "Log hours"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
