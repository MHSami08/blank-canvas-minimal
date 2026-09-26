// Phase 3 + 4: folder-wise automatic page numbering and queue pre-scan.
//
// Nothing here writes to Google Drive — it only *reads* each destination
// folder once, assigns page numbers per folder, and reports what would be
// replaced, what is new, which pages look left over, and where two queued
// groups would collide.

import {
  classify,
  extractPageNumber,
  highestPage,
  listFolderFiles,
  renameWithPage,
  type DriveFileMeta,
  type LeftoverCandidate,
  type LocalFileMeta,
} from "@/lib/upload-scan";
import { setAssignedStart, type QueueGroup } from "@/lib/upload-queue";

export type GroupScan = {
  groupId: string;
  folderId: string;
  folderName: string;
  /** Final filenames that would be written to Drive. */
  names: string[];
  pageStart: number | null;
  pageEnd: number | null;
  renumbered: boolean;
  replaceCount: number;
  freshCount: number;
  leftovers: LeftoverCandidate[];
  /** Names that another earlier group in the same folder also writes. */
  collisions: string[];
  error: string | null;
};

export type QueueScan = {
  at: number;
  groups: GroupScan[];
  totalFiles: number;
  totalReplace: number;
  totalFresh: number;
  totalLeftovers: number;
  totalCollisions: number;
  folderCount: number;
  errors: string[];
};

function metaFor(names: string[], sizes: number[]): LocalFileMeta[] {
  return names.map((name, i) => ({
    name,
    page: extractPageNumber(name),
    ext: (/\.([^.]+)$/.exec(name)?.[1] ?? "").toLowerCase(),
    size: sizes[i] ?? 0,
    width: null,
    height: null,
    aspectRatio: null,
    hash: null,
  }));
}

/**
 * Scan every queued group. Each destination folder is listed only once, and
 * groups targeting the same folder are numbered in the order they were added.
 */
export async function prescanQueue(
  groups: QueueGroup[],
  getToken: (folderId: string) => Promise<string>,
): Promise<QueueScan> {
  const byFolder = new Map<string, QueueGroup[]>();
  for (const g of groups) {
    const list = byFolder.get(g.folderId) ?? [];
    list.push(g);
    byFolder.set(g.folderId, list);
  }

  const results: GroupScan[] = [];
  const errors: string[] = [];

  for (const [folderId, folderGroups] of byFolder) {
    let driveFiles: DriveFileMeta[] = [];
    let listError: string | null = null;
    try {
      const token = await getToken(folderId);
      driveFiles = await listFolderFiles(folderId, token);
    } catch (e) {
      listError = e instanceof Error ? e.message : String(e);
      errors.push(`${folderGroups[0].folderName}: ${listError}`);
    }

    // Folder-wise page cursor: continue after the highest page already in the
    // folder, then after every group queued before this one.
    let nextPage = highestPage(driveFiles) + 1;
    const writtenNames = new Set<string>();

    for (const g of folderGroups.sort((a, b) => a.addedAt - b.addedAt)) {
      let names = g.files.map((f) => f.name);
      let renumbered = false;
      if (g.autoNumber) {
        names = g.files.map((f, i) => renameWithPage(f.name, nextPage + i));
        setAssignedStart(g.id, nextPage);
        renumbered = true;
      } else {
        setAssignedStart(g.id, null);
      }

      const pages = names.map(extractPageNumber).filter((p): p is number => p != null);
      const maxPage = pages.length ? Math.max(...pages) : nextPage - 1;
      nextPage = Math.max(nextPage + (renumbered ? g.files.length : 0), maxPage + 1);

      const collisions = names.filter((n) => writtenNames.has(n));
      for (const n of names) writtenNames.add(n);

      const local = metaFor(names, g.files.map((f) => f.file.size));
      const classified = classify({
        folderId,
        folderName: g.folderName,
        localFiles: local,
        driveFiles,
      });

      results.push({
        groupId: g.id,
        folderId,
        folderName: g.folderName,
        names,
        pageStart: pages.length ? Math.min(...pages) : null,
        pageEnd: pages.length ? Math.max(...pages) : null,
        renumbered,
        replaceCount: classified.replace.length,
        freshCount: classified.fresh.length,
        leftovers: listError ? [] : classified.leftovers,
        collisions,
        error: listError,
      });
    }
  }

  // Keep the queue's original order in the report.
  const order = new Map(groups.map((g, i) => [g.id, i]));
  results.sort((a, b) => (order.get(a.groupId) ?? 0) - (order.get(b.groupId) ?? 0));

  return {
    at: Date.now(),
    groups: results,
    totalFiles: results.reduce((s, r) => s + r.names.length, 0),
    totalReplace: results.reduce((s, r) => s + r.replaceCount, 0),
    totalFresh: results.reduce((s, r) => s + r.freshCount, 0),
    totalLeftovers: results.reduce((s, r) => s + r.leftovers.length, 0),
    totalCollisions: results.reduce((s, r) => s + r.collisions.length, 0),
    folderCount: byFolder.size,
    errors,
  };
}
