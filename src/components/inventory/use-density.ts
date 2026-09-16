"use client";
import { useCallback, useEffect, useState } from "react";

export type Density = "comfortable" | "compact";
const KEY = "clover:inventory:density";

/** Grid vs table, remembered per browser. Starts comfortable and hydrates from storage after mount. */
export function useDensity(): [Density, (d: Density) => void, boolean] {
  const [density, setDensityState] = useState<Density>("comfortable");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "compact" || stored === "comfortable") setDensityState(stored);
    } catch {
      // storage unavailable (private mode) — keep the default
    }
    setHydrated(true);
  }, []);
  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    try {
      localStorage.setItem(KEY, d);
    } catch {
      // ignore
    }
  }, []);
  return [density, setDensity, hydrated];
}
