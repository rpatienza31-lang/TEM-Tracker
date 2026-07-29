"use client";

import { useActionState, useEffect, useState } from "react";

import { setUserCashAdvanceAction, type SetRateState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initial: SetRateState = { status: "idle" };

/** Inline editor for a staff member's cash advance (deducted from their payout). */
export function CashAdvanceCell({ userId, amount }: { userId: string; amount: number }) {
  const [state, formAction, pending] = useActionState(setUserCashAdvanceAction, initial);
  const [value, setValue] = useState(amount.toString());
  const dirty = value.trim() !== amount.toString();

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
          aria-label="Cash advance in pesos"
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
