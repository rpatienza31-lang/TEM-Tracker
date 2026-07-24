"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { TransitionResult } from "@/lib/work-items/transitions";

export function BulkActionButton({
  itemIds,
  label,
  pendingLabel,
  variant = "outline",
  action,
  onDone,
}: {
  itemIds: string[];
  label: string;
  pendingLabel: string;
  variant?: "outline" | "destructive" | "secondary" | "default";
  action: (itemId: string) => Promise<TransitionResult>;
  onDone: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant={variant}
      disabled={itemIds.length === 0 || isPending}
      onClick={() =>
        startTransition(async () => {
          const results = await Promise.all(itemIds.map(action));
          const failed = results.filter((r) => !r.ok);
          if (failed.length > 0) {
            onDone(`${itemIds.length - failed.length} succeeded, ${failed.length} failed: ${failed[0].ok ? "" : failed[0].error.message}`);
          } else {
            onDone(`${label} applied to ${itemIds.length} item${itemIds.length > 1 ? "s" : ""}.`);
          }
        })
      }
    >
      {isPending ? pendingLabel : label}
    </Button>
  );
}
