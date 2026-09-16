import type { Metadata } from "next";
import { CopilotWorkspace } from "@/components/copilot/copilot-workspace";
import { getThreadMessages, listThreads } from "@/lib/copilot/threads";
import { db } from "@/lib/db";
import { capabilities } from "@/lib/env";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Copilot" };
export const dynamic = "force-dynamic";

export default async function CopilotPage({ searchParams }: { searchParams: Promise<{ thread?: string | string[] }> }) {
  const user = await requireUser();
  const q = await searchParams;
  const requested = Array.isArray(q.thread) ? q.thread[0] : q.thread;
  const threads = await listThreads(user.id);
  const active = requested ? await db.copilotThread.findFirst({ where: { id: requested, userId: user.id }, select: { id: true } }) : null;
  const messages = active ? await getThreadMessages(active.id) : [];
  return <CopilotWorkspace initialThreads={threads} initialThreadId={active?.id ?? null} initialMessages={messages} demo={capabilities.demoMode || !capabilities.ai} />;
}
