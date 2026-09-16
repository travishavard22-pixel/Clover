import { ApiError, json, parseBody, withUser } from "@/lib/api";
import { audit, requestMeta } from "@/lib/audit";
import { ApplyProposalSchema, applyCopilotProposal, findStoredProposal } from "@/lib/copilot/proposals";
import { appendMessage, getOwnedThread } from "@/lib/copilot/threads";

/**
 * POST /api/copilot/apply-proposal `{ threadId, proposal }` → { result: { summary, manual, jobIds } }
 * Executes a proposal the copilot raised, after the seller confirmed it in the interface. The
 * proposal is re-read from the conversation's stored tool trace — the posted copy only identifies
 * it — and the confirmation is recorded in the thread so the conversation shows what changed.
 */
export const POST = withUser(
  async (req, { user }) => {
    const { threadId, proposal: posted } = await parseBody(req, ApplyProposalSchema);
    if (!threadId) throw new ApiError(400, "This proposal is not attached to a conversation, so it cannot be applied.", "validation");
    const thread = await getOwnedThread(user.id, threadId);
    const proposal = await findStoredProposal(thread.id, posted.id);
    if (!proposal || proposal.kind !== posted.kind || proposal.itemId !== posted.itemId) throw new ApiError(404, "That proposal is no longer available. Ask the copilot again.", "not_found");
    const meta = requestMeta(req);
    const result = await applyCopilotProposal(user.id, proposal, meta);
    await appendMessage(thread.id, "assistant", result.summary, { tools: [], proposals: [], applied: { proposalId: proposal.id, kind: proposal.kind, summary: result.summary } });
    await audit({ userId: user.id, action: "copilot.proposal_applied", entityType: "item", entityId: proposal.itemId, meta: { kind: proposal.kind, proposalId: proposal.id, threadId: thread.id }, ...meta });
    return json({ result });
  },
  { rateLimit: { key: "copilot.apply", limit: 60, windowSeconds: 600 } },
);
