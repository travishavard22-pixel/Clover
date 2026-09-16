/** Plain-language descriptions of every OAuth scope Clover requests, for the "View permissions" panel. */
export const SCOPE_LABELS: Record<string, string> = {
  "https://api.ebay.com/oauth/api_scope": "View public eBay data such as categories and item specifics",
  "https://api.ebay.com/oauth/api_scope/sell.inventory": "Create, update and end your listings, and upload listing photos",
  "https://api.ebay.com/oauth/api_scope/sell.account": "Read and create your selling policies (shipping, payment, returns)",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment": "Read your orders so Clover can mark items sold",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly": "Read your eBay username",
  "https://api.ebay.com/oauth/api_scope/commerce.message": "Read and send buyer messages",
  "https://api.ebay.com/oauth/api_scope/commerce.notification.subscription": "Receive eBay notifications about orders and offers",
  openid: "Confirm which Nextdoor account is yours",
  "post:write": "Create your For Sale & Free posts and mark them sold",
  "post:read": "Read the posts Clover created for you",
};

export function describeScope(scope: string): { scope: string; label: string } {
  return { scope, label: SCOPE_LABELS[scope] ?? scope.replace("https://api.ebay.com/oauth/api_scope/", "") };
}
