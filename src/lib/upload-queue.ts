// Temporary, in-memory multi-folder upload queue.
//
// Phase 2: queue building only — nothing here talks to Google Drive.
// Image blobs are snapshotted at "Add to Queue" time so later cropping or
// re-ordering in the renamer cannot change an already queued group.

import { useEffect, useState } from "react";
import { extractPageNumber, renameWithPage, setPageLabelLang, getPageLabelLang, type PageLabelLang } from "@/lib/upload-scan";

export type QueuedFile = { file: Blob; name: string };

export type QueueGroup = {
  id: string;
  folderId: string;
  folderName: string;
  rangeName: string | null;
  files: QueuedFile[];
  addedAt: number;
  pageStart: number | null;
  pageEnd: number | null;
  totalBytes: number;
  /** Phase 3: continue this destination folder's own page sequence. */
  autoNumber: boolean;
  /** First page assigned by the last pre-scan when autoNumber is on. */
  assignedStart: number | null;
};

let groups: QueueGroup[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

// ---- Upload session state -------------------------------------------------
// The mode belongs to the whole upload session, not to a single group, so it
// lives here (module scope) and survives the renamer clearing its images.

export type UploadSessionMode = "none" | "direct" | "queue";

export type CompletedGroupSummary = {
  folderName: string;
  count: number;
  pageStart: number | null;
  pageEnd: number | null;
};

export type CompletedSession = {
  at: number;
  totalImages: number;
  folderCount: number;
  groups: CompletedGroupSummary[];
};

let sessionMode: UploadSessionMode = "none";
let lastSession: CompletedSession | null = null;

export function getSessionMode(): UploadSessionMode {
  return sessionMode;
}

/** Lock the session into a mode. "queue" stays until an explicit reset. */
export function setSessionMode(mode: UploadSessionMode) {
  if (sessionMode === mode) return;
  sessionMode = mode;
  emit();
}

export function getLastSession(): CompletedSession | null {
  return lastSession;
}

/** Record a finished queue upload so the panel can show a success state. */
export function recordCompletedSession(summaries: CompletedGroupSummary[]) {
  if (summaries.length === 0) return;
  lastSession = {
    at: Date.now(),
    totalImages: summaries.reduce((s, g) => s + g.count, 0),
    folderCount: summaries.length,
    groups: summaries,
  };
  emit();
}

/** Explicit "start a new upload session" — clears mode and the last summary. */
export function resetUploadSession() {
  sessionMode = "none";
  lastSession = null;
  groups = [];
  emit();
}

/** Subscribe to session mode + last completed session. */
export function useUploadSession(): { mode: UploadSessionMode; lastSession: CompletedSession | null } {
  const [snapshot, setSnapshot] = useState<{
    mode: UploadSessionMode;
    lastSession: CompletedSession | null;
  }>({ mode: sessionMode, lastSession });
  useEffect(() => {
    const listener = () => setSnapshot({ mode: sessionMode, lastSession });
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return snapshot;
}

export function getQueue(): QueueGroup[] {
  return groups;
}

export function addGroup(input: {
  folderId: string;
  folderName: string;
  rangeName?: string | null;
  files: QueuedFile[];
}): QueueGroup {
  const pages = input.files
    .map((f) => extractPageNumber(f.name))
    .filter((p): p is number => p != null);
  const group: QueueGroup = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    folderId: input.folderId,
    folderName: input.folderName,
    rangeName: input.rangeName ?? null,
    // Snapshot the array so later edits upstream cannot mutate this group.
    files: input.files.map((f) => ({ file: f.file, name: f.name })),
    addedAt: Date.now(),
    pageStart: pages.length ? Math.min(...pages) : null,
    pageEnd: pages.length ? Math.max(...pages) : null,
    totalBytes: input.files.reduce((s, f) => s + f.file.size, 0),
    autoNumber: false,
    assignedStart: null,
  };
  groups = [...groups, group];
  emit();
  return group;
}

export function removeGroup(id: string) {
  groups = groups.filter((g) => g.id !== id);
  emit();
}

export function clearQueue() {
  groups = [];
  emit();
}

/** Phase 3: turn folder-wise automatic page numbering on/off for one group. */
export function setGroupAutoNumber(id: string, autoNumber: boolean) {
  groups = groups.map((g) => (g.id === id ? { ...g, autoNumber, assignedStart: null } : g));
  emit();
}

/** Record the start page a pre-scan assigned to an auto-numbered group. */
export function setAssignedStart(id: string, start: number | null) {
  groups = groups.map((g) => (g.id === id ? { ...g, assignedStart: start } : g));
  emit();
}

/**
 * Final Drive filenames for a group: the originals, or the folder-wise
 * renumbered names when auto numbering assigned a start page.
 */
export function groupUploadNames(g: QueueGroup): string[] {
  if (!g.autoNumber || g.assignedStart == null) return g.files.map((f) => f.name);
  return g.files.map((f, i) => renameWithPage(f.name, (g.assignedStart as number) + i));
}

/** Sync the Page Label Language so auto-numbered names re-render immediately. */
export function syncPageLabelLang(l: PageLabelLang) {
  if (getPageLabelLang() === l) return;
  setPageLabelLang(l);
  groups = [...groups];
  emit();
}

/** Total images across every queued group. */
export function queueFileCount(list: QueueGroup[] = groups): number {
  return list.reduce((s, g) => s + g.files.length, 0);
}

/** True when this exact file set is already queued for this folder. */
export function isAlreadyQueued(folderId: string, names: string[]): boolean {
  const key = [...names].sort().join("\u0000");
  return groups.some(
    (g) => g.folderId === folderId && [...g.files.map((f) => f.name)].sort().join("\u0000") === key,
  );
}

/** Subscribe a component to queue changes. */
export function useUploadQueue(): QueueGroup[] {
  const [snapshot, setSnapshot] = useState<QueueGroup[]>(groups);
  useEffect(() => {
    const listener = () => setSnapshot(groups);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return snapshot;
}
