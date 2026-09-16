"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { primaryNav, secondaryNav } from "./nav-config";

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

/** Global "g x" chords and single-key shortcuts. Keyboard-initiated navigation never animates. */
export function KeyboardShortcuts() {
  const router = useRouter();
  useEffect(() => {
    let pendingG = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "g") {
        pendingG = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => (pendingG = false), 900);
        return;
      }
      if (pendingG) {
        const chord = `g ${e.key}`;
        const hit = [...primaryNav, ...secondaryNav].find((n) => n.shortcut === chord);
        pendingG = false;
        if (hit) {
          e.preventDefault();
          document.documentElement.dataset.keyboardNav = "1";
          router.push(hit.href);
        }
        return;
      }
      if (e.key === "n") {
        e.preventDefault();
        router.push("/sell");
      }
      if (e.key === "?") {
        e.preventDefault();
        router.push("/help");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
