"use client";

import { useActionState, useEffect, useRef } from "react";

import { adjustPointsAction } from "./actions";
import type { SetRateState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initial: SetRateState = { status: "idle" };

/**
 * Owner-only inline control to correct an editor's points. A positive amount
 * adds points; a negative amount (with a leading minus) deducts them. Every
 * correction is applied to the editor's open cycle and recorded for audit.
 */
export function AdjustPointsForm({ editorId, editorName }: { editorId: string; editorName: string }) {
  const [state, formAction, pending] = useActionState(adjustPointsAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "ok") formRef.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        Add a missing project (enter its points and name the subject in the reason) or correct the total. Use a minus
        sign to deduct.
      </p>
      <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="editorId" value={editorId} />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`adj-points-${editorId}`}>
            Add / adjust points
          </label>
          <Input
            id={`adj-points-${editorId}`}
            name="points"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="e.g. 0.2 or -1.5"
            className="w-32"
            aria-label={`Point adjustment for ${editorName}`}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`adj-note-${editorId}`}>
            Subject / reason (optional)
          </label>
          <Input
            id={`adj-note-${editorId}`}
            name="note"
            type="text"
            placeholder="e.g. Grade 4 Math Week 3, or why this correction"
            className="min-w-48"
          />
        </div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Applying…" : "Apply"}
        </Button>
        {state.status === "ok" && <span className="text-xs text-status-approved">Adjusted ✓</span>}
        {state.status === "error" && <span className="text-xs text-destructive">{state.message}</span>}
      </form>
    </div>
  );
}
