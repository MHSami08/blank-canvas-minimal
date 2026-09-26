// Phase 5 + 6 + 7 — multi-folder queue upload engine.
//
// Uploads every queued group to its own destination folder, one group at a
// time, with the same adaptive parallel worker pool, retry, duplicate
// replacement, verification, batch history and Gmail notification behaviour
// the single-folder uploader already uses. Binaries go straight from the
// browser to Google Drive; nothing passes through our backend.

import {
  AdaptiveConcurrencyController,
  classifyError,
} from "@/lib/adaptive-concurrency";
import { computeBatchId, computePageRange, notifyBatchComplete } from "@/lib/notify-client";
import {
  extractPageNumber,
  fileIsInFolder,
  filenameStem,
  saveBatchRecord,
  type LeftoverCandidate,
} from "@/lib/upload-scan";
import { groupUploadNames, type QueueGroup } from "@/lib/upload-queue";

export type GroupStatus =
  | "pending"
  | "uploading"
  | "verifying"
  | "done"
  | "partial"
  | "failed"
  | "paused";

export type GroupProgress = {
  groupId: string;
  folderId: string;
  folderName: string;
  status: GroupStatus;
  total: number;
  done: number;
  bytesTotal: number;
  bytesDone: number;
  failed: { name: string; message: string }[];
  verified: number;
  missing: string[];
  concurrency: number;
  error: string | null;
};

export type QueueUploadState = {
  groups: GroupProgress[];
  totalFiles: number;
  doneFiles: number;
  bytesTotal: number;
  bytesDone: number;
  finished: boolean;
};

export type QueueUploadResult = {
  uploaded: number;
  failed: number;
  groups: GroupProgress[];
};

type RunOptions = {
  groups: QueueGroup[];
  /** Final Drive filenames per group id, from the pre-scan. */
  namesByGroup?: Map<string, string[]>;
  /** Leftover Drive files the user approved for deletion, per group id. */
  leftoversByGroup?: Map<string, LeftoverCandidate[]>;
  getDriveToken: (folderId: string, force?: boolean) => Promise<string>;
  getClerkToken: () => Promise<string | null>;
  onState: (state: QueueUploadState) => void;
  isPaused: () => boolean;
};

const UPLOAD_TIMEOUT_MS = 180_000;
const MAX_ATTEMPTS = 5;
const MULTIPART_LIMIT = 8 * 1024 * 1024;

function httpError(name: string, what: string, status: number, text: string) {
  const err = new Error(`${what} for ${name} [${status}]: ${text.slice(0, 300)}`);
  (err as { status?: number }).status = status;
  return err;
}

function isNetworkError(e: unknown) {
  return e instanceof TypeError || (typeof navigator !== "undefined" && !navigator.onLine);
}

