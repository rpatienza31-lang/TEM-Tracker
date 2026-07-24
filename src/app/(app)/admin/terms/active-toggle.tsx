"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

export function ActiveToggle({
  termId,
  isActive,
  action,
}: {
  termId: string;
  isActive: boolean;
  action: (termId: string, isActive: boolean) => Promise<void>;
}) {
  const [active, setActive] = useState(isActive);
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        const next = !active;
        setActive(next);
        startTransition(() => action(termId, next));
      }}
    >
      {active ? "Deactivate" : "Activate"}
    </Button>
  );
}
