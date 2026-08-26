// Collects image files from a drag & drop DataTransfer, walking dropped
// folders recursively when the browser exposes the entries API.

const IMAGE_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|tiff?)$/i;

function isImage(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_RE.test(file.name);
}

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  file: (cb: (f: File) => void, err: (e: unknown) => void) => void;
  createReader: () => {
    readEntries: (cb: (entries: FsEntry[]) => void, err: (e: unknown) => void) => void;
  };
};

async function readDirectory(entry: FsEntry): Promise<FsEntry[]> {
  const reader = entry.createReader();
  const all: FsEntry[] = [];
  while (true) {
    const batch = await new Promise<FsEntry[]>((resolve) =>
      reader.readEntries(resolve, () => resolve([])),
    );
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all;
}

async function walk(entry: FsEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File | null>((resolve) =>
      entry.file(resolve, () => resolve(null)),
    );
    if (file && isImage(file)) out.push(file);
    return;
  }
  if (entry.isDirectory) {
    const children = await readDirectory(entry);
    for (const child of children) await walk(child, out);
  }
}

export async function collectDroppedImages(dt: DataTransfer): Promise<File[]> {
  const out: File[] = [];
  const items = dt.items ? Array.from(dt.items) : [];
  const entries = items
    .map((item) =>
      typeof (item as DataTransferItem & { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry ===
      "function"
        ? ((item as DataTransferItem & { webkitGetAsEntry: () => FsEntry | null }).webkitGetAsEntry())
        : null,
    )
    .filter((e): e is FsEntry => Boolean(e));

  if (entries.length > 0) {
    for (const entry of entries) await walk(entry, out);
    if (out.length > 0) return out;
  }

  for (const file of Array.from(dt.files ?? [])) {
    if (isImage(file)) out.push(file);
  }
  return out;
}
