"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { claimItemAction } from "@/lib/work-items/actions";

export function ClaimButton({ itemId, onError }: { itemId: string; onError: (message: string) => void }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await claimItemAction(itemId);
          if (!result.ok) onError(result.error.message);
        })
      }
    >
      {isPending ? "Claiming…" : "Claim"}
    </Button>
  );
}
