import { createFileRoute } from "@tanstack/react-router";
import { requireUploader } from "@/lib/drive-auth.server";
import { getFolderName, getRootFolderId, listSubfolders } from "@/lib/google-drive.server";

export const Route = createFileRoute("/api/drive/folders")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireUploader(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Auth error", { status: 500 });
        }
        try {
          const url = new URL(request.url);
          const rootId = getRootFolderId();
          const parent = url.searchParams.get("parent") || rootId;
          const [folders, name] = await Promise.all([
            listSubfolders(parent),
            getFolderName(parent),
          ]);
          return Response.json({ currentId: parent, currentName: name, rootId, folders });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("drive/folders error:", msg);
          // With the drive.file scope, a folder the app was never granted looks
          // like it doesn't exist. Surface that as a distinct, actionable state.
          if (msg.includes("[404]") || msg.includes("[403]") || msg.includes("File not found")) {
            return Response.json(
              {
                error: "Drive folder access has not been granted to this app yet.",
                code: "drive_not_granted",
              },
              { status: 409 },
            );
          }
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
