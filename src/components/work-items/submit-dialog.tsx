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
import { Textarea } from "@/components/ui/textarea";
import { submitItemAction } from "@/lib/work-items/actions";

export function SubmitDialog({
  itemId,
  type,
  label,
  onError,
}: {
  itemId: string;
  type: "DLP" | "COT";
  label: string;
  onError?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dlpUrl, setDlpUrl] = useState("");
  const [pptUrl, setPptUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await submitItemAction(itemId, { dlpUrl, pptUrl: pptUrl || undefined, notes: notes || undefined });
      if (!result.ok) {
        setError(result.error.message);
        onError?.(result.error.message);
        return;
      }
      setError(null);
      setOpen(false);
      setDlpUrl("");
      setPptUrl("");
      setNotes("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit for review</DialogTitle>
          <DialogDescription>Links to wherever the files already live (Google Drive, etc.)</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="dlpUrl">{type === "DLP" ? "DLP link" : "COT link"}</Label>
            <Input id="dlpUrl" value={dlpUrl} onChange={(e) => setDlpUrl(e.target.value)} placeholder="https://drive.google.com/…" />
          </div>
          {type === "DLP" && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="pptUrl">PPT link (required)</Label>
              <Input id="pptUrl" value={pptUrl} onChange={(e) => setPptUrl(e.target.value)} placeholder="https://drive.google.com/…" />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || !dlpUrl.trim() || (type === "DLP" && !pptUrl.trim())}>
            {isPending ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
