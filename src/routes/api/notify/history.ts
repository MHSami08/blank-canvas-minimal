import { createFileRoute } from "@tanstack/react-router";
import { requireAdminIdentity } from "@/lib/notify-auth.server";
import { listRecords } from "@/lib/notify-store.server";

export const Route = createFileRoute("/api/notify/history")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdminIdentity(request);
        } catch (e) {
          if (e instanceof Response) return e;
          return new Response("Auth error", { status: 500 });
        }
        return Response.json({ records: listRecords() }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
