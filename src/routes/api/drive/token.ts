import { createFileRoute } from "@tanstack/react-router";
import { requireUploader } from "@/lib/drive-auth.server";
import { assertFolderInRoot, issueClientAccessToken } from "@/lib/google-drive.server";

export const Route = createFileRoute("/api/drive/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireUploader(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Auth error", { status: 500 });
        }
        try {
          const body = (await request.json().catch(() => ({}))) as { folderId?: string };
          const folderId = typeof body.folderId === "string" ? body.folderId : "";
          if (!folderId) return Response.json({ error: "Missing folderId" }, { status: 400 });
          await assertFolderInRoot(folderId);
          const token = await issueClientAccessToken();
          return Response.json(token, {
            headers: { "cache-control": "no-store" },
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("drive/token error:", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
