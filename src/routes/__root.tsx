import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/clerk-react";
import { Settings as SettingsIcon } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { getClerkPublishableKey } from "../lib/get-clerk-key";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Page Renamer Pro — Batch rename notebook photos" },
      { name: "description", content: "Upload notebook page images, rename them in order with a base name and page numbers, and download as a ZIP. Runs entirely in your browser." },
      { name: "theme-color", content: "#0d111c" },
      { property: "og:title", content: "Page Renamer Pro — Batch rename notebook photos" },
      { property: "og:description", content: "Upload notebook page images, rename them in order with a base name and page numbers, and download as a ZIP. Runs entirely in your browser." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Page Renamer Pro — Batch rename notebook photos" },
      { name: "twitter:description", content: "Upload notebook page images, rename them in order with a base name and page numbers, and download as a ZIP. Runs entirely in your browser." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2b38188c-7c73-4023-acd5-6f8ef6f71389/id-preview-cf5a8c18--db125590-5333-43f1-bc2d-3e9b30746f97.lovable.app-1784441059111.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2b38188c-7c73-4023-acd5-6f8ef6f71389/id-preview-cf5a8c18--db125590-5333-43f1-bc2d-3e9b30746f97.lovable.app-1784441059111.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  loader: () => getClerkPublishableKey(),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { publishableKey } = Route.useLoaderData();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showHeaderControls = pathname === "/";

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      afterSignOutUrl="/"
      appearance={{
        variables: {
          colorBackground: "#0d111c",
          colorText: "#f5f7fb",
          colorTextSecondary: "#a5adc2",
          colorPrimary: "#8b7cff",
          colorInputBackground: "#171c2b",
          colorInputText: "#f5f7fb",
          colorNeutral: "#f5f7fb",
        },
        elements: {
          userButtonAvatarBox: { width: "40px", height: "40px" },
          userButtonPopoverCard: {
            backgroundColor: "#0d111c",
            border: "1px solid rgba(255,255,255,0.08)",
          },
          userButtonPopoverActionButton: { color: "#f5f7fb" },
          userButtonPopoverActionButtonText: { color: "#f5f7fb" },
          userButtonPopoverActionButtonIcon: { color: "#f5f7fb" },
          userButtonPopoverFooter: { 
            backgroundColor: "#0d111c", // Your dark background color
            backgroundImage: "linear-gradient(45deg, rgba(139, 124, 255, 0.1) 25%, transparent 25%, transparent 50%, rgba(139, 124, 255, 0.1) 50%, rgba(139, 124, 255, 0.1) 75%, transparent 75%, transparent)",
            backgroundSize: "40px 40px",
           },
          },
        }}
      >
      <QueryClientProvider client={queryClient}>
        {showHeaderControls ? (
        <div className="fixed right-3 top-3 z-50 flex items-center" style={{ gap: "5px" }}>
          <Link
            to="/download"
            aria-label="Download Windows app"
            className="grid h-10 w-10 place-items-center rounded-md text-foreground hover:text-primary"
          >
            <DownloadIcon className="h-6 w-6" />
          </Link>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-app-settings"))}
            aria-label="Settings"
            className="grid h-10 w-10 place-items-center rounded-md text-foreground hover:text-primary"
          >
            <SettingsIcon className="h-6 w-6" />
          </button>
          <SignedOut>
            <SignInButton mode="modal">
              <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow hover:brightness-110">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
        ) : null}

        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </QueryClientProvider>
    </ClerkProvider>
  );
}
