import { useEffect, useState } from "react";
import { useAuth, useUser, SignInButton, SignedIn, SignedOut } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UploadCloud, FolderOpen, ChevronRight, Loader2, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";

type Folder = { id: string; name: string };
type FolderResponse = {
  currentId: string;
  currentName: string;
  rootId: string;
  folders: Folder[];
};

type Props = {
  files: { file: Blob; name: string }[];
};

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

  function enterFolder(f: Folder) {
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

  async function handleUpload() {
    if (!data || files.length === 0) return;
    setUploading(true);
    setError(null);
    setUploadDone(null);
    setProgress({ done: 0, total: files.length });
    try {
      const token = await getToken();
      for (let i = 0; i < files.length; i++) {
        const { file, name } = files[i];
        const form = new FormData();
        form.set("folderId", data.currentId);
        form.set("filename", name);
        form.set("file", file, name);
        const res = await fetch("/api/drive/upload", {
          method: "POST",
          headers: { authorization: `Bearer ${token ?? ""}` },
          body: form,
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`Upload failed for ${name}: ${t}`);
        }
        setProgress({ done: i + 1, total: files.length });
      }
      setUploadDone(`Uploaded ${files.length} file${files.length === 1 ? "" : "s"} to "${data.currentName}".`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-primary">
        <UploadCloud className="h-5 w-5" />
        <h2 className="text-base font-semibold text-foreground">Upload to Google Drive</h2>
      </div>

      <SignedOut>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign in to upload the renamed files to Google Drive.
        </p>
        <div className="mt-3">
          <SignInButton mode="modal">
            <Button size="sm">Sign in</Button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        {!hasRole ? (
          <Alert className="mt-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Your account doesn't have upload permission. Ask the admin to grant the
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">mustakim-s-student</code>
              role.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <button
                type="button"
                onClick={() => goToCrumb(-1)}
                className="rounded px-2 py-1 hover:bg-accent hover:text-foreground"
              >
                Root
              </button>
              {breadcrumb.map((c, i) => (
                <span key={c.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  <button
                    type="button"
                    onClick={() => goToCrumb(i)}
                    className="rounded px-2 py-1 hover:bg-accent hover:text-foreground"
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-border bg-background">
              {loading ? (
                <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : data ? (
                <ul className="max-h-64 overflow-auto divide-y divide-border">
                  {breadcrumb.length > 0 && (
                    <li>
                      <button
                        type="button"
                        onClick={() => goToCrumb(breadcrumb.length - 2)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        <span>Back</span>
                      </button>
                    </li>
                  )}
                  {data.folders.length === 0 ? (
                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                      No subfolders here.
                    </li>
                  ) : (
                    data.folders.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => enterFolder(f)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <FolderOpen className="h-4 w-4 text-primary" />
                          <span className="flex-1 truncate">{f.name}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Current folder: <span className="font-medium text-foreground">{data?.currentName ?? "—"}</span>
            </p>

            {error && (
              <Alert variant="destructive" className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="break-words">{error}</AlertDescription>
              </Alert>
            )}

            {uploadDone && (
              <Alert className="mt-3">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{uploadDone}</AlertDescription>
              </Alert>
            )}

            {progress && uploading && (
              <div className="mt-3">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {progress.done} / {progress.total} uploaded
                </p>
              </div>
            )}

            <Button
              size="lg"
              className="mt-4 h-12 w-full"
              onClick={handleUpload}
              disabled={uploading || !data || files.length === 0}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <UploadCloud className="mr-2 h-5 w-5" />
                  Upload {files.length} file{files.length === 1 ? "" : "s"} here
                </>
              )}
            </Button>
          </>
        )}
      </SignedIn>
    </div>
  );
}
