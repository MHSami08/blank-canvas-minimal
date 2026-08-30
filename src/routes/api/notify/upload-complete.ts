import { createFileRoute } from "@tanstack/react-router";
import { requireUploaderIdentity } from "@/lib/notify-auth.server";
import { buildUploadEmail, sendGmail } from "@/lib/gmail.server";
import { beginRecord, getRecord, markFailed, markSent } from "@/lib/notify-store.server";

export const Route = createFileRoute("/api/notify/upload-complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let identity;
        try {
          identity = await requireUploaderIdentity(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Auth error", { status: 500 });
        }

        const body = (await request.json().catch(() => ({}))) as {
          batchId?: string;
          folderName?: string;
          batchName?: string;
          rangeName?: string | null;
          pageRange?: { start?: unknown; end?: unknown } | null;
          imageCount?: number;
        };
        const batchId = typeof body.batchId === "string" ? body.batchId.slice(0, 200) : "";
        const rawFolder =
          typeof body.folderName === "string" && body.folderName.trim()
            ? body.folderName
            : typeof body.batchName === "string"
              ? body.batchName
              : "";
        const folderName = rawFolder.trim() ? rawFolder.trim().slice(0, 200) : "Untitled folder";
        const rangeName =
          typeof body.rangeName === "string" && body.rangeName.trim()
            ? body.rangeName.trim().slice(0, 200)
            : null;
        const pageRange =
          body.pageRange &&
          typeof body.pageRange.start === "string" &&
          typeof body.pageRange.end === "string"
            ? {
                start: body.pageRange.start.slice(0, 10),
                end: body.pageRange.end.slice(0, 10),
              }
            : null;
        const imageCount = Number.isFinite(body.imageCount) ? Math.floor(Number(body.imageCount)) : 0;
        if (!batchId || imageCount <= 0) {
          return Response.json({ error: "Missing batchId or imageCount" }, { status: 400 });
        }

        const existing = getRecord(batchId);
        if (existing && (existing.status === "sent" || existing.status === "sending")) {
          return Response.json({ status: existing.status, duplicate: true });
        }

        beginRecord({
          batchId,
          clerkUserId: identity.userId,
          userName: identity.name,
          userEmail: identity.email,
          batchName: folderName,
          rangeName,
          pageRange,
          imageCount,
        });

        try {
          const { subject, html } = buildUploadEmail({
            userName: identity.name,
            userEmail: identity.email,
            folderName,
            rangeName,
            pageRange,
            imageCount,
          });
          await sendGmail({ subject, html });
          markSent(batchId);
          return Response.json({ status: "sent" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          markFailed(batchId, msg);
          console.error("gmail notify failed:", msg);
          // Never surface as an upload failure — Drive result is unaffected.
          return Response.json({ status: "failed", error: msg }, { status: 200 });
        }
      },
    },
  },
});
