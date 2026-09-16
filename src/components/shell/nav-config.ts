import { Camera, Home, Package, Inbox, BarChart3, Zap, Sparkles, Plug, Settings, Tag } from "lucide-react";

export type NavItem = { href: string; label: string; icon: typeof Home; shortcut?: string; mobile?: boolean; description?: string };

export const primaryNav: NavItem[] = [
  { href: "/home", label: "Home", icon: Home, shortcut: "g h", mobile: true },
  { href: "/sell", label: "Sell", icon: Camera, shortcut: "n", mobile: true, description: "Scan or upload an item" },
  { href: "/inventory", label: "Inventory", icon: Package, shortcut: "g i", mobile: true },
  { href: "/listings", label: "Listings", icon: Tag, shortcut: "g l" },
  { href: "/offers", label: "Offers", icon: Inbox, shortcut: "g o", mobile: true },
  { href: "/insights", label: "Insights", icon: BarChart3, shortcut: "g s" },
  { href: "/automations", label: "Automations", icon: Zap, shortcut: "g a" },
  { href: "/copilot", label: "Copilot", icon: Sparkles, shortcut: "g c" },
];

export const secondaryNav: NavItem[] = [
  { href: "/connections", label: "Connections", icon: Plug, shortcut: "g x" },
  { href: "/settings", label: "Settings", icon: Settings, shortcut: "g ," },
];
