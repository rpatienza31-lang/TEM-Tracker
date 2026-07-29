"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteItemAction } from "@/lib/work-items/actions";

export function DeleteItemButton({
  itemId,
  label,
  onDone,
  onError,
}: {
  itemId: string;
  label: string;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function run() {
    startTransition(async () => {
      const result = await deleteItemAction(itemId);
      if (result.ok) onDone("Work item deleted.");
      else onError(result.error.message);
      setConfirming(false);
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button size="sm" variant="destructive" disabled={isPending} onClick={run}>
          {isPending ? "Deleting…" : "Confirm delete"}
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </span>
    );
  }

  return (
    <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirming(true)}>
      {label}
    </Button>
  );
}
