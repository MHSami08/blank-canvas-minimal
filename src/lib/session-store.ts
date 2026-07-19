// Session persistence using IndexedDB (files) via idb-keyval.
import { get, set, del, createStore } from "idb-keyval";

const store = createStore("page-renamer-session", "kv");
const SESSION_KEY = "session-v1";

export type SavedItem = {
  id: string;
  originalName: string;
  ext: string;
  sig: string;
  uploadOrder: number;
  cropped?: boolean;
  originalFile: Blob;
  file: Blob; // current (possibly cropped) file
};

export type SavedSession = {
  savedAt: number;
  items: SavedItem[];
  baseName: string;
  startPage: string;
  lang: "en" | "bn";
  orderCounter: number;
};

export async function saveSession(s: SavedSession): Promise<void> {
  try {
    await set(SESSION_KEY, s, store);
  } catch (e) {
    console.warn("Session save failed", e);
  }
}

export async function loadSession(): Promise<SavedSession | null> {
  try {
    const v = await get<SavedSession>(SESSION_KEY, store);
    return v ?? null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try { await del(SESSION_KEY, store); } catch { /* ignore */ }
}

export async function hasSession(): Promise<boolean> {
  const s = await loadSession();
  return !!(s && s.items && s.items.length > 0);
}
