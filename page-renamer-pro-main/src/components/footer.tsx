import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-card/50 py-4 backdrop-blur-xl">
      <div className="mx-auto max-w-3xl px-4 text-center text-xs text-muted-foreground">
        <div>
          © {new Date().getFullYear()} <span className="font-semibold text-foreground">Page Renamer Pro</span>. All rights reserved.
        </div>

        <div className="mt-1 text-[11px]">
          Developed with care by <span className="font-medium text-primary">MH Sami</span>
        </div>

        <div className="mt-2 flex items-center justify-center gap-3 text-[11px]">
          <Link to="/about" className="hover:text-primary hover:underline">
            About this WebApp
          </Link>
          <span aria-hidden className="opacity-40">•</span>
          <Link to="/privacy" className="hover:text-primary hover:underline">
            Privacy Policy
          </Link>
          <span aria-hidden className="opacity-40">•</span>
          <Link to="/terms" className="hover:text-primary hover:underline">
            Terms of Service
          </Link>
        </div>
      </div>
    </footer>
  );
}
