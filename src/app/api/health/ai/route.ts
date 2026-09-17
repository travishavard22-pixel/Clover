import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { z } from "zod";
import { withUser } from "@/lib/api";
import { workspaceHeaders } from "@/lib/ai/anthropic";
import { ItemProfileWireSchema, ListingCopySchema, OfferAdviceSchema, SelfCheckSchema, StudioQaSchema } from "@/lib/ai/schemas";
import { capabilities, env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Sends the smallest possible real request for each structured-output schema and reports which the
 * API accepts.
 *
 * Two failures are invisible from outside the container and identical from the seller's side — the
 * job just says identification failed. One is the key's scope; the other is the API refusing to
 * compile a schema's grammar ("The compiled grammar is too large"), which depends on server-side
 * limits that are not published and cannot be reproduced without the deployment's own key. Both
 * answer in one request each, so the schema that is too complex can be named from the deployment
 * rather than guessed at from a screenshot.
 *
 * `max_tokens: 1` keeps the spend at essentially nothing: the schema is validated and its grammar
 * compiled before any tokens are generated, so a rejection arrives without producing output.
 *
 * Sign-in required: the responses carry configuration detail that should not be public.
 */
const SCHEMAS: Array<[string, z.ZodType]> = [
  ["identify", ItemProfileWireSchema],
  ["writeListing", ListingCopySchema],
  ["selfCheck", SelfCheckSchema],
  ["studioQa", StudioQaSchema],
  ["offerAdvice", OfferAdviceSchema],
];

/**
 * Only used when `identify` is rejected: progressively smaller versions of it, so one request
 * brackets where the limit actually falls instead of costing another deploy-and-ask round trip.
 * Each rung is a reduction we would really consider, in the order we would consider it.
 */
const IDENTIFY_LADDER: Array<[string, z.ZodType]> = [
  ["withoutAlternatives", ItemProfileWireSchema.omit({ alternativeIdentifications: true })],
  ["withoutDefectObjects", ItemProfileWireSchema.omit({ alternativeIdentifications: true }).extend({ condition: ItemProfileWireSchema.shape.condition.extend({ defects: z.array(z.string()) }) })],
  [
    "minimal",
    z.object({
      itemName: ItemProfileWireSchema.shape.itemName,
      facts: ItemProfileWireSchema.shape.facts,
      categoryPath: z.array(z.string()),
      condition: z.object({ grade: ItemProfileWireSchema.shape.condition.shape.grade, confidence: z.number(), summary: z.string(), functionalStatus: ItemProfileWireSchema.shape.condition.shape.functionalStatus }),
      identityConfidence: z.number(),
    }),
  ],
];

type Probe = { ok: boolean; status?: number; error?: string; schemaBytes: number };

export const GET = withUser(
  async () => {
    if (!capabilities.ai) {
      return Response.json(
        {
          ok: false,
          reason: env.CLOVER_DEMO_MODE ? "CLOVER_DEMO_MODE is set, so the AI layer is running in demo mode." : "ANTHROPIC_API_KEY is not set.",
          models: null,
          schemas: null,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0, timeout: 30_000, defaultHeaders: workspaceHeaders(env.ANTHROPIC_WORKSPACE_ID) });

    const probe = async (schema: z.ZodType): Promise<Probe> => {
      const json = z.toJSONSchema(schema, { target: "draft-2020-12", reused: "ref" }) as Record<string, unknown>;
      delete json.$schema;
      const schemaBytes = JSON.stringify(json).length;
      try {
        await client.messages.create({
          // The cheapest model that still compiles the same grammar, so a probe never costs real money.
          model: env.CLOVER_MODEL_CHECK,
          max_tokens: 1,
          messages: [{ role: "user", content: "ping" }],
          output_config: { format: jsonSchemaOutputFormat(json as never, { transform: false }) },
        });
        // Stopping at max_tokens is a pass: the schema compiled, generation just had nowhere to go.
        return { ok: true, schemaBytes };
      } catch (err) {
        const status = err instanceof Anthropic.APIError ? err.status : undefined;
        return { ok: false, status, error: (err instanceof Error ? err.message : String(err)).slice(0, 400), schemaBytes };
      }
    };

    const results: Record<string, Probe> = {};
    for (const [name, schema] of SCHEMAS) results[name] = await probe(schema);

    // Bracket the limit only when there is a rejection to explain.
    let ladder: Record<string, Probe> | undefined;
    if (!results["identify"]?.ok) {
      ladder = {};
      for (const [name, schema] of IDENTIFY_LADDER) ladder[name] = await probe(schema);
    }

    const ok = Object.values(results).every((r) => r.ok);
    return Response.json(
      {
        ok,
        workspaceScoped: !!workspaceHeaders(env.ANTHROPIC_WORKSPACE_ID),
        models: {
          identify: env.CLOVER_MODEL_IDENTIFY,
          write: env.CLOVER_MODEL_WRITE,
          check: env.CLOVER_MODEL_CHECK,
          copilot: env.CLOVER_MODEL_COPILOT,
        },
        schemas: results,
        ...(ladder ? { identifyLadder: ladder } : {}),
      },
      { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  },
  { rateLimit: { key: "health-ai", limit: 6, windowSeconds: 60 } },
);
