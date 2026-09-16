"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

/** Enter sends, Shift+Enter adds a line. Stop aborts the reply and keeps what arrived. */
export function Composer({ onSend, onStop, streaming, disabled, autoFocus, value, onValueChange }: { onSend: (text: string) => void; onStop: () => void; streaming: boolean; disabled?: boolean; autoFocus?: boolean; value: string; onValueChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus && !isTouch) ref.current?.focus();
  }, [autoFocus, isTouch]);

  const submit = () => {
    const text = value.trim();
    if (!text || streaming || disabled) return;
    onSend(text);
    onValueChange("");
  };

  return (
    <form
      className="rounded-md border border-border-default bg-surface-raised shadow-[0_1px_2px_oklch(0_0_0/0.04)] focus-within:border-accent"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="copilot-composer" className="sr-only">
        Message the copilot
      </label>
      <textarea
        id="copilot-composer"
        ref={ref}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder="Ask about your inventory…"
        aria-describedby="copilot-composer-hint"
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        className={cn("block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3 text-base text-primary placeholder:text-muted focus:outline-none disabled:opacity-60")}
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <p id="copilot-composer-hint" className="hidden pl-2 text-xs text-muted sm:block">
          <Kbd>Enter</Kbd> to send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> for a new line
        </p>
        <p className="pl-2 text-xs text-muted sm:hidden">Answers use your inventory. Estimates are labelled.</p>
        {streaming ? (
          <Button type="button" size="sm" variant="outline" onClick={onStop} leadingIcon={<Square className="size-3.5 fill-current" aria-hidden />}>
            Stop
          </Button>
        ) : (
          <Button type="submit" size="icon" aria-label="Send message" disabled={disabled || !value.trim()} className="rounded-full">
            <ArrowUp className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </form>
  );
}
