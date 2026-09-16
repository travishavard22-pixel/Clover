"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

/**
 * Click-to-edit text. Enter saves, Escape cancels, blur saves when the value changed. The display
 * element is a real button so it is focusable and announced; `onSave` may reject to keep editing.
 */
export function InlineEdit({
  value,
  onSave,
  label,
  placeholder = "Add",
  className,
  displayClassName,
  inputClassName,
  maxLength = 200,
  multiline = false,
  disabled,
  renderDisplay,
}: {
  value: string;
  onSave: (next: string) => Promise<void> | void;
  label: string;
  placeholder?: string;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  maxLength?: number;
  multiline?: boolean;
  disabled?: boolean;
  renderDisplay?: (value: string) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const cancel = () => {
    cancelledRef.current = true;
    setEditing(false);
    setDraft(value);
    setError(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const commit = async () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const next = draft.trim();
    if (next === value.trim()) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      setEditing(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      ref.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          cancelledRef.current = false;
          setDraft(value);
          setError(null);
          setEditing(true);
        }}
        aria-label={`Edit ${label}${value ? `: ${value}` : ""}`}
        className={cn(
          "group inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-xs text-left transition-colors hover:bg-surface-sunken disabled:hover:bg-transparent",
          !value && "text-muted",
          displayClassName,
        )}
      >
        <span className="min-w-0 break-words">{value ? (renderDisplay ? renderDisplay(value) : value) : placeholder}</span>
        {!disabled && <Pencil className="size-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />}
      </button>
    );
  }

  const shared = {
    ref,
    value: draft,
    maxLength,
    disabled: busy,
    "aria-label": label,
    "aria-invalid": !!error,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: () => void commit(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void commit();
      }
    },
  };

  return (
    <div className={cn("flex w-full flex-col gap-1", className)}>
      <div className="flex items-center gap-1.5">
        {multiline ? <textarea {...shared} rows={2} className={cn("w-full rounded-xs border border-border-default bg-surface-raised px-3 py-1.5 text-base text-primary focus-visible:border-accent", inputClassName)} /> : <Input {...shared} className={cn("h-9", inputClassName)} />}
        <Button variant="ghost" size="icon-sm" aria-label="Save" onMouseDown={(e) => e.preventDefault()} onClick={() => void commit()} loading={busy}>
          <Check className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Cancel" onMouseDown={(e) => e.preventDefault()} onClick={cancel} disabled={busy}>
          <X className="size-4" />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <p className="text-[11px] text-muted">Enter to save · Esc to cancel</p>
    </div>
  );
}
