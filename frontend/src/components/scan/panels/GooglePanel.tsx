"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SerpCheckSample } from "@/lib/journey";
import { scanNumber, scanStringList } from "@/lib/useScanStream";

const SHOW_LIMIT = 16;
const MAX_RESULTS = 10;

type Phase = "typing" | "results" | "verdict" | "next";

function useTypewriter(text: string, active: boolean, speed = 28) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    setShown("");
    if (!text || !active) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, speed);
    return () => window.clearInterval(id);
  }, [text, speed, active]);
  return shown;
}

function hostOf(domain: string) {
  return domain.replace(/^www\./, "").toLowerCase();
}

function citeUrl(row: SerpCheckSample["results"][number]) {
  if (row.url) {
    try {
      const u = new URL(row.url.startsWith("http") ? row.url : `https://${row.url}`);
      const parts = u.pathname.split("/").filter(Boolean).slice(0, 3);
      const base = u.hostname.replace(/^www\./, "");
      if (parts.length === 0) return base;
      return `${base} › ${parts.map((p) => decodeURIComponent(p)).join(" › ")}`;
    } catch {
      /* fall through */
    }
  }
  return hostOf(row.domain);
}

function siteName(row: SerpCheckSample["results"][number]) {
  const host = hostOf(row.domain);
  const label = host.split(".")[0] || host;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function faviconSrc(domain: string) {
  const host = hostOf(domain);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
}

/** Google SERP — only real buyer searches from the pipeline. */
export function GooglePanel({
  domain,
  serpChecks,
  values,
  onComplete,
}: {
  domain: string;
  serpChecks: SerpCheckSample[];
  values?: Record<string, unknown>;
  onComplete?: () => void;
}) {
  const orderRef = useRef<string[]>([]);
  const completedRef = useRef(false);
  const ownHost = hostOf(domain);

  const playlist = useMemo(() => {
    const byQuery = new Map<string, SerpCheckSample>();
    for (const check of serpChecks) {
      const key = check.query.trim().toLowerCase();
      if (!key) continue;
      byQuery.set(key, check);
      if (orderRef.current.length < SHOW_LIMIT && !orderRef.current.includes(key)) {
        orderRef.current.push(key);
      }
    }

    return orderRef.current
      .map((key) => byQuery.get(key))
      .filter((item): item is SerpCheckSample => Boolean(item));
  }, [serpChecks]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");

  const active = playlist[activeIdx] ?? null;
  const query = active?.query ?? "";
  const results = (active?.results ?? []).slice(0, MAX_RESULTS);
  const typed = useTypewriter(query, phase === "typing");

  const declared =
    scanNumber(values ?? {}, "intents_count") ??
    scanStringList(values ?? {}, "keywords").length;
  const allQueriesIn = declared > 0 && playlist.length >= declared;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!query) return;
    setPhase("typing");
    const typeMs = Math.min(1600, Math.max(700, query.length * 28 + 120));
    const id = window.setTimeout(() => setPhase("results"), typeMs);
    return () => window.clearTimeout(id);
  }, [activeIdx, query]);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase !== "results") return;
    const scroller = listRef.current;
    if (!scroller) return;
    scroller.scrollTop = 0;
    const startDelay = 160;
    const dur = Math.min(1100, 700 + results.length * 30);
    const start = window.setTimeout(() => {
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      if (max < 40) return;
      const from = scroller.scrollTop;
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        scroller.scrollTop = from + max * ease;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, startDelay);
    const waitMs = results.length > 0 ? startDelay + dur + 900 : 1300;
    const verdictAt = window.setTimeout(() => setPhase("verdict"), waitMs);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(verdictAt);
    };
  }, [phase, activeIdx, results.length]);

  useEffect(() => {
    if (phase !== "verdict") return;
    const id = window.setTimeout(() => setPhase("next"), 1400);
    return () => window.clearTimeout(id);
  }, [phase, active, query]);

  useEffect(() => {
    if (phase !== "next") return;
    const next = activeIdx + 1;
    if (next < playlist.length) {
      setPhase("typing");
      setActiveIdx(next);
      return;
    }
    if (!allQueriesIn) return;
    if (!completedRef.current && playlist.length > 0) {
      completedRef.current = true;
      onCompleteRef.current?.();
    }
  }, [phase, activeIdx, playlist.length, allQueriesIn]);

  const found = Boolean(active?.foundInTop50 && (active?.brandPosition ?? 0) > 0);
  const brandPos = active?.brandPosition ?? 0;
  const resultCountLabel = results.length > 0 ? `About ${(results.length * 1_240_000).toLocaleString()} results` : "Searching…";

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-[#dadce0]">
        {/* Browser chrome */}
        <div className="flex shrink-0 items-center gap-2 border-b border-[#dadce0] bg-[#f1f3f4] px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          <div className="ml-2 flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 py-1 text-[11px] text-[#5f6368] ring-1 ring-[#dadce0]">
            <GoogleLockIcon />
            <span className="truncate">
              {query
                ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
                : "https://www.google.com/search"}
            </span>
          </div>
          {playlist.length > 0 ? (
            <span className="hidden shrink-0 tabular-nums text-[10px] font-medium text-[#80868b] sm:inline">
              {Math.min(activeIdx + 1, playlist.length)}/{Math.max(declared, playlist.length)}
            </span>
          ) : null}
        </div>

        {/* Google header + search box */}
        <div
          className="shrink-0 border-b border-[#ebebeb] bg-white px-4 pb-0 pt-3 sm:px-6"
          style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
        >
          <div className="mb-3 flex items-center gap-4 sm:gap-6">
            <GoogleWordmark />
            <div className="flex min-h-[44px] flex-1 items-center gap-3 rounded-full border border-[#dfe1e5] bg-white px-4 shadow-[0_1px_6px_rgba(32,33,36,0.28)] hover:shadow-[0_1px_8px_rgba(32,33,36,0.35)] sm:min-h-[46px] sm:px-5">
              <SearchIcon />
              <span className="min-h-[1.25rem] flex-1 truncate text-[15px] text-[#202124] sm:text-[16px]">
                {typed || (phase === "typing" ? "" : query)}
                {phase === "typing" ? <span className="type-caret" /> : null}
              </span>
              {query && phase !== "typing" ? <ClearIcon /> : null}
              <MicIcon />
              <LensIcon />
            </div>
          </div>

          <div className="flex gap-5 overflow-x-auto text-[13px] text-[#5f6368] [scrollbar-width:none]">
            <Tab active>All</Tab>
            <Tab>Images</Tab>
            <Tab>Videos</Tab>
            <Tab className="hidden sm:inline">News</Tab>
            <Tab className="hidden sm:inline">Shopping</Tab>
            <Tab className="hidden md:inline">Maps</Tab>
            <Tab>More</Tab>
          </div>
        </div>

        {/* Results */}
        <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
          <div
            ref={listRef}
            className="analysis-scroll h-full overflow-y-auto px-4 py-3 sm:px-6 sm:pl-8"
            style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
          >
            {results.length === 0 || phase === "typing" ? (
              <div className="space-y-8 py-3">
                <div className="h-3 w-48 animate-pulse rounded bg-[#f1f3f4]" />
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-[#f1f3f4]" />
                      <div className="space-y-1.5">
                        <div className="h-3 w-36 rounded bg-[#f1f3f4]" />
                        <div className="h-2.5 w-52 rounded bg-[#f1f3f4]" />
                      </div>
                    </div>
                    <div className="h-5 w-[78%] rounded bg-[#f1f3f4]" />
                    <div className="h-3.5 w-full max-w-xl rounded bg-[#f1f3f4]" />
                    <div className="h-3.5 w-[88%] max-w-lg rounded bg-[#f1f3f4]" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="pb-20">
                <p className="mb-5 text-[13px] text-[#70757a]">{resultCountLabel} ({(0.28 + activeIdx * 0.03).toFixed(2)} seconds)</p>
                <ul className="max-w-[652px] space-y-7">
                  {results.map((row, index) => {
                    const isBrand = row.own || hostOf(row.domain) === ownHost;
                    return (
                      <li key={`${row.domain}-${row.position}-${index}`} className="group">
                        <div className="mb-1 flex items-center gap-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={faviconSrc(row.domain)}
                            alt=""
                            width={28}
                            height={28}
                            className="h-7 w-7 rounded-full bg-[#f1f3f4] p-1.5 ring-1 ring-[#dadce0]"
                          />
                          <div className="min-w-0">
                            <div className="truncate text-[14px] leading-tight text-[#202124]">
                              {siteName(row)}
                            </div>
                            <div className="truncate text-[12px] leading-tight text-[#4d5156]">
                              {citeUrl(row)}
                            </div>
                          </div>
                          {isBrand ? (
                            <span className="ml-auto shrink-0 rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[11px] font-medium text-[#1967d2]">
                              Your site · {row.position}
                            </span>
                          ) : null}
                        </div>
                        <a
                          className="block cursor-default text-[20px] leading-[1.3] text-[#1a0dab] visited:text-[#681da8] group-hover:underline"
                          tabIndex={-1}
                          onClick={(e) => e.preventDefault()}
                        >
                          {row.title || siteName(row)}
                        </a>
                        {row.snippet ? (
                          <p className="mt-1 line-clamp-2 text-[14px] leading-[1.58] text-[#4d5156]">
                            {row.snippet}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>

                {/* Google-style people also ask / footer strip */}
                <div className="mt-10 max-w-[652px] border-t border-[#dadce0] pt-6">
                  <p className="text-[16px] font-normal text-[#202124]">People also ask</p>
                  <div className="mt-3 divide-y divide-[#dadce0] rounded-xl border border-[#dadce0]">
                    {(playlist[activeIdx + 1]?.query
                      ? [playlist[activeIdx + 1]!.query, playlist[(activeIdx + 2) % Math.max(playlist.length, 1)]?.query]
                      : ["What is the best option?", "How do reviews compare?"]
                    )
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((q) => (
                        <div key={String(q)} className="flex items-center justify-between px-4 py-3.5 text-[14px] text-[#202124]">
                          <span className="pr-4">{q}</span>
                          <span className="text-lg leading-none text-[#70757a]">+</span>
                        </div>
                      ))}
                  </div>
                </div>

                <div className="mt-8 flex max-w-[652px] items-center justify-center gap-1 pb-2 text-[14px]">
                  <span className="px-3 py-2 font-medium text-[#4285f4]">1</span>
                  <span className="px-3 py-2 text-[#202124]">2</span>
                  <span className="px-3 py-2 text-[#202124]">3</span>
                  <span className="px-3 py-2 text-[#202124]">4</span>
                  <span className="px-3 py-2 text-[#1a0dab]">Next</span>
                </div>
              </div>
            )}
          </div>

          {(phase === "verdict" || phase === "next") && query ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 to-transparent px-4 pb-4 pt-10 sm:px-6">
              <div className="mx-auto flex max-w-[652px] items-center gap-3 rounded-full border border-[#dadce0] bg-white px-4 py-2.5 shadow-[0_1px_6px_rgba(32,33,36,0.15)]">
                <GoogleGMark />
                <p className="min-w-0 flex-1 truncate text-[13px] text-[#202124]">
                  {found ? (
                    <>
                      <span className="font-medium">{ownHost}</span>
                      {" appears at position "}
                      <span className="font-medium text-[#1967d2]">#{brandPos}</span>
                      {" for this search"}
                    </>
                  ) : (
                    <>
                      <span className="font-medium">{ownHost}</span>
                      {" is not in the top results for this search"}
                    </>
                  )}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Tab({
  children,
  active = false,
  className = "",
}: {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`shrink-0 pb-3 ${className} ${
        active
          ? "border-b-[3px] border-[#1a73e8] font-medium text-[#1a73e8]"
          : "border-b-[3px] border-transparent"
      }`}
    >
      {children}
    </span>
  );
}

function GoogleWordmark() {
  return (
    <div className="hidden shrink-0 select-none text-[22px] font-normal tracking-tight sm:block" aria-label="Google">
      <span className="text-[#4285f4]">G</span>
      <span className="text-[#ea4335]">o</span>
      <span className="text-[#fbbc05]">o</span>
      <span className="text-[#4285f4]">g</span>
      <span className="text-[#34a853]">l</span>
      <span className="text-[#ea4335]">e</span>
    </div>
  );
}

function GoogleGMark() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f1f3f4] text-[12px] font-bold" aria-hidden>
      <span className="text-[#4285f4]">G</span>
    </span>
  );
}

function GoogleLockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" className="shrink-0 text-[#188038]" aria-hidden>
      <path
        fill="currentColor"
        d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0 text-[#9aa0a6]" aria-hidden>
      <path
        fill="currentColor"
        d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="hidden shrink-0 text-[#70757a] sm:block" aria-hidden>
      <path
        fill="currentColor"
        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
      />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0" aria-hidden>
      <path fill="#4285f4" d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z" />
      <path fill="#34a853" d="M17 12c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

function LensIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="hidden shrink-0 sm:block" aria-hidden>
      <path fill="#4285f4" d="M12 12.75c.69 0 1.25-.56 1.25-1.25S12.69 10.25 12 10.25 10.75 10.81 10.75 11.5s.56 1.25 1.25 1.25z" />
      <path fill="#ea4335" d="M18.5 10.25h-1.13A5.5 5.5 0 0 0 12.75 6.88V5.75A1.25 1.25 0 0 0 11.5 4.5h-1A1.25 1.25 0 0 0 9.25 5.75v1.13A5.5 5.5 0 0 0 5.63 10.25H4.5A1.25 1.25 0 0 0 3.25 11.5v1A1.25 1.25 0 0 0 4.5 13.75h1.13a5.5 5.5 0 0 0 3.62 3.37v1.13A1.25 1.25 0 0 0 10.5 19.5h1a1.25 1.25 0 0 0 1.25-1.25v-1.13a5.5 5.5 0 0 0 3.37-3.62H18.5a1.25 1.25 0 0 0 1.25-1.25v-1a1.25 1.25 0 0 0-1.25-1.25z" />
      <path fill="#fbbc05" d="M12 8.75A3.25 3.25 0 1 0 15.25 12 3.25 3.25 0 0 0 12 8.75z" />
      <path fill="#34a853" d="M12 9.9A2.1 2.1 0 1 0 14.1 12 2.1 2.1 0 0 0 12 9.9z" />
    </svg>
  );
}
