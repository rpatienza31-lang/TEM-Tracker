"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { confirmPaymentReceivedAction } from "./actions";

export function ConfirmReceivedButton({ paymentId }: { paymentId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await confirmPaymentReceivedAction(paymentId);
            if (!r.ok) setError(r.message ?? "Could not confirm.");
          })
        }
      >
        {pending ? "Confirming…" : "Confirm received"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
