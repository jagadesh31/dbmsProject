"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Sidebar from "./sidebar";

/** Hides the product sidebar while the analysis journey is on screen. */
export function ScanAwareShell({
  children,
  projectId,
  brandName,
  domain,
}: {
  children: ReactNode;
  projectId: string;
  brandName: string;
  domain: string;
}) {
  const pathname = usePathname();
  const isScan = pathname?.endsWith("/scan") ?? false;
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  if (isScan) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="flex min-h-screen bg-[#f3eee6]">
      <Sidebar
        projectId={projectId}
        brandName={brandName}
        domain={domain}
        mobileOpen={menuOpen}
        onNavigate={() => setMenuOpen(false)}
      />
      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-zinc-200/80 bg-[#faf8f4]/95 px-4 py-3 backdrop-blur md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-[#1a1a18]"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M3.5 5.75A.75.75 0 0 1 4.25 5h11.5a.75.75 0 0 1 0 1.5H4.25a.75.75 0 0 1-.75-.75zm0 4.25a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 0 1.5H4.25A.75.75 0 0 1 3.5 10zm0 4.25a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 0 1.5H4.25a.75.75 0 0 1-.75-.75z" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <Link href={`/projects/${projectId}`} className="block truncate font-[family-name:var(--font-display)] text-lg text-[#1a1a18]">
              Seenq
            </Link>
            <p className="truncate font-mono text-[10px] text-zinc-500">{domain || brandName}</p>
          </div>
        </div>
        <div className="min-h-full bg-[#faf8f4]">{children}</div>
      </main>
    </div>
  );
}
