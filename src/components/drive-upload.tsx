import { useEffect, useRef, useState } from "react";
import { useAuth, useUser, SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UploadCloud, FolderOpen, ChevronRight, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Folder, Lock, MessageCircle, Pause, Play, WifiOff, TestTube } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AdaptiveConcurrencyController,
  classifyError,
  type ControllerStats,
} from "@/lib/adaptive-concurrency";

type FolderType = { id: string; name: string };
type FolderResponse = {
  currentId: string;
  currentName: string;
  rootId: string;
  folders: FolderType[];
};

type Props = {
  files: { file: Blob; name: string }[];
};

function RequestAccessNote({ user }: { user: ReturnType<typeof useUser>["user"] }) {
  const ADMIN_PHONE = "8801724583309";
  const firstName = user?.firstName ?? "";
  const nickname = (user?.username as string | undefined) ?? "";
  const displayName = [firstName, nickname].filter(Boolean).join(" ") || user?.fullName || "—";
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";
  const text = [
    "Request to upload via Page Renamer Pro",
    "",
    `My name is : ${displayName}`,
    `my Gmail address : ${email}`,
    "Please Grant my access to upload via the Webapp",
  ].join("\n");
  const href = `https://wa.me/${ADMIN_PHONE}?text=${encodeURIComponent(text)}`;
  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Lock className="h-4 w-4" />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          You don't have access to upload via this website. Please request access to the admin.
        </p>
      </div>
      <a href={href} target="_blank" rel="noopener noreferrer" className="mt-4 block">
        <Button
          size="lg"
          className={cn(
            "h-11 w-full font-semibold border-0 transition-all active:scale-[0.99]",
            "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)] hover:brightness-110"
          )}
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          Request access
        </Button>
      </a>
    </div>
  );
}

/** Shown instead of raw Google auth errors (e.g. invalid_grant): the app's Drive
 *  connection needs the admin to re-authorize. Framed as "out of fuel". */
function isFuelEmptyError(msg: string | null): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes("invalid_grant") ||
    m.includes("token refresh failed") ||
    m.includes("refresh_token") ||
    m.includes("unauthorized_client") ||
    m.includes("missing required env")
  );
}

