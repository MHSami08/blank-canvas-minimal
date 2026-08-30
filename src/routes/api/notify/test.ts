import { createFileRoute } from "@tanstack/react-router";
import { requireAdminIdentity } from "@/lib/notify-auth.server";
import { sendGmail } from "@/lib/gmail.server";

export const Route = createFileRoute("/api/notify/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireAdminIdentity(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Auth error", { status: 500 });
        }
        try {
          await sendGmail({
            subject: "Upload Notification Test",
            html: `<div style="font-family:system-ui,sans-serif;padding:16px">
  <p><strong>Gmail notification system is working correctly.</strong></p>
  <p style="color:#6b7280">This is only for testing.</p>
</div>`,
          });
          return Response.json({ status: "sent" });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("gmail test failed:", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
