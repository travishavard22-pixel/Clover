# Marketplace setup

## eBay (official API)

1. Create an application at developer.ebay.com. You get Sandbox and Production keysets.
2. Register a Redirect URL (RuName) whose "Your auth accepted URL" is `${APP_URL}/api/marketplaces/ebay/callback`.
3. Production keysets require the **Marketplace Account Deletion** notification endpoint. Set
   `EBAY_ACCOUNT_DELETION_VERIFICATION_TOKEN` (32–80 chars) and register
   `${APP_URL}/api/webhooks/ebay/account-deletion` in the developer console.
4. Set `EBAY_ENV`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_RU_NAME`, `EBAY_MARKETPLACE_ID`.
5. Complete the **Application Growth Check** early if you expect more than the default call
   limits (Browse is 5,000/day).
6. Sellers connect in **Connections → eBay**. Scopes requested: `sell.inventory`, `sell.account`,
   `sell.fulfillment`, `commerce.identity.readonly` (+ `api_scope`). Business policies are opted in
   automatically on first connect.

Notes: Marketplace Insights (sold data) is a limited-release API; Clover's pricing works from
active listings plus your own sales history and labels this honestly.

## Nextdoor (Publish API — closed beta)

Apply via Nextdoor's Publishing API request form describing the marketplace use case. When approved,
set `NEXTDOOR_CLIENT_ID` / `NEXTDOOR_CLIENT_SECRET` and register
`${APP_URL}/api/marketplaces/nextdoor/callback`. Until then Nextdoor runs in assisted mode.

## Facebook Marketplace, OfferUp, Craigslist, Mercari, Poshmark

No listing API exists for individual sellers and their terms prohibit automated posting. Clover
runs these in **assisted mode** (prepared copy, photo pack, link-out, checklist, mark-as-published).
Nothing to configure.

## Photo studio providers

Set `STUDIO_SEGMENTATION_PROVIDER` to `photoroom`, `removebg` or `runpod` with the matching key.
Without a provider the studio runs in enhancement-only mode and says so.
