"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Sun, Moon, Monitor, LogOut, User, HelpCircle } from "lucide-react";
import { NotificationsBell } from "@/components/notifications/bell";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { DemoBadge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/card";
import { CloverWordmark } from "@/components/brand/logo";
import { useTheme } from "./theme";
import { signOut } from "@/lib/auth-client";
import type { ShellUser } from "./app-shell";
import type { Capabilities } from "@/lib/env";
import { openCommandPalette } from "./command-palette";

export function TopBar({ user, capabilities }: { user: ShellUser; capabilities: Capabilities }) {
  const { setting, setSetting } = useTheme();
  const router = useRouter();
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <header className="sticky top-0 z-20 flex h-(--topbar-h) items-center gap-3 border-b border-border-subtle bg-surface-base/90 backdrop-blur gutter">
      <Link href="/home" className="lg:hidden" aria-label="Clover home">
        <CloverWordmark size={20} />
      </Link>
      <div className="hidden flex-1 lg:block" />
      <button
        type="button"
        onClick={openCommandPalette}
        className="ml-auto hidden h-9 w-64 items-center gap-2 rounded-xs border border-border-default bg-surface-raised px-3 text-sm text-muted hover:bg-surface-sunken lg:flex"
        aria-label="Search and commands"
      >
        <Search className="size-4" aria-hidden />
        <span className="flex-1 text-left">Search or jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Search" onClick={openCommandPalette}>
        <Search className="size-5" />
      </Button>
      {(capabilities.demoMode || !capabilities.ai) && <DemoBadge className="hidden sm:inline-flex" />}
      <NotificationsBell />
      <Menu>
        <MenuTrigger asChild>
          <button type="button" className="flex size-9 items-center justify-center rounded-full bg-surface-inverse text-xs font-semibold text-inverse" aria-label="Account menu">
            {initials || <User className="size-4" />}
          </button>
        </MenuTrigger>
        <MenuContent className="w-56">
          <MenuLabel>
            <div className="truncate text-primary">{user.name}</div>
            <div className="truncate font-normal">{user.email}</div>
          </MenuLabel>
          <MenuSeparator />
          <MenuLabel>Theme</MenuLabel>
          <MenuItem onSelect={() => setSetting("light")}>
            <Sun className="size-4" /> Light {setting === "light" && <span className="ml-auto text-xs text-muted">on</span>}
          </MenuItem>
          <MenuItem onSelect={() => setSetting("dark")}>
            <Moon className="size-4" /> Dark {setting === "dark" && <span className="ml-auto text-xs text-muted">on</span>}
          </MenuItem>
          <MenuItem onSelect={() => setSetting("system")}>
            <Monitor className="size-4" /> System {setting === "system" && <span className="ml-auto text-xs text-muted">on</span>}
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => router.push("/settings")}>
            <User className="size-4" /> Settings
          </MenuItem>
          <MenuItem onSelect={() => router.push("/help")}>
            <HelpCircle className="size-4" /> Help &amp; shortcuts
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onSelect={async () => {
              await signOut();
              router.push("/sign-in");
              router.refresh();
            }}
          >
            <LogOut className="size-4" /> Sign out
          </MenuItem>
        </MenuContent>
      </Menu>
    </header>
  );
}
