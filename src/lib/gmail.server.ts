// Server-only Gmail API sender.
// Completely independent of the Google Drive upload path: it has its own
// token cache and never touches Drive helpers or Drive state.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

export function getGoogleOAuthClient(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET not configured");
  }
  return { clientId, clientSecret };
}

/** Gmail-capable refresh token. Falls back to the shared Google refresh token. */
function getGmailRefreshToken(): string {
  const t =
    process.env.GMAIL_OAUTH_REFRESH_TOKEN ??
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN ??
    process.env.GOOGLE_REFRESH_TOKEN;
  if (!t) {
    throw new Error(
      "GMAIL_OAUTH_REFRESH_TOKEN not configured. Visit /api/gmail/oauth/start (signed in as admin) to obtain one with gmail.send scope.",
    );
  }
  return t;
}

export function getNotificationEmail(): string {
  const to = process.env.UPLOAD_NOTIFICATION_EMAIL;
  if (!to) throw new Error("UPLOAD_NOTIFICATION_EMAIL not configured");
  return to;
}

let cached: { token: string; expiresAt: number } | null = null;
let inFlight: Promise<string> | null = null;

async function mintToken(): Promise<string> {
  const { clientId, clientSecret } = getGoogleOAuthClient();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: getGmailRefreshToken(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Gmail token refresh failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: Math.floor(Date.now() / 1000) + data.expires_in };
  return data.access_token;
}

/** Single-flight access token so concurrent sends never storm the token endpoint. */
async function getAccessToken(force = false): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (!force && cached && cached.expiresAt - 60 > now) return cached.token;
  if (inFlight) return inFlight;
  inFlight = mintToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function gmailFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const call = async (token: string) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetch(`${GMAIL_API}${path}`, { ...init, headers });
  };
  let res = await call(await getAccessToken());
  if (res.status === 401) res = await call(await getAccessToken(true));
  return res;
}

// No From header: Gmail defaults it to the authenticated account, and the
// gmail.send scope does NOT cover the /profile endpoint, so we must not call it.

const b64 = (s: string) =>
  btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const header = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

export async function sendGmail(params: {
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  const to = getNotificationEmail();
  const raw = [
    `To: ${to}`,
    `Subject: ${header(params.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    params.html,
  ].join("\r\n");
  const encoded = b64(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  // Retry transient failures only (never affects Drive state).
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await gmailFetch("/messages/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw: encoded }),
    });
    if (res.ok) return (await res.json()) as { id: string };
    const text = (await res.text()).slice(0, 300);
    lastErr = `[${res.status}] ${text}`;
    const transient = res.status === 429 || res.status >= 500;
    if (!transient) break;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw new Error(`Gmail send failed ${lastErr}`);
}

export function formatDhaka(date: Date): { date: string; time: string } {
  const d = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const t = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return { date: d, time: t };
}

const esc = (s: string) =>
  s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] as string);

export function buildUploadEmail(info: {
  userName: string;
  userEmail: string;
  folderName: string;
  rangeName?: string | null;
  pageRange?: { start: string; end: string } | null;
  imageCount: number;
}): { subject: string; html: string } {
  const { date, time } = formatDhaka(new Date());
  const subject = `New Upload — ${info.folderName} — ${info.userName}`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px">${esc(label)}</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600">${esc(value)}</td></tr>`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 16px;font-size:18px;color:#111827">New Upload Completed</h2>
  <table style="border-collapse:collapse;width:100%">
    ${row("User", info.userName)}
    ${row("Email", info.userEmail)}
    ${row("Folder", info.folderName)}
    ${info.rangeName ? row("Batch Name", info.rangeName) : ""}
    ${row("Pictures", String(info.imageCount))}
    ${row("Date", date)}
    ${row("Time", `${time} (Asia/Dhaka)`)}
    ${row("Status", "Completed successfully")}
  </table>
  <p style="margin-top:20px;font-size:13px;color:#374151">All ${info.imageCount} picture${info.imageCount === 1 ? " was" : "s were"} successfully uploaded and verified in Google Drive.</p>
</div>`;
  return { subject, html };
}
