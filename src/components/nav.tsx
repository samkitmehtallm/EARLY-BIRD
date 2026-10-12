"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, Music2, Settings, Ticket } from "lucide-react";
import { cn } from "./ui";

const ITEMS = [
  { href: "/", label: "Shows", icon: Ticket },
  { href: "/artists", label: "Artists", icon: Music2 },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/activity", label: "Live data", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" || path.startsWith("/events") : path.startsWith(href));

export function Nav() {
  const path = usePathname();
  return (
    <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Main">
      {ITEMS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(path, href) ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-ink",
            isActive(path, href) && "bg-surface-2 text-ink",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(path, href) ? "page" : undefined}
            className={cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-muted", isActive(path, href) && "text-accent")}
          >
            <Icon size={20} strokeWidth={isActive(path, href) ? 2.4 : 1.8} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
