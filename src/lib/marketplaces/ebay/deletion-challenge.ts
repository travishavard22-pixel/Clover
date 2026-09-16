import { sha256 } from "../../crypto";

/**
 * eBay endpoint validation for Marketplace Account Deletion notifications: the response is the
 * hex SHA-256 of challengeCode + verificationToken + endpointUrl, hashed in exactly that order.
 * Pure, so it is unit-tested against eBay's documented example.
 */
export function challengeResponse(challengeCode: string, verificationToken: string, endpointUrl: string): string {
  return sha256(`${challengeCode}${verificationToken}${endpointUrl}`);
}
