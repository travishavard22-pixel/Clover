"use client";
import { useCallback, useRef, useState } from "react";

/**
 * A polite live region for save confirmations. The message is cleared and re-set so repeated
 * identical announcements are still read by screen readers.
 */
export function useAnnouncer() {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announce = useCallback((text: string) => {
    setMessage("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(text), 30);
  }, []);
  return { message, announce };
}
