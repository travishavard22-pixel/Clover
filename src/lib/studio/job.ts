import { z } from "zod";
import { STUDIO_STEPS } from "@/lib/analysis/steps";
import { enqueueJob } from "@/lib/jobs/queue";
import { STUDIO_MODE_IDS } from "./modes";
import { StudioOptionsInputSchema } from "./options";

/**
 * Payload contract for STUDIO_RENDER jobs. The analyze pipeline enqueues `{ itemId, photoId, mode }`
 * for the cover photo; the studio UI adds `options` and `initiatedBy: "user"` (which is what turns
 * on the "Studio photo ready" notification — background renders stay quiet).
 */
export const StudioRenderPayloadSchema = z.object({
  itemId: z.string().min(1),
  photoId: z.string().min(1),
  mode: z.enum(STUDIO_MODE_IDS),
  options: StudioOptionsInputSchema.optional(),
  initiatedBy: z.literal("user").optional(),
});

export type StudioRenderPayload = z.infer<typeof StudioRenderPayloadSchema>;

export async function enqueueStudioRender(userId: string, payload: StudioRenderPayload) {
  return enqueueJob("STUDIO_RENDER", payload, { userId, itemId: payload.itemId, steps: [...STUDIO_STEPS] });
}
