import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-line bg-oat">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 text-sm text-muted sm:flex-row">
        <p className="font-display">
          © {new Date().getFullYear()} leadscout. Made in Nigeria.
        </p>
        <nav className="flex gap-6">
          <Link href="/pricing" className="transition-colors hover:text-fg">
            Pricing
          </Link>
          <Link href="/terms" className="transition-colors hover:text-fg">
            Terms
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-fg">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
