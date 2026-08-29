// Server-only Gmail send service.
// Completely independent from the Google Drive upload path: it uses its own
// token cache and never touches Drive code. Free — Gmail API only.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function env(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  throw new Error(`Missing required env: ${names.join(" or ")}`);
}

function creds() {
  return {
    clientId: env("GOOGLE_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_CLIENT_SECRET"),
    // A Gmail-scoped refresh token is preferred; fall back to the shared
    // Google refresh token when it already carries gmail.send.
    refreshToken: env(
      "GMAIL_REFRESH_TOKEN",
      "GOOGLE_REFRESH_TOKEN",
      "GOOGLE_OAUTH_REFRESH_TOKEN",
    ),
  };
}

export function getNotificationRecipient(): string {
  return env("UPLOAD_NOTIFICATION_EMAIL");
}

let cached: { token: string; expiresAt: number } | null = null;

async function getAccessToken(force = false): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (!force && cached && cached.expiresAt - 60 > now) return cached.token;
  const { clientId, clientSecret, refreshToken } = creds();
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
    throw new Error(`Gmail token refresh failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

function b64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64url(input: string): string {
  return b64(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function header(value: string): string {
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${b64(value)}?=`;
}

/** Sends one HTML email from the authorized Google account to the fixed admin recipient. */
export async function sendGmail(params: { subject: string; html: string }): Promise<void> {
  const to = getNotificationRecipient();
  const raw = b64url(
    [
      `To: ${to}`,
      `Subject: ${header(params.subject)}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      params.html,
    ].join("\r\n"),
  );

  const send = async (token: string) =>
    fetch(`${GMAIL_API}/messages/send`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    });

  let res = await send(await getAccessToken());
  if (res.status === 401) res = await send(await getAccessToken(true));
  if (!res.ok) {
    throw new Error(`Gmail send failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  }
}

/** Formats date/time in Asia/Dhaka. */
export function dhakaStamp(d = new Date()): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return { date, time };
}

function esc(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
}

export function uploadEmail(info: {
  userName: string;
  userEmail: string;
  batchName: string;
  imageCount: number;
  date: string;
  time: string;
}): { subject: string; html: string } {
  const subject = `New Upload — ${info.batchName} — ${info.userName}`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:110px">${esc(label)}</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600">${esc(value)}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden">
  <div style="padding:18px 22px;background:#111827;color:#fff;font-size:16px;font-weight:700">New Upload Completed</div>
  <div style="padding:20px 22px">
    <table style="width:100%;border-collapse:collapse">
      ${row("User", info.userName)}
      ${row("Email", info.userEmail)}
      ${row("Batch", info.batchName)}
      ${row("Pictures", String(info.imageCount))}
      ${row("Date", info.date)}
      ${row("Time", `${info.time} (Asia/Dhaka)`)}
      ${row("Status", "Completed successfully")}
    </table>
    <p style="margin:18px 0 0;color:#374151;font-size:13px;line-height:1.6">
      All ${info.imageCount} picture${info.imageCount === 1 ? " was" : "s were"} successfully uploaded and verified in Google Drive.
    </p>
  </div>
</div></body></html>`;
  return { subject, html };
}
