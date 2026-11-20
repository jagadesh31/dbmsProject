"use client";

import { useEffect } from "react";
import { useAuthModal } from "@/components/AuthModal";

/** Opens the limit modal when ?limit=1 is present (already used this Google account). */
export function LimitGate({ active }: { active: boolean }) {
  const { openAuthModal } = useAuthModal();

  useEffect(() => {
    if (!active) return;
    openAuthModal(
      typeof window !== "undefined" ? `${window.location.origin}/projects` : "/projects",
      {
        mode: "limit",
        message:
          "This Google account already used its Seenq scan. Open your report, or sign in with a different Google account.",
      },
    );
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("limit");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [active, openAuthModal]);

  return null;
}
