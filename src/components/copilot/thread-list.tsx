"use client";
import { useState } from "react";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ThreadDTO } from "@/lib/copilot/threads";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/client/request";
import { TimeAgo } from "@/lib/client/time-ago";
import { cn } from "@/lib/utils/cn";
import { copilotApi } from "./copilot-api";

export function ThreadList({ threads, activeId, onSelect, onNew, onDeleted, className }: { threads: ThreadDTO[]; activeId: string | null; onSelect: (id: string) => void; onNew: () => void; onDeleted: (id: string) => void; className?: string }) {
  const [confirm, setConfirm] = useState<ThreadDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      await copilotApi.deleteThread(confirm.id);
      onDeleted(confirm.id);
      setConfirm(null);
    } catch (err) {
      toast.error(errorMessage(err, "Could not delete the conversation."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <nav aria-label="Conversations" className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center justify-between gap-2 pb-3">
        <h2 className="text-sm font-semibold text-primary">Conversations</h2>
        <Button size="sm" variant="outline" leadingIcon={<Plus className="size-4" aria-hidden />} onClick={onNew}>
          New
        </Button>
      </div>
      {threads.length === 0 ? (
        <p className="text-sm text-muted">No conversations yet. Ask something to start one.</p>
      ) : (
        <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {threads.map((t) => {
            const active = t.id === activeId;
            return (
              <li key={t.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn("flex w-full flex-col items-start gap-0.5 rounded-xs px-2.5 py-2 pr-9 text-left transition-colors hover:bg-surface-sunken", active && "bg-surface-sunken")}
                >
                  <span className="flex w-full items-center gap-2">
                    <MessageSquare className="size-3.5 shrink-0 text-muted" aria-hidden />
                    <span className={cn("line-clamp-1 text-sm", active ? "font-medium text-primary" : "text-primary")}>{t.title}</span>
                  </span>
                  <span className="pl-5.5 text-xs text-muted">
                    {t.messageCount} message{t.messageCount === 1 ? "" : "s"} · <TimeAgo iso={t.updatedAt} />
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete conversation “${t.title}”`}
                  onClick={() => setConfirm(t)}
                  className="absolute right-1 top-1.5 flex size-7 items-center justify-center rounded-xs text-muted opacity-0 transition-opacity hover:bg-surface-raised hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 [@media(pointer:coarse)]:opacity-100"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent title="Delete this conversation?" description="The messages are removed for good. Changes you already confirmed stay applied." size="sm">
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Keep it</Button>
            </DialogClose>
            <Button variant="danger" onClick={remove} loading={deleting}>
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
