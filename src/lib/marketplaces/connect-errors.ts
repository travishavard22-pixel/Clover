import type { Marketplace } from "../db";
import { MARKETPLACES } from "./registry";

/** Error codes the connect/callback routes put in `?error=`; the Connections page turns them into a toast. Client-safe. */
export type ConnectError = "unknown_marketplace" | "not_connectable" | "state_invalid" | "denied" | "exchange_failed" | "not_configured";

export function connectErrorMessage(code: string, marketplace?: Marketplace | null): string {
  const name = marketplace ? MARKETPLACES[marketplace].name : "the marketplace";
  switch (code as ConnectError) {
    case "unknown_marketplace":
      return "That marketplace is not one Clover supports.";
    case "not_connectable":
      return `${name} has no account link — it works in assisted mode.`;
    case "state_invalid":
      return "The sign-in link expired or was already used. Start the connection again.";
    case "denied":
      return `You cancelled on ${name}. Nothing was connected.`;
    case "exchange_failed":
      return `${name} accepted the sign-in but Clover could not finish connecting. Try again.`;
    case "not_configured":
      return `${name} credentials are not configured on this deployment.`;
    default:
      return "The connection did not complete. Try again.";
  }
}
