import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Loader2, Mail, RefreshCw } from "lucide-react";

type Record_ = {
  batchId: string;
  userName: string;
  userEmail: string;
  batchName: string;
  imageCount: number;
  status: "sending" | "sent" | "failed";
  createdAt: number;
  error?: string;
};

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Upload Email Notifications — Admin" },
      {
        name: "description",
        content: "Admin panel to send a test Gmail notification and review upload email history.",
      },
      { property: "og:title", content: "Upload Email Notifications — Admin" },
      {
        property: "og:description",
        content: "Send a test Gmail notification and review upload email history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsAdmin,
});

function fmt(ts: number) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ts));
}

function NotificationsAdmin() {
  const { getToken, isSignedIn, isLoaded } = useAuth();
  const [records, setRecords] = useState<Record_[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/notify/history", {
        headers: { authorization: `Bearer ${(await getToken()) ?? ""}` },
      });
      if (res.status === 401 || res.status === 403) {
        setDenied(true);
        return;
      }
      const json = (await res.json()) as { records?: Record_[] };
      setRecords(json.records ?? []);
    } catch {
      setMsg("Failed to load history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isLoaded && isSignedIn) void load();
  }, [isLoaded, isSignedIn]);

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/notify/test", {
        method: "POST",
        headers: { authorization: `Bearer ${(await getToken()) ?? ""}` },
      });
      const text = await res.text();
      setMsg(res.ok ? "Test email sent." : `Failed: ${text.slice(0, 300)}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!isLoaded) return null;
  if (!isSignedIn || denied)
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-lg font-semibold">Admin only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You need administrator access to view upload email notifications.
        </p>
      </main>
    );

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">Upload email notifications</h1>
      <div className="mt-4 flex gap-2">
        <Button onClick={sendTest} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
          Send Test Email
        </Button>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
      {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}

      <div className="mt-6 divide-y divide-border/60 rounded-xl border border-border/60">
        {records.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>
        )}
        {records.map((r) => (
          <div key={r.batchId} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <div>
              <p className="font-semibold">{r.userName}</p>
              <p className="text-muted-foreground">{r.userEmail}</p>
              <p className="mt-1">{r.batchName}</p>
              <p className="text-muted-foreground">
                {r.imageCount} picture{r.imageCount === 1 ? "" : "s"} · {fmt(r.createdAt)}
              </p>
            </div>
            <span
              className={
                r.status === "sent"
                  ? "text-emerald-600"
                  : r.status === "failed"
                    ? "text-destructive"
                    : "text-muted-foreground"
              }
            >
              {r.status === "sent" ? "Email Sent" : r.status === "failed" ? "Email Failed" : "Sending…"}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
