import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_BADGE_CLASS, STATUS_LABELS, type ItemStatus } from "@/lib/constants";

export function StatusBadge({ status, overdue }: { status: ItemStatus; overdue?: boolean }) {
  return (
    <Badge className={cn(STATUS_BADGE_CLASS[status], overdue && "ring-2 ring-status-overdue")}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
