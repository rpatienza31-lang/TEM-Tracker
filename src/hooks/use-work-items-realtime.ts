"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to postgres_changes on work_items and refreshes the current
 * route's server data on any insert/update/delete, so the board/matrix
 * reflect other users' claims within ~1s (spec §7.2/§7.3).
 */
export function useWorkItemsRealtime(termId?: string) {
  const router = useRouter();
  const routerRef = useRef(router);

  useEffect(() => {
    routerRef.current = router;
  });

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`work_items_${termId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_items",
          ...(termId ? { filter: `term_id=eq.${termId}` } : {}),
        },
        () => routerRef.current.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [termId]);
}
