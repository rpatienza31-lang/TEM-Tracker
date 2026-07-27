"use client";

import { useActionState, useEffect, useState } from "react";

import { setUserPasswordAction, type SetPasswordState } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initial: SetPasswordState = { status: "idle" };

/**
 * Inline control to set or reset one staff member's login password, so they
 * can sign in with email + password instead of a magic link.
 */
export function SetPasswordCell({ userId }: { userId: string }) {
  const [state, formAction, pending] = useActionState(setUserPasswordAction, initial);
  const [value, setValue] = useState("");

  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (state.status === "ok") {
      setJustSaved(true);
      setValue("");
      const t = setTimeout(() => setJustSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex items-center gap-2">
        <Input
          name="password"
          type="text"
          minLength={6}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Set password"
          className="w-36"
          aria-label="Set login password"
        />
        {value.length >= 6 && (
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {pending ? "Saving…" : "Set"}
          </Button>
        )}
      </div>
      {justSaved && <span className="text-xs text-status-approved">Password set ✓</span>}
      {state.status === "error" && <span className="text-xs text-destructive">{state.message}</span>}
    </form>
  );
}
