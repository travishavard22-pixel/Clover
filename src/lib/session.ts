import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

export const getSession = cache(async () => {
  const h = await headers();
  return auth.api.getSession({ headers: h });
});

export async function getCurrentUser() {
  const s = await getSession();
  return s?.user ?? null;
}

/** Server-component / server-action guard. Redirects to sign-in when unauthenticated. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/** Route-handler guard. Returns null instead of redirecting so callers can respond 401. */
export async function requireUserApi(req: Request) {
  const s = await auth.api.getSession({ headers: req.headers });
  return s?.user ?? null;
}
