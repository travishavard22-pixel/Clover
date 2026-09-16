import { z } from "zod";
import { json, parseBody, withUser } from "@/lib/api";
import { getOwnedPublication, rebuildAssistedChecklist, setChecklistStep, toPublicationDTO } from "@/lib/marketplaces/publications";

const StepSchema = z.object({ key: z.string().min(1).max(64), done: z.boolean() });

/** POST /api/publications/[id]/checklist { key, done } → { publication } — ticks one guided-flow step. */
export const POST = withUser<{ id: string }>(
  async (req, { user, params }) => {
    const { key, done } = await parseBody(req, StepSchema);
    const publication = await setChecklistStep(user.id, params.id, key, done);
    return json({ publication: toPublicationDTO(publication) });
  },
  { rateLimit: { key: "pub-checklist", limit: 240, windowSeconds: 600 } },
);

/** PUT /api/publications/[id]/checklist → { publication } — rebuilds the checklist from the current draft, keeping ticks. */
export const PUT = withUser<{ id: string }>(
  async (_req, { user, params }) => {
    const p = await getOwnedPublication(user.id, params.id);
    const publication = p.mode === "ASSISTED" && p.status === "REQUIRES_USER_ACTION" ? await rebuildAssistedChecklist(p) : p;
    return json({ publication: toPublicationDTO(publication) });
  },
  { rateLimit: { key: "pub-checklist-rebuild", limit: 60, windowSeconds: 600 } },
);
