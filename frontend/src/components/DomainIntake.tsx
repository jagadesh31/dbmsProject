"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthModal } from "@/components/AuthModal";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

function afterLoginUrl() {
  return typeof window !== "undefined" ? `${window.location.origin}/start` : "/start";
}

function rememberWebsite(website: string) {
  sessionStorage.setItem("pending_website", website);
}

function rememberPositioning(positioning: string) {
  if (positioning) {
    sessionStorage.setItem("pending_positioning", positioning);
  } else {
    sessionStorage.removeItem("pending_positioning");
  }
}

function rememberTurnstile(token: string) {
  if (token) sessionStorage.setItem("pending_turnstile", token);
  else sessionStorage.removeItem("pending_turnstile");
}

function hasAuthCookie() {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => part.trim().startsWith("seenly_token="));
}

/** Landing intake: save the site, require Google login, then start the scan. */
export function DomainIntake({
  cta = "Check my site",
  compact = false,
}: {
  cta?: string;
  compact?: boolean;
}) {
  const { openAuthModal } = useAuthModal();
  const [url, setUrl] = useState("");
  const [positioning, setPositioning] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [turnstileError, setTurnstileError] = useState("");
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    if (window.turnstile) {
      setScriptReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>('script[data-seenly-turnstile="1"]');
    if (existing) {
      existing.addEventListener("load", () => setScriptReady(true));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.seenlyTurnstile = "1";
    script.onload = () => setScriptReady(true);
    script.onerror = () => setTurnstileError("Could not load the human check. Refresh and try again.");
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !scriptReady || !widgetRef.current || !window.turnstile) return;
    if (widgetId.current) {
      window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    }
    setTurnstileToken("");
    setTurnstileError("");
    try {
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "light",
        callback: (next) => {
          setTurnstileToken(next);
          setTurnstileError("");
        },
        "expired-callback": () => setTurnstileToken(""),
        "error-callback": () => {
          setTurnstileToken("");
          setTurnstileError(
            "Human check failed for this domain. Add dbms.wrenyn.com in Cloudflare Turnstile hostnames.",
          );
        },
      });
    } catch {
      setTurnstileError("Human check could not start. Check the Turnstile site key and hostnames.");
    }
    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [scriptReady]);

  const resetTurnstile = () => {
    setTurnstileToken("");
    if (widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
    }
  };

  const submitWebsite = async (raw: string, pos: string) => {
    setIsLoading(true);
    setError("");
    try {
      if (TURNSTILE_SITE_KEY && !turnstileToken) {
        setError("Complete the human check, then try again.");
        setIsLoading(false);
        return;
      }

      let website = raw.trim();
      if (website && !/^https?:\/\//i.test(website)) {
        website = `https://${website}`;
      }
      rememberWebsite(website);
      rememberPositioning(pos.trim());
      rememberTurnstile(turnstileToken);

      // Not signed in → Google login first, then /start creates the scan.
      if (!hasAuthCookie()) {
        openAuthModal(afterLoginUrl(), {
          mode: "login",
          message: "Sign in with Google to start your Seenly scan for this site.",
          turnstileToken,
        });
        setIsLoading(false);
        return;
      }

      const formData = new FormData();
      formData.append("website", website);
      if (pos.trim()) {
        formData.append("positioning", pos.trim());
      }
      if (turnstileToken) {
        formData.append("turnstile", turnstileToken);
      }

      const { createProjectAction } = await import("@/app/actions");
      const result = await createProjectAction(formData);

      if (result?.login_required || result?.limit_reached || result?.error) {
        if (result.limit_reached) {
          openAuthModal(`${typeof window !== "undefined" ? window.location.origin : ""}/projects`, {
            mode: "limit",
            message:
              result.error ||
              "This Google account already used its Seenly scan. Open your report, or sign in with a different Google account.",
          });
        } else if (result.login_required) {
          openAuthModal(afterLoginUrl(), {
            mode: "login",
            message: "Sign in with Google to start your Seenly scan for this site.",
            turnstileToken,
          });
        }
        if (result.error && !result.limit_reached) setError(result.error);
        resetTurnstile();
        setIsLoading(false);
        return;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      if (message.includes("NEXT_REDIRECT")) throw err;
      setError(message);
      resetTurnstile();
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitWebsite(url, positioning);
  };

  const needsTurnstile = Boolean(TURNSTILE_SITE_KEY);

  return (
    <form onSubmit={handleSubmit} className={compact ? "w-full" : "mx-auto w-full max-w-2xl text-left"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <input
          id="website"
          name="website"
          type="text"
          required
          inputMode="url"
          autoComplete="url"
          placeholder="https://yourbrand.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={isLoading}
          className="min-w-0 flex-1 border border-[var(--line)] bg-white px-5 py-4 text-base font-medium text-[var(--ink)] shadow-[0_1px_0_rgba(15,15,14,0.04)] outline-none transition focus:border-[var(--ink)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isLoading || (needsTurnstile && !turnstileToken)}
          className="shrink-0 bg-[var(--ink)] px-7 py-4 text-sm font-black uppercase tracking-[0.14em] text-[var(--paper)] transition hover:bg-[var(--rust)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "Opening…" : cta}
        </button>
      </div>

      <div className="mt-4">
        <label htmlFor="positioning" className="mb-1.5 block text-left text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
          How should we talk about you?
        </label>
        <input
          id="positioning"
          name="positioning"
          type="text"
          inputMode="text"
          placeholder='e.g. Premium skincare for sensitive skin'
          value={positioning}
          onChange={(e) => setPositioning(e.target.value)}
          disabled={isLoading}
          className="w-full border border-[var(--line)] bg-white px-5 py-3.5 text-sm font-medium text-[var(--ink)] shadow-[0_1px_0_rgba(15,15,14,0.04)] outline-none transition placeholder:text-zinc-400 focus:border-[var(--ink)] disabled:opacity-60"
        />
        <p className="mt-1.5 text-left text-xs text-zinc-400">
          Optional. Helps Google and AI searches match your positioning.
        </p>
      </div>

      {needsTurnstile ? (
        <div className="mt-4 flex flex-col items-start gap-2">
          <div ref={widgetRef} />
          {!TURNSTILE_SITE_KEY ? (
            <p className="text-xs font-medium text-[var(--rust)]">Turnstile site key is missing.</p>
          ) : null}
          {turnstileError ? (
            <p className="text-xs font-medium text-[var(--rust)]">{turnstileError}</p>
          ) : null}
          {scriptReady && !turnstileToken && !turnstileError ? (
            <p className="text-xs text-zinc-400">Complete the check before continuing.</p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-left text-xs text-zinc-400">
        <span className="font-semibold text-zinc-500">Google sign-in required.</span>{" "}
        One Seenly scan per Google account.
      </p>

      {error ? (
        <p className="mt-3 border border-[var(--rust)] bg-[var(--rust-soft)] px-3 py-2 text-sm font-medium text-[var(--ink)]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
