import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { env } from "./env";
import { audit } from "./audit";

export const auth = betterAuth({
  appName: "Clover",
  baseURL: env.APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  // In development the app may be served from another port (per-engineer dev servers); trust loopback hosts then.
  trustedOrigins: [env.APP_URL, ...(env.NODE_ENV === "production" ? [] : ["http://localhost:*", "http://127.0.0.1:*"])],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14, // 14 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    cookiePrefix: "clover",
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await db.userPreferences.upsert({
            where: { userId: user.id },
            create: { userId: user.id },
            update: {},
          });
          await audit({ userId: user.id, action: "user.created" });
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
