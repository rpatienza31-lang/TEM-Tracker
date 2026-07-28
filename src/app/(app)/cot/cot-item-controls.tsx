"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_BADGE_CLASS, STATUS_LABELS, DELIVERABLE_TYPE_LABELS, type ItemStatus, type DeliverableType } from "@/lib/constants";
import { approveCotAction, claimCotAction, releaseCotAction, submitCotAction, unapproveCotAction } from "./actions";

type Item = {
  id: string;
  type: DeliverableType;
  status: string;
  assigneeName: string | null;
  fileUrl: string | null;
};

export function CotItemControls({
  item,
  isAdmin,
  canClaim,
}: {
  item: Item;
  isAdmin: boolean;
  canClaim: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const status = item.status as ItemStatus;

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message ?? "Something went wrong.");
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{DELIVERABLE_TYPE_LABELS[item.type]}</span>
        <Badge className={STATUS_BADGE_CLASS[status]}>{STATUS_LABELS[status]}</Badge>
      </div>

      {item.assigneeName && <p className="text-xs text-muted-foreground">Editor: {item.assigneeName}</p>}
      {item.fileUrl && (
        <a href={item.fileUrl} target="_blank" rel="noopener" className="text-xs text-accent underline">
          View file
        </a>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {status === "available" && canClaim && (
          <Button size="sm" disabled={pending} onClick={() => run(() => claimCotAction(item.id))}>
            Claim
          </Button>
        )}

        {(status === "claimed" || status === "revision") && (
          <div className="flex w-full flex-col gap-2">
            <Input
              placeholder="Paste finished file link"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              className="h-8"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending || fileUrl.trim().length === 0}
                onClick={() => run(() => submitCotAction(item.id, fileUrl.trim()))}
              >
                Submit for review
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => releaseCotAction(item.id))}>
                Release
              </Button>
            </div>
          </div>
        )}

        {status === "in_review" && isAdmin && (
          <Button size="sm" disabled={pending} onClick={() => run(() => approveCotAction(item.id))}>
            Approve (+points)
          </Button>
        )}

        {status === "approved" && isAdmin && (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => unapproveCotAction(item.id))}>
            Un-approve
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
