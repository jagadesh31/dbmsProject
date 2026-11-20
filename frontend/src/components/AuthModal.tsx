"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { publicApiOrigin } from "@/lib/api";

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

export type AuthModalMode = "login" | "limit";

export type AuthModalOptions = {
  mode?: AuthModalMode;
  message?: string;
  /** Reuse a Turnstile token already completed on the landing form. */
  turnstileToken?: string;
};

type AuthModalContextValue = {
  openAuthModal: (redirect?: string, options?: AuthModalOptions) => void;
  closeAuthModal: () => void;
};

const AuthModalContext = createContext<AuthModalContextValue>({
  openAuthModal: () => undefined,
  closeAuthModal: () => undefined,
});

export function useAuthModal() {
  return useContext(AuthModalContext);
}

export function AuthModalProvider({
  children,
  initiallyOpen = false,
  initialRedirect,
  initialMode = "login",
  initialMessage,
}: {
  children: ReactNode;
  initiallyOpen?: boolean;
  initialRedirect?: string;
  initialMode?: AuthModalMode;
  initialMessage?: string;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [redirect, setRedirect] = useState(initialRedirect ?? "");
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [message, setMessage] = useState(initialMessage ?? "");
  const [seedToken, setSeedToken] = useState("");

  const openAuthModal = useCallback((nextRedirect?: string, options?: AuthModalOptions) => {
    setRedirect(nextRedirect ?? "");
    setMode(options?.mode ?? "login");
    setMessage(options?.message ?? "");
    setSeedToken(options?.turnstileToken ?? "");
    setOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <AuthModalContext.Provider value={{ openAuthModal, closeAuthModal }}>
      {children}
      <AuthModal
        open={open}
        redirect={redirect}
        mode={mode}
        message={message}
        seedToken={seedToken}
        onClose={closeAuthModal}
      />
    </AuthModalContext.Provider>
  );
}

function AuthModal({
  open,
  redirect,
  mode,
  message,
  seedToken = "",
  onClose,
}: {
  open: boolean;
  redirect: string;
  mode: AuthModalMode;
  message: string;
  seedToken?: string;
  onClose: () => void;
}) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const isLimit = mode === "limit";
  const hasSeed = Boolean(seedToken);

  useEffect(() => {
    if (!open) return;
    if (seedToken) {
      setToken(seedToken);
      return;
    }
    setToken("");
  }, [open, seedToken]);

  useEffect(() => {
    if (!open || hasSeed) return;
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
    document.head.appendChild(script);
  }, [open, hasSeed]);

  useEffect(() => {
    if (!open || hasSeed || !scriptReady || !widgetRef.current || !window.turnstile) return;
    if (widgetId.current) {
      window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    }
    setToken("");
    widgetId.current = window.turnstile.render(widgetRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "light",
      callback: (next) => setToken(next),
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
    });
    return () => {
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [open, scriptReady, hasSeed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const continueHref = (() => {
    const dest =
      redirect ||
      (typeof window !== "undefined" ? `${window.location.origin}/start` : "/start");
    const params = new URLSearchParams({
      redirect: dest,
      turnstile: token,
    });
    return `${publicApiOrigin()}/auth/google?${params.toString()}`;
  })();

  const projectsHref =
    typeof window !== "undefined" ? `${window.location.origin}/projects` : "/projects";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close login"
        className="absolute inset-0 z-0 bg-[rgba(26,26,24,0.45)] backdrop-blur-md"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative z-10 w-full max-w-[420px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-7 pb-7 pt-6 shadow-[0_28px_80px_rgba(26,26,24,0.22)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(166,90,58,0.18),transparent_70%)]" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(90,122,106,0.16),transparent_70%)]" />

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
          className="absolute right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition hover:bg-white hover:text-[var(--ink)]"
          aria-label="Close"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M5.2 4.3a.75.75 0 0 0-1.06 1.06L8.94 10l-4.8 4.64a.75.75 0 1 0 1.06 1.06L10 11.06l4.64 4.64a.75.75 0 1 0 1.06-1.06L11.06 10l4.64-4.64A.75.75 0 0 0 14.64 4.3L10 8.94 5.2 4.3z" />
          </svg>
        </button>

        <div className="relative z-10 pr-8 text-center">
          <p className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[var(--ink)]">
            Seenq
          </p>
          <h2 id="auth-modal-title" className="mt-3 text-lg font-semibold text-[var(--ink)]">
            {isLimit ? "Scan already used" : "Sign in to scan"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            {message ||
              (isLimit
                ? "This Google account already used its Seenq scan. Open your report, or continue with a different Google account."
                : "Enter your site, then sign in with Google. One scan per Google account.")}
          </p>
        </div>

        {isLimit ? (
          <a
            href={projectsHref}
            className="relative z-10 mt-6 flex w-full items-center justify-center rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-[var(--paper)] transition hover:bg-[var(--rust)]"
          >
            Open my report
          </a>
        ) : null}

        <a
          href={token ? continueHref : undefined}
          onClick={(e) => {
            if (!token) e.preventDefault();
          }}
          aria-disabled={!token}
          className={`relative z-10 mt-3 flex w-full items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
            token
              ? "border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--ink)]"
              : "cursor-not-allowed border-[var(--line)] bg-white/50 text-zinc-400"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {isLimit ? "Continue with a different Google account" : "Continue with Google"}
        </a>

        {!hasSeed ? (
          <>
            <div className="relative z-10 mt-5 flex justify-center">
              {TURNSTILE_SITE_KEY ? (
                <div ref={widgetRef} />
              ) : (
                <p className="text-center text-[12px] text-[var(--rust)]">Turnstile site key is missing.</p>
              )}
            </div>
            {TURNSTILE_SITE_KEY && !token ? (
              <p className="relative z-10 mt-3 text-center text-[12px] text-zinc-400">
                Complete the check to continue.
              </p>
            ) : null}
          </>
        ) : null}

        <p className="relative z-10 mt-5 text-center text-[11px] leading-relaxed text-zinc-400">
          By continuing, you agree to Seenq&apos;s Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