function xhrSend(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: Blob | string,
  signal: AbortSignal,
  onProgress?: (loaded: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    if (onProgress) xhr.upload.onprogress = (e) => onProgress(e.loaded);
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
}

/** name -> ids currently in a folder, plus createdTime for reconciliation. */
async function listFolderIndex(
  folderId: string,
  token: string,
): Promise<Map<string, { id: string; created: string }[]>> {
  const map = new Map<string, { id: string; created: string }[]>();
  let pageToken: string | undefined;
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,createdTime)");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Drive list failed [${res.status}]: ${await res.text()}`);
    const json = (await res.json()) as {
      files?: { id: string; name: string; createdTime?: string }[];
      nextPageToken?: string;
    };
    for (const f of json.files ?? []) {
      const list = map.get(f.name) ?? [];
      list.push({ id: f.id, created: f.createdTime ?? "" });
      map.set(f.name, list);
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return map;
}

async function deleteFile(id: string, token: string) {
  try {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`,
      { method: "DELETE", headers: { authorization: `Bearer ${token}` } },
    );
  } catch {
    /* best effort */
  }
}

export async function runQueueUpload(opts: RunOptions): Promise<QueueUploadResult> {
  const { groups, getDriveToken, getClerkToken, onState, isPaused } = opts;

  const progress: GroupProgress[] = groups.map((g) => ({
    groupId: g.id,
    folderId: g.folderId,
    folderName: g.folderName,
    status: "pending",
    total: g.files.length,
    done: 0,
    bytesTotal: g.totalBytes,
    bytesDone: 0,
    failed: [],
    verified: 0,
    missing: [],
    concurrency: 0,
    error: null,
  }));

  const emit = (finished = false) => {
    onState({
      groups: progress.map((p) => ({ ...p, failed: [...p.failed], missing: [...p.missing] })),
      totalFiles: progress.reduce((s, p) => s + p.total, 0),
      doneFiles: progress.reduce((s, p) => s + p.done, 0),
      bytesTotal: progress.reduce((s, p) => s + p.bytesTotal, 0),
      bytesDone: progress.reduce((s, p) => s + p.bytesDone, 0),
      finished,
    });
  };
  emit();

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const state = progress[gi];
    if (isPaused()) {
      state.status = "paused";
      emit();
      break;
    }

    const names = opts.namesByGroup?.get(g.id) ?? groupUploadNames(g);
    const items = g.files.map((f, i) => ({ file: f.file, name: names[i] ?? f.name }));
    const folderId = g.folderId;

    state.status = "uploading";
    emit();

    // Snapshot the folder once: used for duplicate replacement and verification.
    let existing: Map<string, { id: string; created: string }[]> = new Map();
    try {
      existing = await listFolderIndex(folderId, await getDriveToken(folderId));
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
    }

    // ---- Approved leftover deletion --------------------------------------
    const deletedPages: number[] = [];
    const leftovers = opts.leftoversByGroup?.get(g.id) ?? [];
    if (leftovers.length > 0) {
      try {
        const token = await getDriveToken(folderId);
        for (const lf of leftovers) {
          if (!(await fileIsInFolder(lf.id, folderId, token))) continue;
          await deleteFile(lf.id, token);
          deletedPages.push(lf.page);
        }
      } catch {
        /* never block the upload */
      }
    }

    const bytesLoaded = new Map<string, number>();
    const completed = new Set<string>();
    const failedMap = new Map<string, string>();
    const uploadedIds = new Map<string, string>();

    const report = () => {
      let loaded = 0;
      for (const v of bytesLoaded.values()) loaded += v;
      state.bytesDone = Math.min(loaded, state.bytesTotal);
      state.done = completed.size + failedMap.size;
      state.failed = Array.from(failedMap, ([name, message]) => ({ name, message }));
      emit();
    };

    const ctrl = new AdaptiveConcurrencyController({
      start: Math.max(1, Math.min(12, items.length)),
      max: Math.max(2, Math.min(64, items.length)),
      min: 1,
      successesToRamp: 2,
      stableWindowMs: 300,
      rampStep: 6,
      cooldownMs: 1000,
    });

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
          report();
        },
      );
      if (res.status < 200 || res.status >= 300)
        throw httpError(name, "Upload failed", res.status, res.text);
      return (JSON.parse(res.text || "{}") as { id?: string }).id ?? null;
    };

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
      if (!initRes.ok)
        throw httpError(name, "Drive init failed", initRes.status, await initRes.text());
      const location = initRes.headers.get("location");
      if (!location) throw new Error(`Drive did not return an upload URL for ${name}`);
      const putRes = await xhrSend("PUT", location, { "content-type": mime }, file, signal, (loaded) => {
        bytesLoaded.set(name, Math.min(loaded, file.size));
        report();
      });
      if (putRes.status < 200 || putRes.status >= 300)
        throw httpError(name, "Upload failed", putRes.status, putRes.text);
      return (JSON.parse(putRes.text || "{}") as { id?: string }).id ?? null;
    };

    const uploadDirect = async (file: Blob, name: string, force: boolean) => {
      const token = await getDriveToken(folderId, force);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
      try {
        if (file.size <= MULTIPART_LIMIT)
          return await uploadMultipart(file, name, token, controller.signal);
        return await uploadResumable(file, name, token, controller.signal);
      } finally {
        clearTimeout(timer);
      }
    };

    // Replace: trash pre-existing copies of a name once its new version lands.
    const cleanups = new Set<Promise<void>>();
    const scheduleCleanup = (name: string, keepId: string | null) => {
      const olds = existing.get(name);
      if (!olds || olds.length === 0) return;
      existing.delete(name);
      const p = (async () => {
        const token = await getDriveToken(folderId);
        await Promise.all(
          olds.filter((o) => o.id !== keepId).map((o) => deleteFile(o.id, token)),
        );
      })()
        .catch(() => {})
        .finally(() => cleanups.delete(p));
      cleanups.add(p);
    };

    const uploadOne = async (file: Blob, name: string) => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (isPaused()) throw new Error("__paused__");
        try {
          const started = Date.now();
          const newId = await uploadDirect(file, name, attempt > 0);
          if (attempt > 0) ctrl.retryFinished();
          ctrl.recordSuccess(Date.now() - started);
          bytesLoaded.set(name, file.size);
          if (newId) uploadedIds.set(name, newId);
          scheduleCleanup(name, newId ?? null);
          report();
          return;
        } catch (e) {
          if (isPaused()) throw new Error("__paused__");
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
          state.concurrency = ctrl.concurrency;
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt) + Math.random() * 250));
        }
      }
    };

    // ---- Adaptive worker pool -------------------------------------------
    let cursor = 0;
    let activeWorkers = 0;
    const running = new Set<Promise<void>>();

    const spawnWorkers = () => {
      while (!isPaused() && activeWorkers < ctrl.concurrency && cursor < items.length) {
        const p = worker().finally(() => running.delete(p));
        running.add(p);
      }
    };

    const worker = async (): Promise<void> => {
      activeWorkers++;
      try {
        for (;;) {
          if (isPaused()) return;
          if (activeWorkers > ctrl.concurrency) return;
          const i = cursor++;
          if (i >= items.length) return;
          const { file, name } = items[i];
          if (completed.has(name)) continue;
          try {
            await uploadOne(file, name);
            completed.add(name);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg === "__paused__") return;
            failedMap.set(name, msg);
          } finally {
            state.concurrency = ctrl.concurrency;
            report();
          }
        }
      } finally {
        activeWorkers--;
        spawnWorkers();
      }
    };

    try {
      spawnWorkers();
      while (running.size > 0) await Promise.all(Array.from(running));
      await Promise.all(Array.from(cleanups));
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
    }

    if (isPaused() && completed.size + failedMap.size < items.length) {
      state.status = "paused";
      emit();
      break;
    }

    // ---- Phase 6: verification (+ one repair pass) -----------------------
    state.status = "verifying";
    emit();
    try {
      const token = await getDriveToken(folderId);
      let index = await listFolderIndex(folderId, token);
      let missing = Array.from(completed).filter((n) => !index.has(n));

      if (missing.length > 0) {
        // Re-upload the files Drive does not actually have.
        for (const name of missing) {
          const item = items.find((it) => it.name === name);
          if (!item) continue;
          try {
            await uploadOne(item.file, item.name);
          } catch (e) {
            completed.delete(name);
            failedMap.set(name, e instanceof Error ? e.message : String(e));
          }
        }
        index = await listFolderIndex(folderId, await getDriveToken(folderId));
        missing = Array.from(completed).filter((n) => !index.has(n));
        for (const name of missing) {
          completed.delete(name);
          failedMap.set(name, "Not found in Drive after upload");
        }
      }

      // Keep exactly one (newest) copy of every uploaded name.
      const doomed: string[] = [];
      for (const [name, list] of index) {
        if (!completed.has(name) || list.length < 2) continue;
        const sorted = [...list].sort((a, b) =>
          a.created < b.created ? 1 : a.created > b.created ? -1 : 0,
        );
        doomed.push(...sorted.slice(1).map((f) => f.id));
      }
      if (doomed.length > 0) {
        const t = await getDriveToken(folderId);
        await Promise.all(doomed.map((id) => deleteFile(id, t)));
      }

      state.verified = Array.from(completed).filter((n) => index.has(n)).length;
      state.missing = missing;
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
    }

    report();
    state.status =
      failedMap.size === 0 ? "done" : completed.size > 0 ? "partial" : "failed";
    emit();

    // ---- Phase 7: batch history + Gmail notification ---------------------
    if (completed.size > 0) {
      const doneNames = Array.from(completed);
      const pages = doneNames
        .map((n) => extractPageNumber(n))
        .filter((p): p is number => p != null)
        .filter((p) => !deletedPages.includes(p));
      const fileIds: Record<string, string> = {};
      for (const n of doneNames) {
        const page = extractPageNumber(n);
        const id = uploadedIds.get(n);
        if (page != null && id) fileIds[String(page)] = id;
      }
      saveBatchRecord({
        folderId,
        folderName: g.folderName,
        at: Date.now(),
        pageStart: pages.length ? Math.min(...pages) : null,
        pageEnd: pages.length ? Math.max(...pages) : null,
        pages: Array.from(new Set(pages)).sort((a, b) => a - b),
        fileIds,
        stems: Array.from(new Set(doneNames.map((n) => filenameStem(n)).filter(Boolean))),
        status: failedMap.size > 0 ? "partial" : "success",
      });

      // One email per group, fire-and-forget; never affects the upload result.
      void (async () => {
        await notifyBatchComplete({
          token: await getClerkToken().catch(() => null),
          batchId: computeBatchId(folderId, doneNames),
          folderName: g.folderName,
          rangeName: g.rangeName ?? null,
          pageRange: computePageRange(doneNames),
          imageCount: doneNames.length,
        });
      })();
    }
  }

  emit(true);
  return {
    uploaded: progress.reduce((s, p) => s + (p.done - p.failed.length), 0),
    failed: progress.reduce((s, p) => s + p.failed.length, 0),
    groups: progress,
  };
}
