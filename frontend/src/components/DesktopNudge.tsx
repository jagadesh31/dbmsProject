"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "seenq_desktop_nudge";

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

/** Nudge phone visitors toward a laptop — scan UI is built for a wider screen. */
export function DesktopNudge() {
  const [open, setOpen] = useState(false);

  const dismiss = useCallback(() => {
    sessionStorage.setItem(STORAGE_KEY, "1");
    setOpen(false);
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === "1") return;
    if (!isMobileViewport()) return;

    setOpen(true);

    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (!e.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-[rgba(26,26,24,0.5)] backdrop-blur-sm"
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-nudge-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-6 pb-6 pt-5 shadow-[0_28px_80px_rgba(26,26,24,0.22)]"
      >
        <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-[radial-gradient(circle_at_center,rgba(166,90,58,0.16),transparent_70%)]" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-[radial-gradient(circle_at_center,rgba(90,122,106,0.14),transparent_70%)]" />

        <div className="relative z-10">
          <p className="font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)]">
            Seenq
          </p>
          <h2 id="desktop-nudge-title" className="mt-3 text-lg font-semibold text-[var(--ink)]">
            Best on a laptop
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            The live scan and reports are built for a wider screen. Open{" "}
            <span className="font-medium text-[var(--ink)]">dbms.wrenyn.com</span> on a laptop for
            the full experience.
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={dismiss}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--rust)]"
            >
              Continue on this phone
            </button>
            <p className="text-center text-[11px] text-zinc-400">
              You can keep going here — some panels will feel tight.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
