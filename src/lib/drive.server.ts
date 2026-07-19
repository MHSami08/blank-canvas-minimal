// Server-only helpers: Google Drive via owner OAuth refresh token + Clerk auth verification.
import { createClerkClient, type ClerkClient } from "@clerk/backend";

const REQUIRED_ROLE = "mustakim-s-student";
export const DRIVE_OAUTH_SCOPE = "https://www.googleapis.com/auth/drive.file";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

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

export type VerifiedUser = {
  userId: string;
  role: string | null;
};

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
 * Verify Clerk session token from Authorization: Bearer <token> header.
 * Ensures the user has the required role. Throws Response on failure.
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

/**
 * Cookie-based session verification for admin one-off routes (browser nav).
 */
export async function requireUploaderFromCookie(request: Request): Promise<VerifiedUser> {
  const cookie = request.headers.get("cookie") ?? "";
  const match = /(?:^|;\s*)__session=([^;]+)/.exec(cookie);
  const token = match?.[1];
  if (!token) throw new Response("Unauthorized: sign in first", { status: 401 });
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Response("CLERK_SECRET_KEY not configured", { status: 500 });
  const { verifyToken } = await import("@clerk/backend");
  let claims: { sub?: string };
  try {
    claims = await verifyToken(token, { secretKey });
  } catch {
    throw new Response("Unauthorized: invalid session", { status: 401 });
  }
  const userId = claims.sub;
  if (!userId) throw new Response("Unauthorized", { status: 401 });
  const role = await assertRole(userId);
  return { userId, role };
}

export function getRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!id) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID not configured");
  return id;
}

export function getOAuthClient(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not configured");
  }
  return { clientId, clientSecret };
}

export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
}): Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }> {
  const { clientId, clientSecret } = getOAuthClient();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OAuth code exchange failed [${res.status}]: ${body}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
  };
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
    return cachedAccessToken.token;
  }
  const { clientId, clientSecret } = getOAuthClient();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error(
      "GOOGLE_OAUTH_REFRESH_TOKEN not configured. Visit /api/drive/oauth/start (signed in with the required role) to obtain one.",
    );
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token refresh failed [${res.status}]: ${body}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in,
  };
  return data.access_token;
}

export type DriveFolder = { id: string; name: string };

export async function listDriveSubfolders(parentId: string): Promise<DriveFolder[]> {
  const token = await getAccessToken();
  const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("orderBy", "name");
  url.searchParams.set("pageSize", "200");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive list failed [${res.status}]: ${body}`);
  }
  const data = (await res.json()) as { files: DriveFolder[] };
  return data.files ?? [];
}

export async function getFolderName(folderId: string): Promise<string> {
  const token = await getAccessToken();
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("supportsAllDrives", "true");
  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive get folder failed [${res.status}]: ${body}`);
  }
  const data = (await res.json()) as { name: string };
  return data.name;
}

export async function uploadFileToDrive(params: {
  folderId: string;
  filename: string;
  mimeType: string;
  body: ArrayBuffer;
}): Promise<{ id: string; name: string }> {
  const token = await getAccessToken();
  const boundary = `----lovable${Math.random().toString(16).slice(2)}`;
  const metadata = {
    name: params.filename,
    parents: [params.folderId],
    mimeType: params.mimeType,
  };
  const enc = new TextEncoder();
  const pre = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--\r\n`);
  const bodyBytes = new Uint8Array(pre.byteLength + params.body.byteLength + post.byteLength);
  bodyBytes.set(pre, 0);
  bodyBytes.set(new Uint8Array(params.body), pre.byteLength);
  bodyBytes.set(post, pre.byteLength + params.body.byteLength);

  const url = new URL("https://www.googleapis.com/upload/drive/v3/files");
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": `multipart/related; boundary=${boundary}`,
    },
    body: bodyBytes,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed [${res.status}]: ${text}`);
  }
  return (await res.json()) as { id: string; name: string };
}
