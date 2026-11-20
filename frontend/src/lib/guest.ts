import { NextRequest, NextResponse } from "next/server";

export const GUEST_COOKIE = "seenly_guest";

const ONE_YEAR = 60 * 60 * 24 * 365;

function guestCookieDomain(hostname: string): string | undefined {
  const configured = (process.env.COOKIE_DOMAIN || "").replace(/^\./, "").trim();
  if (configured) return `.${configured}`;
  if (!hostname || hostname === "localhost" || /^[\d.]+$/.test(hostname)) return undefined;
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length >= 2) return `.${parts.slice(-2).join(".")}`;
  return undefined;
}

/** Edge-safe id — Web Crypto, no Node `crypto` module. */
function newGuestId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Ensure every browser gets a stable Seenly guest id before login. */
export function ensureGuestCookie(
  request: NextRequest,
  response: NextResponse,
  hostname: string,
): NextResponse {
  const existing = request.cookies.get(GUEST_COOKIE)?.value?.trim();
  if (existing && existing.length >= 16) return response;

  const id = newGuestId();
  const secure =
    (request.headers.get("x-forwarded-proto") || request.nextUrl.protocol).includes("https");
  const domain = guestCookieDomain(hostname);

  response.cookies.set({
    name: GUEST_COOKIE,
    value: id,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
    secure,
    ...(domain ? { domain } : {}),
  });
  return response;
}

export function isGuestScanPath(pathname: string) {
  return /^\/projects\/[^/]+\/scan\/?$/.test(pathname);
}
