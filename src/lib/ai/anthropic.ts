import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { z } from "zod";
import { env } from "../env";
import {
  hydrateProfile,
  ItemProfileWireSchema,
  ListingCopySchema,
  OfferAdviceSchema,
  SelfCheckSchema,
  StudioQaSchema,
  type ItemProfile,
  type ListingCopy,
  type SelfCheck,
} from "./schemas";
import { COPILOT_SYSTEM, IDENTIFY_SYSTEM, OFFER_ADVICE_SYSTEM, PROMPT_VERSION, SELF_CHECK_SYSTEM, STUDIO_QA_SYSTEM, WRITE_LISTING_SYSTEM, untrusted } from "./prompts";
import type { AiProvider, CopilotEvent, CopilotTool, CopilotTurn, IdentifyInput, IdentifyOutput, ImageInput, OfferAdviceInput, StudioQaInput, WriteListingInput, WriteListingOutput } from "./provider";

export class AiRefusalError extends Error {
  constructor(public category: string | null, message: string) {
    super(message);
    this.name = "AiRefusalError";
  }
}
export class AiUnavailableError extends Error {
  constructor(message: string, public retryable: boolean) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

function imageBlock(img: ImageInput): Anthropic.ImageBlockParam {
  return { type: "image", source: { type: "base64", media_type: img.mimeType, data: img.data.toString("base64") } };
}

function systemBlock(text: string): Anthropic.TextBlockParam[] {
  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

/**
 * Builds the structured-output format from a Zod schema.
 *
 * Not `zodOutputFormat`: in SDK 0.126 its schema transform deletes `enum` and writes the values
 * into `description` as prose — `{"type":"string","enum":["GOOD",…]}` becomes
 * `{"type":"string","description":"{enum: [\"GOOD\",…]}"}`. The API documents `enum` as supported,
 * so that is pure loss: the model is left free to invent a grade, and the Zod parse then rejects
 * the entire response as unparseable rather than the one bad field. Zod's own converter emits the
 * enums correctly, so the schema is built there and handed over with the transform switched off.
 *
 * `reused: "ref"` collects the repeated shapes into `$defs`, which the API supports and which keeps
 * the payload small. Note it does not follow that the *grammar* shrinks: a compiler expands a `$ref`
 * at each use, so restoring the enums adds branches it did not have before. Correctness, not size.
 */
function outputFormat<S extends z.ZodType>(schema: S) {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", reused: "ref" }) as Record<string, unknown>;
  // `$schema` is metadata, not a constraint; the SDK's own transform strips it, so drop it here too
  // rather than leave the server to decide what an unexpected keyword means.
  delete json.$schema;
  return jsonSchemaOutputFormat(json as never, { transform: false });
}

function mapError(err: unknown): never {
  if (err instanceof Anthropic.RateLimitError) throw new AiUnavailableError("The AI service is rate-limited right now.", true);
  if (err instanceof Anthropic.InternalServerError) throw new AiUnavailableError("The AI service had an internal error.", true);
  if (err instanceof Anthropic.AuthenticationError) throw new AiUnavailableError("AI credentials are invalid.", false);
  if (err instanceof Anthropic.BadRequestError) {
    // This one is a misconfiguration, not a bad request, and the raw 400 body is a wall of JSON in
    // the UI. Say what to change instead: the key is an organization-level one and needs either a
    // workspace named on every request or a replacement created inside a workspace.
    if (err.message.includes("anthropic-workspace-id")) {
      throw new AiUnavailableError(
        "The Anthropic API key is not scoped to a workspace. Set ANTHROPIC_WORKSPACE_ID to the workspace's ID, or replace the key with one created inside a workspace.",
        false,
      );
    }
    // Also a misconfiguration rather than a bad request: the output schema compiled to a grammar
    // the API will not accept. Nothing about the photos or the seller's input can cause it, so
    // point at the schema instead of inviting a retry that will fail identically.
    if (err.message.includes("compiled grammar is too large")) {
      throw new AiUnavailableError("The AI output schema is too complex for the API to compile. This is a bug in Clover, not something wrong with your photos — the identify schema needs simplifying.", false);
    }
    throw new AiUnavailableError(`AI request rejected: ${err.message}`, false);
  }
  if (err instanceof Anthropic.APIConnectionError) throw new AiUnavailableError("Could not reach the AI service.", true);
  if (err instanceof Anthropic.APIError) throw new AiUnavailableError(`AI error ${err.status}: ${err.message}`, (err.status ?? 500) >= 500);
  throw err;
}

/**
 * Default headers for the client. An organization-level API key is not scoped to a workspace, and
 * the API rejects those with a 400 unless the request names one; the SDK has no option for it, so
 * it travels as a header. A key created inside a workspace carries its own scope and needs none of
 * this, and sending the header empty is itself a bad request — so an unset or blank value yields no
 * header at all rather than a blank one.
 */
export function workspaceHeaders(workspaceId: string | undefined): Record<string, string> | undefined {
  const ws = workspaceId?.trim();
  return ws ? { "anthropic-workspace-id": ws } : undefined;
}

export type Effort = "low" | "medium" | "high";

/**
 * Whether to send `effort` at a given level, from a model's reported capability.
 *
 * Separated from the fetching so the decision is testable without a server: it is the part with
 * rules in it, and the rule is "only when the model says both the parameter and that level are
 * supported". Every uncertain case — no capability data, an unknown level — returns undefined, so
 * the parameter is left off and the model uses its default.
 */
export function effortFromCapability(caps: Anthropic.Models.EffortCapability | null | undefined, level: Effort): Effort | undefined {
  if (!caps?.supported) return undefined;
  return caps[level]?.supported ? level : undefined;
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;
  /** Per-model effort capability, fetched once per process. `null` means "could not tell". */
  private effortCaps = new Map<string, Anthropic.Models.EffortCapability | null>();

  constructor(apiKey = env.ANTHROPIC_API_KEY, workspaceId = env.ANTHROPIC_WORKSPACE_ID) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000, defaultHeaders: workspaceHeaders(workspaceId) });
  }

  /**
   * The effort to send for a model, or undefined to leave the parameter off.
   *
   * `effort` is not universal: the self-check step runs on the cheapest configured model, and
   * Haiku 4.5 rejects the parameter outright with "This model does not support the effort
   * parameter" — a 400 that failed the whole listing step. All four models are set by environment
   * variable, so any of them can be pointed at a model with a different feature set, and a
   * hardcoded list of which models accept what would be stale the next time that changes.
   *
   * So ask. The Models API reports the capability per model and per level, the answer is cached for
   * the life of the process, and anything unexpected — a lookup that fails, a model the API does
   * not know — omits the parameter rather than risking the 400. Omitting it is safe: the model then
   * uses its own default.
   */
  private async effortFor(model: string, level: Effort): Promise<Effort | undefined> {
    if (!this.effortCaps.has(model)) {
      try {
        const info = await this.client.models.retrieve(model);
        this.effortCaps.set(model, info.capabilities?.effort ?? null);
      } catch {
        this.effortCaps.set(model, null);
      }
    }
    return effortFromCapability(this.effortCaps.get(model), level);
  }

  private async parse<S extends z.ZodType>(opts: {
    model: string;
    system: string;
    content: Anthropic.ContentBlockParam[];
    schema: S;
    effort: Effort;
    maxTokens?: number;
  }): Promise<{ data: z.infer<S>; usage: { inputTokens: number; outputTokens: number } }> {
    try {
      const effort = await this.effortFor(opts.model, opts.effort);
      const res = await this.client.messages.parse({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 8000,
        system: systemBlock(opts.system),
        messages: [{ role: "user", content: opts.content }],
        output_config: { format: outputFormat(opts.schema), ...(effort ? { effort } : {}) },
      });
      if (res.stop_reason === "refusal") {
        throw new AiRefusalError(res.stop_details?.category ?? null, "The AI declined to process this request.");
      }
      if (!res.parsed_output) throw new AiUnavailableError("The AI returned an unparseable response.", true);
      // The format is a JSON schema now, so `parsed_output` is typed from it rather than from Zod.
      // Re-validating against the Zod schema is what makes the return type honest, and it turns a
      // deviation into a named field rather than a cast that lies.
      const checked = opts.schema.safeParse(res.parsed_output);
      if (!checked.success) {
        throw new AiUnavailableError(`The AI's response did not match the expected shape (${checked.error.issues[0]?.path.join(".") || "unknown field"}).`, true);
      }
      return { data: checked.data as z.infer<S>, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
    } catch (err) {
      if (err instanceof AiRefusalError || err instanceof AiUnavailableError) throw err;
      return mapError(err);
    }
  }

  async identify(input: IdentifyInput): Promise<IdentifyOutput> {
    const model = env.CLOVER_MODEL_IDENTIFY;
    const content: Anthropic.ContentBlockParam[] = [];
    input.images.forEach((img, i) => {
      content.push({ type: "text", text: `Photo ${i + 1}${img.label ? ` (${img.label})` : ""}:` });
      content.push(imageBlock(img));
    });
    const hints = input.userHints ?? {};
    const hintLines = Object.entries(hints)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `- ${k}: ${String(v).trim()}`);
    let text = `Identify the item in these ${input.images.length} photos and grade its condition.`;
    if (hintLines.length) text += `\n\nSeller hints (verify against the photos):\n${hintLines.join("\n")}`;
    if (input.candidates?.length) text += `\n\nCandidate identifications from external lookups (choose or reject with evidence):\n${input.candidates.map((c) => `- ${c}`).join("\n")}`;
    content.push({ type: "text", text });

    const { data, usage } = await this.parse({ model, system: IDENTIFY_SYSTEM, content, schema: ItemProfileWireSchema, effort: input.escalate ? "high" : "medium" });
    // Tiers are derived from confidence rather than asked for, so the pair can never disagree.
    const profile: ItemProfile = hydrateProfile(data);
    return { profile, model, promptVersion: PROMPT_VERSION, usage };
  }

  async writeListing(input: WriteListingInput): Promise<WriteListingOutput> {
    const model = env.CLOVER_MODEL_WRITE;
    const facts = {
      verifiedAttributes: input.verifiedAttributes,
      condition: input.profile.condition,
      accessoriesIncluded: input.profile.accessoriesIncluded,
      possiblyMissing: input.profile.possiblyMissing,
      unknowns: input.unknowns,
      shipping: input.shipping,
      priceCents: input.priceCents ?? null,
    };
    const req = [
      `Marketplace: ${input.marketplace}`,
      `Limits: title <= ${input.limits.titleMax} characters, description <= ${input.limits.descriptionMax} characters.`,
      `Tone: ${input.tone ?? "neutral"}. Length: ${input.length ?? "standard"}.`,
      input.compsVocabulary?.length ? `Search vocabulary from comparable listings (use only when consistent with verified facts):\n${untrusted("comparable-listings", input.compsVocabulary.join(", "))}` : "",
      input.existing ? `Existing copy to revise:\n${untrusted("existing-copy", JSON.stringify(input.existing))}` : "",
      input.instruction ? `Instruction: ${input.instruction}` : "",
      `Verified facts (closed world):\n${JSON.stringify(facts, null, 2)}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    let copy: ListingCopy;
    let selfCheck: SelfCheck;
    let attempt = 0;
    let feedback = "";
    do {
      const r = await this.parse({ model, system: WRITE_LISTING_SYSTEM, content: [{ type: "text", text: req + feedback }], schema: ListingCopySchema, effort: "medium" });
      copy = r.data;
      selfCheck = await this.selfCheck(facts, copy);
      if (selfCheck.verdict === "pass") break;
      const unsupported = selfCheck.claims.filter((c) => !c.supported).map((c) => `- ${c.claim}`);
      feedback = `\n\nA previous draft contained unsupported claims. Remove or rephrase them so every claim is grounded:\n${unsupported.join("\n")}`;
      attempt++;
    } while (attempt < 2);
    return { copy, selfCheck, model, promptVersion: PROMPT_VERSION };
  }

  private async selfCheck(facts: unknown, copy: ListingCopy): Promise<SelfCheck> {
    const { data } = await this.parse({
      model: env.CLOVER_MODEL_CHECK,
      system: SELF_CHECK_SYSTEM,
      content: [{ type: "text", text: `Verified facts:\n${JSON.stringify(facts)}\n\nListing copy:\n${JSON.stringify(copy)}` }],
      schema: SelfCheckSchema,
      effort: "low",
      maxTokens: 4000,
    });
    return data;
  }

  async studioQa(input: StudioQaInput) {
    const { data } = await this.parse({
      model: env.CLOVER_MODEL_CHECK,
      system: STUDIO_QA_SYSTEM,
      content: [{ type: "text", text: "Original:" }, imageBlock(input.original), { type: "text", text: `Generated (${input.mode}):` }, imageBlock(input.generated)],
      schema: StudioQaSchema,
      effort: "low",
      maxTokens: 2000,
    });
    return data;
  }

  async offerAdvice(input: OfferAdviceInput) {
    const { buyerMessage, ...numbers } = input;
    const text = [`Offer facts:\n${JSON.stringify(numbers)}`, buyerMessage ? `Buyer's message:\n${untrusted("buyer-message", buyerMessage)}` : ""].filter(Boolean).join("\n\n");
    const { data } = await this.parse({
      model: env.CLOVER_MODEL_WRITE,
      system: OFFER_ADVICE_SYSTEM,
      content: [{ type: "text", text }],
      schema: OfferAdviceSchema,
      effort: "low",
      maxTokens: 2000,
    });
    return data;
  }

  async *copilot(input: { system: string; history: CopilotTurn[]; tools: CopilotTool[] }): AsyncGenerator<CopilotEvent> {
    const model = env.CLOVER_MODEL_COPILOT;
    const tools: Anthropic.Tool[] = input.tools.map((t) => ({
      name: t.name,
      description: t.description,
      strict: true,
      input_schema: { ...(t.inputSchema as Anthropic.Tool.InputSchema), type: "object", additionalProperties: false },
    }));
    const messages: Anthropic.MessageParam[] = input.history.map((h) => ({ role: h.role, content: h.content }));
    const toolTrace: Array<{ name: string; input: Record<string, unknown>; summary: string }> = [];
    let finalText = "";
    // Same capability gate as the structured calls: the copilot's model is configurable too, and a
    // rejected parameter here would fail the seller's question rather than one pipeline step.
    const effort = await this.effortFor(model, "medium");

    for (let iteration = 0; iteration < 8; iteration++) {
      let message: Anthropic.Message;
      try {
        const stream = this.client.messages.stream({
          model,
          max_tokens: 4000,
          system: systemBlock(`${COPILOT_SYSTEM}\n\n${input.system}`),
          messages,
          tools,
          ...(effort ? { output_config: { effort } } : {}),
        });
        let turnText = "";
        for await (const ev of stream) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            turnText += ev.delta.text;
            yield { type: "text", delta: ev.delta.text };
          }
        }
        message = await stream.finalMessage();
        finalText = turnText || finalText;
      } catch (err) {
        try {
          mapError(err);
        } catch (mapped) {
          yield { type: "error", message: mapped instanceof Error ? mapped.message : String(mapped) };
          return;
        }
        return;
      }

      if (message.stop_reason === "refusal") {
        yield { type: "error", message: "The copilot declined to answer that." };
        return;
      }
      const toolUses = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (message.stop_reason !== "tool_use" || toolUses.length === 0) break;

      messages.push({ role: "assistant", content: message.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const tool = input.tools.find((t) => t.name === tu.name);
        const toolInput = (tu.input ?? {}) as Record<string, unknown>;
        yield { type: "tool_call", name: tu.name, input: toolInput };
        if (!tool) {
          results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: `Unknown tool ${tu.name}` });
          continue;
        }
        try {
          const out = await tool.run(toolInput);
          const text = typeof out === "string" ? out : JSON.stringify(out);
          const summary = text.length > 140 ? `${text.slice(0, 137)}…` : text;
          toolTrace.push({ name: tu.name, input: toolInput, summary });
          yield { type: "tool_result", name: tu.name, summary };
          results.push({ type: "tool_result", tool_use_id: tu.id, content: text });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toolTrace.push({ name: tu.name, input: toolInput, summary: `error: ${msg}` });
          results.push({ type: "tool_result", tool_use_id: tu.id, is_error: true, content: msg });
        }
      }
      messages.push({ role: "user", content: results });
    }
    yield { type: "done", text: finalText, toolTrace };
  }
}

