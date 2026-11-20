import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookies, publicHost } from "@/lib/clear-auth-cookie";
import { GUEST_COOKIE, ensureGuestCookie, isGuestScanPath } from "@/lib/guest";

/** Anyone can open these without a session. Login is a modal on `/`. */
const PUBLIC_PATHS = new Set(["/"]);

/** Logged-out users must not reach these (except guest scan). */
function isPrivatePath(pathname: string) {
  return (
    pathname === "/start" ||
    pathname === "/projects" ||
    pathname.startsWith("/projects/")
  );
}

function isLoggedIn(request: NextRequest) {
  const token = request.cookies.get("seenly_token")?.value;
  if (!token) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString(),
    );
    return !(payload.exp && payload.exp * 1000 < Date.now());
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/go-api")
  ) {
    return NextResponse.next();
  }

  const loggingOut = request.nextUrl.searchParams.get("logged_out") === "1";
  const loggedIn = !loggingOut && isLoggedIn(request);
  const host = publicHost(request.headers) || request.nextUrl.hostname;
  const hostWithPort = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    host
  )
    .split(",")[0]
    .trim();
  const proto = (
    request.headers.get("x-forwarded-proto") ||
    request.nextUrl.protocol.replace(":", "")
  )
    .split(",")[0]
    .trim();
  const origin = `${proto}://${hostWithPort}`;
  const to = (path: string) =>
    ensureGuestCookie(request, NextResponse.redirect(new URL(path, origin)), host);
  const pass = () => ensureGuestCookie(request, NextResponse.next(), host);

  if (loggingOut) {
    const res = pathname === "/" ? NextResponse.next() : to("/?logged_out=1");
    clearAuthCookies(res.headers, host);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return ensureGuestCookie(request, res, host);
  }

  if (pathname === "/onboarding" || pathname === "/login") {
    return to(loggedIn ? "/projects" : "/");
  }

  if (PUBLIC_PATHS.has(pathname)) {
    if (loggedIn) return to("/projects");
    return pass();
  }

  // Guests may watch their free live scan without Google login.
  if (isGuestScanPath(pathname)) {
    if (loggedIn || request.cookies.get(GUEST_COOKIE)?.value) {
      return pass();
    }
    return to("/");
  }

  if (isPrivatePath(pathname) && !loggedIn) {
    return to("/");
  }

  if (!loggedIn) {
    return to("/");
  }

  return pass();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
