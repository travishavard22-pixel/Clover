import { db } from "./db";

export type AuditInput = {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

/** Append-only audit trail. Never throws — auditing must not break the primary action. */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        meta: input.meta as never,
        ip: input.ip ?? null,
        userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
      },
    });
  } catch (err) {
    console.error("[audit] failed", err);
  }
}

export function requestMeta(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return {
    ip: (fwd ? fwd.split(",")[0]?.trim() : null) ?? req.headers.get("x-real-ip"),
    userAgent: req.headers.get("user-agent"),
  };
}
