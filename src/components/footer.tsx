export function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-card/50 py-4 backdrop-blur-xl">
      <div className="mx-auto max-w-3xl px-4 text-center text-xs text-muted-foreground">
        {/* কপিরাইট টেক্সট */}
        <div>
          © {new Date().getFullYear()} <span className="font-semibold text-foreground">Page Renamer Pro</span>. All rights reserved.
        </div>
        
        {/* আপনার নাম - একদম কাছাকাছি এবং মিনিমাল স্পেসিংয়ে */}
        <div className="mt-1 text-[11px]">
          Developed by <span className="font-medium text-primary">MH Sami</span>
        </div>
      </div>
    </footer>
  );
}
