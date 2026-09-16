"use client";
import { useCallback, useRef, useState } from "react";
import type { CopilotStreamEvent } from "@/lib/copilot/stream";
import { readApiError } from "@/lib/client/request";

/**
 * Sends one message and parses the SSE reply from `POST /api/copilot/threads/[id]/messages`.
 * `stop()` aborts the request; the server stores whatever was generated so far.
 */
export function useCopilotStream() {
  const controller = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState(false);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  const send = useCallback(async (threadId: string, content: string, onEvent: (ev: CopilotStreamEvent) => void): Promise<"done" | "stopped"> => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setStreaming(true);
    try {
      const res = await fetch(`/api/copilot/threads/${encodeURIComponent(threadId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ content }),
        signal: ac.signal,
      });
      if (!res.ok) throw await readApiError(res);
      if (!res.body) throw new Error("The copilot returned no stream.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const data = frame
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("\n");
          if (!data) continue;
          try {
            onEvent(JSON.parse(data) as CopilotStreamEvent);
          } catch {
            // malformed frame; skip it rather than break the stream
          }
        }
      }
      return "done";
    } catch (err) {
      if (ac.signal.aborted) return "stopped";
      throw err;
    } finally {
      if (controller.current === ac) controller.current = null;
      setStreaming(false);
    }
  }, []);

  return { send, stop, streaming };
}
