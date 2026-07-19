import { createFileRoute } from "@tanstack/react-router";
import {
  DRIVE_OAUTH_SCOPE,
  getOAuthClient,
  requireUploaderFromCookie,
} from "@/lib/drive.server";

export const Route = createFileRoute("/api/drive/oauth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireUploaderFromCookie(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Auth error", { status: 500 });
        }
        try {
          const { clientId } = getOAuthClient();
          const origin = new URL(request.url).origin;
          const redirectUri = `${origin}/api/drive/oauth/callback`;
          const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
          authUrl.searchParams.set("client_id", clientId);
          authUrl.searchParams.set("redirect_uri", redirectUri);
          authUrl.searchParams.set("response_type", "code");
          authUrl.searchParams.set("scope", DRIVE_OAUTH_SCOPE);
          authUrl.searchParams.set("access_type", "offline");
          authUrl.searchParams.set("prompt", "consent");
          authUrl.searchParams.set("include_granted_scopes", "true");
          return Response.redirect(authUrl.toString(), 302);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(msg, { status: 500 });
        }
      },
    },
  },
});
