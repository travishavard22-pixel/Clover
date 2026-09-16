"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera } from "lucide-react";
import { CloverWordmark, CloverMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils/cn";
import { primaryNav, secondaryNav } from "./nav-config";
import { TopBar } from "./top-bar";
import { CommandPalette } from "./command-palette";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import type { Capabilities } from "@/lib/env";

export type ShellUser = { id: string; name: string; email: string; image?: string | null };

export function AppShell({ user, capabilities, unread, children }: { user: ShellUser; capabilities: Capabilities; unread: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const immersive = pathname.startsWith("/sell/capture");

  return (
    <div className="min-h-dvh bg-surface-base">
      <CommandPalette />
      <KeyboardShortcuts />
      {/* Desktop sidebar */}
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden w-(--nav-w) flex-col border-r border-border-subtle bg-surface-base lg:flex", immersive && "lg:hidden")} aria-label="Primary">
        <div className="flex h-(--topbar-h) items-center px-5">
          <Link href="/home" className="rounded-xs" aria-label="Clover home">
            <CloverWordmark size={22} />
          </Link>
        </div>
        <nav className="flex-1 space-y-6 px-3 py-2">
          <ul className="space-y-0.5">
            {primaryNav.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={cn(
                    "group flex h-9 items-center gap-3 rounded-xs px-2.5 text-sm font-medium text-secondary transition-colors hover:bg-surface-sunken hover:text-primary",
                    isActive(n.href) && "bg-surface-sunken text-primary",
                    n.href === "/sell" && "text-accent-text",
                  )}
                >
                  <n.icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                  <span className="flex-1">{n.label}</span>
                  {n.href === "/offers" && unread > 0 && (
                    <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold tabular text-on-accent">
                      {unread}
                      <span className="sr-only"> pending</span>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <ul className="space-y-0.5 border-t border-border-subtle pt-4">
            {secondaryNav.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-3 rounded-xs px-2.5 text-sm font-medium text-secondary transition-colors hover:bg-surface-sunken hover:text-primary",
                    isActive(n.href) && "bg-surface-sunken text-primary",
                  )}
                >
                  <n.icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="px-5 py-4 text-xs text-muted">
          {capabilities.demoMode || !capabilities.ai ? (
            <p>
              <span className="font-medium text-warning">Demo providers active.</span> Add API keys to enable live AI and marketplace calls.
            </p>
          ) : (
            <p>Live providers connected.</p>
          )}
        </div>
      </aside>

      {/* Main column */}
      <div className={cn("flex min-h-dvh flex-col", !immersive && "lg:pl-(--nav-w)")}>
        {!immersive && <TopBar user={user} capabilities={capabilities} />}
        <main id="main" className={cn("flex-1", !immersive && "pb-(--tabbar-h) lg:pb-0")}>
          {children}
        </main>
      </div>

      {/* Mobile tab bar */}
      {!immersive && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface-base/95 backdrop-blur safe-bottom lg:hidden" aria-label="Primary">
          <ul className="grid h-(--tabbar-h) grid-cols-5">
            {primaryNav
              .filter((n) => n.mobile)
              .map((n) =>
                n.href === "/sell" ? (
                  <li key={n.href} className="flex items-center justify-center">
                    <Link href="/sell" aria-label="Sell an item" className="flex size-12 -translate-y-3 items-center justify-center rounded-full bg-accent text-on-accent shadow-lift">
                      <Camera className="size-5" aria-hidden />
                    </Link>
                  </li>
                ) : (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={isActive(n.href) ? "page" : undefined}
                      className={cn("flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted", isActive(n.href) && "text-primary")}
                    >
                      <span className="relative">
                        <n.icon className="size-5" strokeWidth={1.75} aria-hidden />
                        {n.href === "/offers" && unread > 0 && <span className="absolute -right-1.5 -top-1 size-2 rounded-full bg-accent" aria-hidden />}
                      </span>
                      {n.label}
                    </Link>
                  </li>
                ),
              )}
          </ul>
        </nav>
      )}
      <span className="sr-only">
        <CloverMark size={1} />
      </span>
    </div>
  );
}
