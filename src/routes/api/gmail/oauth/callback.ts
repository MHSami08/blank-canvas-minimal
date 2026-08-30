import { createFileRoute } from "@tanstack/react-router";
import { requireAdminIdentity } from "@/lib/notify-auth.server";
import { getGoogleOAuthClient } from "@/lib/gmail.server";

const esc = (s: string) =>
  s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] as string);

export const Route = createFileRoute("/api/gmail/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdminIdentity(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Auth error", { status: 500 });
        }
        const url = new URL(request.url);
        const err = url.searchParams.get("error");
        if (err) return new Response(`OAuth error: ${err}`, { status: 400 });
        const code = url.searchParams.get("code");
        if (!code) return new Response("Missing code", { status: 400 });
        try {
          const { clientId, clientSecret } = getGoogleOAuthClient();
          const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: `${url.origin}/api/gmail/oauth/callback`,
              grant_type: "authorization_code",
            }),
          });
          if (!res.ok) {
            return new Response(`Token exchange failed [${res.status}]: ${await res.text()}`, {
              status: 500,
            });
          }
          const tokens = (await res.json()) as { refresh_token?: string; scope?: string };
          const rt = tokens.refresh_token;
          const body = rt
            ? `<!doctype html><meta charset="utf-8"><title>Gmail refresh token</title>
<style>body{font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5}textarea{width:100%;height:120px;font-family:ui-monospace,monospace;font-size:13px;padding:8px}</style>
<h1>✅ Gmail refresh token obtained</h1>
<p>Save this as the <code>GMAIL_OAUTH_REFRESH_TOKEN</code> secret in Lovable.</p>
<textarea readonly onclick="this.select()">${esc(rt)}</textarea>
<p><small>Scopes granted: ${esc(tokens.scope ?? "")}</small></p>`
            : `<!doctype html><meta charset="utf-8"><h1>No refresh_token returned</h1><p>Remove this app at <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>, then retry <a href="/api/gmail/oauth/start">/api/gmail/oauth/start</a>.</p>`;
          return new Response(body, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        } catch (e) {
          return new Response(e instanceof Error ? e.message : String(e), { status: 500 });
        }
      },
    },
  },
});
