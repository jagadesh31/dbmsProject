"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  JOURNEY_STEPS,
  JourneyStepId,
  estimateSecondsRemaining,
  journeyProgressPercent,
} from "@/lib/journey";

type Subtask = { label: string; detail?: string; done?: boolean };

export function ScanExperience({
  domain,
  positioning,
  step,
  finished,
  running,
  stopped,
  pauseDetail,
  onRestart,
  restarting,
  subtasks,
  children,
}: {
  domain: string;
  /** Optional north-star positioning sentence — shown as "Aiming at: …" in the header. */
  positioning?: string;
  step: JourneyStepId;
  finished: boolean;
  running: boolean;
  stopped: boolean;
  pauseDetail?: string;
  onRestart?: () => void;
  restarting?: boolean;
  subtasks: Subtask[];
  children: React.ReactNode;
}) {
  const progress = journeyProgressPercent(step, finished, running);
  const eta = estimateSecondsRemaining(step, finished);
  const current = JOURNEY_STEPS.find((item) => item.id === step);

  useEffect(() => {
    const prevHtml = document.documentElement.style.overflow;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  return (
    <div className="scan-app flex h-dvh max-h-dvh flex-col overflow-hidden">
      <header className="relative z-20 flex shrink-0 items-center justify-between border-b border-[var(--line)]/70 bg-[var(--paper)]/85 px-5 py-3 backdrop-blur-md md:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href="/"
            className="shrink-0 font-[family-name:var(--font-display)] text-xl tracking-tight text-[var(--ink)]"
          >
            Seenq
          </Link>
          <div className="hidden h-5 w-px bg-[var(--line)] sm:block" />
          <div className="min-w-0">
            <div className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">
              {domain}
            </div>
            {positioning ? (
              <div className="mt-0.5 flex items-center gap-1.5 truncate">
                <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--rust)]">
                  Aiming at
                </span>
                <span className="truncate text-[10px] font-semibold text-zinc-600" title={positioning}>
                  {positioning}
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            finished
              ? "bg-[var(--sage-soft)] text-[var(--sage)]"
              : stopped
                ? "bg-[var(--rust-soft)] text-[var(--rust)]"
                : "bg-white/80 text-zinc-600 ring-1 ring-[var(--line)]"
          }`}
        >
          {finished ? "Ready" : stopped ? "Paused" : running ? "Live" : "Starting"}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 md:flex-row md:gap-0 md:p-4 lg:p-5">
        <aside className="scan-sidebar relative flex h-auto max-h-[32vh] w-full shrink-0 flex-col overflow-hidden rounded-2xl text-white sm:max-h-[38vh] md:h-full md:max-h-none md:w-[280px] lg:w-[300px]">
          <div className="scan-sidebar-glow pointer-events-none absolute inset-0" />
          <div className="relative z-10 flex min-h-0 flex-1 flex-col p-4 md:p-5">
            <div className="mb-4 shrink-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
                Live analysis
              </p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-lg tracking-tight text-white">
                {current?.label ?? "Scan"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/45">
                {current?.description}
              </p>
            </div>

            <nav
              className="scan-sidebar-nav min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
              aria-label="Scan progress"
            >
              <div className="flex flex-col gap-0.5">
                {JOURNEY_STEPS.map((item) => {
                  const done = item.id < step;
                  const isCurrent = item.id === step;
                  return (
                    <div
                      key={item.key}
                      className={`rounded-xl px-3 py-2.5 transition-colors duration-300 ${
                        isCurrent ? "bg-white/[0.1] ring-1 ring-[rgba(166,90,58,0.45)]" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <StatusIcon done={done} current={isCurrent} />
                        <span
                          className={`text-sm font-medium transition-colors ${
                            isCurrent ? "text-white" : done ? "text-white/75" : "text-white/30"
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>

                      {isCurrent && subtasks.length > 0 ? (
                        <ul className="ml-2 mt-2 space-y-1.5 border-l border-white/10 pl-5">
                          {subtasks.map((task) => (
                            <li
                              key={task.label}
                              className="flex items-center justify-between gap-2 text-xs text-white/55"
                            >
                              <span className="flex min-w-0 items-center gap-2 truncate">
                                <span
                                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                    task.done
                                      ? "bg-[var(--sage)]"
                                      : task.detail === "crawling…"
                                        ? "scan-pulse-dot bg-[var(--rust)]"
                                        : "scan-pulse-dot bg-white/50"
                                  }`}
                                />
                                <span
                                  className={`truncate ${
                                    task.detail === "crawling…" ? "font-medium text-white/80" : ""
                                  }`}
                                >
                                  {task.label}
                                </span>
                              </span>
                              {task.detail ? (
                                <span
                                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                                    task.detail === "✓"
                                      ? "bg-[rgba(90,122,106,0.28)] text-[#c5d9cc]"
                                      : task.detail === "crawling…"
                                        ? "bg-[rgba(166,90,58,0.28)] text-[#e8c4b4]"
                                        : "bg-white/10 text-white/80"
                                  }`}
                                >
                                  {task.detail}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </nav>

            <div className="mt-4 shrink-0">
              <div className="mb-2 flex items-center justify-between text-xs text-white/45">
                <span>{finished ? "All set" : stopped ? "Paused" : `About ${eta}s left`}</span>
                <span className="font-semibold tabular-nums text-white/70">{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="scan-progress-bar h-full rounded-full"
                  style={{
                    width: `${progress}%`,
                    background:
                      "linear-gradient(90deg, var(--rust) 0%, #c4845f 45%, var(--sage) 100%)",
                  }}
                />
              </div>
            </div>
          </div>
        </aside>

        <main className="scan-main relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl md:ml-4">
          <div className="scan-main-sheen pointer-events-none absolute inset-0" />
          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden p-3 md:p-4">
            {stopped ? (
              <div className="mb-4 shrink-0 rounded-2xl border border-[var(--rust)]/30 bg-[var(--rust-soft)]/90 px-4 py-3 text-sm text-[var(--ink)] shadow-sm">
                <p className="font-semibold">Something interrupted the scan.</p>
                <p className="mt-1 text-zinc-600">{pauseDetail}</p>
                {onRestart ? (
                  <button
                    type="button"
                    onClick={onRestart}
                    disabled={restarting}
                    className="mt-3 rounded-xl bg-[var(--ink)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[var(--rust)] disabled:opacity-50"
                  >
                    {restarting ? "Restarting…" : "Restart scan"}
                  </button>
                ) : null}
              </div>
            ) : null}

            <div
              key={`panel-${step}`}
              className="scan-step-enter flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
            >
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function StatusIcon({ done, current }: { done: boolean; current: boolean }) {
  if (done && !current) {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--sage)] text-[10px] font-black text-white">
        ✓
      </span>
    );
  }
  if (current) {
    return (
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[rgba(166,90,58,0.35)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--rust)] shadow-[0_0_12px_rgba(166,90,58,0.65)]" />
      </span>
    );
  }
  return <span className="h-5 w-5 rounded-full border border-white/20" />;
}
