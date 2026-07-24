"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { signOut } from "@/app/logout/actions";

type NavUser = {
  fullName: string;
  role: "owner" | "admin" | "sales" | "editor";
};

const NAV = [
  { href: "/", label: "Dashboard", roles: ["owner", "admin", "sales", "editor"] },
  { href: "/board", label: "Work Board", roles: ["owner", "admin", "editor"] },
  { href: "/matrix", label: "Matrix View", roles: ["owner", "admin", "editor"] },
  { href: "/my-work", label: "My Work", roles: ["editor"] },
  { href: "/review", label: "Review Queue", roles: ["owner", "admin"] },
  { href: "/productivity", label: "Productivity & Quota", roles: ["owner", "admin", "editor"] },
  { href: "/payroll", label: "Payroll Period", roles: ["owner", "admin"] },
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

export function AppShell({ user, children }: { user: NavUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((item) => (item.roles as readonly string[]).includes(user.role));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <div className="flex items-center justify-between border-b border-border p-3 md:hidden">
        <span className="font-semibold">TEM Tracker</span>
        <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)}>
          {open ? <X /> : <Menu />}
        </Button>
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
      <main className="flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
    </div>
  );
}
