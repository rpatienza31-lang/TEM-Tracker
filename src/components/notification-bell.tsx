"use client";

import { useState, useTransition } from "react";
import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/lib/notifications/actions";
import { cn } from "@/lib/utils";
import type { LiveAlert } from "@/lib/notifications/queries";

type NotificationItem = {
  id: string;
  message: string;
  readAt: Date | null;
  createdAt: Date;
};

export function NotificationBell({
  items,
  unreadCount,
  liveAlerts,
}: {
  items: NotificationItem[];
  unreadCount: number;
  liveAlerts: LiveAlert[];
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  const badgeCount = unreadCount + liveAlerts.reduce((sum, a) => sum + a.count, 0);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {badgeCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {liveAlerts.length > 0 && (
          <>
            <DropdownMenuLabel>Alerts</DropdownMenuLabel>
            <div className="flex flex-col gap-1 px-2 pb-2">
              {liveAlerts.map((alert) => (
                <a
                  key={alert.label}
                  href={alert.href}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-sm hover:bg-accent",
                    alert.tone === "danger" ? "text-destructive" : "text-amber-600",
                  )}
                >
                  {alert.count} {alert.label}
                </a>
              ))}
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              className="text-xs text-primary underline"
              onClick={() => startTransition(() => markAllNotificationsReadAction())}
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          {items.map((item) => (
            <button
              key={item.id}
              className={cn(
                "rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                !item.readAt && "bg-accent/50 font-medium",
              )}
              onClick={() => {
                if (!item.readAt) startTransition(() => markNotificationReadAction(item.id));
              }}
            >
              {item.message}
            </button>
          ))}
          {items.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted-foreground">No notifications yet.</p>}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
