import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env";

const g = globalThis as unknown as { __cloverPrisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL, max: 10 });
  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db: PrismaClient = g.__cloverPrisma ?? (g.__cloverPrisma = create());

export * from "../../generated/prisma/client";
