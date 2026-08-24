"use client";

import { useActionState, useEffect, useState } from "react";

import { setUserRateAction, type SetRateState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initial: SetRateState = { status: "idle" };

/**
 * Inline editor for one staff member's pay rate. Rendered only for the owner.
 * The Save button appears once the value changes; a brief "Saved" confirms it.
 */
export function RateCell({ userId, rate, field }: { userId: string; rate: number; field: "hourly" | "cycle" | "daily" }) {
  const [state, formAction, pending] = useActionState(setUserRateAction, initial);
  const [value, setValue] = useState(rate.toString());
  const dirty = value.trim() !== rate.toString();

  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (state.status === "ok") {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 1600);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="field" value={field} />
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">₱</span>
        <Input
          name="rate"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-28"
          aria-label="Pay rate in pesos"
        />
      </div>
      {dirty && (
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      )}
      {!dirty && justSaved && <span className="text-xs text-status-approved">Saved ✓</span>}
      {state.status === "error" && <span className="text-xs text-destructive">{state.message}</span>}
    </form>
  );
}
