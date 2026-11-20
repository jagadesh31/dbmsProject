"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";

const NAV = [
  { name: "Overview", path: "", hint: "Scores & next steps" },
  { name: "What to fix", path: "/fixes", hint: "Ready-to-copy changes" },
  { name: "Google", path: "/visibility", hint: "Where you rank" },
  { name: "AI answers", path: "/geo", hint: "Where AIs mention you" },
  { name: "Competitors", path: "/competitors", hint: "Who shows up" },
  { name: "Pages", path: "/pages", hint: "Crawled URLs" },
  { name: "Site", path: "/seo", hint: "Technical health" },
  { name: "Settings", path: "/settings", hint: "Project setup" },
] as const;

export default function Sidebar({
  projectId,
  brandName,
  domain,
  mobileOpen = false,
  onNavigate,
}: {
  projectId: string;
  brandName: string;
  domain: string;
  mobileOpen?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const base = `/projects/${projectId}`;

  const navBody = (keyPrefix: string) => (
    <>
      <div className="border-b border-zinc-200/80 px-4 py-5">
        <h2 className="truncate font-[family-name:var(--font-display)] text-xl leading-tight text-[#1a1a18]">
          Seenq
        </h2>
        <p
          className="mt-0.5 truncate font-mono text-[11px] text-zinc-500"
          title={brandName ? `${brandName} · ${domain}` : domain}
        >
          {domain || brandName || "Project"}
        </p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2.5 py-4">
        {NAV.map((item) => {
          const href = `${base}${item.path}`;
          const isActive =
            item.path === ""
              ? pathname === base || pathname === `${base}/`
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={`${keyPrefix}-${item.name}`}
              href={href}
              aria-current={isActive ? "page" : undefined}
              onClick={() => onNavigate?.()}
              className={`group rounded-xl px-3 py-2.5 transition ${
                isActive
                  ? "bg-[#1a1a18] text-white shadow-sm"
                  : "text-zinc-600 hover:bg-white/80 hover:text-[#1a1a18]"
              }`}
            >
              <span className="block text-[13px] font-semibold tracking-tight">{item.name}</span>
              <span
                className={`mt-0.5 block text-[11px] ${
                  isActive ? "text-white/50" : "text-zinc-400 group-hover:text-zinc-500"
                }`}
              >
                {item.hint}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-zinc-200/80 p-3">
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            router.push(`${base}/scan?rerun=1&t=${Date.now()}`);
          }}
          className="flex w-full items-center justify-center rounded-xl bg-[#1a1a18] px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-[#a65a3a]"
        >
          Re-run analysis
        </button>
      </div>

      <div className="border-t border-zinc-200/80 p-3">
        <LogoutButton className="block w-full text-left rounded-xl px-3 py-2.5 transition text-rose-600 font-medium text-[13px] hover:bg-rose-50" />
      </div>
    </>
  );

  return (
    <>
      <aside className="sticky top-0 z-10 hidden h-screen w-[15.5rem] shrink-0 flex-col border-r border-zinc-200/80 bg-[#f7f4ef] md:flex">
        {navBody("desk")}
      </aside>

      <div
        className={`fixed inset-0 z-40 md:hidden ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          aria-label="Close menu"
          className={`absolute inset-0 bg-black/40 transition-opacity ${mobileOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => onNavigate?.()}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col border-r border-zinc-200/80 bg-[#f7f4ef] shadow-xl transition-transform duration-200 ease-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-3">
            <span className="font-[family-name:var(--font-display)] text-lg text-[#1a1a18]">Menu</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => onNavigate?.()}
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-white hover:text-[#1a1a18]"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M5.2 4.3a.75.75 0 0 0-1.06 1.06L8.94 10l-4.8 4.64a.75.75 0 1 0 1.06 1.06L10 11.06l4.64 4.64a.75.75 0 1 0 1.06-1.06L11.06 10l4.64-4.64A.75.75 0 0 0 14.64 4.3L10 8.94 5.2 4.3z" />
              </svg>
            </button>
          </div>
          {navBody("mobile")}
        </aside>
      </div>
    </>
  );
}
