// Server-only Clerk identity + admin check for the Gmail notification layer.
import { createClerkClient, type ClerkClient } from "@clerk/backend";

const UPLOAD_ROLE = "mustakim-s-student";

let clerk: ClerkClient | null = null;
function getClerk(): ClerkClient {
  if (!clerk) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new Error("CLERK_SECRET_KEY not configured");
    clerk = createClerkClient({ secretKey, publishableKey: process.env.CLERK_PUBLISHABLE_KEY });
  }
  return clerk;
}

export type NotifyIdentity = {
  userId: string;
  role: string | null;
  roles: string[];
  name: string;
  email: string;
  isAdmin: boolean;
};

async function verifyBearer(request: Request): Promise<string> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Response("Unauthorized: missing token", { status: 401 });
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Response("CLERK_SECRET_KEY not configured", { status: 500 });
  const { verifyToken } = await import("@clerk/backend");
  try {
    const claims = (await verifyToken(token, { secretKey })) as { sub?: string };
    if (!claims.sub) throw new Error("no sub");
    return claims.sub;
  } catch {
    throw new Response("Unauthorized: invalid token", { status: 401 });
  }
}

function cookieToken(request: Request): string | null {
  const m = /(?:^|;\s*)__session=([^;]+)/.exec(request.headers.get("cookie") ?? "");
  return m?.[1] ?? null;
}

async function loadIdentity(userId: string): Promise<NotifyIdentity> {
  const user = await getClerk().users.getUser(userId);
  const meta = (user.publicMetadata ?? {}) as { role?: unknown };
  // role may be a string ("admin") or an array (["mustakim-s-student","admin"])
  const roles: string[] = Array.isArray(meta.role)
    ? meta.role.filter((r): r is string => typeof r === "string")
    : typeof meta.role === "string"
      ? [meta.role]
      : [];
  const role = roles[0] ?? null;
  const primary =
    user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.username ||
    primary?.emailAddress ||
    userId;
  const adminIds = (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    userId,
    role,
    roles,
    name,
    email: primary?.emailAddress ?? "",
    isAdmin: roles.includes("admin") || adminIds.includes(userId),
  };
}

/** Any signed-in user with the upload role. Identity comes from Clerk, never the client. */
export async function requireUploaderIdentity(request: Request): Promise<NotifyIdentity> {
  const id = await loadIdentity(await verifyBearer(request));
  if (!id.roles.includes(UPLOAD_ROLE) && !id.isAdmin) {
    console.log(
      `[notify-auth] upload access denied: userId=${id.userId} roles=${id.roles.join(",") || "none"} status=403`,
    );
    throw new Response("Forbidden", { status: 403 });
  }
  return id;
}

/** Admin-only (Clerk role "admin" or listed in ADMIN_CLERK_USER_IDS). */
export async function requireAdminIdentity(request: Request): Promise<NotifyIdentity> {
  const token = cookieToken(request);
  let cookieFailed = false;
  const userId = token
    ? await (async () => {
        const { verifyToken } = await import("@clerk/backend");
        try {
          const claims = (await verifyToken(token, {
            secretKey: process.env.CLERK_SECRET_KEY!,
          })) as { sub?: string };
          return claims.sub ?? null;
        } catch {
          cookieFailed = true;
          return null;
        }
      })()
    : null;
  if (cookieFailed) console.log("[notify-auth] __session cookie present but invalid; falling back to bearer");
  const id = await loadIdentity(userId ?? (await verifyBearer(request)));
  if (!id.isAdmin) {
    console.log(
      `[notify-auth] admin access denied: userId=${id.userId} roles=${id.roles.join(",") || "none"} status=403`,
    );
    throw new Response("Forbidden: admin only", { status: 403 });
  }
  console.log(`[notify-auth] admin access granted: userId=${id.userId} status=200`);
  return id;
}
