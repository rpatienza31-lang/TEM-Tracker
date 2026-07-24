import { cn } from "@/lib/utils";

export function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full", pct >= 100 ? "bg-status-uploaded" : "bg-status-claimed")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
