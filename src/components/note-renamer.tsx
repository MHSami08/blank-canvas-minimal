import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import Cropper, { type Area } from "react-easy-crop";
import { Footer } from "@/components/footer";
import { DriveUpload } from "@/components/drive-upload";
import { toast } from "sonner";
import { collectDroppedImages } from "@/lib/collect-dropped-images";

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import {
  GripVertical,
  Trash2,
  UploadCloud,
  Download,
  CheckCircle2,
  Sparkles,
  Languages,
  AlertCircle,
  Lock,
  Undo2,
  Eye,
  Crop as CropIcon,
  X,
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  MoreVertical,
  Settings as SettingsIcon,
} from "lucide-react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  clearSession,
  loadSession,
  saveSession,
  type SavedSession,
} from "@/lib/session-store";

type ImgItem = {
  id: string;
  file: File;
  url: string;
  originalFile: File;
  originalUrl: string;
  originalName: string;
  ext: string;
  sig: string;
  uploadOrder: number;
  cropped?: boolean;
};

const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ACCEPTED_EXT = /\.(jpe?g|png|webp)$/i;

function getExt(name: string) {
  const m = name.match(/\.([^.]+)$/);
  return m ? m[1].toLowerCase() : "jpg";
}

async function fileSignature(f: File): Promise<string> {
  try {
    const buf = await f.slice(0, 256 * 1024).arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", buf);
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `${f.size}-${hex}`;
  } catch {
    return `${f.size}-${f.name}-${f.lastModified}`;
  }
}

type Lang = "en" | "bn";

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

function toBnDigits(n: number) {
  return String(n)
    .split("")
    .map((c) => (/\d/.test(c) ? BN_DIGITS[Number(c)] : c))
    .join("");
}

function pageLabel(n: number, lang: Lang) {
  // সংখ্যা ১০ এর কম হলে সামনে '0' যোগ করবে, অন্যথায় যা আছে তাই রাখবে
  const formattedNum = n < 10 ? `0${n}` : String(n);
  
  // ল্যাঙ্গুয়েজ অনুযায়ী বাংলা বা ইংরেজিতে কনভার্ট করবে
  if (lang === "bn") {
    const bnNum = formattedNum
      .split("")
      .map((c) => (/\d/.test(c) ? BN_DIGITS[Number(c)] : c))
      .join("");
    return `পৃষ্ঠা-${bnNum}`;
  }
  
  return `Page-${formattedNum}`;
}

function buildFileName(base: string, page: number, ext: string, lang: Lang) {
  return `${base.trim()}  ${pageLabel(page, lang)}.${ext}`;
}

function renumberItems(list: ImgItem[]): ImgItem[] {
  const rank = [...list]
    .sort((a, b) => a.uploadOrder - b.uploadOrder)
    .reduce((m, it, i) => { m.set(it.id, i + 1); return m; }, new Map<string, number>());
  return list.map((it) => ({ ...it, uploadOrder: rank.get(it.id)! }));
}

type RemovedItem = { item: ImgItem; index: number };

type RatioPreset = { label: string; value: number | null };
const RATIO_PRESETS: RatioPreset[] = [
  { label: "Custom", value: null },
  { label: "1:1", value: 1 },
  { label: "3:4", value: 3 / 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "9:16", value: 9 / 16 },
  { label: "16:9", value: 16 / 9 },
  { label: "2:3", value: 2 / 3 },
  { label: "3:2", value: 3 / 2 },
];

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase();
  if (e === "png") return "image/png";
  if (e === "webp") return "image/webp";
  return "image/jpeg";
}

async function loadImageBitmap(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

type CropArea = { x: number; y: number; width: number; height: number };

async function cropFileToArea(file: File, ext: string, area: CropArea, rotation = 0, flipH = false): Promise<File> {
  const img = await loadImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(area.width);
  canvas.height = Math.round(area.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  const needsTransform = rotation !== 0 || flipH;
  if (!needsTransform) {
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  } else {
    // Draw the full image transformed onto an offscreen canvas, then crop.
    const rad = (rotation * Math.PI) / 180;
    const abs = Math.abs;
    const sin = abs(Math.sin(rad));
    const cos = abs(Math.cos(rad));
    const bw = img.naturalWidth * cos + img.naturalHeight * sin;
    const bh = img.naturalWidth * sin + img.naturalHeight * cos;
    const off = document.createElement("canvas");
    off.width = bw;
    off.height = bh;
    const octx = off.getContext("2d")!;
    octx.translate(bw / 2, bh / 2);
    octx.rotate(rad);
    octx.scale(flipH ? -1 : 1, 1);
    octx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    ctx.drawImage(off, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  }
  const mime = mimeFromExt(ext);
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), mime, 0.92),
  );
  return new File([blob], file.name, { type: mime, lastModified: Date.now() });
}

async function centerCropFileToRatio(file: File, ext: string, ratio: number): Promise<File> {
  const img = await loadImageBitmap(file);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const currentRatio = iw / ih;
  let cw = iw;
  let ch = ih;
  if (currentRatio > ratio) {
    cw = Math.round(ih * ratio);
    ch = ih;
  } else {
    ch = Math.round(iw / ratio);
    cw = iw;
  }
  const x = Math.round((iw - cw) / 2);
  const y = Math.round((ih - ch) / 2);
  return cropFileToArea(file, ext, { x, y, width: cw, height: ch });
}

