export type PushMessage = { title: string; body: string; href?: string | null; notificationId?: string };

export type PushOutcome = { ok: true } | { ok: false; invalidToken: boolean; error: string };

export interface PushProvider {
  readonly name: string;
  send(token: string, message: PushMessage): Promise<PushOutcome>;
}
