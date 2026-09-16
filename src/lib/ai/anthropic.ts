import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "../env";
import {
  ItemProfileSchema,
  ListingCopySchema,
  OfferAdviceSchema,
  SelfCheckSchema,
  StudioQaSchema,
  tierFromConfidence,
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

function mapError(err: unknown): never {
  if (err instanceof Anthropic.RateLimitError) throw new AiUnavailableError("The AI service is rate-limited right now.", true);
  if (err instanceof Anthropic.InternalServerError) throw new AiUnavailableError("The AI service had an internal error.", true);
  if (err instanceof Anthropic.AuthenticationError) throw new AiUnavailableError("AI credentials are invalid.", false);
  if (err instanceof Anthropic.BadRequestError) throw new AiUnavailableError(`AI request rejected: ${err.message}`, false);
  if (err instanceof Anthropic.APIConnectionError) throw new AiUnavailableError("Could not reach the AI service.", true);
  if (err instanceof Anthropic.APIError) throw new AiUnavailableError(`AI error ${err.status}: ${err.message}`, (err.status ?? 500) >= 500);
  throw err;
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;
  private client: Anthropic;

  constructor(apiKey = env.ANTHROPIC_API_KEY) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  private async parse<S extends z.ZodType>(opts: {
    model: string;
    system: string;
    content: Anthropic.ContentBlockParam[];
    schema: S;
    effort: "low" | "medium" | "high";
    maxTokens?: number;
  }): Promise<{ data: z.infer<S>; usage: { inputTokens: number; outputTokens: number } }> {
    try {
      const res = await this.client.messages.parse({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 8000,
        system: systemBlock(opts.system),
        messages: [{ role: "user", content: opts.content }],
        output_config: { format: zodOutputFormat(opts.schema), effort: opts.effort },
      });
      if (res.stop_reason === "refusal") {
        throw new AiRefusalError(res.stop_details?.category ?? null, "The AI declined to process this request.");
      }
      if (!res.parsed_output) throw new AiUnavailableError("The AI returned an unparseable response.", true);
      return { data: res.parsed_output, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
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

    const { data, usage } = await this.parse({ model, system: IDENTIFY_SYSTEM, content, schema: ItemProfileSchema, effort: input.escalate ? "high" : "medium" });
    // Normalise tiers from confidence so the UI never sees an inconsistent pair.
    const profile: ItemProfile = normaliseTiers(data);
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

    for (let iteration = 0; iteration < 8; iteration++) {
      let message: Anthropic.Message;
      try {
        const stream = this.client.messages.stream({
          model,
          max_tokens: 4000,
          system: systemBlock(`${COPILOT_SYSTEM}\n\n${input.system}`),
          messages,
          tools,
          output_config: { effort: "medium" },
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

function normaliseTiers(p: ItemProfile): ItemProfile {
  const fix = <T extends { confidence: number; tier: ItemProfile["identityTier"] } | null>(f: T): T => (f ? { ...f, tier: tierFromConfidence(f.confidence) } : f);
  return {
    ...p,
    itemName: fix(p.itemName),
    brand: fix(p.brand),
    model: fix(p.model),
    modelNumber: fix(p.modelNumber),
    color: fix(p.color),
    material: fix(p.material),
    size: fix(p.size),
    dimensions: fix(p.dimensions),
    approximateAge: fix(p.approximateAge),
    attributes: p.attributes.map((a) => ({ ...a, field: fix(a.field) })),
    condition: { ...p.condition, tier: tierFromConfidence(p.condition.confidence) },
    identityTier: tierFromConfidence(p.identityConfidence),
  };
}
