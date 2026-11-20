"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CompetitorSample } from "@/lib/journey";
import { scanNumber, scanString } from "@/lib/useScanStream";

const DWELL_MS = 4800;

function faviconLetter(domain: string) {
  return domain.replace(/^www\./, "")[0]?.toUpperCase() ?? "?";
}

function cleanHost(domain: string) {
  return domain.replace(/^www\./, "").toLowerCase();
}

function friendlyClass(raw?: string) {
  if (!raw || raw === "Classifying…" || raw === "unknown") return "";
  const lower = raw.toLowerCase();
  if (lower.includes("direct") || lower.includes("d2c")) return "Direct rival";
  if (lower.includes("content") || lower.includes("publisher")) return "Content site";
  if (lower.includes("market")) return "Marketplace";
  if (lower.includes("retail")) return "Retailer";
  return raw.replace(/_/g, " ");
}

function barColor(i: number) {
  const colors = ["bg-[#1a1a18]", "bg-zinc-700", "bg-zinc-600", "bg-zinc-500", "bg-zinc-400"];
  return colors[i] ?? "bg-zinc-300";
}

function TypedText({ text, speed = 28 }: { text: string; speed?: number }) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    if (!text) return;
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return <>{shown}</>;
}

function ScanningBrowser({ domain, checking }: { domain: string; checking: string }) {
  const [progress, setProgress] = useState(0);
  const [scanLine, setScanLine] = useState(0);

  useEffect(() => {
    if (!checking) return;
    setProgress(0);
    setScanLine(0);
    const start = Date.now();
    const dur = Math.max(3200, DWELL_MS - 600);
    const id = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / dur);
      setProgress(p);
      if (p >= 1) clearInterval(id);
    }, 60);
    const sl = window.setInterval(() => {
      setScanLine((n) => Math.min(5, n + 1));
    }, 420);
    return () => {
      clearInterval(id);
      clearInterval(sl);
    };
  }, [checking]);

  if (!checking) return null;

  const lines = [
    `Opening https://${checking}`,
    "Reading title and meta…",
    "Scanning headings…",
    "Collecting page copy…",
    "Checking schema…",
    `Comparing to ${domain}`,
  ];

  return (
    <div className="scan-card-appear overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/[0.07]">
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
        <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
        <span className="h-2 w-2 rounded-full bg-[#28c840]" />
        <div className="ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-2.5 py-1 text-[10px] text-zinc-500 ring-1 ring-zinc-200">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400 animate-pulse" />
          <span className="truncate font-mono">https://{checking}</span>
        </div>
        <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
          Scanning
        </span>
      </div>
      <div className="h-1 w-full bg-zinc-100">
        <div
          className="h-full rounded-r-full bg-[#4285f4] transition-all duration-300 ease-out"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="space-y-2 p-4">
        {lines.slice(0, scanLine + 1).map((line, i) => (
          <div key={`${checking}-${i}`} className="flex items-center gap-2">
            {i < scanLine ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[9px] font-black text-emerald-600">
                ✓
              </span>
            ) : (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              </span>
            )}
            <span className={`text-xs ${i < scanLine ? "text-zinc-400 line-through" : "font-medium text-zinc-700"}`}>
              {i === scanLine ? <TypedText text={line} speed={22} /> : line}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompetitorsPanel({
  domain,
  competitors,
  values,
  onComplete,
}: {
  domain: string;
  competitors: CompetitorSample[];
  values: Record<string, unknown>;
  onComplete?: () => void;
}) {
  const discovered = scanNumber(values, "competitors_discovered") ?? competitors.length;
  const crawled = scanNumber(values, "competitors_crawled") ?? 0;
  const backendChecking = cleanHost(scanString(values, "domain") ?? "");
  const brandHost = cleanHost(domain);

  const list = useMemo(() => {
    return [...competitors]
      .filter((c) => cleanHost(c.domain) !== brandHost)
      .sort((a, b) => (b.appearances ?? 0) - (a.appearances ?? 0))
      .slice(0, 6);
  }, [competitors, brandHost]);

  const maxAppearances = Math.max(1, ...list.map((c) => c.appearances ?? 0));
  const classified = list.filter(
    (c) => c.classification && c.classification !== "Classifying…" && c.classification !== "unknown",
  ).length;

  const [focusIdx, setFocusIdx] = useState(0);
  const [visited, setVisited] = useState<string[]>([]);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Prefer cycling every rival so the UI never sticks on one domain.
  useEffect(() => {
    if (list.length === 0) return;
    setFocusIdx(0);
    setVisited([]);
    completedRef.current = false;
  }, [list.map((c) => c.domain).join("|")]);

  useEffect(() => {
    if (list.length === 0) return;
    if (backendChecking) {
      const idx = list.findIndex((c) => cleanHost(c.domain) === backendChecking);
      if (idx >= 0) setFocusIdx(idx);
    }
  }, [backendChecking, list]);

  useEffect(() => {
    if (list.length === 0) return;
    const current = cleanHost(list[focusIdx]?.domain ?? "");
    if (current) {
      setVisited((prev) => (prev.includes(current) ? prev : [...prev, current]));
    }
  }, [list, focusIdx]);

  useEffect(() => {
    if (list.length <= 1) return;
    const id = window.setInterval(() => {
      setFocusIdx((i) => (i + 1) % list.length);
    }, DWELL_MS);
    return () => window.clearInterval(id);
  }, [list.length]);

  useEffect(() => {
    if (completedRef.current || list.length === 0) return;
    const seenAll = visited.length >= list.length;
    const backendDone = crawled > 0 && crawled >= Math.min(list.length, 3);
    if (!seenAll && !backendDone) return;
    // Let the last site finish its dwell once.
    const id = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current?.();
    }, seenAll ? DWELL_MS : DWELL_MS + 1200);
    return () => window.clearTimeout(id);
  }, [visited.length, list.length, crawled]);

  const checking = list[focusIdx] ? cleanHost(list[focusIdx].domain) : "";

  const statusText = checking
    ? `Scanning ${checking}`
    : discovered === 0
      ? "Finding rivals in search…"
      : crawled > 0
        ? "Rival sites checked"
        : "Checking rival sites…";

  const pct =
    discovered === 0
      ? 8
      : list.length === 0
        ? 33
        : Math.round(33 + (Math.max(classified, visited.length) / Math.max(list.length, 1)) * 67);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 800);
    return () => window.clearInterval(id);
  }, []);
  const phase3Dots = ["▪", "▪▪", "▪▪▪"][tick % 3];

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-4 overflow-hidden">
      <div className="shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex gap-1.5">
              <span className="ai-dot" />
              <span className="ai-dot" style={{ animationDelay: "0.15s" }} />
              <span className="ai-dot" style={{ animationDelay: "0.3s" }} />
            </div>
            <p className="min-w-0 truncate text-sm font-medium text-[#1a1a18]">{statusText}</p>
          </div>
          <span className="shrink-0 text-sm font-bold tabular-nums text-zinc-400">{pct}%</span>
        </div>
        <div className="h-1.5 w-full bg-zinc-100">
          <div className="h-full rounded-r-full bg-[#1a1a18] transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <div className="grid grid-cols-3 divide-x divide-zinc-100 border-t border-zinc-100">
          {[
            { label: "Find", full: "Find domains", done: discovered > 0, detail: discovered > 0 ? "Done" : `Scanning${phase3Dots}` },
            { label: "Rank", full: "Rank rivals", done: list.length >= 2, detail: list.length >= 2 ? "Done" : `Ranking${phase3Dots}` },
            {
              label: "Scan",
              full: "Scan sites",
              done: visited.length >= list.length && list.length > 0,
              detail:
                visited.length >= list.length && list.length > 0
                  ? "Done"
                  : checking
                    ? `Opening${phase3Dots}`
                    : "Queued",
            },
          ].map((p) => (
            <div key={p.full} className={`px-2 py-2.5 text-center sm:px-4 ${p.done ? "bg-emerald-50/60" : ""}`}>
              <p className={`text-[10px] font-semibold uppercase tracking-wide ${p.done ? "text-emerald-700" : "text-zinc-400"}`}>
                {p.done ? "✓" : "→"} <span className="sm:hidden">{p.label}</span>
                <span className="hidden sm:inline">{p.full}</span>
              </p>
              <p className={`mt-0.5 text-[11px] font-medium ${p.done ? "text-emerald-600" : "text-zinc-500"}`}>{p.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden md:flex-row">
        <div className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 md:w-[55%]">
          <div className="shrink-0 border-b border-zinc-100 px-5 py-2.5">
            <p className="text-sm font-bold text-[#1a1a18]">Rivals in search</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-10">
                <div className="flex gap-1.5">
                  <span className="ai-dot" />
                  <span className="ai-dot" style={{ animationDelay: "0.15s" }} />
                  <span className="ai-dot" style={{ animationDelay: "0.3s" }} />
                </div>
                <p className="text-sm text-zinc-400">Identifying competitors…</p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-50 px-5 py-2">
                {list.map((comp, i) => {
                  const compClean = cleanHost(comp.domain);
                  const isActive = checking === compClean;
                  const seen = visited.includes(compClean);
                  const isClassified = Boolean(
                    comp.classification && comp.classification !== "Classifying…" && comp.classification !== "unknown",
                  );
                  const barW = Math.max(8, Math.round(((comp.appearances ?? 0) / maxAppearances) * 100));
                  return (
                    <li
                      key={comp.domain}
                      className={`scan-card-appear flex items-center gap-3 py-3 transition-colors duration-300 ${
                        isActive ? "rounded-xl bg-amber-50/60 px-2 -mx-2" : ""
                      }`}
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-600">
                        {faviconLetter(comp.domain)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-[#1a1a18]">{compClean}</p>
                          {isActive ? (
                            <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700">
                              scanning
                            </span>
                          ) : null}
                          {(isClassified || seen) && !isActive ? (
                            <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                              {friendlyClass(comp.classification) || "Checked"}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                            <div
                              className={`h-full rounded-full transition-all duration-1000 ease-out ${
                                isActive ? "bg-amber-500" : barColor(i)
                              }`}
                              style={{ width: isActive ? `${Math.min(100, barW + 20)}%` : `${barW}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[10px] font-bold tabular-nums text-zinc-400">
                            {comp.bestPosition != null ? `Best #${comp.bestPosition}` : ""}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {checking ? (
            <ScanningBrowser domain={brandHost} checking={checking} />
          ) : (
            <div className="flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-white/70 p-6 ring-1 ring-black/5">
              <p className="text-sm text-zinc-400">Waiting for rival domains…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
