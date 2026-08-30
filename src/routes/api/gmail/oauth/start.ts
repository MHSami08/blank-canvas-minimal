import { createFileRoute } from "@tanstack/react-router";
import { requireAdminIdentity } from "@/lib/notify-auth.server";
import { GMAIL_SEND_SCOPE, getGoogleOAuthClient } from "@/lib/gmail.server";

// Re-consent flow that keeps the existing Drive scope AND adds gmail.send,
// so the resulting refresh token works for both.
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export const Route = createFileRoute("/api/gmail/oauth/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdminIdentity(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Auth error", { status: 500 });
        }
        try {
          const { clientId } = getGoogleOAuthClient();
          const origin = new URL(request.url).origin;
          const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
          authUrl.searchParams.set("client_id", clientId);
          authUrl.searchParams.set("redirect_uri", `${origin}/api/gmail/oauth/callback`);
          authUrl.searchParams.set("response_type", "code");
          authUrl.searchParams.set("scope", `${DRIVE_SCOPE} ${GMAIL_SEND_SCOPE}`);
          authUrl.searchParams.set("access_type", "offline");
          authUrl.searchParams.set("prompt", "consent");
          authUrl.searchParams.set("include_granted_scopes", "true");
          return Response.redirect(authUrl.toString(), 302);
        } catch (e) {
          return new Response(e instanceof Error ? e.message : String(e), { status: 500 });
        }
      },
    },
  },
});
