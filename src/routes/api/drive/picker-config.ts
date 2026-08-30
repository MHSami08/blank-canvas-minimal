import { createFileRoute } from "@tanstack/react-router";
import { requireAdminIdentity } from "@/lib/notify-auth.server";
import { getRootFolderId, issueClientAccessToken } from "@/lib/google-drive.server";

/**
 * Admin-only. Returns a short-lived owner access token so the Google Picker can
 * run in the admin's browser as the Drive owner account. Picking a folder there
 * grants this app drive.file access to that folder and everything inside it.
 */
export const Route = createFileRoute("/api/drive/picker-config")({
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
          const { accessToken } = await issueClientAccessToken();
          const appId = (process.env["GOOGLE_CLIENT_ID"] ?? process.env["GOOGLE_OAUTH_CLIENT_ID"] ?? "").split("-")[0];
          return Response.json({
            accessToken,
            appId,
            developerKey: process.env["GOOGLE_PICKER_API_KEY"] ?? null,
            rootFolderId: getRootFolderId(),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("drive/picker-config error:", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});