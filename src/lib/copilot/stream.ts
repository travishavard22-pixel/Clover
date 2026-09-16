import { getAiProvider } from "../ai";
import type { CopilotEvent } from "../ai/provider";
import { audit } from "../audit";
import { db } from "../db";
import { buildSystemContext } from "./context";
import { COPILOT_SYSTEM_PROMPT, threadTitleFrom } from "./prompts";
import type { CopilotProposal } from "./proposals";
import { appendMessage, historyFor, type StoredToolTrace, type ToolTraceEntry } from "./threads";
import { buildCopilotTools } from "./tools";

/** Events the client receives. The provider's events plus `proposal` cards and a `message` id for persistence. */
export type CopilotStreamEvent =
  | CopilotEvent
  | { type: "proposal"; proposal: CopilotProposal }
  | { type: "message"; id: string; role: "user" | "assistant" }
  | { type: "status"; message: string };

export const GRACEFUL_ERROR = "Clover's copilot couldn't answer just now. Your message is saved — try again in a moment.";

/**
 * Runs one turn: persists the user's message, streams the provider's events, collects proposals
 * raised by tools, and persists the assistant's reply (or a stopped/partial reply). Any provider
 * failure becomes an `error` event rather than a broken stream.
 */
export async function* runCopilotTurn(input: { userId: string; threadId: string; content: string; signal?: AbortSignal; now?: Date }): AsyncGenerator<CopilotStreamEvent> {
  const { userId, threadId, content } = input;
  const now = input.now ?? new Date();
  const userMsg = await appendMessage(threadId, "user", content);
  yield { type: "message", id: userMsg.id, role: "user" };

  const thread = await db.copilotThread.findUnique({ where: { id: threadId }, select: { title: true } });
  if (thread?.title === "New conversation") await db.copilotThread.update({ where: { id: threadId }, data: { title: threadTitleFrom(content) } });

  const proposals: CopilotProposal[] = [];
  const pending: CopilotProposal[] = [];
  const tools = buildCopilotTools(userId, { push: (p) => pending.push(p) }, now);
  const trace: ToolTraceEntry[] = [];
  let text = "";
  let finished = false;

  const persistAssistant = async (stopped: boolean) => {
    if (!text.trim() && trace.length === 0 && proposals.length === 0) return null;
    const stored: StoredToolTrace = { tools: trace, proposals, stopped: stopped || undefined };
    const msg = await appendMessage(threadId, "assistant", text.trim() || (stopped ? "(stopped)" : ""), stored);
    return msg.id;
  };

  try {
    yield { type: "status", message: "Reading your inventory" };
    const [provider, context, history] = await Promise.all([getAiProvider(), buildSystemContext(userId, now), historyFor(threadId)]);
    const system = `${COPILOT_SYSTEM_PROMPT}\n\n--- Seller snapshot ---\n${context}`;
    const gen = provider.copilot({ system, history, tools });

    for await (const ev of gen) {
      if (input.signal?.aborted) break;
      switch (ev.type) {
        case "text":
          text += ev.delta;
          yield ev;
          break;
        case "tool_call":
          yield ev;
          break;
        case "tool_result": {
          const call = trace.find((t) => t.name === ev.name && t.summary === "") ?? null;
          if (call) call.summary = ev.summary;
          else trace.push({ name: ev.name, input: {}, summary: ev.summary });
          yield ev;
          while (pending.length) {
            const p = pending.shift()!;
            proposals.push(p);
            yield { type: "proposal", proposal: p };
          }
          break;
        }
        case "done": {
          if (ev.text && ev.text.trim().length >= text.trim().length) text = ev.text;
          // Prefer the provider's own trace (it has the inputs); keep our summaries where the provider gave none.
          if (ev.toolTrace.length) {
            trace.splice(0, trace.length, ...ev.toolTrace.map((t) => ({ name: t.name, input: t.input ?? {}, summary: t.summary })));
          }
          while (pending.length) {
            const p = pending.shift()!;
            proposals.push(p);
            yield { type: "proposal", proposal: p };
          }
          finished = true;
          const id = await persistAssistant(false);
          if (id) yield { type: "message", id, role: "assistant" };
          yield { type: "done", text, toolTrace: trace };
          break;
        }
        case "error":
          finished = true;
          await audit({ userId, action: "copilot.error", entityType: "copilotThread", entityId: threadId, meta: { message: ev.message } });
          if (text.trim()) {
            const id = await persistAssistant(false);
            if (id) yield { type: "message", id, role: "assistant" };
          }
          yield { type: "error", message: ev.message || GRACEFUL_ERROR };
          break;
      }
      if (finished) break;
    }
    if (!finished && input.signal?.aborted) {
      const id = await persistAssistant(true);
      if (id) yield { type: "message", id, role: "assistant" };
      yield { type: "done", text, toolTrace: trace };
    } else if (!finished) {
      // Provider ended without a done event: treat what we have as the answer.
      const id = await persistAssistant(false);
      if (id) yield { type: "message", id, role: "assistant" };
      yield { type: "done", text, toolTrace: trace };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[copilot] turn failed:", message);
    await audit({ userId, action: "copilot.error", entityType: "copilotThread", entityId: threadId, meta: { message } });
    if (text.trim()) {
      const id = await persistAssistant(false);
      if (id) yield { type: "message", id, role: "assistant" };
    }
    yield { type: "error", message: GRACEFUL_ERROR };
  }
  // Register tool_call inputs as they arrive so summaries can be matched (see tool_result above).
}

/** Records the tool call input before its result arrives. Called by the route as events pass through. */
export function noteToolCall(trace: ToolTraceEntry[], ev: Extract<CopilotEvent, { type: "tool_call" }>) {
  trace.push({ name: ev.name, input: ev.input, summary: "" });
}
