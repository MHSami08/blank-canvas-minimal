import { createFileRoute } from "@tanstack/react-router";
import { requireUploader, uploadFileToDrive } from "@/lib/drive.server";

export const Route = createFileRoute("/api/drive/upload")({
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
          const form = await request.formData();
          const folderId = String(form.get("folderId") ?? "");
          const filename = String(form.get("filename") ?? "");
          const file = form.get("file");
          if (!folderId || !filename || !(file instanceof Blob)) {
            return Response.json({ error: "Missing folderId, filename, or file" }, { status: 400 });
          }
          const body = await file.arrayBuffer();
          const mimeType = file.type || "application/octet-stream";
          const result = await uploadFileToDrive({ folderId, filename, mimeType, body });
          return Response.json(result);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("drive/upload error:", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
