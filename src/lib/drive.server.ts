// Server-only helpers: Google Drive via Service Account + Clerk auth verification.
import { createClerkClient, type ClerkClient } from "@clerk/backend";

const REQUIRED_ROLE = "mustakim-s-student";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

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

/**
 * Verify Clerk session token from Authorization: Bearer <token> header.
 * Ensures the user has the required role. Throws Response on failure.
 */
export async function requireUploader(request: Request): Promise<VerifiedUser> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) {
    throw new Response("Unauthorized: missing token", { status: 401 });
  }
  let claims: { sub?: string; [k: string]: unknown };
  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) throw new Error("CLERK_SECRET_KEY not configured");
    const { verifyToken } = await import("@clerk/backend");
    claims = await verifyToken(token, { secretKey });
  } catch (e) {
    throw new Response("Unauthorized: invalid token", { status: 401 });
  }
  const userId = claims.sub;
  if (!userId) throw new Response("Unauthorized", { status: 401 });

  // Fetch user to read public metadata role (session token may not carry it).
  const user = await getClerk().users.getUser(userId);
  const meta = (user.publicMetadata ?? {}) as { role?: unknown };
  const role = typeof meta.role === "string" ? meta.role : null;
  if (role !== REQUIRED_ROLE) {
    throw new Response(`Forbidden: role "${REQUIRED_ROLE}" required`, { status: 403 });
  }
  return { userId, role };
}

// ---------- Google Service Account ----------

function loadServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not configured");
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Invalid service account JSON");
  }
  // Handle escaped newlines commonly stored as \\n in env values.
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  return parsed;
}

export function getRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!id) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID not configured");
  return id;
}

function base64UrlEncode(input: string | Uint8Array): string {
  let bin: string;
  if (typeof input === "string") {
    bin = btoa(unescape(encodeURIComponent(input)));
  } else {
    let s = "";
    for (let i = 0; i < input.length; i++) s += String.fromCharCode(input[i]);
    bin = btoa(s);
  }
  return bin.replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
    return cachedAccessToken.token;
  }
  const sa = loadServiceAccount();
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: DRIVE_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claims))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64UrlEncode(new Uint8Array(sig))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token exchange failed [${res.status}]: ${body}`);
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
