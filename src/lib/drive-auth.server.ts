// Server-only Clerk auth verification for Drive routes.
import { createClerkClient, type ClerkClient } from "@clerk/backend";

const REQUIRED_ROLE = "mustakim-s-student";

let clerkClient: ClerkClient | null = null;
function getClerk(): ClerkClient {
  if (!clerkClient) {
    const secretKey = process.env.CLERK_SECRET_KEY;
    const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
    if (!secretKey) throw new Error("CLERK_SECRET_KEY not configured");
    clerkClient = createClerkClient({ secretKey, publishableKey });
  }
  return clerkClient;
}

export type VerifiedUser = { userId: string; role: string | null };

async function assertRole(userId: string): Promise<string | null> {
  const user = await getClerk().users.getUser(userId);
  const meta = (user.publicMetadata ?? {}) as { role?: unknown };
  const role = typeof meta.role === "string" ? meta.role : null;
  if (role !== REQUIRED_ROLE) {
    throw new Response(`Forbidden: role "${REQUIRED_ROLE}" required`, { status: 403 });
  }
  return role;
}

/**
 * Verify Clerk session token from Authorization: Bearer <token> header
 * and require the uploader role.
 */
export async function requireUploader(request: Request): Promise<VerifiedUser> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Response("Unauthorized: missing token", { status: 401 });
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Response("CLERK_SECRET_KEY not configured", { status: 500 });
  const { verifyToken } = await import("@clerk/backend");
  let claims: { sub?: string };
  try {
    claims = await verifyToken(token, { secretKey });
  } catch {
    throw new Response("Unauthorized: invalid token", { status: 401 });
  }
  const userId = claims.sub;
  if (!userId) throw new Response("Unauthorized", { status: 401 });
  const role = await assertRole(userId);
  return { userId, role };
}
