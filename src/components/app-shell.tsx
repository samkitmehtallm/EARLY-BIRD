import Link from "next/link";
import { has } from "@/lib/env";
import { getLatestRun } from "@/lib/queries";
import type { ScanRun } from "@/lib/types";
import { MobileNav, Nav } from "./nav";
import { LivePill } from "./live-pill";
import { ScanButton } from "./scan-button";

export async function AppShell({ children }: { children: React.ReactNode }) {
  let lastRun: ScanRun | null = null;
  if (has.db()) {
    try {
      lastRun = await getLatestRun();
    } catch {}
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Early Bird home">
            <Logo />
            <span className="font-display text-[19px] font-extrabold tracking-tight">Early Bird</span>
          </Link>
          <Nav />
          <div className="ml-auto flex items-center gap-2">
            <LivePill lastRun={lastRun} />
            <ScanButton disabled={!has.db()} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 sm:pt-8 md:pb-16">{children}</main>
      <MobileNav />
    </div>
  );
}

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
      <rect width="28" height="28" rx="8" fill="var(--ink)" />
      <path d="M7 17.5c2.2-5.5 6.4-8.5 13-9-1.6 1.4-2.6 3.1-3 5.2 1.6-.3 2.9-.1 4 .6-3.4.6-6 2.3-7.6 5.1-1.7-1.8-3.8-2.5-6.4-1.9Z" fill="var(--eb)" />
      <circle cx="18.6" cy="11.1" r="1.1" fill="var(--ink)" />
    </svg>
  );
}