export function NoteRenamer() {
  const [items, setItems] = useState<ImgItem[]>([]);
  const [baseName, setBaseName] = useState("");
  const [startPage, setStartPage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [renamed, setRenamed] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [lang, setLang] = useState<Lang>("bn");
  const [lastRemoved, setLastRemoved] = useState<RemovedItem | null>(null);
  const [dupInfo, setDupInfo] = useState<{ count: number; names: string[] } | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [cropId, setCropId] = useState<string | null>(null);
  const [batchRatioOpen, setBatchRatioOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [restoreDialog, setRestoreDialog] = useState<SavedSession | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const h = () => setSettingsOpen(true);
    window.addEventListener("open-app-settings", h);
    return () => window.removeEventListener("open-app-settings", h);
  }, []);
  const [sessionReady, setSessionReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderCounterRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRemovedRef = useRef<RemovedItem | null>(null);
  useEffect(() => { lastRemovedRef.current = lastRemoved; }, [lastRemoved]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let cancelled = false;
    loadSession().then((s) => {
      if (cancelled) return;
      if (s && s.items && s.items.length > 0) {
        setRestoreDialog(s);
      } else {
        setSessionReady(true);
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (items.length === 0) {
        clearSession();
        return;
      }
      const payload: SavedSession = {
        savedAt: Date.now(),
        baseName,
        startPage,
        lang,
        orderCounter: orderCounterRef.current,
        items: items.map((it) => ({
          id: it.id,
          originalName: it.originalName,
          ext: it.ext,
          sig: it.sig,
          uploadOrder: it.uploadOrder,
          cropped: it.cropped,
          originalFile: it.originalFile,
          file: it.file,
        })),
      };
      saveSession(payload);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [items, baseName, startPage, lang, sessionReady]);

  function restoreFromSession(s: SavedSession) {
    orderCounterRef.current = s.orderCounter ?? s.items.length;
    const restored: ImgItem[] = s.items.map((si) => {
      const originalFile = new File([si.originalFile], si.originalName, {
        type: si.originalFile.type || undefined,
      });
      const file = si.file === si.originalFile
        ? originalFile
        : new File([si.file], si.originalName, { type: si.file.type || undefined });
      const originalUrl = URL.createObjectURL(originalFile);
      const url = file === originalFile ? originalUrl : URL.createObjectURL(file);
      return {
        id: si.id,
        file,
        url,
        originalFile,
        originalUrl,
        originalName: si.originalName,
        ext: si.ext,
        sig: si.sig,
        uploadOrder: si.uploadOrder,
        cropped: si.cropped,
      };
    });
    setItems(restored);
    setBaseName(s.baseName ?? "");
    setStartPage(s.startPage ?? "");
    setLang(s.lang ?? "en");
    setRestoreDialog(null);
    setSessionReady(true);
  }

  function startNewSession() {
    clearSession();
    setRestoreDialog(null);
    setSessionReady(true);
  }

  async function clearSavedSession() {
    await clearSession();
    setSettingsOpen(false);
  }

  const startNum = Number(startPage);
  const validStart = startPage !== "" && Number.isInteger(startNum) && startNum >= 0;
  const computedEnd = validStart && items.length > 0 ? startNum + items.length - 1 : null;

  const validationError = useMemo(() => {
    if (items.length === 0) return null;
    if (!baseName.trim()) return null;
    if (!validStart) return null;
    return null;
  }, [items.length, baseName, validStart]);

  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState<{ phase: "scan" | "add"; done: number; total: number } | null>(null);


  const previews = useMemo(() => {
    if (!baseName.trim() || !validStart) return null;
    return items.map((it, i) => buildFileName(baseName, startNum + i, it.ext, lang));
  }, [items, baseName, validStart, startNum, lang]);

  async function addFiles(fileList: FileList | File[], onProgress?: (done: number, total: number) => void) {
    const incoming = Array.from(fileList).filter(
      (f) => ACCEPTED.includes(f.type) || ACCEPTED_EXT.test(f.name),
    );
    if (incoming.length === 0) return;
    setRenamed(false);
    setError(null);

    // If a delete is pending undo, finalize it first so uploadOrder stays gap-free.
    let baseItems = items;
    const pending = lastRemovedRef.current;
    if (pending) {
      if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
      revokeItemUrls(pending.item);
      lastRemovedRef.current = null;
      setLastRemoved(null);
      baseItems = renumberItems(baseItems);
    }
    const existingSigs = new Set(baseItems.map((i) => i.sig));
    const seenInBatch = new Set<string>();
    const mapped: ImgItem[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];

    // Hash files in parallel (a small pool) instead of one-by-one —
    // with large batches this cuts the "Adding images…" phase from
    // O(n) sequential reads to ~8 concurrent ones.
    type Result =
      | { kind: "ok"; index: number; sig: string }
      | { kind: "skipped"; name: string }
      | { kind: "failed"; name: string };
    const results: Result[] = new Array(incoming.length);
    let done = 0;
    let cursor = 0;
    const CONCURRENCY = 8;
    async function worker() {
      while (cursor < incoming.length) {
        const i = cursor++;
        const f = incoming[i];
        try {
          const sig = await fileSignature(f);
          if (existingSigs.has(sig) || seenInBatch.has(sig)) {
            results[i] = { kind: "skipped", name: f.name };
          } else {
            seenInBatch.add(sig);
            results[i] = { kind: "ok", index: i, sig };
          }
        } catch (err) {
          console.error("addFiles: failed to process file", f.name, err);
          results[i] = { kind: "failed", name: f.name };
        }
        done++;
        onProgress?.(done, incoming.length);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, incoming.length) }, () => worker()),
    );

    // Build items in original order so uploadOrder matches the drop order.
    for (let i = 0; i < incoming.length; i++) {
      const r = results[i];
      if (!r || r.kind === "skipped") {
        if (r) skipped.push(r.name);
        continue;
      }
      if (r.kind === "failed") {
        failed.push(r.name);
        continue;
      }
      const f = incoming[i];
      const url = URL.createObjectURL(f);
      mapped.push({
        id: `${Date.now()}-${i}-${f.name}`,
        file: f,
        url,
        originalFile: f,
        originalUrl: url,
        originalName: f.name,
        ext: getExt(f.name),
        sig: r.sig,
        uploadOrder: baseItems.length + mapped.length + 1,
      });
    }

    if (mapped.length > 0) {
      const next = [...baseItems, ...mapped];
      orderCounterRef.current = next.length;
      setItems(next);
    } else if (pending) {
      orderCounterRef.current = baseItems.length;
      setItems(baseItems);
    }
    if (skipped.length > 0) {
      setDupInfo({ count: skipped.length, names: skipped });
      if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
      dupTimerRef.current = setTimeout(() => setDupInfo(null), 6000);
    }
    if (failed.length > 0) {
      setError(
        `Couldn't add ${failed.length} file${failed.length === 1 ? "" : "s"}: ${failed.join(", ")}. Check the app's DevTools console for details.`,
      );
    }
  }

  function revokeItemUrls(it: ImgItem) {
    URL.revokeObjectURL(it.url);
    if (it.originalUrl !== it.url) URL.revokeObjectURL(it.originalUrl);
  }

  function removeItem(id: string) {
    setSelected((s) => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n; });
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx === -1) return prev;
      const gone = prev[idx];
      setLastRemoved({ item: gone, index: idx });
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => {
        revokeItemUrls(gone);
        setLastRemoved((cur) => (cur?.item.id === gone.id ? null : cur));
        setItems((cur) => {
          const renumbered = renumberItems(cur);
          orderCounterRef.current = renumbered.length;
          return renumbered;
        });
      }, 5000);
      return prev.filter((p) => p.id !== id);
    });
    setRenamed(false);
  }

  function undoRemove() {
    if (!lastRemoved) return;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setItems((prev) => {
      const next = prev.slice();
      const insertAt = Math.min(lastRemoved.index, next.length);
      next.splice(insertAt, 0, lastRemoved.item);
      return next;
    });
    setLastRemoved(null);
    setRenamed(false);
  }

  function clearAll() {
    items.forEach(revokeItemUrls);
    setItems([]);
    setSelected(new Set());
    setRenamed(false);
    orderCounterRef.current = 0;
    if (lastRemoved) {
      revokeItemUrls(lastRemoved.item);
      setLastRemoved(null);
    }
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }

  async function applyBatchRatio(ratio: number, targetIds?: Set<string>) {
    setBatchBusy(true);
    try {
      const updated = await Promise.all(
        items.map(async (it) => {
          if (targetIds && !targetIds.has(it.id)) return it;
          try {
            const newFile = await centerCropFileToRatio(it.originalFile, it.ext, ratio);
            if (it.url !== it.originalUrl) URL.revokeObjectURL(it.url);
            const newUrl = URL.createObjectURL(newFile);
            return {
              ...it,
              file: newFile,
              url: newUrl,
              cropped: true,
            };
          } catch {
            return it;
          }
        }),
      );
      setItems(updated);
      setRenamed(false);
      setBatchRatioOpen(false);
      setSelected(new Set());
    } finally {
      setBatchBusy(false);
    }
  }

  async function applyCropToItem(
    id: string,
    area: CropArea,
    rotation: number,
    flipH: boolean,
  ) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const newFile = await cropFileToArea(it.originalFile, it.ext, area, rotation, flipH);
    const newUrl = URL.createObjectURL(newFile);
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (p.url !== p.originalUrl) URL.revokeObjectURL(p.url);
        return {
          ...p,
          file: newFile,
          url: newUrl,
          cropped: true,
        };
      }),
    );
    setRenamed(false);
  }

  function restoreOriginal(id: string) {
    setItems((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (!p.cropped) return p;
        if (p.url !== p.originalUrl) URL.revokeObjectURL(p.url);
        return { ...p, file: p.originalFile, url: p.originalUrl, cropped: false };
      }),
    );
    setRenamed(false);
  }

  function toggleSelect(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function selectAll() { setSelected(new Set(items.map((i) => i.id))); }
  function clearSelection() { setSelected(new Set()); }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIdx = prev.findIndex((p) => p.id === active.id);
      const newIdx = prev.findIndex((p) => p.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
    setRenamed(false);
  }

  function handleRename() {
    setError(null);
    if (items.length === 0) return setError("Please upload at least one image.");
    if (!baseName.trim()) return setError("Base name is required.");
    if (!validStart) return setError("Starting page is required.");
    if (validationError) return setError(validationError);
    setRenamed(true);
    requestAnimationFrame(() => {
      document.getElementById("success-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function downloadZip() {
    if (!previews) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      
      // ১. নতুন ও সুন্দর নামের ফরম্যাট তৈরি (যেমন: Test Page (1-3))
      const startLabel = startNum;
      const endLabel = computedEnd ?? startNum;
      const customFolderName = `${baseName.trim()} Page (${startLabel}-${endLabel})`;

      // ২. জিপ ফাইলের ভেতরে এই নামের একটি নির্দিষ্ট ফোল্ডার তৈরি করা হচ্ছে
      const imgFolder = zip.folder(customFolderName);

      // ৩. ছবিগুলো সরাসরি জিপে না রেখে, তৈরি করা ফোল্ডারের ভেতরে পুশ করা হচ্ছে
      for (let i = 0; i < items.length; i++) {
        if (imgFolder) {
          imgFolder.file(previews[i], items[i].file);
        }
      }

      // ৪. জিপ ফাইল জেনারেট এবং ডাউনলোড
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      
      // জিপ ফাইলের নামও ফোল্ডারের নামের সাথে মিল রেখে সেট করা হলো
      a.download = `${customFolderName}.zip`;
      
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setZipping(false);
    }
  }


  const canRename =
    items.length > 0 && baseName.trim() !== "" && validStart && !validationError;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] opacity-60"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--primary) 28%, transparent) 0%, transparent 70%)",
        }}
      />
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex w-full items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-primary-foreground shadow-lg"
            style={{ backgroundImage: "var(--gradient-primary)", boxShadow: "var(--shadow-primary)" }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-tight">Page Renamer Pro</h1>
            <p className="truncate text-xs text-muted-foreground">
              Rename notebook pages in order
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-32 pt-6 lg:max-w-5xl lg:px-8">
        <section className="mb-8">
          <StepHeader n={1} title="Upload images" subtitle="Order is preserved exactly as uploaded." />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragOver) setDragOver(true);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const dt = e.dataTransfer;
              setImporting({ phase: "scan", done: 0, total: 0 });
              void collectDroppedImages(dt)
                .then(async (files) => {
                  if (!files.length) {
                    setImporting(null);
                    toast.error("No Picture Found");
                    return;
                  }
                  setImporting({ phase: "add", done: 0, total: files.length });
                  await addFiles(files, (done, total) =>
                    setImporting({ phase: "add", done, total }),
                  );
                  setImporting(null);
                })
                .catch(() => setImporting(null));
            }}

            className={`group flex w-full select-none flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed bg-card px-4 py-10 text-center outline-none transition-all duration-200 focus:outline-none focus-visible:outline-none focus-visible:ring-0 hover:border-primary hover:bg-accent/50 active:scale-[0.99] ${
              dragOver
                ? "border-solid border-primary bg-accent/70 ring-4 ring-primary/30 scale-[1.01] shadow-lg"
                : "border-border"
            }`}
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <div
              className={`grid h-12 w-12 place-items-center rounded-full text-primary-foreground shadow-md transition-transform group-hover:scale-105 ${dragOver ? "scale-125 animate-bounce" : ""}`}
              style={{ backgroundImage: "var(--gradient-primary)" }}
            >
              <UploadCloud className="h-6 w-6" />
            </div>
            {importing ? (
              <div className="flex w-full max-w-xs flex-col items-center gap-2">
                <div className="text-sm font-medium">
                  {importing.phase === "scan"
                    ? "Scanning dropped items…"
                    : `Adding images… ${importing.done}/${importing.total}`}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-150"
                    style={{
                      backgroundImage: "var(--gradient-primary)",
                      width:
                        importing.phase === "scan" || importing.total === 0
                          ? "100%"
                          : `${Math.round((importing.done / importing.total) * 100)}%`,
                      ...(importing.phase === "scan" ? { animation: "pulse 1s ease-in-out infinite" } : {}),
                    }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="text-sm font-medium">
                  {dragOver ? "Release to add your images" : "Tap to select images"}
                </div>
                <div className="hidden text-xs text-muted-foreground sm:block">
                  {dragOver
                    ? "Multiple files and whole folders are supported"
                    : "or drag & drop images — or a whole folder — here"}
                </div>
                <div className="text-xs text-muted-foreground">JPG · JPEG · PNG · WEBP</div>
              </>
            )}
          </button>

          <div className="mt-3 select-none text-center text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="font-medium underline-offset-4 hover:text-foreground hover:underline"
            >
              Or select a whole folder
            </button>
          </div>

          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-expect-error non-standard folder picker attributes
            webkitdirectory=""
            directory=""
            mozdirectory=""
            className="hidden"
            onChange={async (e) => {
              const all = Array.from(e.target.files ?? []).filter((f) =>
                /\.(jpe?g|png|webp)$/i.test(f.name),
              );
              if (all.length > 0) {
                setImporting({ phase: "add", done: 0, total: all.length });
                await addFiles(all, (done, total) =>
                  setImporting({ phase: "add", done, total }),
                );
                setImporting(null);
              }
              e.target.value = "";
            }}
          />

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={async (e) => {
              const files = e.target.files;
              if (files && files.length > 0) {
                setImporting({ phase: "add", done: 0, total: files.length });
                await addFiles(files, (done, total) =>
                  setImporting({ phase: "add", done, total }),
                );
                setImporting(null);
              }
              e.target.value = "";
            }}
          />

          {items.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {items.length} image{items.length === 1 ? "" : "s"} · drag to reorder
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
                >
                  Clear all
                </button>
              </div>
            </div>
          )}

          {items.length > 0 && selected.size > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              <span className="font-medium text-foreground">
                {selected.size} selected
              </span>
              <div className="flex items-center gap-2">
                {selected.size < items.length && (
                  <button
                    type="button"
                    onClick={selectAll}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
                  >
                    Select all
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setBatchRatioOpen(true)}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-md"
                  style={{ backgroundImage: "var(--gradient-primary)" }}
                >
                  <CropIcon className="h-3.5 w-3.5" />
                  Crop selected
                </button>
              </div>
            </div>
          )}

          {dupInfo && (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-medium text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Skipped {dupInfo.count} duplicate{dupInfo.count === 1 ? "" : "s"}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {dupInfo.names.slice(0, 3).join(", ")}
                  {dupInfo.names.length > 3 && ` +${dupInfo.names.length - 3} more`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDupInfo(null)}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            </div>
          )}

          {lastRemoved && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                Removed <span className="text-foreground">{lastRemoved.item.originalName}</span>
              </span>
              <button
                type="button"
                onClick={undoRemove}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-md transition-transform hover:scale-[1.03] active:scale-95"
                style={{ backgroundImage: "var(--gradient-primary)" }}
              >
                <Undo2 className="h-3.5 w-3.5" />
                Undo
              </button>
            </div>
          )}

          {items.length > 0 && (
            <div className="mt-3">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <ul className="flex flex-col gap-2">
                    {items.map((it, i) => (
                      <SortableRow
                        key={it.id}
                        item={it}
                        position={i}
                        newName={previews?.[i] ?? null}
                        selected={selected.has(it.id)}
                        onToggleSelect={() => toggleSelect(it.id)}
                        onRestore={() => restoreOriginal(it.id)}
                        onRemove={() => removeItem(it.id)}
                        onPreview={() => setViewerId(it.id)}
                        onCrop={() => setCropId(it.id)}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </section>

        <section className="mb-8">
          <StepHeader n={2} title="Rename settings" subtitle="Live preview updates as you type." />
          <div className="grid min-w-0 grid-cols-1 gap-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <FloatingField
              id="base"
              label="Base name"
              required
              value={baseName}
              onChange={(v) => {
                setBaseName(v);
                setRenamed(false);
              }}
            />

            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <Languages className="h-3.5 w-3.5" />
                Page label language
              </div>
              <LanguageToggle
                lang={lang}
                onChange={(l) => { setLang(l); setRenamed(false); }}
              />
              <p className="mt-2 text-xs text-muted-foreground">Applies to page numbers in the renamed filenames only.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FloatingField
                id="start"
                label="Starting page"
                required
                type="number"
                inputMode="numeric"
                value={startPage}
                onChange={(v) => {
                  setStartPage(v);
                  setRenamed(false);
                }}
              />
              <FloatingDisplay
                id="end"
                label="Ending page"
                value={computedEnd !== null ? String(computedEnd) : ""}
                locked
              />
            </div>

            {validationError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{validationError}</AlertDescription>
              </Alert>
            )}

            {previews && !validationError && (
              <div className="rounded-xl border border-border bg-muted/50 p-3 text-xs">
                <div className="mb-2 font-medium text-foreground">Preview</div>
                <ul className="space-y-1 font-mono text-muted-foreground w-full min-w-0">
                  {previews.slice(0, 3).map((n, i) => (
                    <li key={i} className="w-full overflow-x-auto whitespace-nowrap scrollbar-none text-left">
                      {items[i].originalName} → <span className="text-foreground">{n}</span>
                    </li>
                  ))}
                  {previews.length > 3 && <li>… +{previews.length - 3} more</li>}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section className="mb-8">
          {error && (
            <Alert variant="destructive" className="mb-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            size="lg"
            className="h-12 w-full border-0 text-base font-semibold text-primary-foreground shadow-lg transition-all hover:brightness-105 hover:shadow-xl active:scale-[0.99] disabled:opacity-40 disabled:shadow-none"
            style={{ backgroundImage: "var(--gradient-primary)", boxShadow: "var(--shadow-primary)" }}
            disabled={!canRename}
            onClick={handleRename}
          >
            Rename files
          </Button>
        </section>

        {renamed && previews && (
          <section id="success-panel" className="mb-8">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="h-5 w-5" />
                <h2 className="text-base font-semibold text-foreground">Rename complete</h2>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Stat label="Total images" value={String(items.length)} />
                <Stat label="Starting page" value={String(startNum)} />
                <Stat label="Ending page" value={String(computedEnd)} />
                <Stat label="ZIP" value="Ready" />
              </dl>
              <Button
                size="lg"
                className="mt-5 h-14 w-full border-0 text-base font-semibold text-primary-foreground shadow-lg transition-all hover:brightness-105 active:scale-[0.99]"
                style={{ backgroundImage: "var(--gradient-primary)", boxShadow: "var(--shadow-primary)" }}
                onClick={downloadZip}
                disabled={zipping}
              >
                <Download className="mr-2 h-5 w-5" />
                {zipping ? "Preparing ZIP…" : "Download ZIP"}
              </Button>
            </div>
            <DriveUpload
              files={items.map((it, i) => ({
                file: it.file,
                name: previews[i],
              }))}
            />
          </section>
        )}
      </main>
     <Footer />
      
      {viewerId && (() => {
        const it = items.find((x) => x.id === viewerId);
        if (!it) return null;
        return (
          <PreviewModal
            item={it}
            onClose={() => setViewerId(null)}
            onCrop={() => {
              setCropId(it.id);
              setViewerId(null);
            }}
          />
        );
      })()}

      {cropId && (() => {
        const it = items.find((x) => x.id === cropId);
        if (!it) return null;
        return (
          <CropModal
            item={it}
            onClose={() => setCropId(null)}
            onApply={async (area, rotation, flipH) => {
              await applyCropToItem(it.id, area, rotation, flipH);
              setCropId(null);
            }}
          />
        );
      })()}

      {batchRatioOpen && (
        <BatchRatioModal
          busy={batchBusy}
          count={selected.size}
          onClose={() => !batchBusy && setBatchRatioOpen(false)}
          onPick={(r) => applyBatchRatio(r, selected)}
        />
      )}

      {restoreDialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-foreground">Previous editing session found</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              {restoreDialog.items.length} image{restoreDialog.items.length === 1 ? "" : "s"} saved{" "}
              {new Date(restoreDialog.savedAt).toLocaleString()}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => restoreFromSession(restoreDialog)}
                className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-primary-foreground shadow-md"
                style={{ backgroundImage: "var(--gradient-primary)" }}
              >
                Restore Previous Session
              </button>
              <button
                type="button"
                onClick={startNewSession}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:border-primary"
              >
                Start New Session
              </button>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Settings</h3>
              <button
                onClick={() => setSettingsOpen(false)}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={clearSavedSession}
                className="w-full rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20"
              >
                Clear Saved Session
              </button>
              <p className="text-[11px] text-muted-foreground">
                Removes the automatically saved editing session from this browser. Uploaded images stay in the current workspace.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepHeader({ n, title, subtitle }: { n: number; title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold leading-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function FloatingField({
  id,
  label,
  value,
  onChange,
  required,
  type = "text",
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  inputMode?: "text" | "numeric";
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder=" "
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className="peer no-spinner h-14 w-full rounded-xl border border-border bg-background px-3 pt-5 pb-1 text-sm text-foreground outline-none transition-all placeholder:text-transparent focus:border-primary focus:ring-2 focus:ring-primary/30 lg:h-16 lg:text-base"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground transition-all duration-200 peer-focus:top-3 peer-focus:-translate-y-0 peer-focus:text-[11px] peer-focus:font-medium peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-3 peer-[:not(:placeholder-shown)]:-translate-y-0 peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:font-medium peer-[:not(:placeholder-shown)]:text-primary"
      >
        {label}{required && <span className="text-primary"> *</span>}
      </label>
    </div>
  );
}

function FloatingDisplay({
  id,
  label,
  value,
  locked,
}: {
  id: string;
  label: string;
  value: string;
  locked?: boolean;
}) {
  const filled = value !== "";
  return (
    <div className="relative">
      {/* পরিবর্তন ১: কন্টেইনারে w-full এবং min-w-0 নিশ্চিত করা হয়েছে */}
      <div
        id={id}
        className="flex h-14 w-full items-end rounded-xl border border-dashed border-border bg-muted/40 px-3 pb-2 pt-5 text-sm text-foreground min-w-0"
      >
        {/* পরিবর্তন ২: flex-row স্ট্রাকচারে টেক্সট পার্টকে flex-1 এবং স্ক্রলযোগ্য করা হয়েছে */}
        <div className="flex w-full items-center justify-between gap-2 min-w-0">
          <span 
            className={cn(
              "flex-1 overflow-x-auto whitespace-nowrap scrollbar-none text-left min-w-0",
              !filled && "text-muted-foreground"
            )}
          >
            {filled ? value : "—"}
          </span>
          
          {/* তালা চিহ্নটি flex-shrink-0 করা হয়েছে যাতে চ্যাপ্টা না হয় */}
          {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        </div>
      </div>
      <span
        className={cn(
          "pointer-events-none absolute left-3 top-3 text-[11px] font-medium text-muted-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function LanguageToggle({
  lang,
  onChange,
}: {
  lang: Lang;
  onChange: (l: Lang) => void;
}) {
  return (
    <div className="relative grid h-11 w-full grid-cols-2 overflow-hidden rounded-xl border border-border bg-muted p-1">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg shadow-md transition-transform duration-300 ease-out"
        style={{
          backgroundImage: "var(--gradient-primary)",
          transform: lang === "en" ? "translateX(100%)" : "translateX(0%)",
        }}
      />
      <button
        type="button"
        onClick={() => onChange("bn")}
        aria-pressed={lang === "bn"}
        className={cn(
          "relative z-10 border-0 bg-transparent text-xs font-semibold outline-none transition-colors duration-200 focus:outline-none focus-visible:outline-none focus-visible:ring-0",
          lang === "bn" ? "text-primary-foreground" : "text-muted-foreground",
        )}
      >
        বাংলা · পৃষ্ঠা-১
      </button>
      <button
        type="button"
        onClick={() => onChange("en")}
        aria-pressed={lang === "en"}
        className={cn(
          "relative z-10 border-0 bg-transparent text-xs font-semibold outline-none transition-colors duration-200 focus:outline-none focus-visible:outline-none focus-visible:ring-0",
          lang === "en" ? "text-primary-foreground" : "text-muted-foreground",
        )}
      >
        English · Page-1
      </button>
    </div>
  );
}

function SortableRow({
  item,
  position,
  newName,
  selected,
  onToggleSelect,
  onRestore,
  onRemove,
  onPreview,
  onCrop,
}: {
  item: ImgItem;
  position: number;
  newName: string | null;
  selected: boolean;
  onToggleSelect: () => void;
  onRestore: () => void;
  onRemove: () => void;
  onPreview: () => void;
  onCrop: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const baseTransform = CSS.Transform.toString(transform);
  const style = {
    transform: isDragging ? `${baseTransform} scale(1.00)` : baseTransform,
    transition,
    boxShadow: isDragging
      ? "0 20px 40px -8px rgba(0,0,0,0.28), 0 8px 16px -4px rgba(0,0,0,0.18)"
      : undefined,
    zIndex: isDragging ? 50 : undefined,
  };
  const moved = position + 1 !== item.uploadOrder;
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 transition-shadow duration-200 ease-out",
        isDragging && "ring-2 ring-primary/40",
        selected && !isDragging && "ring-2 ring-primary/60 border-primary/50",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={selected ? "Deselect image" : "Select image"}
        onClick={onToggleSelect}
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-md border transition",
          selected
            ? "border-primary bg-[image:var(--gradient-primary)] text-primary-foreground shadow"
            : "border-border bg-background text-transparent hover:border-primary",
        )}
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Drag to reorder"
        className="grid h-10 w-8 shrink-0 touch-none place-items-center rounded-md text-muted-foreground hover:bg-muted"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onPreview}
        aria-label="Preview image"
        className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-transparent transition hover:ring-primary/60"
      >
        <img src={item.url} alt="" className="h-full w-full object-cover" />
        <span
          className={cn(
            "absolute left-1 top-1 rounded px-1 text-[10px] font-semibold text-white",
            moved ? "bg-primary/90" : "bg-black/70",
          )}
          title="Upload serial (unchanged when reordered)"
        >
          #{item.uploadOrder}
        </span>
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
          <Eye className="h-4 w-4" />
        </span>
        {item.cropped && (
          <span className="absolute bottom-0.5 right-0.5 rounded bg-primary p-0.5 text-primary-foreground">
            <CropIcon className="h-2.5 w-2.5" />
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
          <span>Image #{item.uploadOrder}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            pos {position + 1}
          </span>
          {moved && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              moved
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">{item.originalName}</div>
        {newName && (
          <div className="mt-0.5 truncate font-mono text-[11px] text-primary">→ {newName}</div>
        )}
      </div>
      {item.cropped && (
        <button
          type="button"
          aria-label="Restore original (undo crop)"
          title="Restore original"
          onClick={onRestore}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary"
        >
          <Undo2 className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        aria-label="Crop image"
        onClick={onCrop}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary"
      >
        <CropIcon className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Remove image"
        onClick={onRemove}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

function PreviewModal({
  item,
  onClose,
  onCrop,
}: {
  item: ImgItem;
  onClose: () => void;
  onCrop: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Image #{item.uploadOrder}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto bg-muted p-3">
          <img src={item.url} alt={item.originalName} className="max-h-[70vh] w-auto max-w-full rounded-md object-contain" />
        </div>
        <div className="flex flex-col gap-2 border-t border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 truncate text-xs text-muted-foreground">{item.originalName}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCrop}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:border-primary hover:text-primary"
            >
              <CropIcon className="h-4 w-4" />
              Crop
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-primary-foreground shadow-md"
              style={{ backgroundImage: "var(--gradient-primary)" }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MIUI Gallery-style crop editor
// -----------------------------------------------------------------------------
type CropHistoryEntry = {
  ratio: number | null;
  crop: { x: number; y: number };
  zoom: number;
  rotation: number;
  flipH: boolean;
};

function CropModal({
  item,
  onClose,
  onApply,
}: {
  item: ImgItem;
  onClose: () => void;
  onApply: (area: CropArea, rotation: number, flipH: boolean) => Promise<void> | void;
}) {
  const initial: CropHistoryEntry = {
    ratio: null,
    crop: { x: 0, y: 0 },
    zoom: 1,
    rotation: 0,
    flipH: false,
  };
  const [imageRatio, setImageRatio] = useState<number | undefined>(undefined);
  const onMediaLoaded = useCallback((mediaSize: { width: number; height: number }) => {
  setImageRatio(mediaSize.width / mediaSize.height);
}, []);
  
  const [state, setState] = useState<CropHistoryEntry>(initial);
  const [history, setHistory] = useState<CropHistoryEntry[]>([]);
  const [future, setFuture] = useState<CropHistoryEntry[]>([]);
  const [pixelArea, setPixelArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => setPixelArea(pixels), []);

  function commit(next: CropHistoryEntry) {
    setHistory((h) => [...h, state]);
    setFuture([]);
    setState(next);
  }

  function undo() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [state, ...f]);
      setState(prev);
      return h.slice(0, -1);
    });
  }

  function redo() {
    setFuture((f) => {
      if (f.length === 0) return f;
      const nxt = f[0];
      setHistory((h) => [...h, state]);
      setState(nxt);
      return f.slice(1);
    });
  }

  function reset() {
    if (
      state.ratio === initial.ratio &&
      state.zoom === initial.zoom &&
      state.rotation === initial.rotation &&
      !state.flipH
    ) {
      return;
    }
    commit(initial);
  }

  async function handleSave() {
    if (!pixelArea) return;
    setBusy(true);
    try {
      await onApply(
        { x: pixelArea.x, y: pixelArea.y, width: pixelArea.width, height: pixelArea.height },
        state.rotation,
        state.flipH,
      );
    } finally {
      setBusy(false);
    }
  }

  const canUndo = history.length > 0;
  const canRedo = future.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {/* Top bar */}
<header className="flex items-center justify-between px-4 py-3 bg-background border-b border-border">
  <div className="flex items-center gap-3">
    {/* ক্রস বাটন - text-white দিয়ে এটি পুরোপুরি সাদা করা হলো */}
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/10"
    >
      <X className="h-5 w-5" />
    </button>
    <span className="h-5 w-px bg-border" />
    <button
      type="button"
      onClick={undo}
      disabled={!canUndo}
      aria-label="Undo"
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full transition",
        canUndo ? "text-foreground hover:bg-white/10" : "text-muted-foreground/50",
      )}
    >
      <Undo2 className="h-5 w-5" />
    </button>
    <button
      type="button"
      onClick={redo}
      disabled={!canRedo}
      aria-label="Redo"
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full transition",
        canRedo ? "text-foreground hover:bg-white/10" : "text-muted-foreground/50",
      )}
    >
      <Undo2 className="h-5 w-5 scale-x-[-1]" />
    </button>
  </div>
  
  {/* সেভ বাটন এখন একদম ডানে চলে আসবে, এবং থ্রি-ডট রিমুভ করা হয়েছে */}
  <div className="flex items-center">
    <button
      type="button"
      onClick={handleSave}
      disabled={busy || !pixelArea}
      className="rounded-full bg-[image:var(--gradient-primary)] px-5 py-1.5 text-base font-semibold text-primary-foreground shadow-[var(--shadow-primary)] transition hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
    >
      {busy ? "Saving…" : "Save"}
    </button>
  </div>
</header>

      {/* Cropper canvas */}
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-4 sm:inset-8">
          <Cropper
  image={item.originalUrl}
  crop={state.crop}
  zoom={state.zoom}
  rotation={state.rotation} // এটি থাকবে, যাতে আপনার নিচের ৯০° বাটন কাজ করে
  
  // কাস্টম মোডে ইমেজের নিজস্ব রেশিও দিলে শুরুতে পুরো ছবি কভার করবে
  aspect={state.ratio === null ? imageRatio : state.ratio}
  
  onCropChange={(c) => setState((s) => ({ ...s, crop: c }))}
  onZoomChange={(z) => setState((s) => ({ ...s, zoom: z }))}
  
  // গুরুত্বপূর্ণ: আঙুল দিয়ে ঘুরানো বন্ধ করতে নিচের এই লাইনটি (onRotationChange) পুরোপুরি রিমুভ বা কমেন্ট করে দিন
  // onRotationChange={(r) => setState((s) => ({ ...s, rotation: r }))}
  
  onCropComplete={onCropComplete}
  onMediaLoaded={onMediaLoaded} // ইমেজ লোড হ্যান্ডলার যুক্ত করা হলো
  
  minZoom={1}
  maxZoom={3}
  restrictPosition={true}
  objectFit="contain"
  showGrid={true}
  transform={
    state.flipH
      ? `translate(${state.crop.x}px, ${state.crop.y}px) rotate(${state.rotation}deg) scale(${state.zoom}) scaleX(-1)`
      : undefined
  }
  style={{
    containerStyle: { background: "transparent" },
    cropAreaStyle: {
      border: "2px solid var(--primary)", 
      boxShadow: "0 0 0 9999px rgba(8, 10, 24, 0.72)",
    },
  }}
/>

          {/* MIUI-style corner markers overlay */}
          <div className="pointer-events-none absolute inset-0" aria-hidden />
        </div>
      </div>

      {/* Flip / Rotate / Reset / Aspect ratio row */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Flip horizontal"
            onClick={() => commit({ ...state, flipH: !state.flipH })}
            className="grid h-10 w-10 place-items-center rounded-full text-foreground hover:bg-white/10"
          >
            <FlipHorizontal2 className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Rotate"
            onClick={() => commit({ ...state, rotation: (state.rotation + 90) % 360 })}
            className="grid h-10 w-10 place-items-center rounded-full text-foreground hover:bg-white/10"
          >
            <RotateCcw className="h-6 w-6" />
          </button>
        </div>
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-border bg-card px-5 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Reset
        </button>
        <span className="rounded-full px-5 py-2 text-sm font-medium text-primary">
          Aspect ratio
        </span>
      </div>

      {/* Aspect ratio pills */}
      <div className="border-t border-border bg-card/40 pb-2 pt-4">
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 [&::-webkit-scrollbar]:hidden">
          {RATIO_PRESETS.map((r) => {
            const active = state.ratio === r.value;
            return (
              <button
                key={r.label}
                type="button"
                onClick={() => commit({ ...state, ratio: r.value })}
                className="flex shrink-0 flex-col items-center gap-1"
              >
                <span
                  className={cn(
                    "grid h-14 w-16 place-items-center rounded-2xl transition",
                    active
                      ? "bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-primary)]"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  <RatioGlyph label={r.label} />
                </span>
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {r.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RatioGlyph({ label }: { label: string }) {
  if (label === "Custom") {
    return (
      <span className="relative block h-6 w-6">
        <span className="absolute left-0 top-0 h-2 w-2 border-l-2 border-t-2 border-current rounded-tl-sm" />
        <span className="absolute right-0 top-0 h-2 w-2 border-r-2 border-t-2 border-current rounded-tr-sm" />
        <span className="absolute left-0 bottom-0 h-2 w-2 border-l-2 border-b-2 border-current rounded-bl-sm" />
        <span className="absolute right-0 bottom-0 h-2 w-2 border-r-2 border-b-2 border-current rounded-br-sm" />
      </span>
    );
  }
  // Draw a rectangle glyph with the aspect ratio.
  let w = 20, h = 20;
  if (label.includes(":")) {
    const [a, b] = label.split(":").map(Number);
    if (a && b) {
      if (a >= b) {
        w = 22;
        h = Math.max(10, Math.round((b / a) * 22));
      } else {
        h = 22;
        w = Math.max(10, Math.round((a / b) * 22));
      }
    }
  }
  return (
    <span
      className="block rounded-[4px] border-2 border-current"
      style={{ width: w, height: h }}
    />
  );
}

function BatchRatioModal({
  busy,
  count,
  onClose,
  onPick,
}: {
  busy: boolean;
  count: number;
  onClose: () => void;
  onPick: (ratio: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            Crop {count} selected image{count === 1 ? "" : "s"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            Center-crop the selected image{count === 1 ? "" : "s"} to the chosen aspect ratio. You can restore the original from the row later.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {RATIO_PRESETS.filter((r) => r.value !== null).map((r) => (
              <button
                key={r.label}
                type="button"
                disabled={busy}
                onClick={() => r.value && onPick(r.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {r.label}
              </button>
            ))}
          </div>
          {busy && (
            <p className="mt-3 text-center text-xs text-muted-foreground">Cropping…</p>
          )}
        </div>
      </div>
    </div>
  );
}
