"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationBell } from "@/components/notification-bell";
import { useNotificationsRealtime } from "@/hooks/use-notifications-realtime";
import { signOut } from "@/app/logout/actions";
import type { LiveAlert } from "@/lib/notifications/queries";

type NavUser = {
  id: string;
  fullName: string;
  role: "owner" | "admin" | "sales" | "editor";
  payType: "hourly" | "quota" | "both";
};

type NotificationItem = { id: string; message: string; readAt: Date | null; createdAt: Date };

const NAV = [
  { href: "/", label: "Dashboard", roles: ["owner", "admin", "sales", "editor"] },
  { href: "/schedule", label: "Project Schedule", roles: ["owner", "admin", "editor"] },
  { href: "/board", label: "Work Board", roles: ["owner", "admin", "editor"] },
  { href: "/my-work", label: "My Work", roles: ["owner", "admin", "sales", "editor"] },
  { href: "/daily", label: "Daily Report", roles: ["owner", "admin", "sales", "editor"] },
  { href: "/cot", label: "COT Orders", roles: ["owner", "admin", "editor"] },
  { href: "/matrix", label: "Matrix View", roles: ["owner", "admin", "editor"] },
  { href: "/cot/library", label: "Available Library", roles: ["owner", "admin", "sales", "editor"] },
  { href: "/review", label: "Review Queue", roles: ["owner", "admin"] },
  { href: "/productivity", label: "Productivity & Quota", roles: ["owner", "admin", "editor"] },
  { href: "/time-logs", label: "My Hours", roles: ["owner", "admin", "sales", "editor"], payTypes: ["hourly", "both"] },
  { href: "/payroll", label: "Payroll Period", roles: ["owner", "admin"] },
  { href: "/admin/backfill", label: "Bulk Backfill", roles: ["owner", "admin"] },
  { href: "/admin", label: "Admin / Setup", roles: ["owner", "admin"] },
] as const;

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AppShell({
  user,
  notifications,
  unreadCount,
  liveAlerts,
  children,
}: {
  user: NavUser;
  notifications: NotificationItem[];
  unreadCount: number;
  liveAlerts: LiveAlert[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useNotificationsRealtime(user.id);
  const items = NAV.filter(
    (item) =>
      (item.roles as readonly string[]).includes(user.role) &&
      (!("payTypes" in item) || (item.payTypes as readonly string[]).includes(user.payType)),
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="flex items-center justify-between border-b border-border p-3 md:hidden">
        <span className="font-semibold">TEM Tracker</span>
        <div className="flex items-center gap-1">
          <NotificationBell items={notifications} unreadCount={unreadCount} liveAlerts={liveAlerts} />
          <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)}>
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      <aside
        className={cn(
          "w-full shrink-0 border-b border-border bg-card md:block md:w-56 md:border-b-0 md:border-r",
          open ? "block" : "hidden",
        )}
      >
        <div className="hidden p-4 text-lg font-semibold md:block">TEM Tracker</div>
        <nav className="flex flex-col gap-1 p-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium hover:bg-accent",
                pathname === item.href && "bg-accent text-accent-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2 border-t border-border p-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="truncate text-xs capitalize text-muted-foreground">{user.role}</p>
          </div>
          <form action={signOut}>
            <Button variant="ghost" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="hidden items-center justify-end border-b border-border p-2 md:flex">
          <NotificationBell items={notifications} unreadCount={unreadCount} liveAlerts={liveAlerts} />
        </div>
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  );
}
