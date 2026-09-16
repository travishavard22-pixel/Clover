"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { copyText } from "./api-client";

/** Copy-to-clipboard with a 1.6 s "Copied" state and an honest failure state. */
export function useCopy(resetMs = 1600) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      setState(ok ? "copied" : "failed");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), resetMs);
      return ok;
    },
    [resetMs],
  );
  return { state, copy };
}
