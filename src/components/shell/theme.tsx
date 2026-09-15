"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeSetting = "system" | "light" | "dark";
type Ctx = { setting: ThemeSetting; resolved: "light" | "dark"; setSetting: (s: ThemeSetting) => void };
const ThemeCtx = createContext<Ctx | null>(null);

function resolve(setting: ThemeSetting): "light" | "dark" {
  if (setting !== "system") return setting;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [setting, setSettingState] = useState<ThemeSetting>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem("clover:theme");
    } catch {}
    const s: ThemeSetting = stored === "dark" || stored === "light" ? stored : "system";
    setSettingState(s);
    setResolved(resolve(s));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(resolve(s));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  const setSetting = useCallback((s: ThemeSetting) => {
    setSettingState(s);
    setResolved(resolve(s));
    try {
      if (s === "system") localStorage.removeItem("clover:theme");
      else localStorage.setItem("clover:theme", s);
    } catch {}
  }, []);

  const value = useMemo(() => ({ setting, resolved, setSetting }), [setting, resolved, setSetting]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme outside ThemeProvider");
  return ctx;
}
