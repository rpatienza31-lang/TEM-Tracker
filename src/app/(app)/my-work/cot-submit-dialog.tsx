"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitCotAction } from "../cot/actions";

/** Lets the assigned staff submit a finished COT deliverable for admin review. */
export function CotSubmitDialog({ itemId }: { itemId: string }) {
  const [open, setOpen] = useState(false);
  const [fileUrl, setFileUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await submitCotAction(itemId, fileUrl.trim());
      if (!result.ok) {
        setError(result.message ?? "Could not submit.");
        return;
      }
      setOpen(false);
      setFileUrl("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          Submit / Done
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit COT deliverable</DialogTitle>
          <DialogDescription>
            Paste the link to the finished file (Google Drive, etc.). An admin approves it before it counts.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor="cotFileUrl">File link</Label>
          <Input
            id="cotFileUrl"
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            placeholder="https://drive.google.com/…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !fileUrl.trim()}>
            {isPending ? "Submitting…" : "Submit for review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
