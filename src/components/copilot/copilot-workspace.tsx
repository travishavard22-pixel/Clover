"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { toast } from "sonner";
import type { CopilotStreamEvent } from "@/lib/copilot/stream";
import type { MessageDTO, ThreadDTO } from "@/lib/copilot/threads";
import { Button } from "@/components/ui/button";
import { DemoBadge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/client/request";
import { cn } from "@/lib/utils/cn";
import { copilotApi } from "./copilot-api";
import { Composer } from "./composer";
import { MessageList, type ViewMessage } from "./message-list";
import type { ProposalState } from "./proposal-card";
import { SuggestedPrompts } from "./suggested-prompts";
import { ThreadList } from "./thread-list";
import { useCopilotStream } from "./use-copilot-stream";

function fromDTO(m: MessageDTO): ViewMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    tools: m.toolTrace?.tools ?? [],
    proposals: m.toolTrace?.proposals ?? [],
    proposalStates: {},
    stopped: m.toolTrace?.stopped,
    applied: m.toolTrace?.applied,
    status: "done",
    historic: true,
    createdAt: m.createdAt,
  };
}

let localSeq = 0;
const localId = (p: string) => `${p}-${Date.now()}-${++localSeq}`;

export function CopilotWorkspace({ initialThreads, initialThreadId, initialMessages, demo }: { initialThreads: ThreadDTO[]; initialThreadId: string | null; initialMessages: MessageDTO[]; demo: boolean }) {
  const router = useRouter();
  const [threads, setThreads] = useState(initialThreads);
  const [activeId, setActiveId] = useState<string | null>(initialThreadId);
  const [messages, setMessages] = useState<ViewMessage[]>(initialMessages.map(fromDTO));
  const [loadingThread, setLoadingThread] = useState(false);
  const [draft, setDraft] = useState("");
  const [railOpen, setRailOpen] = useState(false);
  const { send, stop, streaming } = useCopilotStream();
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  const syncUrl = useCallback(
    (id: string | null) => {
      router.replace(id ? `/copilot?thread=${encodeURIComponent(id)}` : "/copilot", { scroll: false });
    },
    [router],
  );

  const openThread = useCallback(
    async (id: string) => {
      if (streaming) stop();
      setRailOpen(false);
      setActiveId(id);
      syncUrl(id);
      setLoadingThread(true);
      try {
        const { messages: ms } = await copilotApi.thread(id);
        if (activeRef.current === id) setMessages(ms.map(fromDTO));
      } catch (err) {
        toast.error(errorMessage(err, "Could not open that conversation."));
      } finally {
        setLoadingThread(false);
      }
    },
    [streaming, stop, syncUrl],
  );

  const newThread = useCallback(() => {
    if (streaming) stop();
    setRailOpen(false);
    setActiveId(null);
    setMessages([]);
    syncUrl(null);
  }, [streaming, stop, syncUrl]);

  const refreshThreads = useCallback(async () => {
    try {
      const { threads: ts } = await copilotApi.threads();
      setThreads(ts);
    } catch {
      // the list is a convenience; the conversation itself is unaffected
    }
  }, []);

  const patchMessage = (id: string, fn: (m: ViewMessage) => ViewMessage) => setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));

  const sendMessage = useCallback(
    async (content: string) => {
      let threadId = activeId;
      const userLocal = localId("u");
      const assistantLocal = localId("a");
      const now = new Date().toISOString();
      setMessages((ms) => [
        ...ms,
        { id: userLocal, role: "user", content, tools: [], proposals: [], proposalStates: {}, status: "done", createdAt: now },
        { id: assistantLocal, role: "assistant", content: "", tools: [], proposals: [], proposalStates: {}, status: "streaming", statusLine: "Thinking", createdAt: now },
      ]);
      try {
        if (!threadId) {
          const { thread } = await copilotApi.createThread();
          threadId = thread.id;
          setActiveId(thread.id);
          activeRef.current = thread.id;
          setThreads((ts) => [thread, ...ts]);
          syncUrl(thread.id);
        }
        const onEvent = (ev: CopilotStreamEvent) => {
          switch (ev.type) {
            case "status":
              patchMessage(assistantLocal, (m) => ({ ...m, statusLine: ev.message }));
              break;
            case "text":
              patchMessage(assistantLocal, (m) => ({ ...m, content: m.content + ev.delta }));
              break;
            case "tool_call":
              patchMessage(assistantLocal, (m) => ({ ...m, statusLine: "Looking at your data", tools: [...m.tools, { name: ev.name, input: ev.input, summary: "" }] }));
              break;
            case "tool_result":
              patchMessage(assistantLocal, (m) => {
                const idx = m.tools.findIndex((t) => t.name === ev.name && t.summary === "");
                const tools = idx === -1 ? [...m.tools, { name: ev.name, input: {}, summary: ev.summary }] : m.tools.map((t, i) => (i === idx ? { ...t, summary: ev.summary } : t));
                return { ...m, tools };
              });
              break;
            case "proposal":
              patchMessage(assistantLocal, (m) => (m.proposals.some((p) => p.id === ev.proposal.id) ? m : { ...m, proposals: [...m.proposals, ev.proposal] }));
              break;
            case "message":
              // Bubbles keep their local ids for the whole turn; the persisted id is recorded alongside.
              patchMessage(ev.role === "user" ? userLocal : assistantLocal, (m) => ({ ...m, serverId: ev.id }));
              break;
            case "done":
              patchMessage(assistantLocal, (m) => ({ ...m, status: "done", content: ev.text.trim().length >= m.content.trim().length ? ev.text : m.content, tools: ev.toolTrace.length ? ev.toolTrace.map((t) => ({ name: t.name, input: t.input ?? {}, summary: t.summary })) : m.tools, statusLine: undefined }));
              break;
            case "error":
              patchMessage(assistantLocal, (m) => ({ ...m, status: "error", error: ev.message, statusLine: undefined }));
              break;
          }
        };
        const outcome = await send(threadId, content, onEvent);
        if (outcome === "stopped") patchMessage(assistantLocal, (m) => ({ ...m, status: "done", stopped: true, statusLine: undefined }));
        void refreshThreads();
      } catch (err) {
        patchMessage(assistantLocal, (m) => ({ ...m, status: "error", error: errorMessage(err, "The copilot could not answer. Your message is saved — try again."), statusLine: undefined }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, send, syncUrl, refreshThreads],
  );

  const onProposalState = (messageId: string, proposalId: string, s: ProposalState) => {
    patchMessage(messageId, (m) => ({ ...m, proposalStates: { ...m.proposalStates, [proposalId]: s } }));
    if (s.status === "applied") void refreshThreads();
  };

  const onRetry = (failed: ViewMessage) => {
    const idx = messages.findIndex((m) => m.id === failed.id);
    const prior = idx > 0 ? messages[idx - 1] : undefined;
    if (!prior || prior.role !== "user") return;
    setMessages((ms) => ms.filter((m) => m.id !== failed.id && m.id !== prior.id));
    void sendMessage(prior.content);
  };

  const onDeleted = (id: string) => {
    setThreads((ts) => ts.filter((t) => t.id !== id));
    if (activeId === id) newThread();
  };

  const empty = messages.length === 0 && !loadingThread;
  const activeThread = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId]);

  return (
    <div className="flex h-[calc(100dvh-var(--topbar-h)-var(--tabbar-h))] min-h-[480px] lg:h-[calc(100dvh-var(--topbar-h))]">
      {/* Desktop rail */}
      <aside className="hidden w-72 shrink-0 border-r border-border-subtle bg-surface-base px-4 py-5 lg:block">
        <ThreadList threads={threads} activeId={activeId} onSelect={openThread} onNew={newThread} onDeleted={onDeleted} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col" aria-label="Conversation">
        <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open conversations" onClick={() => setRailOpen(true)}>
              <PanelLeft className="size-4" aria-hidden />
            </Button>
            <h1 className="truncate text-sm font-semibold text-primary">{activeThread?.title ?? "New conversation"}</h1>
          </div>
          <div className="flex items-center gap-2">
            {demo && <DemoBadge />}
            <Button variant="outline" size="sm" className="lg:hidden" onClick={newThread}>
              New
            </Button>
          </div>
        </header>

        <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8", empty && "flex items-center justify-center")}>
          {empty ? (
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="serif-display text-4xl text-primary sm:text-5xl">Ask about your inventory.</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-secondary sm:text-base">Answers come from your own items, listings and offers. Recorded prices are facts; Clover&apos;s price estimates are marked as estimates. The copilot proposes changes — you confirm them.</p>
              <SuggestedPrompts className="mt-6" onPick={(p) => void sendMessage(p)} disabled={streaming} />
            </div>
          ) : loadingThread ? (
            <div className="mx-auto w-full max-w-3xl space-y-4" aria-busy>
              <div className="skeleton ml-auto h-10 w-2/3 rounded-lg" />
              <div className="skeleton h-24 w-5/6 rounded-lg" />
              <div className="skeleton ml-auto h-10 w-1/2 rounded-lg" />
            </div>
          ) : (
            <MessageList messages={messages} threadId={activeId} onProposalState={onProposalState} onRetry={onRetry} />
          )}
        </div>

        <div className="border-t border-border-subtle bg-surface-base px-4 py-3 lg:px-8">
          <div className="mx-auto w-full max-w-3xl space-y-2">
            {!empty && messages.length <= 2 && !streaming && <SuggestedPrompts compact onPick={(p) => void sendMessage(p)} className="hidden sm:flex" />}
            <Composer value={draft} onValueChange={setDraft} onSend={(t) => void sendMessage(t)} onStop={stop} streaming={streaming} autoFocus />
          </div>
        </div>
      </section>

      <Dialog open={railOpen} onOpenChange={setRailOpen}>
        <DialogContent title="Conversations" size="sm" hideTitle>
          <div className="h-[60dvh]">
            <ThreadList threads={threads} activeId={activeId} onSelect={openThread} onNew={newThread} onDeleted={onDeleted} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
