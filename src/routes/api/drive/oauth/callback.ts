import { createFileRoute } from "@tanstack/react-router";
import { exchangeCodeForTokens, requireUploaderFromCookie } from "@/lib/drive.server";

export const Route = createFileRoute("/api/drive/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireUploaderFromCookie(request);
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
          const redirectUri = `${url.origin}/api/drive/oauth/callback`;
          const tokens = await exchangeCodeForTokens({ code, redirectUri });
          const rt = tokens.refresh_token;
          const body = rt
            ? `<!doctype html><meta charset="utf-8"><title>Refresh token</title>
<style>body{font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.5}code,textarea{font-family:ui-monospace,monospace}textarea{width:100%;height:120px;padding:8px;font-size:13px}</style>
<h1>✅ Refresh token obtained</h1>
<p>Copy the value below and paste it into the <code>GOOGLE_OAUTH_REFRESH_TOKEN</code> secret in Lovable, then reload the app.</p>
<textarea readonly onclick="this.select()">${rt.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string))}</textarea>
<p><small>Scope granted: ${tokens.scope}</small></p>
<p>After saving the secret, you can delete the two admin routes <code>/api/drive/oauth/start</code> and <code>/api/drive/oauth/callback</code>.</p>`
            : `<!doctype html><meta charset="utf-8"><h1>No refresh_token returned</h1><p>Google only returns a refresh token on first consent. Go to <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>, remove this app, then visit <a href="/api/drive/oauth/start">/api/drive/oauth/start</a> again.</p>`;
          return new Response(body, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(msg, { status: 500 });
        }
      },
    },
  },
});
