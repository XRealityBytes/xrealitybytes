import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 bg-slate-950/80">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-4 px-6 py-8 text-sm text-slate-400 sm:flex-row sm:items-center">
        <p>© {new Date().getFullYear()} XRealityBytes Lab. Weekly experiments, stable fallbacks.</p>
        <div className="flex items-center gap-4">
          <Link href="/lab" className="transition-colors hover:text-slate-100">
            Lab
          </Link>
          <Link href="/log" className="transition-colors hover:text-slate-100">
            Log
          </Link>
          <Link href="/work" className="transition-colors hover:text-slate-100">
            Work
          </Link>
          <Link href="/contact" className="transition-colors hover:text-slate-100">
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}
