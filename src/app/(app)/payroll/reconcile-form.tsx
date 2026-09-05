"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { reconcileEditorAction, type SetRateState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initial: SetRateState = { status: "idle" };

/**
 * Owner reconciliation: set an editor to the cycle number and current points
 * they are really on (a one-time baseline for staff you're catching up on),
 * without touching past approvals. Both fields default to the current values.
 */
export function ReconcileForm({
  editorId,
  cycleNumber,
  currentPoints,
}: {
  editorId: string;
  cycleNumber: number;
  currentPoints: number;
}) {
  const [state, formAction, pending] = useActionState(reconcileEditorAction, initial);
  const [cycle, setCycle] = useState(String(cycleNumber));
  const [points, setPoints] = useState(String(currentPoints));
  const dirty = cycle.trim() !== String(cycleNumber) || points.trim() !== String(currentPoints);
  const router = useRouter();

  // Pull the corrected points into the table the moment the baseline saves,
  // instead of waiting for a manual reload.
  useEffect(() => {
    if (state.status === "ok") router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
      <input type="hidden" name="editorId" value={editorId} />
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`rc-cycle-${editorId}`}>
          Current cycle #
        </label>
        <Input
          id={`rc-cycle-${editorId}`}
          name="cycleNumber"
          type="number"
          min="1"
          step="1"
          value={cycle}
          onChange={(e) => setCycle(e.target.value)}
          className="w-24"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`rc-points-${editorId}`}>
          Current points
        </label>
        <Input
          id={`rc-points-${editorId}`}
          name="points"
          type="number"
          min="0"
          step="0.01"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          className="w-24"
        />
      </div>
      {dirty && (
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Set baseline"}
        </Button>
      )}
      {state.status === "ok" && <span className="text-xs text-status-approved">Reconciled ✓</span>}
      {state.status === "error" && <span className="text-xs text-destructive">{state.message}</span>}
    </form>
  );
}
