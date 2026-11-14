"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Live-refreshes the notification bell when a new row lands for this user.
 * When `watchRedAlerts` is set (owner/admin/sales), it also refreshes on any
 * COT order change, so a newly raised red alert updates the bell — and chimes —
 * without needing a manual navigation. (Requires custom_orders to be in the
 * Supabase realtime publication; see migration 0032. If it isn't, the red-alert
 * count still updates on the next navigation.)
 */
export function useNotificationsRealtime(userId: string, watchRedAlerts = false) {
  const router = useRouter();
  const routerRef = useRef(router);

  useEffect(() => {
    routerRef.current = router;
  });

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => routerRef.current.refresh(),
      );

    if (watchRedAlerts) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "custom_orders" },
        () => routerRef.current.refresh(),
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, watchRedAlerts]);
}
