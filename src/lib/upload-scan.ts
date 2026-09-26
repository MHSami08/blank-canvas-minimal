// Lightweight pre-upload scanning, page-number extraction and rolling
// upload-batch history. Everything here is metadata only — image binaries are
// never stored.

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Normalize Bangla numerals to ASCII so page numbers parse in either language. */
export function normalizeDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const i = BN_DIGITS.indexOf(ch);
    out += i >= 0 ? String(i) : ch;
  }
  return out;
}

/** Page number = last number group in the filename (extension removed). */
export function extractPageNumber(filename: string): number | null {
  const base = normalizeDigits(filename).replace(/\.[^.]+$/, "");
  const matches = base.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const n = parseInt(matches[matches.length - 1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Replace the trailing page number in a filename, keeping the original
 * zero-padding width, the stem and the extension untouched.
 * Falls back to appending " Page-NN" when the name has no number at all.
 */
export type PageLabelLang = "en" | "bn";
let pageLabelLang: PageLabelLang = "bn";
/** The user's Page Label Language — single source of truth for generated labels. */
export function setPageLabelLang(l: PageLabelLang) {
  pageLabelLang = l;
}
export function getPageLabelLang(): PageLabelLang {
  return pageLabelLang;
}
const BN = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
export function formatPageLabel(page: number, lang: PageLabelLang = pageLabelLang, width = 2): string {
  const num = String(page).padStart(width, "0");
  if (lang === "bn") return `পৃষ্ঠা-${num.replace(/\d/g, (d) => BN[Number(d)])}`;
  return `Page-${num}`;
}

export function renameWithPage(filename: string, page: number, lang: PageLabelLang = pageLabelLang): string {
  const extMatch = /\.[^.]+$/.exec(filename);
  const ext = extMatch ? extMatch[0] : "";
  const base = filename.slice(0, filename.length - ext.length);
  const normalized = normalizeDigits(base);
  // Known label ("Page-NN" / "পৃষ্ঠা-NN"): rebuild it in the selected language.
  const labelRe = /(Page|পৃষ্ঠা)\s*-\s*(\d+)\s*$/i;
  const lm = labelRe.exec(normalized);
  if (lm) {
    const width = Math.max(2, lm[2].length);
    return base.slice(0, lm.index) + formatPageLabel(page, lang, width) + ext;
  }
  const matches = normalized.match(/\d+/g);
  if (!matches || matches.length === 0) return `${base}  ${formatPageLabel(page, lang)}${ext}`;
  const last = matches[matches.length - 1];
  const idx = normalized.lastIndexOf(last);
  let padded = String(page).padStart(last.length, "0");
  if (lang === "bn") padded = padded.replace(/\d/g, (d) => BN[Number(d)]);
  return base.slice(0, idx) + padded + base.slice(idx + last.length) + ext;
}

/** Highest page number currently present in a folder's files. */
export function highestPage(files: { page: number | null }[]): number {
  let max = 0;
  for (const f of files) if (f.page != null && f.page > max) max = f.page;
  return max;
}

/**
 * Shared, folder-based starting-page resolver used by every upload workflow
 * (direct, queue, multi-group). A user-provided page always wins; otherwise
 * the destination folder is scanned and the next page after the highest one
 * (also counting pages already reserved, e.g. by queued groups) is used.
 * Only the number is resolved here — the label language is applied later.
 */
export async function resolveStartingPage(params: {
  folderId: string;
  userProvidedPage: number | null;
  token: string;
  reservedPages?: number[];
}): Promise<{ start: number; latest: number; source: "user" | "auto" }> {
  const { folderId, userProvidedPage, token, reservedPages = [] } = params;
  if (userProvidedPage != null && Number.isInteger(userProvidedPage) && userProvidedPage >= 0) {
    return { start: userProvidedPage, latest: 0, source: "user" };
  }
  const files = await listFolderFiles(folderId, token);
  const latest = Math.max(highestPage(files), ...reservedPages, 0);
  return { start: latest + 1, latest, source: "auto" };
}


export function fileExtension(filename: string): string {
  const m = /\.([^.]+)$/.exec(filename);
  return m ? m[1].toLowerCase() : "";
}

/** Base name without the trailing page number, used to relate filenames. */
export function filenameStem(filename: string): string {
  const base = normalizeDigits(filename).replace(/\.[^.]+$/, "");
  return base.replace(/[\s\-_]*\d+\s*$/, "").trim().toLowerCase();
}

export type LocalFileMeta = {
  name: string;
  page: number | null;
  ext: string;
  size: number;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  hash: string | null;
};

export type DriveFileMeta = {
  id: string;
  name: string;
  page: number | null;
  modifiedTime?: string;
};

export type LeftoverCandidate = DriveFileMeta & { page: number };

export type ScanResult = {
  folderId: string;
  folderName: string;
  /** name -> drive file ids present in the target folder */
  existingByName: Map<string, string[]>;
  driveFiles: DriveFileMeta[];
  localFiles: LocalFileMeta[];
  replace: LocalFileMeta[];
  fresh: LocalFileMeta[];
  leftovers: LeftoverCandidate[];
  relatedBatch: BatchRecord | null;
  pageStart: number | null;
  pageEnd: number | null;
};

// ---------------------------------------------------------------- history --

export type BatchRecord = {
  folderId: string;
  folderName: string;
  at: number;
  pageStart: number | null;
  pageEnd: number | null;
  pages: number[];
  /** page -> drive file id (only when known) */
  fileIds?: Record<string, string>;
  stems: string[];
  status: "success" | "partial";
};

const HISTORY_KEY = "drive-batch-history-v1";
const MAX_PER_FOLDER = 10;

function readAll(): BatchRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as BatchRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(records: BatchRecord[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
  } catch {
    /* ignore quota errors — history is an optimization, not a requirement */
  }
}

export function getFolderHistory(folderId: string): BatchRecord[] {
  return readAll()
    .filter((r) => r.folderId === folderId)
    .sort((a, b) => b.at - a.at);
}

/** Save a record, then keep only the newest 10 records for that folder. */
export function saveBatchRecord(record: BatchRecord) {
  const all = [...readAll(), record];
  const keep: BatchRecord[] = [];
  const byFolder = new Map<string, BatchRecord[]>();
  for (const r of all) {
    const list = byFolder.get(r.folderId) ?? [];
    list.push(r);
    byFolder.set(r.folderId, list);
  }
  for (const list of byFolder.values()) {
    list.sort((a, b) => b.at - a.at);
    keep.push(...list.slice(0, MAX_PER_FOLDER));
  }
  writeAll(keep);
}

// ------------------------------------------------------------- local meta --

async function hashHead(blob: Blob): Promise<string | null> {
  try {
    if (!crypto?.subtle) return null;
    const head = blob.slice(0, 256 * 1024);
    const digest = await crypto.subtle.digest("SHA-256", await head.arrayBuffer());
    return Array.from(new Uint8Array(digest).slice(0, 8))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

async function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  try {
    if (typeof createImageBitmap !== "function" || !blob.type.startsWith("image/")) return null;
    const bmp = await createImageBitmap(blob);
    const out = { width: bmp.width, height: bmp.height };
    bmp.close?.();
    return out;
  } catch {
    return null;
  }
}

export async function analyzeLocalFiles(
  files: { file: Blob; name: string }[],
  opts: { maxDeep?: number } = {},
): Promise<LocalFileMeta[]> {
  const maxDeep = opts.maxDeep ?? 60;
  return Promise.all(
    files.map(async (f, i) => {
      const deep = i < maxDeep;
      const [dims, hash] = deep
        ? await Promise.all([imageSize(f.file), hashHead(f.file)])
        : [null, null];
      return {
        name: f.name,
        page: extractPageNumber(f.name),
        ext: fileExtension(f.name),
        size: f.file.size,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        aspectRatio: dims ? Number((dims.width / dims.height).toFixed(4)) : null,
        hash,
      } satisfies LocalFileMeta;
    }),
  );
}

// ------------------------------------------------------------ drive listing --

export async function listFolderFiles(
  folderId: string,
  token: string,
): Promise<DriveFileMeta[]> {
  const out: DriveFileMeta[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", `'${folderId}' in parents and trashed=false`);
    url.searchParams.set("fields", "nextPageToken,files(id,name,modifiedTime)");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Drive list failed [${res.status}]: ${await res.text()}`);
    const json = (await res.json()) as {
      files?: { id: string; name: string; modifiedTime?: string }[];
      nextPageToken?: string;
    };
    for (const f of json.files ?? []) {
      out.push({
        id: f.id,
        name: f.name,
        page: extractPageNumber(f.name),
        modifiedTime: f.modifiedTime,
      });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

// ---------------------------------------------------------- classification --

/**
 * Pick the most recent history record for this folder whose page range
 * overlaps the new selection (and whose filenames look related).
 */
export function findRelatedBatch(
  folderId: string,
  pages: number[],
  stems: string[],
): BatchRecord | null {
  if (pages.length === 0) return null;
  const min = Math.min(...pages);
  const max = Math.max(...pages);
  const stemSet = new Set(stems);
  for (const rec of getFolderHistory(folderId)) {
    if (rec.pageStart == null || rec.pageEnd == null) continue;
    const overlaps = rec.pageStart <= max && rec.pageEnd >= min;
    if (!overlaps) continue;
    const stemMatch =
      rec.stems.length === 0 || rec.stems.some((s) => stemSet.has(s)) || stemSet.size === 0;
    if (!stemMatch) continue;
    return rec;
  }
  return null;
}

export function classify(params: {
  folderId: string;
  folderName: string;
  localFiles: LocalFileMeta[];
  driveFiles: DriveFileMeta[];
}): ScanResult {
  const { folderId, folderName, localFiles, driveFiles } = params;

  const existingByName = new Map<string, string[]>();
  for (const f of driveFiles) {
    const list = existingByName.get(f.name);
    if (list) list.push(f.id);
    else existingByName.set(f.name, [f.id]);
  }

  const replace: LocalFileMeta[] = [];
  const fresh: LocalFileMeta[] = [];
  for (const f of localFiles) {
    if (existingByName.has(f.name)) replace.push(f);
    else fresh.push(f);
  }

  const pages = localFiles.map((f) => f.page).filter((p): p is number => p != null);
  const stems = Array.from(new Set(localFiles.map((f) => filenameStem(f.name)).filter(Boolean)));
  const pageStart = pages.length ? Math.min(...pages) : null;
  const pageEnd = pages.length ? Math.max(...pages) : null;

  const relatedBatch = findRelatedBatch(folderId, pages, stems);

  // Leftovers: pages that the related previous batch uploaded but the new
  // selection no longer covers. Only files actually present in this folder,
  // and only inside the previous batch's own page range — never beyond it.
  const leftovers: LeftoverCandidate[] = [];
  if (relatedBatch) {
    const newPages = new Set(pages);
    const newNames = new Set(localFiles.map((f) => f.name));
    const stemSet = new Set(stems);
    for (const prevPage of relatedBatch.pages) {
      if (newPages.has(prevPage)) continue;
      const candidates = driveFiles.filter(
        (d) =>
          d.page === prevPage &&
          !newNames.has(d.name) &&
          (stemSet.size === 0 || stemSet.has(filenameStem(d.name))),
      );
      for (const c of candidates) {
        const mappedId = relatedBatch.fileIds?.[String(prevPage)];
        // Extra confidence: if the batch mapped a file id, prefer that exact file.
        if (mappedId && c.id !== mappedId) continue;
        leftovers.push({ ...c, page: prevPage });
      }
    }
  }

  return {
    folderId,
    folderName,
    existingByName,
    driveFiles,
    localFiles,
    replace,
    fresh,
    leftovers,
    relatedBatch,
    pageStart,
    pageEnd,
  };
}

/** Compact "5, 7-10" style summary for page lists. */
export function formatPages(pages: number[]): string {
  const sorted = Array.from(new Set(pages)).sort((a, b) => a - b);
  if (sorted.length === 0) return "—";
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    start = cur;
    prev = cur;
  }
  return parts.join(", ");
}

/** Safety check before deleting: the file must still live in the target folder. */
export async function fileIsInFolder(
  fileId: string,
  folderId: string,
  token: string,
): Promise<boolean> {
  try {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
    url.searchParams.set("fields", "id,parents,trashed");
    url.searchParams.set("supportsAllDrives", "true");
    const res = await fetch(url.toString(), { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) return false;
    const json = (await res.json()) as { parents?: string[]; trashed?: boolean };
    return !json.trashed && (json.parents ?? []).includes(folderId);
  } catch {
    return false;
  }
}
