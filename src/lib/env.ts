import { z } from "zod";

/**
 * Environment validation. Runs once at import time on the server.
 * Secrets never reach the client bundle: only values exposed via `publicEnv` are safe to render.
 */
const boolish = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_SECRET: z.string().min(16),
  CLOVER_ENCRYPTION_KEYS: z.string().min(1),
  CLOVER_DEMO_MODE: boolish,

  ANTHROPIC_API_KEY: z.string().optional(),
  CLOVER_MODEL_IDENTIFY: z.string().default("claude-opus-5"),
  CLOVER_MODEL_WRITE: z.string().default("claude-opus-5"),
  CLOVER_MODEL_CHECK: z.string().default("claude-haiku-4-5"),
  CLOVER_MODEL_COPILOT: z.string().default("claude-opus-5"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  STUDIO_SEGMENTATION_PROVIDER: z.enum(["none", "photoroom", "removebg", "runpod"]).default("none"),
  PHOTOROOM_API_KEY: z.string().optional(),
  REMOVEBG_API_KEY: z.string().optional(),
  RUNPOD_API_KEY: z.string().optional(),
  RUNPOD_SEGMENT_ENDPOINT_ID: z.string().optional(),

  EBAY_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  EBAY_CLIENT_ID: z.string().optional(),
  EBAY_CLIENT_SECRET: z.string().optional(),
  EBAY_RU_NAME: z.string().optional(),
  EBAY_MARKETPLACE_ID: z.string().default("EBAY_US"),
  EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN: z.string().optional(),

  NEXTDOOR_CLIENT_ID: z.string().optional(),
  NEXTDOOR_CLIENT_SECRET: z.string().optional(),

  UPCITEMDB_USER_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example.`);
  }
  return parsed.data;
}

const g = globalThis as unknown as { __cloverEnv?: Env };
export const env: Env = g.__cloverEnv ?? (g.__cloverEnv = load());

const empty = (v: string | undefined) => !v || v.trim() === "";

/** Runtime capability flags derived from configuration. Also surfaced in the UI so nothing is hidden. */
export const capabilities = {
  demoMode: env.CLOVER_DEMO_MODE,
  ai: !env.CLOVER_DEMO_MODE && !empty(env.ANTHROPIC_API_KEY),
  ebay: !env.CLOVER_DEMO_MODE && !empty(env.EBAY_CLIENT_ID) && !empty(env.EBAY_CLIENT_SECRET) && !empty(env.EBAY_RU_NAME),
  nextdoorApi: !env.CLOVER_DEMO_MODE && !empty(env.NEXTDOOR_CLIENT_ID) && !empty(env.NEXTDOOR_CLIENT_SECRET),
  segmentation:
    !env.CLOVER_DEMO_MODE &&
    ((env.STUDIO_SEGMENTATION_PROVIDER === "photoroom" && !empty(env.PHOTOROOM_API_KEY)) ||
      (env.STUDIO_SEGMENTATION_PROVIDER === "removebg" && !empty(env.REMOVEBG_API_KEY)) ||
      (env.STUDIO_SEGMENTATION_PROVIDER === "runpod" && !empty(env.RUNPOD_API_KEY) && !empty(env.RUNPOD_SEGMENT_ENDPOINT_ID))),
  barcode: !empty(env.UPCITEMDB_USER_KEY),
  s3: env.STORAGE_DRIVER === "s3",
} as const;

export type Capabilities = { [K in keyof typeof capabilities]: boolean };

/** Safe to send to the client. */
export function publicCapabilities(): Capabilities {
  return { ...capabilities };
}
