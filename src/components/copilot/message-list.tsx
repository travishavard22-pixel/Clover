"use client";
import { useEffect, useRef } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { CopilotProposal } from "@/lib/copilot/proposals";
import type { AppliedProposalNote, ToolTraceEntry } from "@/lib/copilot/threads";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { MessageText } from "./message-text";
import { ProposalCard, type ProposalState } from "./proposal-card";
import { ToolChips } from "./tool-chips";

export type ViewMessage = {
  /** Stable id for rendering: the persisted id for loaded messages, a local id for ones sent this session. */
  id: string;
  /** The persisted id once the server has stored a message sent this session. */
  serverId?: string;
  role: "user" | "assistant";
  content: string;
  tools: ToolTraceEntry[];
  proposals: CopilotProposal[];
  proposalStates: Record<string, ProposalState>;
  stopped?: boolean;
  applied?: AppliedProposalNote;
  status: "streaming" | "done" | "error";
  statusLine?: string;
  error?: string;
  /** Historic messages come from the server; their proposals are read-only. */
  historic?: boolean;
  createdAt: string;
};

export function MessageList({ messages, threadId, onProposalState, onRetry }: { messages: ViewMessage[]; threadId: string | null; onProposalState: (messageId: string, proposalId: string, s: ProposalState) => void; onRetry: (message: ViewMessage) => void }) {
  const reduce = useReducedMotion();
  const endRef = useRef<HTMLDivElement>(null);
  const last = messages[messages.length - 1];
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [messages.length, last?.content.length, last?.tools.length, reduce]);

  return (
    <ol className="mx-auto w-full max-w-3xl space-y-5" aria-live="polite" aria-relevant="additions text">
      {messages.map((m, i) => (
        <motion.li
          key={m.id}
          initial={m.historic ? false : { opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
        >
          {m.role === "user" ? (
            <div className="max-w-[85%] rounded-lg rounded-br-xs bg-accent px-4 py-2.5 text-base text-on-accent sm:max-w-[70%]">
              <span className="sr-only">You: </span>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ) : (
            <div className="min-w-0 max-w-full flex-1 sm:max-w-[88%]">
              <span className="sr-only">Copilot: </span>
              {m.applied ? (
                <div className="flex items-start gap-2 rounded-sm border border-border-subtle bg-surface-raised px-4 py-3 text-sm">
                  <Badge tone="success" className="shrink-0">
                    Applied
                  </Badge>
                  <span className="text-primary">{m.content}</span>
                </div>
              ) : (
                <div className="rounded-lg rounded-bl-xs border border-border-subtle bg-surface-raised px-4 py-3 text-base text-primary">
                  {m.status === "streaming" && !m.content && (
                    <p className="flex items-center gap-2 text-sm text-secondary" role="status">
                      <span className="inline-flex gap-0.5" aria-hidden>
                        <Dot delay={0} />
                        <Dot delay={0.15} />
                        <Dot delay={0.3} />
                      </span>
                      {m.statusLine ?? "Thinking"}
                    </p>
                  )}
                  {m.content && <MessageText text={m.content} className="leading-relaxed" />}
                  {m.stopped && <p className="mt-2 text-xs text-muted">Stopped — this reply is incomplete.</p>}
                  <ToolChips tools={m.tools} live={m.status === "streaming"} />
                  {m.proposals.map((p) => (
                    <ProposalCard
                      key={p.id}
                      proposal={p}
                      threadId={threadId}
                      readOnly={m.historic}
                      state={m.proposalStates[p.id] ?? { status: "pending" }}
                      onState={(s) => onProposalState(m.id, p.id, s)}
                    />
                  ))}
                  {m.status === "error" && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xs bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                      <span className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {m.error ?? "The copilot could not answer."}
                      </span>
                      {i === messages.length - 1 && (
                        <Button size="sm" variant="outline" leadingIcon={<RotateCcw className="size-3.5" aria-hidden />} onClick={() => onRetry(m)}>
                          Try again
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </motion.li>
      ))}
      <div ref={endRef} aria-hidden />
    </ol>
  );
}

function Dot({ delay }: { delay: number }) {
  const reduce = useReducedMotion();
  return <motion.span className="inline-block size-1.5 rounded-full bg-muted" animate={reduce ? { opacity: [0.4, 1, 0.4] } : { y: [0, -3, 0], opacity: [0.4, 1, 0.4] }} transition={{ duration: 0.9, repeat: Infinity, delay, ease: "easeInOut" }} />;
}