function FuelEmptyNote({ user }: { user: ReturnType<typeof useUser>["user"] }) {
  const ADMIN_PHONE = "8801724583309";
  const firstName = user?.firstName ?? "";
  const nickname = (user?.username as string | undefined) ?? "";
  const displayName = [firstName, nickname].filter(Boolean).join(" ") || user?.fullName || "—";
  const email = user?.primaryEmailAddress?.emailAddress ?? "—";
  const text = [
    "The Page Renamer Pro website's Drive upload engine fuel is run out",
    "",
    `My name is : ${displayName}`,
    `My Gmail : ${email}`,
    "",
    "Please refuel the Drive Upload Fuel.",
  ].join("\n");
  const href = `https://wa.me/${ADMIN_PHONE}?text=${encodeURIComponent(text)}`;
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-4">
      <div className="flex items-start gap-3">
        <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-400">
          <TestTube className="h-5 w-5 rotate-12" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-300">Website have no Drive upload fuel !</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            The Drive upload engine is out of fuel. Please ask the admin to refuel it before uploading more files.
          </p>
        </div>
      </div>
      <a href={href} target="_blank" rel="noopener noreferrer" className="mt-4 block">
        <Button
          size="lg"
          className={cn(
            "h-11 w-full font-semibold border-0 transition-all active:scale-[0.99]",
            "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)] hover:brightness-110",
          )}
        >
          Request Refuel
        </Button>
      </a>
    </div>
  );
}
export function DriveUpload({ files }: Props) {
  const { isSignedIn, user, isLoaded } = useUser();
  const { getToken } = useAuth();

  const role = (user?.publicMetadata as { role?: string } | undefined)?.role ?? null;
  const hasRole = role === "mustakim-s-student";

  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<FolderResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadDone, setUploadDone] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [offline, setOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Map<string, string>>(new Map());
  const [active, setActive] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<ControllerStats | null>(null);
  const pausedRef = useRef(false);
  const PROGRESS_KEY = "drive-upload-progress-v1";

  useEffect(() => {
    if (!data) return;
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      if (!raw) { setCompleted(new Set()); return; }
      const parsed = JSON.parse(raw) as { folderId?: string; names?: string[] };
      if (parsed.folderId === data.currentId && Array.isArray(parsed.names)) {
        setCompleted(new Set(parsed.names));
      } else {
        setCompleted(new Set());
      }
    } catch { setCompleted(new Set()); }
  }, [data?.currentId]);

  function persistCompleted(folderId: string, set: Set<string>) {
    try {
      if (set.size === 0) localStorage.removeItem(PROGRESS_KEY);
      else localStorage.setItem(PROGRESS_KEY, JSON.stringify({ folderId, names: Array.from(set) }));
    } catch { /* ignore */ }
  }

  useEffect(() => {
    const onOff = () => { setOffline(true); pausedRef.current = true; setPaused(true); };
    const onOn = () => setOffline(false);
    window.addEventListener("offline", onOff);
    window.addEventListener("online", onOn);
    return () => {
      window.removeEventListener("offline", onOff);
      window.removeEventListener("online", onOn);
    };
  }, []);

  async function loadFolder(parentId: string | null) {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        parentId ? `/api/drive/folders?parent=${encodeURIComponent(parentId)}` : "/api/drive/folders",
        { headers: { authorization: `Bearer ${token ?? ""}` } },
      );
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Failed to load folders (${res.status}): ${t}`);
      }
      const json = (await res.json()) as FolderResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isLoaded && isSignedIn && hasRole && !data) {
      loadFolder(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, hasRole]);

  function enterFolder(f: FolderType) {
    setBreadcrumb((prev) => [...prev, { id: f.id, name: f.name }]);
    loadFolder(f.id);
  }

  function goToCrumb(idx: number) {
    if (idx < 0) {
      setBreadcrumb([]);
      loadFolder(null);
      return;
    }
    const target = breadcrumb[idx];
    setBreadcrumb(breadcrumb.slice(0, idx + 1));
    loadFolder(target.id);
  }

  async function runUpload(initialCompleted: Set<string>) {
    if (!data) return;
    const folderId = data.currentId;
    const pending = files.filter((f) => !initialCompleted.has(f.name));
    if (pending.length === 0) {
      setUploadDone(`All ${files.length} file${files.length === 1 ? "" : "s"} already uploaded to "${data.currentName}".`);
      persistCompleted(folderId, new Set());
      setCompleted(new Set());
      return;
    }
    setUploading(true);
    setError(null);
    setUploadDone(null);
    setFailed(new Map());
    setActive(new Set());
    pausedRef.current = false;
    setPaused(false);

    const ctrl = new AdaptiveConcurrencyController({ start: 15, max: 60, min: 2 });
    setStats(ctrl.stats());

    const done = { count: initialCompleted.size };
    setProgress({ done: done.count, total: files.length });
    let cursor = 0;
    const localCompleted = new Set(initialCompleted);
    const localFailed = new Map<string, string>();
    const activeNames = new Set<string>();
    const syncActive = () => setActive(new Set(activeNames));

    const isNetworkError = (e: unknown) =>
      e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);

    // ---- Drive access token manager (server only mints tokens, never proxies bytes) ----
    let tokenCache: { accessToken: string; expiresAt: number } | null = null;
    let tokenInFlight: Promise<string> | null = null;
    const fetchDriveToken = async (force: boolean): Promise<string> => {
      const now = Math.floor(Date.now() / 1000);
      if (!force && tokenCache && tokenCache.expiresAt - 90 > now) return tokenCache.accessToken;
      if (tokenInFlight) return tokenInFlight;
      tokenInFlight = (async () => {
        try {
          const clerkToken = await getToken({ skipCache: force });
          const res = await fetch("/api/drive/token", {
            method: "POST",
            headers: {
              authorization: `Bearer ${clerkToken ?? ""}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ folderId }),
          });
          if (!res.ok) throw new Error(`Could not get Drive token [${res.status}]: ${await res.text()}`);
          const json = (await res.json()) as { accessToken: string; expiresAt: number };
          tokenCache = json;
          return json.accessToken;
        } finally {
          tokenInFlight = null;
        }
      })();
      return tokenInFlight;
    };

    const UPLOAD_TIMEOUT_MS = 180_000;
    const MAX_ATTEMPTS = 5;

    /** Direct browser -> Google Drive resumable upload. No binary hits our backend. */
    const uploadDirect = async (file: Blob, name: string, force: boolean) => {
      const token = await fetchDriveToken(force);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
      try {
        const initUrl =
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name";
        const initRes = await fetch(initUrl, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": file.type || "application/octet-stream",
          },
          body: JSON.stringify({
            name,
            parents: [folderId],
            mimeType: file.type || "application/octet-stream",
          }),
          signal: controller.signal,
        });
        if (!initRes.ok) {
          const text = await initRes.text();
          const err = new Error(`Drive init failed for ${name} [${initRes.status}]: ${text.slice(0, 300)}`);
          (err as { status?: number }).status = initRes.status;
          throw err;
        }
        const location = initRes.headers.get("location");
        if (!location) throw new Error(`Drive did not return an upload URL for ${name}`);
        const putRes = await fetch(location, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
          signal: controller.signal,
        });
        if (!putRes.ok) {
          const text = await putRes.text();
          const err = new Error(`Upload failed for ${name} [${putRes.status}]: ${text.slice(0, 300)}`);
          (err as { status?: number }).status = putRes.status;
          throw err;
        }
      } finally {
        clearTimeout(timer);
      }
    };

    const uploadOne = async (file: Blob, name: string) => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (pausedRef.current) throw new Error("__paused__");
        try {
          const started = Date.now();
          await uploadDirect(file, name, attempt > 0);
          if (attempt > 0) ctrl.retryFinished();
          ctrl.recordSuccess(Date.now() - started);
          return;
        } catch (e) {
          if (pausedRef.current) throw new Error("__paused__");
          if (isNetworkError(e) && typeof navigator !== "undefined" && !navigator.onLine) {
            pausedRef.current = true;
            setPaused(true);
            setOffline(true);
            throw new Error("__paused__");
          }
          const status = (e as { status?: number }).status;
          const aborted = e instanceof DOMException && e.name === "AbortError";
          const retriable =
            aborted ||
            isNetworkError(e) ||
            status === undefined ||
            status === 401 ||
            status === 403 ||
            status === 408 ||
            status === 429 ||
            status >= 500;
          if (!retriable || attempt === MAX_ATTEMPTS - 1) {
            if (attempt > 0) ctrl.retryFinished();
            ctrl.recordFailure(classifyError(e));
            throw e instanceof Error ? e : new Error(String(e));
          }
          ctrl.recordRetry(classifyError(e));
          setStats(ctrl.stats());
          const delay = 500 * Math.pow(2, attempt) + Math.random() * 250;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    };

    // ---- Adaptive worker pool: slots are always released (try/finally) ----
    let activeWorkers = 0;
    const running = new Set<Promise<void>>();

    const spawnWorkers = () => {
      while (
        !pausedRef.current &&
        activeWorkers < ctrl.concurrency &&
        cursor < pending.length
      ) {
        const p = worker().finally(() => running.delete(p));
        running.add(p);
      }
    };

    const worker = async (): Promise<void> => {
      activeWorkers++;
      try {
        while (true) {
          if (pausedRef.current) return;
          // Shed this worker if the controller lowered concurrency.
          if (activeWorkers > ctrl.concurrency) return;
          const i = cursor++;
          if (i >= pending.length) return;
          const { file, name } = pending[i];
          if (localCompleted.has(name)) continue;
          activeNames.add(name);
          syncActive();
          try {
            await uploadOne(file, name);
            localCompleted.add(name);
            persistCompleted(folderId, localCompleted);
            setCompleted(new Set(localCompleted));
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg === "__paused__") return;
            // One bad file must never block the queue.
            localFailed.set(name, msg);
            setFailed(new Map(localFailed));
          } finally {
            activeNames.delete(name);
            syncActive();
            setStats(ctrl.stats());
            setProgress({
              done: localCompleted.size + localFailed.size,
              total: files.length,
            });
          }
        }
      } finally {
        activeWorkers--;
        // Controller may have raised concurrency while we worked.
        spawnWorkers();
      }
    };

    try {
      setStats(ctrl.stats());
      spawnWorkers();
      while (running.size > 0) {
        await Promise.all(Array.from(running));
      }

      if (!pausedRef.current) {
        if (localFailed.size > 0) {
          setError(
            `${localFailed.size} file${localFailed.size === 1 ? "" : "s"} failed after retries. ${localCompleted.size} of ${files.length} uploaded — press Resume to retry only the failed ones.`,
          );
        } else {
          setUploadDone(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"} to "${data.currentName}".`);
          persistCompleted(folderId, new Set());
          setCompleted(new Set());
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActive(new Set());
      setUploading(false);
    }
  }


  async function handleUpload() {
    if (!data || files.length === 0) return;
    await runUpload(completed);
  }

  function handlePause() {
    pausedRef.current = true;
    setPaused(true);
  }

  async function handleResume() {
    if (!data) return;
    await runUpload(completed);
  }

  return (
    <div className="mt-6 rounded-2xl border border-border/80 bg-card/60 p-5 shadow-xl backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center gap-2.5 pb-4 border-b border-border/40">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
          <UploadCloud className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Upload to Google Drive</h2>
          <p className="text-xs text-muted-foreground">Save your renamed files directly to cloud</p>
        </div>
      </div>

      <SignedOut>
        <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
          Sign in to upload your ordered and renamed notebook pages directly to your Google Drive workspace.
        </p>
        <div className="mt-4">
          <SignInButton mode="modal">
            <Button size="sm" className="w-full sm:w-auto font-medium">Sign in to Drive</Button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        {!hasRole ? (
          <RequestAccessNote user={user} />
        ) : (
          <>
            {/* Interactive Breadcrumbs */}
            <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-xl bg-muted/40 p-2 text-xs">
              <button
                type="button"
                onClick={() => goToCrumb(-1)}
                className={cn(
                  "rounded-lg px-2.5 py-1 font-medium transition-colors hover:bg-background hover:text-foreground",
                  breadcrumb.length === 0 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                )}
              >
                Root
              </button>
              {breadcrumb.map((c, i) => (
                <div key={c.id} className="flex items-center gap-1.5">
                  <ChevronRight className="h-3 w-3 text-muted-foreground/60" />
                  <button
                    type="button"
                    onClick={() => goToCrumb(i)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 font-medium max-w-[120px] truncate transition-colors hover:bg-background hover:text-foreground",
                      i === breadcrumb.length - 1 ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {c.name}
                  </button>
                </div>
              ))}
            </div>

            {/* Folder Explorer Container */}
            <div className="mt-3 overflow-hidden rounded-xl border border-border bg-background/50">
              {loading ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span>Fetching directories...</span>
                </div>
              ) : data ? (
                <div className="max-h-60 overflow-y-auto">
                  <ul className="divide-y divide-border/40">
                    {breadcrumb.length > 0 && (
                      <li>
                        <button
                          type="button"
                          onClick={() => goToCrumb(breadcrumb.length - 2)}
                          className="flex w-full items-center gap-2.5 px-4 py-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />
                          <span>Go back a directory</span>
                        </button>
                      </li>
                    )}
                    {data.folders.length === 0 ? (
                      <div className="flex h-28 flex-col items-center justify-center gap-1.5 text-center p-4">
                        <Folder className="h-6 w-6 text-muted-foreground/40 stroke-[1.5]" />
                        <span className="text-xs text-muted-foreground">No subfolders found inside this directory.</span>
                      </div>
                    ) : (
                      data.folders.map((f) => (
                        <li key={f.id}>
                          <button
                            type="button"
                            onClick={() => enterFolder(f)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs font-medium transition-colors hover:bg-muted/50 group"
                          >
                            <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/5 text-primary/80 group-hover:bg-primary/10 group-hover:text-primary">
                              <FolderOpen className="h-4 w-4" />
                            </div>
                            <span className="flex-1 truncate text-foreground/90 group-hover:text-foreground">{f.name}</span>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ) : null}
            </div>

            {/* Current Target Safe-zone */}
            <div className="mt-3 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
              <span>Destination path:</span>
              <span className="font-semibold text-foreground max-w-[200px] truncate">
                {data?.currentName ? `/${data.currentName}` : "—"}
              </span>
            </div>

            {/* Notifications & Status Alerts */}
            {error && isFuelEmptyError(error) && <FuelEmptyNote user={user} />}

            {error && !isFuelEmptyError(error) && (
              <Alert variant="destructive" className="mt-3 border-destructive/20 bg-destructive/5 text-xs">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="break-words font-medium">{error}</AlertDescription>
              </Alert>
            )}

            {uploadDone && (
              <Alert className="mt-3 border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <AlertDescription className="font-medium">{uploadDone}</AlertDescription>
              </Alert>
            )}

            {!isFuelEmptyError(error) && (
              <>
                {/* Progress Track */}
                {progress && (uploading || paused) && (
                  <div className={cn(
                    "mt-4 rounded-xl border p-3",
                    paused ? "border-amber-500/30 bg-amber-500/5" : "border-border/60 bg-muted/20"
                  )}>
                    <div className="flex items-center justify-between text-[11px] font-medium mb-1.5">
                      <span className={cn("flex items-center gap-1.5", paused ? "text-amber-500" : "text-muted-foreground")}>
                        {paused ? (
                          <>
                            <Pause className="h-3.5 w-3.5 fill-current" />
                            {offline ? "Paused — you're offline" : "Paused"}
                          </>
                        ) : (
                          <>Uploading package...</>
                        )}
                      </span>
                      <span className="font-mono text-foreground">{Math.round((progress.done / progress.total) * 100)}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full transition-all duration-300",
                          paused ? "bg-amber-500" : "bg-primary"
                        )}
                        style={{ width: `${(progress.done / progress.total) * 100}%` }}
                      />
                    </div>
                    {stats && (
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground/80">
                        <span className="font-mono">
                          Parallel uploads: {stats.concurrency} / {stats.max}
                        </span>
                        <span>Active: {active.size}</span>
                        {stats.retrying > 0 && <span>Retrying: {stats.retrying}</span>}
                        {stats.optimizing && !paused && (
                          <span className="text-primary">⚡ Optimizing upload speed</span>
                        )}
                      </p>
                    )}
                    <p className="mt-1.5 text-[10px] text-muted-foreground/80">
                      {completed.size} uploaded · {failed.size} failed · {Math.max(0, progress.total - progress.done - active.size)} queued
                    </p>
                    {active.size > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-[10px] text-muted-foreground/70">
                        {Array.from(active).slice(0, 8).map((n) => (
                          <li key={n} className="truncate">Uploading: {n}</li>
                        ))}
                      </ul>
                    )}
                    {failed.size > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-[10px] text-destructive">
                        {Array.from(failed.keys()).slice(0, 5).map((n) => (
                          <li key={n} className="truncate">Failed: {n}</li>
                        ))}
                        {failed.size > 5 && <li>+{failed.size - 5} more failed</li>}
                      </ul>
                    )}
                  </div>
                )}


                {/* Resume banner when session has unfinished uploads and we're idle */}
                {!uploading && !paused && completed.size > 0 && completed.size < files.length && (
                  <Alert className="mt-3 border-amber-500/20 bg-amber-500/5 text-xs text-amber-500">
                    <Pause className="h-4 w-4 fill-current" />
                    <AlertDescription className="font-medium">
                      Previous upload paused — {completed.size} of {files.length} done. Tap Resume to continue.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Action buttons */}
                {paused ? (
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="lg"
                      className={cn(
                        "h-12 flex-1 font-semibold border-0 transition-all active:scale-[0.99]",
                        "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)] hover:brightness-110"
                      )}
                      onClick={handleResume}
                      disabled={offline}
                    >
                      {offline ? (
                        <><WifiOff className="mr-2 h-4 w-4" />Waiting for internet…</>
                      ) : (
                        <><Play className="mr-2 h-4 w-4 fill-current" />Resume upload</>
                      )}
                    </Button>
                  </div>
                ) : uploading ? (
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-12 flex-1 font-semibold"
                      onClick={handlePause}
                    >
                      <Pause className="mr-2 h-4 w-4 fill-current" />
                      Pause
                    </Button>
                    <Button
                      size="lg"
                      disabled
                      className={cn(
                        "h-12 flex-1 font-semibold border-0",
                        "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)]"
                      )}
                    >
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Pushing…
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="lg"
                    className={cn(
                      "mt-4 h-12 w-full font-semibold border-0 transition-all active:scale-[0.99]",
                      "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)] hover:brightness-110"
                    )}
                    onClick={handleUpload}
                    disabled={!data || files.length === 0}
                  >
                    <UploadCloud className="mr-2 h-4 w-4" />
                    {completed.size > 0 && completed.size < files.length
                      ? `Resume upload (${files.length - completed.size} left)`
                      : `Upload ${files.length} file${files.length === 1 ? "" : "s"} here`}
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </SignedIn>
    </div>
  );
}
