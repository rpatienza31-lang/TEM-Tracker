"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, Volume2, VolumeX } from "lucide-react";

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

const SOUND_KEY = "tem_bell_sound";

/** Short two-tone chime via Web Audio — no asset file needed. */
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // Two quick rising notes.
    [
      { f: 880, t: 0 },
      { f: 1175, t: 0.14 },
    ].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.24);
    });
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* audio not available — ignore */
  }
}

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

  // Sound on/off, remembered per browser (default on).
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => {
    try {
      setSoundOn(localStorage.getItem(SOUND_KEY) !== "off");
    } catch {
      /* ignore */
    }
  }, []);
  function toggleSound() {
    setSoundOn((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SOUND_KEY, next ? "on" : "off");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Chime when the badge count rises (a new notification or alert arrived).
  // Skip the very first render so we don't beep on page load.
  const prevBadge = useRef<number | null>(null);
  useEffect(() => {
    if (prevBadge.current !== null && badgeCount > prevBadge.current && soundOn) {
      playChime();
    }
    prevBadge.current = badgeCount;
  }, [badgeCount, soundOn]);

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSound}
              title={soundOn ? "Alert sound on — click to mute" : "Alert sound muted — click to enable"}
              aria-label={soundOn ? "Mute alert sound" : "Enable alert sound"}
              className="text-muted-foreground hover:text-foreground"
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            {unreadCount > 0 && (
              <button
                className="text-xs text-primary underline"
                onClick={() => startTransition(() => markAllNotificationsReadAction())}
              >
                Mark all read
              </button>
            )}
          </div>
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
