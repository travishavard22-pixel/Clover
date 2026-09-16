import { db, Prisma, type CopilotMessage, type CopilotThread } from "../db";
import { ApiError } from "../api";
import type { CopilotTurn } from "../ai/provider";
import type { CopilotProposal } from "./proposals";

export type ToolTraceEntry = { name: string; input: Record<string, unknown>; summary: string };
/** Recorded on the confirmation message written when the seller applies a proposal from the thread. */
export type AppliedProposalNote = { proposalId: string; kind: CopilotProposal["kind"]; summary: string };
export type StoredToolTrace = { tools: ToolTraceEntry[]; proposals: CopilotProposal[]; stopped?: boolean; applied?: AppliedProposalNote };

export type ThreadDTO = { id: string; title: string; createdAt: string; updatedAt: string; messageCount: number; preview: string | null };
export type MessageDTO = { id: string; role: "user" | "assistant"; content: string; toolTrace: StoredToolTrace | null; createdAt: string };

export function toThreadDTO(t: CopilotThread & { _count?: { messages: number }; messages?: Pick<CopilotMessage, "content">[] }): ThreadDTO {
  return { id: t.id, title: t.title, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(), messageCount: t._count?.messages ?? 0, preview: t.messages?.[0]?.content.slice(0, 120) ?? null };
}

export function toMessageDTO(m: CopilotMessage): MessageDTO {
  return { id: m.id, role: m.role === "assistant" ? "assistant" : "user", content: m.content, toolTrace: parseTrace(m.toolTrace), createdAt: m.createdAt.toISOString() };
}

export function parseTrace(raw: unknown): StoredToolTrace | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<StoredToolTrace>;
  return { tools: Array.isArray(r.tools) ? r.tools : [], proposals: Array.isArray(r.proposals) ? (r.proposals as CopilotProposal[]) : [], stopped: r.stopped === true, applied: r.applied && typeof r.applied === "object" ? r.applied : undefined };
}

export async function listThreads(userId: string, limit = 50): Promise<ThreadDTO[]> {
  const rows = await db.copilotThread.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, take: limit, include: { _count: { select: { messages: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true } } } });
  return rows.map(toThreadDTO);
}

export async function createThread(userId: string, title?: string) {
  return db.copilotThread.create({ data: { userId, title: title?.trim() || "New conversation" } });
}

export async function getOwnedThread(userId: string, threadId: string) {
  const t = await db.copilotThread.findFirst({ where: { id: threadId, userId } });
  if (!t) throw new ApiError(404, "Conversation not found", "not_found");
  return t;
}

export async function getThreadMessages(threadId: string, take = 200): Promise<MessageDTO[]> {
  const rows = await db.copilotMessage.findMany({ where: { threadId }, orderBy: { createdAt: "asc" }, take });
  return rows.map(toMessageDTO);
}

export async function appendMessage(threadId: string, role: "user" | "assistant", content: string, toolTrace?: StoredToolTrace | null) {
  const [message] = await db.$transaction([
    db.copilotMessage.create({ data: { threadId, role, content, toolTrace: toolTrace ? (toolTrace as unknown as Prisma.InputJsonValue) : undefined } }),
    db.copilotThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } }),
  ]);
  return message;
}

/** The recent history the model sees. Tool traces are collapsed into a short note so the model knows what it already looked at. */
export async function historyFor(threadId: string, maxTurns = 30): Promise<CopilotTurn[]> {
  const rows = await db.copilotMessage.findMany({ where: { threadId }, orderBy: { createdAt: "desc" }, take: maxTurns });
  return rows.reverse().map((m) => {
    const trace = parseTrace(m.toolTrace);
    const note = trace && trace.tools.length ? `\n\n(Looked at: ${trace.tools.map((t) => t.name).join(", ")})` : "";
    return { role: m.role === "assistant" ? "assistant" : "user", content: `${m.content}${m.role === "assistant" ? note : ""}` };
  });
}

export async function deleteThread(userId: string, threadId: string) {
  const t = await getOwnedThread(userId, threadId);
  await db.copilotThread.delete({ where: { id: t.id } });
}
