import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, ArrowLeft, ShieldCheck, MonitorDown } from "lucide-react";

// Replace with the real installer URL once the Windows build is published.
const DOWNLOAD_URL = "/downloads/PageRenamerPro-Setup-win-x64.exe";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download Page Renamer Pro for Windows" },
      {
        name: "description",
        content:
          "Download the Page Renamer Pro desktop app for Windows 10 or later and follow the step-by-step installation guide.",
      },
      { property: "og:title", content: "Download Page Renamer Pro for Windows" },
      {
        property: "og:description",
        content:
          "Get the Windows 10+ desktop version of Page Renamer Pro with a simple installation guide.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DownloadPage,
});

const steps = [
  {
    title: "Download the installer",
    body: "Click the download button above. Your browser saves PageRenamerPro-Setup-win-x64.exe to your Downloads folder.",
  },
  {
    title: "Open the file",
    body: "Double-click the downloaded .exe file. If Windows SmartScreen appears, choose “More info” then “Run anyway”.",
  },
  {
    title: "Install",
    body: "Follow the setup wizard and pick an install location. Installation usually takes less than a minute.",
  },
  {
    title: "Launch and sign in",
    body: "Open Page Renamer Pro from the Start menu or desktop shortcut, then sign in with the same account you use on the website.",
  },
];

function DownloadPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-14">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Link>

        <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-primary/10 text-primary">
            <MonitorDown className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-foreground">
            Page Renamer Pro for Windows
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Desktop version for Windows 10 or above (64-bit).
          </p>

          <a
            href={DOWNLOAD_URL}
            download
            className="mt-7 inline-flex select-none items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow transition hover:brightness-110"
          >
            <Download className="h-4 w-4" />
            Download for Windows
          </a>

          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Free · No ads · Your files stay on your device
          </p>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-foreground">Installation guide</h2>
          <ol className="mt-4 space-y-3">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="flex gap-4 rounded-xl border border-border bg-card/60 p-4"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-sm font-medium text-foreground">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-xl border border-border bg-card/40 p-4 text-xs text-muted-foreground">
            <strong className="text-foreground">System requirements:</strong> Windows 10 or
            later (64-bit), 4 GB RAM, ~200 MB free disk space, and an internet connection for
            Google Drive uploads.
          </div>
        </section>
      </div>
    </main>
  );
}
