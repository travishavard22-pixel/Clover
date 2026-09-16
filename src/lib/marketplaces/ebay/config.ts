import { env } from "../../env";

export const EBAY_HOSTS = {
  sandbox: { api: "https://api.sandbox.ebay.com", auth: "https://auth.sandbox.ebay.com", apim: "https://apim.sandbox.ebay.com" },
  production: { api: "https://api.ebay.com", auth: "https://auth.ebay.com", apim: "https://apim.ebay.com" },
} as const;

export function ebayHosts() {
  return EBAY_HOSTS[env.EBAY_ENV];
}

export const EBAY_SCOPES = {
  public: "https://api.ebay.com/oauth/api_scope",
  inventory: "https://api.ebay.com/oauth/api_scope/sell.inventory",
  account: "https://api.ebay.com/oauth/api_scope/sell.account",
  fulfillment: "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  identity: "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  message: "https://api.ebay.com/oauth/api_scope/commerce.message",
  notification: "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription",
} as const;

/** Least-privilege user scope set for publishing, orders, offers and identity. */
export const EBAY_USER_SCOPES = [EBAY_SCOPES.public, EBAY_SCOPES.inventory, EBAY_SCOPES.account, EBAY_SCOPES.fulfillment, EBAY_SCOPES.identity];

export const EBAY_MARKETPLACE_ID = env.EBAY_MARKETPLACE_ID;
