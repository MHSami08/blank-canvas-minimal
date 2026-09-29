import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useUser, SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UploadCloud, FolderOpen, ChevronRight, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Folder, Lock, MessageCircle, Pause, Play, WifiOff, TestTube, Layers } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { UploadQueuePanel } from "@/components/upload-queue-panel";
import {
  addGroup,
  getQueue,
  groupUploadNames,
  isAlreadyQueued,
  setSessionMode,
  useUploadSession,
} from "@/lib/upload-queue";

import {
  AdaptiveConcurrencyController,
  classifyError,
  type ControllerStats,
} from "@/lib/adaptive-concurrency";
import { computeBatchId, computePageRange, notifyBatchComplete } from "@/lib/notify-client";
import {
  analyzeLocalFiles,
  classify,
  extractPageNumber,
  fileIsInFolder,
  filenameStem,
  formatPages,
  getPageLabelLang,
  listFolderFiles,
  renameWithPage,
  resolveStartingPage,
  pageNameKey,
  saveBatchRecord,
  type LeftoverCandidate,
  type ScanResult,
} from "@/lib/upload-scan";


type FolderType = { id: string; name: string };
type FolderResponse = {
  currentId: string;
  currentName: string;
  rootId: string;
  folders: FolderType[];
};

type Props = {
  files: { file: Blob; name: string }[];
  /** ZIP-style batch name, e.g. "Physics 2nd Page (6-11)". */
  rangeName?: string | null;
  onQueued?: () => void;
  /** Set when the user left Starting page empty: pages resolve from the destination folder. */
  autoPage?: { baseName: string } | null;
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
export function DriveUpload({ files: inputFiles, rangeName: rangeNameProp, onQueued, autoPage }: Props) {
  const { isSignedIn, user, isLoaded } = useUser();
  const { getToken } = useAuth();

  // role may be a string ("admin") or an array (["mustakim-s-student","admin"])
  const rawRole = (user?.publicMetadata as { role?: unknown } | undefined)?.role;
  const roles: string[] = Array.isArray(rawRole)
    ? rawRole.filter((r): r is string => typeof r === "string")
    : typeof rawRole === "string"
      ? [rawRole]
      : [];
  const hasRole = roles.includes("mustakim-s-student") || roles.includes("admin");

  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<FolderResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; bytesDone: number; bytesTotal: number } | null>(null);
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

  // ---- Smart pre-upload scan ----
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const scanRef = useRef<ScanResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  scanRef.current = scan;

  // ---- Global auto-paging (direct + queue share this) ----
  // autoStart = detected from the destination folder; falls back to page 1
  // if detection fails. The user sets the starting page in the renamer only.
  const [autoStart, setAutoStart] = useState<number | null>(null);
  const [, setDetecting] = useState(false);
  const effectiveStart = autoPage ? autoStart : null;
  const pagesReady = !autoPage || effectiveStart != null;
  const files = useMemo(() => {
    if (!autoPage || effectiveStart == null) return inputFiles;
    return inputFiles.map((f, i) => ({ file: f.file, name: renameWithPage(f.name, effectiveStart + i) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputFiles, autoPage?.baseName, effectiveStart, getPageLabelLang()]);
  const rangeName =
    autoPage && effectiveStart != null && inputFiles.length > 0
      ? `${autoPage.baseName} Page (${effectiveStart}-${effectiveStart + inputFiles.length - 1})`
      : rangeNameProp;

  // ---- Multi-folder upload queue ----
  // Once the user commits a group to the queue the whole session is in queue
  // mode, so later groups never see the direct-upload action again.
  const { mode: sessionMode } = useUploadSession();
  const queueMode = sessionMode === "queue";

  function handleAddToQueue() {
    if (!data || files.length === 0) return;
    if (!pagesReady) {
      toast.info("Still detecting the next page for this folder — try again in a moment.");
      return;
    }
    const names = files.map((f) => f.name);
    if (isAlreadyQueued(data.currentId, names)) {
      toast.info(`These ${files.length} image${files.length === 1 ? "" : "s"} are already queued for "${data.currentName}".`);
      return;
    }
    addGroup({
      folderId: data.currentId,
      folderName: data.currentName,
      rangeName,
      files,
    });
    setSessionMode("queue");
    toast.success(`Added ${files.length} image${files.length === 1 ? "" : "s"} to the queue for "${data.currentName}". Nothing uploaded yet.`);
    setBreadcrumb([]);
    void loadFolder(null);
    onQueued?.();
  }

  // ---- Drive access token manager (shared + pre-warmed so uploads start instantly) ----
  const tokenCacheRef = useRef<{ accessToken: string; expiresAt: number } | null>(null);
  const tokenInFlightRef = useRef<Promise<string> | null>(null);

  const fetchDriveToken = useCallback(
    async (folderId: string, force = false): Promise<string> => {
      const now = Math.floor(Date.now() / 1000);
      const cached = tokenCacheRef.current;
      if (!force && cached && cached.expiresAt - 90 > now) return cached.accessToken;
      if (!force && tokenInFlightRef.current) return tokenInFlightRef.current;
      const p = (async () => {
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
        tokenCacheRef.current = json;
        return json.accessToken;
      })();
      tokenInFlightRef.current = p;
      try {
        return await p;
      } finally {
        if (tokenInFlightRef.current === p) tokenInFlightRef.current = null;
      }
    },
    [getToken],
  );

  // Pre-warm the token as soon as a folder is open (before any file is picked),
  // so pressing Upload never pays for the Clerk + token round-trip.
  useEffect(() => {
    if (!data || !hasRole) return;
    void fetchDriveToken(data.currentId).catch(() => {});
  }, [data?.currentId, hasRole, fetchDriveToken]);

  // Auto-paging: whenever the destination folder becomes known (or changes, or
  // a new group arrives), detect the next page. Folder change clears any
  // manual value so the new folder's default applies.
  const autoPageOn = !!autoPage && inputFiles.length > 0;
  const inputKey = inputFiles.map((f) => f.name).join("\u0000");
  useEffect(() => {
    setAutoStart(null);
    if (!data || !hasRole || !autoPageOn) return;
    let cancelled = false;
    const folderId = data.currentId;
    setDetecting(true);
    (async () => {
      try {
        const token = await fetchDriveToken(folderId);
        // Pages already reserved by queued groups for this folder count too.
        const baseName = autoPage!.baseName;
        const key = pageNameKey(baseName);
        const reservedPages = getQueue()
          .filter((g) => g.folderId === folderId)
          .flatMap((g) => groupUploadNames(g))
          .filter((n) => pageNameKey(n) === key)
          .map(extractPageNumber)
          .filter((p): p is number => p != null);
        const r = await resolveStartingPage({ folderId, userProvidedPage: null, token, reservedPages, baseName });
        if (!cancelled) setAutoStart(r.start);
      } catch {
        if (!cancelled) setAutoStart(1);
      } finally {
        if (!cancelled) setDetecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.currentId, hasRole, autoPageOn, inputKey]);

  // Second warm-up: the moment files are picked, make sure a fresh token is
  // already in flight so pressing Upload starts transferring instantly.
  useEffect(() => {
    if (!data || !hasRole || files.length === 0) return;
    void fetchDriveToken(data.currentId).catch(() => {});
  }, [files.length, data?.currentId, hasRole, fetchDriveToken]);

  // ---- Automatic pre-upload analysis --------------------------------------
  // Runs as soon as files are selected (or the target folder changes) so that
  // pressing Upload never has to wait for a Drive search.
  const filesKey = files.map((f) => f.name).join("\u0000");
  useEffect(() => {
    if (!data || !hasRole || files.length === 0 || uploading) {
      if (files.length === 0) setScan(null);
      return;
    }
    let cancelled = false;
    const folderId = data.currentId;
    const folderName = data.currentName;
    setScanning(true);
    (async () => {
      try {
        const token = await fetchDriveToken(folderId);
        const [localFiles, driveFiles] = await Promise.all([
          analyzeLocalFiles(files),
          listFolderFiles(folderId, token),
        ]);
        if (cancelled) return;
        setScan(classify({ folderId, folderName, localFiles, driveFiles }));
      } catch {
        if (!cancelled) setScan(null);
      } finally {
        if (!cancelled) setScanning(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, data?.currentId, hasRole]);





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

  async function runUpload(
    initialCompleted: Set<string>,
    opts: { deleteLeftovers?: LeftoverCandidate[] } = {},
  ) {
    if (!data) return;
    const folderId = data.currentId;
    const deletedPages: number[] = [];
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

    // ---- Confirmed leftover deletion (user-approved only) ----
    if (opts.deleteLeftovers?.length) {
      try {
        const token = await fetchDriveToken(folderId);
        for (const lf of opts.deleteLeftovers) {
          // Safety: the file must still live in THIS folder.
          if (!(await fileIsInFolder(lf.id, folderId, token))) continue;
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(lf.id)}?supportsAllDrives=true`,
            { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
          );
          if (res.ok || res.status === 404) deletedPages.push(lf.page);
        }
      } catch {
        /* deletion is best-effort; never block the upload */
      }
    }

    // Small batches should go out all at once — no artificial warm-up.
    const startConcurrency = Math.max(1, Math.min(12, pending.length));
    const ctrl = new AdaptiveConcurrencyController({
      start: startConcurrency,
      max: Math.max(2, Math.min(64, pending.length)),
      min: 1,
      successesToRamp: 2,
      stableWindowMs: 300,
      rampStep: 6,
      cooldownMs: 1000,
    });
    setStats(ctrl.stats());


    const done = { count: initialCompleted.size };
    // Byte-level progress: the bar moves as soon as the first byte leaves the
    // browser instead of waiting for the first whole file to finish.
    const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0) || 1;
    const bytesLoaded = new Map<string, number>();
    for (const f of files) if (initialCompleted.has(f.name)) bytesLoaded.set(f.name, f.file.size);
    let localCompleted: Set<string> = new Set(initialCompleted);
    const localFailed = new Map<string, string>();
    const reportProgress = () => {
      let loaded = 0;
      for (const v of bytesLoaded.values()) loaded += v;
      setProgress({
        done: localCompleted.size + localFailed.size,
        total: files.length,
        bytesDone: Math.min(loaded, totalBytes),
        bytesTotal: totalBytes,
      });
    };
    reportProgress();
    let cursor = 0;
    const activeNames = new Set<string>();
    const syncActive = () => setActive(new Set(activeNames));

    const isNetworkError = (e: unknown) =>
      e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);

    const UPLOAD_TIMEOUT_MS = 180_000;
    const MAX_ATTEMPTS = 5;
    /** Below this size a single multipart request beats a 2-round-trip resumable session. */
    const MULTIPART_LIMIT = 8 * 1024 * 1024;

    const httpError = (name: string, what: string, status: number, text: string) => {
      const err = new Error(`${what} for ${name} [${status}]: ${text.slice(0, 300)}`);
      (err as { status?: number }).status = status;
      return err;
    };

    /**
     * XHR-based upload with real byte-progress events (fetch cannot report
     * upload progress in most browsers). Reports loaded bytes per file so the
     * progress bar starts moving instantly instead of sitting at 0%.
     */
    const xhrSend = (
      method: string,
      url: string,
      headers: Record<string, string>,
      body: Blob | string,
      signal: AbortSignal,
      onProgress?: (loaded: number) => void,
    ): Promise<{ status: number; text: string }> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
        xhr.timeout = UPLOAD_TIMEOUT_MS;
        if (onProgress) {
          xhr.upload.onprogress = (e) => onProgress(e.loaded);
        }
        xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
        xhr.onerror = () => reject(new TypeError("Network request failed"));
        xhr.ontimeout = () => reject(new DOMException("Upload timed out", "AbortError"));
        xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
        if (signal.aborted) {
          xhr.abort();
          return;
        }
        signal.addEventListener("abort", () => xhr.abort(), { once: true });
        xhr.send(body);
      });

    /** Single-request upload (metadata + bytes together) — fastest path for images. */
    const uploadMultipart = async (file: Blob, name: string, token: string, signal: AbortSignal) => {
      const mime = file.type || "application/octet-stream";
      const boundary = `prp${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      const meta = JSON.stringify({ name, parents: [folderId], mimeType: mime });
      const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
        file,
        `\r\n--${boundary}--\r\n`,
      ]);
      const res = await xhrSend(
        "POST",
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",
        {
          authorization: `Bearer ${token}`,
          "content-type": `multipart/related; boundary=${boundary}`,
        },
        body,
        signal,
        (loaded) => {
          bytesLoaded.set(name, Math.min(loaded, file.size));
          reportProgress();
        },
      );
      if (res.status < 200 || res.status >= 300) throw httpError(name, "Upload failed", res.status, res.text);
      const json = (JSON.parse(res.text || "{}") as { id?: string });
      return json.id ?? null;
    };

    /** Resumable session — used for large files where a restart would be costly. */
    const uploadResumable = async (file: Blob, name: string, token: string, signal: AbortSignal) => {
      const mime = file.type || "application/octet-stream";
      const initRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": mime,
          },
          body: JSON.stringify({ name, parents: [folderId], mimeType: mime }),
          signal,
        },
      );
      if (!initRes.ok) throw httpError(name, "Drive init failed", initRes.status, await initRes.text());
      const location = initRes.headers.get("location");
      if (!location) throw new Error(`Drive did not return an upload URL for ${name}`);
      const putRes = await xhrSend(
        "PUT",
        location,
        { "content-type": mime },
        file,
        signal,
        (loaded) => {
          bytesLoaded.set(name, Math.min(loaded, file.size));
          reportProgress();
        },
      );
      if (putRes.status < 200 || putRes.status >= 300) throw httpError(name, "Upload failed", putRes.status, putRes.text);
      const json = (JSON.parse(putRes.text || "{}") as { id?: string });
      return json.id ?? null;
    };

    /** Direct browser -> Google Drive. No binary ever hits our backend. */
    const uploadDirect = async (file: Blob, name: string, force: boolean) => {
      const token = await fetchDriveToken(folderId, force);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
      try {
        if (file.size <= MULTIPART_LIMIT) {
          return await uploadMultipart(file, name, token, controller.signal);
        }
        return await uploadResumable(file, name, token, controller.signal);
      } finally {
        clearTimeout(timer);
      }
    };

    // ---- Duplicate replacement -------------------------------------------
    // Snapshot of what already lives in the target folder, fetched in parallel
    // with the first uploads so it never delays the start of the batch.
    // After each successful upload, every OLDER file with the same name is
    // trashed, so the folder always keeps exactly the latest version.
    const prescanned = scanRef.current;
    const existingByName = (async () => {
      // Reuse the pre-upload scan when it targets this same folder — no
      // repeated Drive search when the user presses Upload.
      if (prescanned && prescanned.folderId === folderId) {
        return new Map(Array.from(prescanned.existingByName, ([k, v]) => [k, [...v]]));
      }
      const map = new Map<string, string[]>();
      try {
        const token = await fetchDriveToken(folderId);
        let pageToken: string | undefined;
        do {
          const url = new URL("https://www.googleapis.com/drive/v3/files");
          url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
          url.searchParams.set("fields", "nextPageToken,files(id,name)");
          url.searchParams.set("pageSize", "1000");
          url.searchParams.set("supportsAllDrives", "true");
          url.searchParams.set("includeItemsFromAllDrives", "true");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const res = await fetch(url.toString(), {
            headers: { authorization: `Bearer ${token}` },
          });
          if (!res.ok) break;
          const json = (await res.json()) as {
            files?: { id: string; name: string }[];
            nextPageToken?: string;
          };
          for (const f of json.files ?? []) {
            const list = map.get(f.name);
            if (list) list.push(f.id);
            else map.set(f.name, [f.id]);
          }
          pageToken = json.nextPageToken;
        } while (pageToken);
      } catch {
        /* duplicate cleanup is best-effort; never block an upload */
      }
      return map;
    })();

    const cleanups = new Set<Promise<void>>();
    /** name -> newly created Drive file id, used for the batch history record. */
    const uploadedIds = new Map<string, string>();

    const removeOlderDuplicates = async (name: string, keepId: string | null) => {
      const map = await existingByName;
      const olds = map.get(name);
      if (!olds || olds.length === 0) return;
      map.delete(name); // only ever clean up the pre-existing copies once
      const token = await fetchDriveToken(folderId);
      await Promise.all(
        olds
          .filter((id) => id !== keepId)
          .map(async (id) => {
            try {
              await fetch(
                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`,
                { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
              );
            } catch {
              /* ignore */
            }
          }),
      );
    };

    const scheduleDuplicateCleanup = (name: string, keepId: string | null) => {
      const p = removeOlderDuplicates(name, keepId)
        .catch(() => {})
        .finally(() => cleanups.delete(p));
      cleanups.add(p);
    };

    /**
     * Final safety net: re-list the folder and, for every name we just
     * uploaded, keep only the most recently created file and delete the rest.
     * This catches duplicates created by a retried request whose first attempt
     * actually reached Drive.
     */
    const reconcileDuplicates = async (names: Set<string>) => {
      try {
        const token = await fetchDriveToken(folderId);
        const found = new Map<string, { id: string; created: string }[]>();
        let pageToken: string | undefined;
        do {
          const url = new URL("https://www.googleapis.com/drive/v3/files");
          url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
          url.searchParams.set("fields", "nextPageToken,files(id,name,createdTime)");
          url.searchParams.set("pageSize", "1000");
          url.searchParams.set("supportsAllDrives", "true");
          url.searchParams.set("includeItemsFromAllDrives", "true");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const res = await fetch(url.toString(), {
            headers: { authorization: `Bearer ${token}` },
          });
          if (!res.ok) return;
          const json = (await res.json()) as {
            files?: { id: string; name: string; createdTime?: string }[];
            nextPageToken?: string;
          };
          for (const f of json.files ?? []) {
            if (!names.has(f.name)) continue;
            const list = found.get(f.name) ?? [];
            list.push({ id: f.id, created: f.createdTime ?? "" });
            found.set(f.name, list);
          }
          pageToken = json.nextPageToken;
        } while (pageToken);

        const doomed: string[] = [];
        for (const list of found.values()) {
          if (list.length < 2) continue;
          list.sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0));
          doomed.push(...list.slice(1).map((f) => f.id));
        }
        await Promise.all(
          doomed.map(async (id) => {
            try {
              await fetch(
                `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`,
                { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
              );
            } catch {
              /* ignore */
            }
          }),
        );
      } catch {
        /* best effort */
      }
    };





    const uploadOne = async (file: Blob, name: string) => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (pausedRef.current) throw new Error("__paused__");
        try {
          const started = Date.now();
          const newId = await uploadDirect(file, name, attempt > 0);
          if (attempt > 0) ctrl.retryFinished();
          ctrl.recordSuccess(Date.now() - started);
          bytesLoaded.set(name, file.size);
          if (newId) uploadedIds.set(name, newId);
          reportProgress();
          scheduleDuplicateCleanup(name, newId ?? null);
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
            reportProgress();
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
      // Let the pending duplicate cleanups settle, then reconcile the folder so
      // that exactly ONE (the newest) copy of every uploaded name survives.
      await Promise.all(Array.from(cleanups));
      if (!pausedRef.current && localCompleted.size > 0) {
        await reconcileDuplicates(new Set(localCompleted));
      }



      if (!pausedRef.current) {
        // ---- Rolling upload history (newest 10 records per folder) ----
        if (localCompleted.size > 0) {
          const doneNames = Array.from(localCompleted);
          const pages = doneNames
            .map((n) => extractPageNumber(n))
            .filter((p): p is number => p != null);
          // Pages whose leftover file we just deleted are no longer in the folder.
          const livePages = pages.filter((p) => !deletedPages.includes(p));
          const fileIds: Record<string, string> = {};
          for (const n of doneNames) {
            const page = extractPageNumber(n);
            const id = uploadedIds.get(n);
            if (page != null && id) fileIds[String(page)] = id;
          }
          saveBatchRecord({
            folderId,
            folderName: data.currentName,
            at: Date.now(),
            pageStart: livePages.length ? Math.min(...livePages) : null,
            pageEnd: livePages.length ? Math.max(...livePages) : null,
            pages: Array.from(new Set(livePages)).sort((a, b) => a - b),
            fileIds,
            stems: Array.from(new Set(doneNames.map((n) => filenameStem(n)).filter(Boolean))),
            status: localFailed.size > 0 ? "partial" : "success",
          });
        }

        if (localFailed.size > 0) {
          setError(
            `${localFailed.size} file${localFailed.size === 1 ? "" : "s"} failed after retries. ${localCompleted.size} of ${files.length} uploaded — press Resume to retry only the failed ones.`,
          );
        } else {
          const deletedNote = deletedPages.length
            ? ` Removed ${deletedPages.length} leftover page${deletedPages.length === 1 ? "" : "s"} (${formatPages(deletedPages)}).`
            : "";
          setUploadDone(
            `Uploaded ${files.length} file${files.length === 1 ? "" : "s"} to "${data.currentName}".${deletedNote}`,
          );
          persistCompleted(folderId, new Set());
          setCompleted(new Set());
          setScan(null);
          // Fire-and-forget Gmail notification: one email per completed batch.
          void (async () => {
            const names = files.map((f) => f.name);
            await notifyBatchComplete({
              token: await getToken().catch(() => null),
              batchId: computeBatchId(folderId, names),
              folderName: data.currentName,
              rangeName: rangeName ?? null,
              pageRange: computePageRange(names),
              imageCount: files.length,
            });
          })();
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
    if (!pagesReady) {
      toast.info("Still detecting the next page for this folder — try again in a moment.");
      return;
    }
    if (sessionMode === "none") setSessionMode("direct");
    // Only interrupt when the scan found pages that look left over from a
    // related earlier upload into this same folder.
    if (scan && scan.folderId === data.currentId && scan.leftovers.length > 0) {
      setConfirmOpen(true);
      return;
    }
    await runUpload(completed);
  }

  async function confirmUpload(deleteLeftovers: boolean) {
    setConfirmOpen(false);
    const leftovers = scanRef.current?.leftovers ?? [];
    await runUpload(completed, deleteLeftovers ? { deleteLeftovers: leftovers } : {});
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
    <>
    {files.length > 0 && (
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
                      <span className="font-mono text-foreground">
                        {Math.min(100, Math.floor((progress.bytesDone / progress.bytesTotal) * 100))}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full transition-all duration-300",
                          paused ? "bg-amber-500" : "bg-primary"
                        )}
                        style={{ width: `${Math.min(100, (progress.bytesDone / progress.bytesTotal) * 100)}%` }}
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


                {/* Pre-upload analysis status + summary chips */}
                {files.length > 0 && !uploading && (scanning || scan) && (
                  <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-3">
                    <p className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                      {scanning ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          Analyzing selected files…
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          Upload analysis ready
                        </>
                      )}
                    </p>
                    {!scanning && scan && (
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium">
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                          {scan.fresh.length} new
                        </span>
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-500">
                          {scan.replace.length} will replace
                        </span>
                        {scan.leftovers.length > 0 && (
                          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                            {scan.leftovers.length} possible leftover ({formatPages(scan.leftovers.map((l) => l.page))})
                          </span>
                        )}
                        {scan.pageStart != null && scan.pageEnd != null && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                            Pages {scan.pageStart}–{scan.pageEnd}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Leftover confirmation */}
                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Possible leftover pages found</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-2">
                        <span className="block">
                          Your last upload to “{scan?.folderName}” included page
                          {(scan?.leftovers.length ?? 0) === 1 ? " " : "s "}
                          {formatPages((scan?.leftovers ?? []).map((l) => l.page))}, which this selection no longer covers.
                        </span>
                        <span className="block">
                          Keep them, or delete them from the folder while uploading the new files?
                        </span>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <Button variant="outline" onClick={() => void confirmUpload(false)}>
                        Upload and Keep
                      </Button>
                      <Button onClick={() => void confirmUpload(true)}>Delete and Upload</Button>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

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
                  <>
                    {!queueMode && (
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
                    <Button
                      size="lg"
                      variant={queueMode ? "default" : "outline"}
                      className={cn(
                        "h-11 w-full min-w-0 overflow-hidden px-3 font-semibold sm:px-8",
                        queueMode
                          ? "mt-4 h-12 border-0 bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)] hover:brightness-110"
                          : "mt-2",
                      )}
                      onClick={handleAddToQueue}
                      disabled={!data || files.length === 0}
                    >
                      <Layers className="h-4 w-4 shrink-0" />
                      <span className="shrink-0">Add to queue</span>
                      <span className="min-w-0 truncate text-muted-foreground">
                        · {data?.currentName ?? ""}
                      </span>
                    </Button>
                    {queueMode && (
                      <p className="mt-2 text-center text-[10px] text-muted-foreground">
                        This session is in queue mode — everything uploads together from the queue
                        below.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </SignedIn>
    </div>
    )}
    <SignedIn>
      {hasRole && (
        <UploadQueuePanel
          disabled={uploading}
          getToken={(folderId, force) => fetchDriveToken(folderId, force)}
          getClerkToken={() => getToken().catch(() => null)}
        />
      )}
    </SignedIn>
    </>
  );
}
