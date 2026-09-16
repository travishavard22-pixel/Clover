import { json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { ApplyProposalSchema, applyCopilotProposal } from "@/lib/copilot/proposals";
import { appendMessage, getOwnedThread } from "@/lib/copilot/threads";

/**
 * POST /api/copilot/apply-proposal `{ threadId?, proposal }` → { result: { summary, manual, jobIds } }
 * Executes a proposal the copilot raised, after the seller confirmed it in the interface. The
 * confirmation is recorded in the thread so the conversation shows what was actually changed.
 */
export const POST = withUser(
  async (req, { user }) => {
    const { threadId, proposal } = await parseBody(req, ApplyProposalSchema);
    const meta = requestMeta(req);
    const result = await applyCopilotProposal(user.id, proposal, meta);
    if (threadId) {
      const thread = await getOwnedThread(user.id, threadId);
      await appendMessage(thread.id, "assistant", result.summary, { tools: [], proposals: [], applied: { proposalId: proposal.id, kind: proposal.kind, summary: result.summary } });
    }
    await audit({ userId: user.id, action: "copilot.proposal_applied", entityType: "item", entityId: proposal.itemId, meta: { kind: proposal.kind, proposalId: proposal.id, threadId: threadId ?? null }, ...meta });
    return json({ result });
  },
  { rateLimit: { key: "copilot.apply", limit: 60, windowSeconds: 600 } },
);
