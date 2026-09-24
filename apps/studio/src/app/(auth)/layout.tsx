import Link from "next/link";
import LanguageSwitcher from "@/presentation/components/LanguageSwitcher";
import ThemeToggle from "@/presentation/components/ThemeToggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen flex flex-col justify-between bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden">
      {/* Background glow effects */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full blur-[140px] opacity-20"
        style={{
          background:
            "radial-gradient(circle, var(--accent-primary) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full blur-[120px] opacity-10"
        style={{
          background:
            "radial-gradient(circle, var(--accent-secondary) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Top Navigation */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="rounded-full px-4 py-2 glass hover:border-[var(--accent-primary)] transition-colors group flex items-center gap-1"
        >
          <span className="text-base font-semibold tracking-tight text-[var(--text-primary)]">
            Wave<span className="text-[var(--accent-primary)]">IA</span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main Form Container */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:px-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-xs text-[var(--text-muted)]">
        &copy; {new Date().getFullYear()} WaveIA Studio &bull; Next-Gen Mastering
      </footer>
    </div>
  );
}
