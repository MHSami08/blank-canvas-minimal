// Server-only Google Drive service.
// Uses a single owner account's OAuth refresh token (obtained once by admin).
// End users never see a Google consent screen.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

function getEnv(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  throw new Error(`Missing required env: ${names.join(" or ")}`);
}

function getCreds() {
  return {
    clientId: getEnv("GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: getEnv("GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"),
    refreshToken: getEnv("GOOGLE_REFRESH_TOKEN", "GOOGLE_OAUTH_REFRESH_TOKEN"),
  };
}

export function getRootFolderId(): string {
  return getEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID");
}

let cached: { token: string; expiresAt: number } | null = null;

async function refreshAccessToken(): Promise<string> {
  const { clientId, clientSecret, refreshToken } = getCreds();
  const maxAttempts = 5;
  let lastErr = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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
    if (res.ok) {
      const data = (await res.json()) as { access_token: string; expires_in: number };
      const now = Math.floor(Date.now() / 1000);
      cached = { token: data.access_token, expiresAt: now + data.expires_in };
      return data.access_token;
    }
    let code = "";
    try {
      const body = (await res.json()) as { error?: string };
      code = body.error ?? "";
    } catch {
      /* ignore */
    }
    lastErr = `${res.status}${code ? ": " + code : ""}`;
    // Retry on rate limit / transient server errors. invalid_grant is fatal.
    const retriable =
      res.status === 429 || res.status >= 500 || code === "rate_limit_exceeded" || code === "slow_down";
    if (!retriable || attempt === maxAttempts - 1) {
      console.error(`[drive] token refresh failed ${lastErr}`);
      throw new Error(`Google token refresh failed (${lastErr})`);
    }
    const delay = 400 * Math.pow(2, attempt) + Math.random() * 300;
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error(`Google token refresh failed (${lastErr})`);
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (!forceRefresh && cached && cached.expiresAt - 60 > now) return cached.token;
  return refreshAccessToken();
}

/**
 * Authenticated Drive fetch with one automatic retry if the access token
 * has expired (401) mid-request.
 */
async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = async (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
  let token = await getAccessToken();
  let res = await doFetch(token);
  if (res.status === 401) {
    token = await getAccessToken(true);
    res = await doFetch(token);
  }
  return res;
}

async function driveJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await driveFetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive request failed [${res.status}]: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

export type DriveFolder = { id: string; name: string };
export type DriveFile = { id: string; name: string; mimeType?: string };

export async function listSubfolders(parentId: string): Promise<DriveFolder[]> {
  const q = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name)");
  url.searchParams.set("orderBy", "name");
  url.searchParams.set("pageSize", "200");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const data = await driveJson<{ files: DriveFolder[] }>(url.toString());
  return data.files ?? [];
}

export async function getFolderName(folderId: string): Promise<string> {
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(folderId)}`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("supportsAllDrives", "true");
  const data = await driveJson<{ name: string }>(url.toString());
  return data.name;
}

export async function uploadFile(params: {
  folderId: string;
  filename: string;
  mimeType: string;
  body: ArrayBuffer;
}): Promise<DriveFile> {
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
  const bytes = new Uint8Array(pre.byteLength + params.body.byteLength + post.byteLength);
  bytes.set(pre, 0);
  bytes.set(new Uint8Array(params.body), pre.byteLength);
  bytes.set(post, pre.byteLength + params.body.byteLength);

  const url = new URL(`${DRIVE_UPLOAD}/files`);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name,mimeType");

  return driveJson<DriveFile>(url.toString(), {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body: bytes,
  });
}

// Reusable helpers for future features.

export async function deleteFile(fileId: string): Promise<void> {
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("supportsAllDrives", "true");
  const res = await driveFetch(url.toString(), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive delete failed [${res.status}]: ${await res.text()}`);
  }
}

export async function moveFile(fileId: string, newParentId: string): Promise<DriveFile> {
  // Fetch current parents so we can remove them.
  const meta = await driveJson<{ parents?: string[] }>(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=parents&supportsAllDrives=true`,
  );
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("addParents", newParentId);
  if (meta.parents?.length) url.searchParams.set("removeParents", meta.parents.join(","));
  url.searchParams.set("fields", "id,name,mimeType");
  url.searchParams.set("supportsAllDrives", "true");
  return driveJson<DriveFile>(url.toString(), { method: "PATCH" });
}

export async function listFiles(folderId: string): Promise<DriveFile[]> {
  const q = `'${folderId}' in parents and trashed=false`;
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name,mimeType)");
  url.searchParams.set("orderBy", "name");
  url.searchParams.set("pageSize", "200");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  const data = await driveJson<{ files: DriveFile[] }>(url.toString());
  return data.files ?? [];
}

export async function downloadFile(fileId: string): Promise<Response> {
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  return driveFetch(url.toString());
  }
