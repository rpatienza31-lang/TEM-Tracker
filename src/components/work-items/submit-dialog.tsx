"use client";

import { useRef, useState, useTransition } from "react";

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
import { uploadWorkItemFile } from "@/lib/storage/upload";
import { DELIVERABLE_TYPE_LABELS, type DeliverableType } from "@/lib/constants";

export function SubmitDialog({
  itemId,
  type,
  label,
  onError,
}: {
  itemId: string;
  type: DeliverableType;
  label: string;
  onError?: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fileUrl, setFileUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function submit() {
    startTransition(async () => {
      const result = await submitItemAction(itemId, { fileUrl, notes: notes || undefined });
      if (!result.ok) {
        setError(result.error.message);
        onError?.(result.error.message);
        return;
      }
      setError(null);
      setOpen(false);
      setFileUrl("");
      setNotes("");
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploading(true);
    const result = await uploadWorkItemFile(itemId, file);
    setIsUploading(false);
    if (!result.ok) {
      setError(`Upload failed (${result.message}) — paste a link instead.`);
      return;
    }
    setFileUrl(result.url);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
          <DialogDescription>Upload the file, or paste a link to wherever it already lives (Google Drive, etc.)</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="fileUrl">{DELIVERABLE_TYPE_LABELS[type]} link</Label>
            <div className="flex gap-2">
              <Input
                id="fileUrl"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                placeholder="https://drive.google.com/…"
                disabled={isUploading}
              />
              <Button type="button" variant="outline" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
                {isUploading ? "Uploading…" : "Upload"}
              </Button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button onClick={submit} disabled={isPending || isUploading || !fileUrl.trim()}>
            {isPending ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
