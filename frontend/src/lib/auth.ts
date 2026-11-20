// Server-only auth helpers — reads the seenly_token JWT cookie set by the Go backend.
// Do not import this module from Client Components.

import { cookies } from "next/headers";

export type AuthUser = {
  email: string;
  name: string;
};

/**
 * Returns the logged-in user from the JWT cookie, or null if not authenticated.
 * For use in server components and server actions.
 */
export async function getUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("seenly_token")?.value;
  if (!token) return null;

  try {
    // JWT is three base64 segments — decode the payload (middle segment)
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8")
    );
    if (!decoded.email) return null;
    // Check expiry
    if (decoded.exp && decoded.exp * 1000 < Date.now()) return null;
    return { email: decoded.email, name: decoded.name ?? "" };
  } catch {
    return null;
  }
}

/**
 * Returns the user email or throws if not authenticated.
 * Use in server actions that need the email for Go API calls.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

/** Headers so the Go API sees the same browser session (auth + guest). */
export async function authHeaders(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("seenly_token")?.value;
  const guest = cookieStore.get("seenly_guest")?.value;
  const user = await getUser();
  const headers: Record<string, string> = {};
  const parts: string[] = [];
  if (token) parts.push(`seenly_token=${token}`);
  if (guest) parts.push(`seenly_guest=${guest}`);
  if (parts.length) headers.Cookie = parts.join("; ");
  if (user?.email) headers["X-User-Email"] = user.email;
  return headers;
}

/** Optional identity — guests may create a free scan without Google login. */
export async function getOptionalUser(): Promise<AuthUser | null> {
  return getUser();
}
