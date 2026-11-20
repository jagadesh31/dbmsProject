import Link from "next/link";
import { DomainIntake } from "@/components/DomainIntake";
import { LoginButton } from "@/components/LoginButton";

/** Landing: brand first, one clear action. */
export default function LandingPage() {
  return (
    <div className="analysis-surface flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 h-[42rem] w-[42rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(166,90,58,0.11),transparent_65%)]" />
        <div className="absolute -right-16 bottom-0 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(90,122,106,0.13),transparent_65%)]" />
        <div className="absolute inset-0 opacity-[0.28] [background-image:linear-gradient(to_right,rgba(15,15,14,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,15,14,0.035)_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <nav className="relative z-10 flex items-center justify-between px-6 py-6 md:px-10">
        <Link href="/" className="flex items-center gap-3">
          <span className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[var(--ink)]">
            Seenly
          </span>
        </Link>
        <div className="flex items-center gap-5">
          <LoginButton className="text-xs font-black uppercase tracking-[0.14em] text-zinc-500 transition hover:text-[var(--ink)]" />
        </div>
      </nav>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-20 pt-8 text-center">
        <p className="reveal-item font-[family-name:var(--font-display)] text-5xl tracking-tight text-[var(--ink)] md:text-6xl lg:text-7xl">
          Seenly
        </p>
        <h1
          className="reveal-item mt-4 max-w-3xl font-[family-name:var(--font-display)] text-2xl leading-snug text-[var(--ink)] md:text-4xl"
          style={{ animationDelay: "80ms" }}
        >
          See where your brand gets found.
        </h1>
        <p
          className="reveal-item mx-auto mt-5 max-w-lg text-base font-medium leading-relaxed text-zinc-500 md:text-lg"
          style={{ animationDelay: "140ms" }}
        >
          Check Google and AI answers for your brand. Then fix the gaps.
        </p>

        <div className="reveal-item mt-11 w-full max-w-2xl" style={{ animationDelay: "200ms" }}>
          <DomainIntake cta="Check my site" />
          <p className="mt-4 text-xs font-medium text-zinc-400">
            Free scan, no Google login. Sign in when you want the full report.
          </p>
        </div>
      </main>
    </div>
  );
}
