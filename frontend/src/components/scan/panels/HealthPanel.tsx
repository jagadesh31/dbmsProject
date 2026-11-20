"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { CrawledPage, scanNumber } from "@/lib/useScanStream";

function hostnameOf(url: string) {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

function pathLabel(page: { url: string; path?: string }) {
  try {
    const u = new URL(page.url);
    return u.pathname === "/" ? "/" : u.pathname.replace(/\/$/, "") || "/";
  } catch {
    return page.path || "/";
  }
}

function contentScore(page: CrawledPage) {
  return (page.title ? 2 : 0) + (page.h1 ? 1 : 0) + (page.description ? 1 : 0) + (page.ogImage ? 1 : 0) + (page.status ? 1 : 0);
}

function isHomepage(page: CrawledPage) {
  const p = pathLabel(page);
  return p === "/" || p === "";
}

function pageHref(page: CrawledPage | null, host: string) {
  if (!page) return `https://${host}`;
  try {
    return page.url.startsWith("http") ? page.url : `https://${host}${pathLabel(page)}`;
  } catch {
    return `https://${host}`;
  }
}

function brandName(host: string, title?: string) {
  const fromTitle = (title || "").split(/[|\-–—]/)[0]?.trim();
  if (fromTitle && fromTitle.length >= 2 && fromTitle.length <= 32) return fromTitle;
  const raw = host.split(".")[0] || host;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function accentFor(host: string) {
  let hash = 0;
  for (let i = 0; i < host.length; i++) hash = (hash * 31 + host.charCodeAt(i)) >>> 0;
  const hues = [18, 210, 152, 262, 32, 348];
  const hue = hues[hash % hues.length];
  return {
    ink: `hsl(${hue} 42% 18%)`,
    paint: `hsl(${hue} 62% 42%)`,
    wash: `hsl(${hue} 48% 94%)`,
    line: `hsl(${hue} 28% 84%)`,
  };
}

function sentences(text?: string, fallback = "") {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  const first = clean.match(/[^.!?]+[.!?]+/);
  if (first && clean.split(" ").length > 28) return first[0].trim();
  return clean;
}

/** Skip Amazon ASINs, UUIDs, ref tokens, and other machine path crumbs. */
function isJunkSegment(seg: string) {
  const s = seg.trim();
  if (!s) return true;
  if (/^b0[a-z0-9]{8,}$/i.test(s)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return true;
  if (/^\d{4,}$/.test(s)) return true;
  if (/^(dp|gp|product|products|sku|ref|qid|sr|node|b|s|sspa|aw|d)$/i.test(s)) return true;
  if (/^ref=/i.test(s) || /^[a-z]?_[a-z0-9_]{6,}$/i.test(s)) return true;
  if (s.length <= 2) return true;
  return false;
}

function humanizeSegment(seg: string) {
  return decodeURIComponent(seg)
    .replace(/\+/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Best human label from a URL path (never prefer an ASIN over a slug). */
function prettyPath(path: string) {
  if (!path || path === "/") return "Home";
  const segments = path
    .split("/")
    .map((s) => s.split("?")[0])
    .filter(Boolean)
    .filter((s) => !isJunkSegment(s));
  if (segments.length === 0) return "Page";
  // Prefer the longest readable slug (product names beat short crumbs).
  const best = [...segments].sort((a, b) => humanizeSegment(b).length - humanizeSegment(a).length)[0];
  const label = humanizeSegment(best);
  return label.length > 48 ? `${label.slice(0, 46)}…` : label;
}

function pageTitle(page: CrawledPage, path: string) {
  const raw = (page.title || page.h1 || "").trim();
  if (raw && !isJunkSegment(raw) && !/^b0[a-z0-9]{8,}$/i.test(raw)) return raw;
  return prettyPath(path);
}

function shortChromePath(path: string) {
  if (!path || path === "/") return "/";
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path.length > 36 ? `…${path.slice(-34)}` : path;
  return `/…/${parts[parts.length - 1]}`.slice(0, 36);
}

function ShimmerBlock({ className = "" }: { className?: string }) {
  return <div className={`site-shimmer rounded-md bg-zinc-200/80 ${className}`} />;
}

function PageShimmer() {
  return (
    <div className="flex h-full flex-col gap-3 bg-white p-6">
      <ShimmerBlock className="h-3 w-24" />
      <ShimmerBlock className="h-8 w-2/3" />
      <ShimmerBlock className="h-3 w-full max-w-xl" />
      <ShimmerBlock className="h-3 w-4/5 max-w-lg" />
      <ShimmerBlock className="mt-2 aspect-[16/6] w-full rounded-xl" />
      <div className="mt-1 grid grid-cols-3 gap-3">
        <ShimmerBlock className="aspect-[4/3]" />
        <ShimmerBlock className="aspect-[4/3]" />
        <ShimmerBlock className="aspect-[4/3]" />
      </div>
    </div>
  );
}

/** Eases to the bottom, re-reading height each frame so late content still scrolls. */
function smoothScroll(node: HTMLElement | null, duration = 2200): () => void {
  if (!node) return () => {};
  const el = node;
  const startTime = performance.now();
  let raf = 0;
  function step(now: number) {
    const t = Math.min((now - startTime) / duration, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTop = max * ease;
    if (t < 1) raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

const LOADER_MIN_MS = 900;
const LOADER_MAX_MS = 3500;
const HOME_SCROLL_MS = 5200;
const HOME_HOLD_MS = 6800;
const GRID_HOLD_MS = 7000;
const HOME_WAIT_MAX_MS = 15000;
const LEGAL_PATH = /(privacy|terms|cookie|legal|refund|shipping-policy|disclaimer)/i;

function ReconstructedSite({
  host,
  home,
  others,
}: {
  host: string;
  home: CrawledPage | null;
  others: CrawledPage[];
}) {
  const brand = brandName(host, home?.title);
  const accent = accentFor(host);
  const h1 = (home?.h1 || "").trim();
  const headline = sentences(h1.split(/\s+/).length >= 3 ? h1 : home?.title || h1, "");
  const blurb = sentences(home?.description, "");
  const content = others.filter((p) => !LEGAL_PATH.test(pathLabel(p)));
  const nav = content.slice(0, 5).map((p) => prettyPath(pathLabel(p)));
  const cards = content.filter((p) => p.title || p.h1 || p.description).slice(0, 6);

  const hasCopy = Boolean(home?.title || home?.h1 || home?.description || home?.ogImage);

  return (
    <div className="bg-white text-[#1a1a18]">
      <nav className="flex items-center justify-between gap-4 px-8 py-4">
        <span className="text-sm font-black tracking-tight" style={{ color: accent.ink }}>
          {brand}
        </span>
        <div className="hidden min-w-0 flex-1 items-center justify-end gap-5 text-[11px] font-semibold text-zinc-500 sm:flex">
          {(nav.length > 0 ? nav : ["Home", "Products", "About"]).map((item) => (
            <span key={item} className="truncate">
              {item}
            </span>
          ))}
        </div>
      </nav>

      {!hasCopy ? (
        <section className="px-8 pb-10 pt-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Opening site</p>
          <h1 className="mt-3 max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight sm:text-5xl">
            {brand}
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-zinc-500">
            Reading pages on {host}…
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            <ShimmerBlock className="aspect-[4/3]" />
            <ShimmerBlock className="aspect-[4/3]" />
            <ShimmerBlock className="aspect-[4/3]" />
          </div>
        </section>
      ) : home?.ogImage ? (
        <section className="relative mx-6 overflow-hidden rounded-3xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={home.ogImage} alt="" className="aspect-[16/8] w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
            {headline ? (
              <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-3xl leading-[1.1] tracking-tight text-white sm:text-4xl">
                {headline}
              </h1>
            ) : null}
            {blurb ? <p className="mt-2 max-w-xl text-sm text-white/80">{blurb}</p> : null}
          </div>
        </section>
      ) : (
        <section className="px-8 pb-6 pt-10">
          {headline ? (
            <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight sm:text-5xl">
              {headline}
            </h1>
          ) : null}
          {blurb ? <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-600">{blurb}</p> : null}
        </section>
      )}

      {cards.length > 0 ? (
        <section className="grid gap-3 px-8 py-10 sm:grid-cols-3">
          {cards.map((page) => {
            const p = pathLabel(page);
            return (
              <article key={page.url} className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  {prettyPath(p)}
                </p>
                <p className="mt-2 text-sm font-semibold leading-snug">{pageTitle(page, p)}</p>
                {page.description ? (
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-zinc-500">{page.description}</p>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : (
        <div className="h-16" />
      )}

      <footer className="flex items-center justify-between border-t border-zinc-100 px-8 py-6 text-[11px] text-zinc-400">
        <span>{brand}</span>
        <span>{host}</span>
      </footer>
    </div>
  );
}

function MiniPageCard({ page, index, host }: { page: CrawledPage; index: number; host: string }) {
  const path = pathLabel(page);
  const title = pageTitle(page, path);
  const blurb = sentences(page.description, "");
  const brand = brandName(host, page.title);
  const hasImage = Boolean(page.ogImage);
  const [imageState, setImageState] = useState<"loading" | "loaded" | "failed">(
    hasImage ? "loading" : "failed",
  );
  const showImage = hasImage && imageState !== "failed";
  const accent = accentFor(host);
  const typeHint =
    page.pageType && page.pageType !== "other"
      ? page.pageType.replace(/_/g, " ")
      : path === "/"
        ? "home"
        : "page";

  return (
    <article
      className="site-mini-appear overflow-hidden rounded-xl bg-white shadow ring-1 ring-black/[0.06]"
      style={{ animationDelay: `${Math.min(index, 10) * 55}ms` }}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-100 bg-zinc-50 px-2 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-[#ff5f57]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#febc2e]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#28c840]" />
        <span className="ml-1 min-w-0 flex-1 truncate rounded-sm bg-white px-1 py-0.5 font-mono text-[7px] text-zinc-400 ring-1 ring-zinc-200">
          {host}
          {shortChromePath(path)}
        </span>
      </div>
      <div className="relative aspect-[4/3] overflow-hidden bg-white">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.ogImage}
            alt=""
            onLoad={() => setImageState("loaded")}
            onError={() => setImageState("failed")}
            className={`relative h-full w-full object-cover transition-opacity duration-500 ${
              imageState === "loaded" ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : (
          <div className="flex h-full flex-col bg-white">
            <div
              className="flex items-center justify-between gap-2 px-2.5 py-1.5"
              style={{ background: accent.wash, borderBottom: `1px solid ${accent.line}` }}
            >
              <span className="truncate text-[9px] font-black tracking-tight" style={{ color: accent.ink }}>
                {brand}
              </span>
              <span className="shrink-0 text-[8px] font-semibold uppercase tracking-wide text-zinc-400">
                {typeHint}
              </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2.5">
              <p className="line-clamp-2 text-[11px] font-semibold leading-snug" style={{ color: accent.ink }}>
                {title}
              </p>
              {blurb ? (
                <p className="line-clamp-2 text-[9px] leading-relaxed text-zinc-500">{blurb}</p>
              ) : (
                <div className="space-y-1 pt-0.5">
                  <div className="h-1.5 w-full rounded-full bg-zinc-100" />
                  <div className="h-1.5 w-5/6 rounded-full bg-zinc-100" />
                  <div className="h-1.5 w-4/6 rounded-full bg-zinc-100" />
                </div>
              )}
              <div className="mt-auto grid grid-cols-3 gap-1 pt-1">
                <div className="aspect-[5/4] rounded-md" style={{ background: accent.wash }} />
                <div className="aspect-[5/4] rounded-md bg-zinc-100" />
                <div className="aspect-[5/4] rounded-md bg-zinc-50 ring-1 ring-zinc-100" />
              </div>
            </div>
          </div>
        )}
        {showImage && imageState === "loading" ? (
          <div className="absolute inset-0 flex flex-col gap-1.5 bg-white p-2.5">
            <ShimmerBlock className="h-2 w-1/3" />
            <ShimmerBlock className="h-3 w-4/5" />
            <ShimmerBlock className="mt-1 w-full flex-1 rounded-lg" />
          </div>
        ) : null}
      </div>
      <div className="border-t border-zinc-50 px-2.5 py-2">
        <p className="truncate text-[11px] font-semibold text-[#1a1a18]">{title}</p>
        <p className="truncate text-[9px] text-zinc-400">{prettyPath(path)}</p>
      </div>
    </article>
  );
}

type Phase = "home" | "leaving" | "grid";

function MiniShimmerCard({ index }: { index: number }) {
  return (
    <div
      className="site-mini-appear overflow-hidden rounded-xl bg-white shadow ring-1 ring-black/[0.06]"
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className="flex items-center gap-1 border-b border-zinc-100 bg-zinc-50 px-2 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-200" />
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-200" />
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-200" />
        <ShimmerBlock className="ml-1 h-2 flex-1" />
      </div>
      <div className="space-y-2 p-3">
        <ShimmerBlock className="aspect-[4/3] w-full" />
        <ShimmerBlock className="h-2.5 w-3/4" />
        <ShimmerBlock className="h-2 w-1/2" />
      </div>
    </div>
  );
}

export function HealthPanel({
  domain,
  pages,
  values,
  onComplete,
}: {
  projectId?: string;
  domain: string;
  pages: CrawledPage[];
  values: Record<string, unknown>;
  onComplete?: () => void;
}) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const host = hostnameOf(domain);
  const crawled = scanNumber(values, "pages_crawled") ?? pages.length;
  const [phase, setPhase] = useState<Phase>("home");
  const [revealed, setRevealed] = useState(false);
  const homeScrollRef = useRef<HTMLDivElement>(null);

  // Rival crawls publish stage-1 events too; keep only our own site, and when a
  // path repeats keep the entry that actually has content.
  const uniquePages = useMemo(() => {
    const byPath = new Map<string, CrawledPage>();
    for (const p of pages) {
      const pageHost = hostnameOf(p.url);
      // Keep own-site pages even when crawl reports www vs apex.
      if (pageHost !== host && !pageHost.endsWith(`.${host}`) && host !== pageHost.replace(/^www\./, "")) {
        continue;
      }
      const key = pathLabel(p);
      const prev = byPath.get(key);
      if (!prev || contentScore(p) > contentScore(prev)) byPath.set(key, p);
    }
    return Array.from(byPath.values());
  }, [pages, host]);

  const home =
    uniquePages.find(isHomepage) ??
    uniquePages.find((p) => (p.path || "") === "/" || p.url.replace(/\/$/, "").endsWith(host)) ??
    uniquePages[0] ??
    null;
  const homeUrl = pageHref(home, host);
  const others = uniquePages
    .filter((p) => p !== home)
    .sort((a, b) => {
      const legal = Number(LEGAL_PATH.test(pathLabel(a))) - Number(LEGAL_PATH.test(pathLabel(b)));
      if (legal !== 0) return legal;
      return contentScore(b) - contentScore(a);
    });
  const gridPages = (others.length > 0 ? others : uniquePages)
    .slice()
    .sort((a, b) => contentScore(b) - contentScore(a))
    .slice(0, 16);
  const homeReady = Boolean(home);
  const homeHasCopy = Boolean(home && (home.title || home.h1 || home.description || home.ogImage));

  // Loader shows at least LOADER_MIN_MS; reveal as soon as any homepage URL lands.
  const [minElapsed, setMinElapsed] = useState(false);
  const [maxElapsed, setMaxElapsed] = useState(false);
  const [homeGaveUp, setHomeGaveUp] = useState(false);
  useEffect(() => {
    const a = window.setTimeout(() => setMinElapsed(true), LOADER_MIN_MS);
    const b = window.setTimeout(() => setMaxElapsed(true), LOADER_MAX_MS);
    const c = window.setTimeout(() => setHomeGaveUp(true), HOME_WAIT_MAX_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
      window.clearTimeout(c);
    };
  }, []);
  const homeSettled = homeReady || homeGaveUp;
  useEffect(() => {
    if (revealed) return;
    if ((minElapsed && homeReady) || (minElapsed && homeHasCopy) || maxElapsed) setRevealed(true);
  }, [revealed, minElapsed, maxElapsed, homeReady, homeHasCopy]);

  // Timers depend only on phase changes — streaming pages must not restart them.
  // The homepage stays on its shimmer until real content arrives.
  useEffect(() => {
    if (!revealed || !homeSettled || phase !== "home") return;
    let stopScroll = () => {};
    const start = window.setTimeout(() => {
      stopScroll = smoothScroll(homeScrollRef.current, HOME_SCROLL_MS);
    }, 350);
    const leave = window.setTimeout(() => setPhase("leaving"), HOME_HOLD_MS);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(leave);
      stopScroll();
    };
  }, [revealed, homeSettled, phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const id = window.setTimeout(() => setPhase("grid"), 650);
    return () => window.clearTimeout(id);
  }, [phase]);

  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase !== "grid") return;
    let stopScroll = () => {};
    const start = window.setTimeout(() => {
      stopScroll = smoothScroll(gridRef.current, 4200);
    }, 900);
    const done = window.setTimeout(() => onCompleteRef.current?.(), GRID_HOLD_MS);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(done);
      stopScroll();
    };
  }, [phase]);

  const showHome = phase === "home" || phase === "leaving";

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden">
      {showHome ? (
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/10 transition-all duration-700 ease-out ${
            phase === "leaving" ? "pointer-events-none -translate-y-8 scale-[0.94] opacity-0" : "translate-y-0 scale-100 opacity-100"
          }`}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
            <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
            <span className="h-2 w-2 rounded-full bg-[#28c840]" />
            <div className="ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-2.5 py-1 text-[10px] text-zinc-500 ring-1 ring-zinc-200">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${homeReady ? "bg-emerald-500" : "bg-amber-400 animate-pulse"}`} />
              <span className="truncate font-mono">{homeUrl}</span>
            </div>
          </div>
          <div className="h-0.5 w-full bg-zinc-100">
            <div className={`h-full bg-[#4285f4] ${homeReady ? "w-full transition-all duration-700" : "loading-bar-anim"}`} />
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
            <div
              className={`absolute inset-0 z-10 transition-opacity duration-500 ${
                revealed ? "pointer-events-none opacity-0" : "opacity-100"
              }`}
            >
              <PageShimmer />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70">
                <div className="flex gap-1.5">
                  <span className="ai-dot" />
                  <span className="ai-dot" style={{ animationDelay: "0.15s" }} />
                  <span className="ai-dot" style={{ animationDelay: "0.3s" }} />
                </div>
                <p className="text-sm font-medium text-zinc-600">Loading {host}…</p>
              </div>
            </div>
            <div
              ref={homeScrollRef}
              className={`analysis-scroll h-full overflow-y-auto transition-opacity duration-700 ${
                revealed ? "opacity-100" : "opacity-0"
              }`}
            >
              <ReconstructedSite host={host} home={home} others={others} />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50/80 px-4 py-2 text-[11px] font-medium text-zinc-500">
            <span className="truncate font-semibold text-[#1a1a18]">{home?.title || "Homepage"}</span>
            <span className="tabular-nums">{crawled > 0 ? `${crawled} pages` : "Opening…"}</span>
          </div>
        </div>
      ) : null}

      {phase === "grid" ? (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={gridRef} className="analysis-scroll relative min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 pb-10 sm:grid-cols-3 lg:grid-cols-4">
              {gridPages.map((page, i) => (
                <MiniPageCard key={page.url} page={page} index={i} host={host} />
              ))}
              {gridPages.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                    <MiniShimmerCard key={`shimmer-${i}`} index={i} />
                  ))
                : gridPages.length < 4
                  ? Array.from({ length: 4 - gridPages.length }).map((_, i) => (
                      <MiniShimmerCard key={`shimmer-${i}`} index={gridPages.length + i} />
                    ))
                  : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
