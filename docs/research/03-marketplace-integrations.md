# 03 — Marketplace Integrations: Feasibility, API Surface, Policy and Security

*Research date: 15 September 2026. Scope: eBay, Facebook Marketplace / Meta, OfferUp, Nextdoor (primary), plus Mercari, Poshmark, Depop, Craigslist, Etsy, Shopify (secondary).*

*Method: official developer documentation and legal/policy pages were read first (developer.ebay.com via its `edp.ebay.com` mirror and the published OpenAPI spec files; developers.facebook.com; developer.nextdoor.com including its machine-readable `.md` reference pages; offerup.com/terms; craigslist.org; developers.etsy.com; shopify.dev), then eBay's own developer newsletters, the eBay Developer Community, and credible secondary sources. Anything not confirmed against a primary source is marked **UNVERIFIED**.*

---

## 0. Executive summary

| Marketplace | Official write API for individual sellers? | Bottom line |
|---|---|---|
| **eBay** | **Yes** — mature RESTful Sell APIs (Inventory, Account, Media, Fulfillment, Negotiation, Message, Marketing, Feed, Notification) plus the legacy Trading API. | First-class integration. Full lifecycle (create, image upload, revise, end, orders, offers, messages) is supported under OAuth 2.0. Default limits are generous for the Sell APIs; the Browse API (comps) is 5,000 calls/day; sold-item data (Marketplace Insights) is effectively closed. |
| **Facebook Marketplace** | **No** — no public listing API for individuals. Commerce Platform / Catalog API is partner-only and does not give peer-to-peer Marketplace listing creation. Partner catalog feeds for vehicles/real estate were shut down in 2021 and business-Page listings in 2023. | Assisted publishing only (user-driven browser handoff with pre-filled copy and a photo pack). Automated posting violates Meta's Terms (§3.2). |
| **OfferUp** | **No** public API. Dealer inventory feeds exist only through the OfferUp for Business / Verified Dealer partner channel (DMS vendors). | Assisted publishing only. ToS §7 (effective 21 July 2026) bans automated means and any third-party app without written consent. |
| **Nextdoor** | **Partial / gated** — Nextdoor's Publish API has a documented `POST /external/api/partner/v1/post/fsf/` endpoint that creates a *For Sale & Free* listing and a `PUT` to mark it sold, under OAuth 2.0 scope `post:write`. Access is closed beta, approved case-by-case via a Google Form. | Apply for Publish API access; until approved, use the open **Share Plugin** (no approval needed) for an assisted flow. |

Secondary channels: **Etsy** (Open API v3, real seller API, tiered approval) and **Shopify** (GraphQL Admin API) are genuinely integrable. **Depop** has a private Selling API (partner/OAuth, request access by email). **Mercari US**, **Poshmark** and **Craigslist** have no public API and strong anti-automation terms.

---

## 1. eBay

### 1.1 Developer program, status and gating (2025–2026)

* Program: **eBay Developers Program** (developer.ebay.com). Free registration; each app gets a Sandbox keyset and a Production keyset (App ID / Cert ID / Dev ID). Status: active; eBay ships quarterly newsletters (Q4 2025, Q1 2026, Q2 2026 confirmed) and continues to migrate Trading API calls to REST.
* **Production keyset activation**: before the first production call you must either subscribe to the **Marketplace Account Deletion / Closure notification** (a `MARKETPLACE_ACCOUNT_DELETION` endpoint that echoes a challenge and accepts signed payloads) or formally opt out (only if you store no eBay user data). Non-compliance results in termination or reduced API access.
* **Application Growth Check** (formerly "Compatible Application Check"): free, required to (a) raise call limits above defaults or (b) use restricted APIs in production. eBay tests a working application against the API License Agreement, User Agreement, privacy law, OWASP secure-coding principles and retry behaviour (max two retries on infrastructure errors). Turnaround is reported by the community at 3–5 business days; post-approval limits of ~1.5 million calls/day are community-reported (**UNVERIFIED** — not stated in official docs).
* **Buy APIs in production** (Browse, Marketing, Feed, Marketplace Insights, etc.): eBay's *Buy APIs Requirements* page states production use "is intended for eBay partners only" and that you "must apply for production access through the eBay Partner Network", accepting the User Agreement, API License Agreement and ePN Agreement, with approval not guaranteed. In practice the Browse API `search`/`getItem` methods are listed with a public 5,000 calls/day default limit and are widely used on ordinary production keysets; treat higher volume or restricted methods as requiring ePN + Growth Check. Whether a plain production keyset can call Browse without an ePN application should be confirmed on your own keyset (**partially UNVERIFIED**).
* No geographic restriction on developer registration. Individual APIs are marketplace-restricted (e.g., Negotiation API: AU, CA, FR, DE, GB, IT, ES, US; Browse `searchByImage`: US, DE, GB, AU only).

### 1.2 OAuth 2.0

* Authorization endpoint: `https://auth.ebay.com/oauth2/authorize` (sandbox: `auth.sandbox.ebay.com`). Token endpoint: `https://api.ebay.com/identity/v1/oauth2/token`. Client authentication is HTTP Basic (App ID : Cert ID).
* Grant types: `client_credentials` (application token, public data — Browse, Taxonomy, Catalog), `authorization_code` (user token) and `refresh_token`.
* **Token lifetimes** (official *OAuth tokens* page): user access token **7,200 s (2 h)**; application token **7,200 s**; refresh token long-lived, `refresh_token_expires_in` **47,304,000 s (~18 months)**. Refresh tokens **do not rotate**; when the refresh token expires or you add scopes, the user must re-consent.
* Scope strings (full list is on the keyset's "OAuth Scopes" page; the ones this product needs):
  * `https://api.ebay.com/oauth/api_scope` — public data (Browse, Taxonomy).
  * `https://api.ebay.com/oauth/api_scope/sell.inventory` (+ `.readonly`) — Inventory API, Media API image/video methods, and (per the Negotiation API method pages) the Negotiation API.
  * `https://api.ebay.com/oauth/api_scope/sell.account` (+ `.readonly`) — Account API (business policies, program opt-in).
  * `https://api.ebay.com/oauth/api_scope/sell.fulfillment` (+ `.readonly`) — Fulfillment API orders; `sell.payment.dispute` for disputes; `sell.finances` for payouts.
  * `https://api.ebay.com/oauth/api_scope/sell.marketing` (+ `.readonly`) — Marketing API.
  * `https://api.ebay.com/oauth/api_scope/commerce.message` — new Message API (confirmed from the published `message_api.json` spec).
  * `https://api.ebay.com/oauth/api_scope/commerce.notification.subscription` — Notification API user subscriptions.
  * `https://api.ebay.com/oauth/api_scope/buy.marketplace.insights` — Marketplace Insights (client-credentials; approval required).
  * `https://api.ebay.com/oauth/api_scope/commerce.identity.readonly` — user identity (username / account type).
  * `https://api.ebay.com/oauth/api_scope/sell.item_draft`, `sell.analytics.readonly`, `sell.marketplace.insights.readonly` exist but are not needed for MVP.
* The Trading API also accepts OAuth user tokens (header `X-EBAY-API-IAF-TOKEN`), so one consent covers both REST and legacy calls when the relevant scopes are granted.

### 1.3 Listing creation — Inventory API (`/sell/inventory/v1`, spec v1.18.8)

Flow (all `sell.inventory` scope):

1. **`createInventoryLocation`** — `POST /location/{merchantLocationKey}` (required once; a location with city/state/country or postal code/country must exist before publishing).
2. **`createOrReplaceInventoryItem`** — `PUT /inventory_item/{sku}`; body: `product{title, description, aspects, imageUrls[], brand, mpn, upc/ean/isbn}`, `condition` (ConditionEnum), `conditionDescription`, `conditionDescriptors[]`, `availability.shipToLocationAvailability.quantity`, `packageWeightAndSize`. Title becomes the listing title (80-character eBay title limit applies at publish). Bulk variant: `bulkCreateOrReplaceInventoryItem` (max 25 per call).
3. **`createOffer`** — `POST /offer`; body: `sku`, `marketplaceId` (e.g., `EBAY_US`), `format` (`FIXED_PRICE` or `AUCTION` — auction is supported in the current spec with `pricingSummary.auctionStartPrice`, `auctionReservePrice` and a non-GTC `listingDuration`; fixed price must be `GTC`), `pricingSummary.price`, `categoryId`, `merchantLocationKey`, `listingDescription` (HTML allowed), `listingPolicies{fulfillmentPolicyId, paymentPolicyId, returnPolicyId, bestOfferTerms{bestOfferEnabled, autoAcceptPrice, autoDeclinePrice}}`, `availableQuantity`, optional `charity`, `tax`, `lotSize`. Best Offer is unavailable on multi-variation listings. `getListingFees` previews fees before publishing.
4. **`publishOffer`** — `POST /offer/{offerId}/publish` → returns `listingId`. Fails unless all three business policies, at least one image, a category, price and location are present.
5. Modify: `updateOffer` (`PUT /offer/{offerId}`), `bulkUpdatePriceQuantity`, re-`PUT` the inventory item then re-publish. End listing: **`withdrawOffer`** (`POST /offer/{offerId}/withdraw`) ends the listing but keeps the offer; `deleteOffer` / `deleteInventoryItem` remove records.
6. Variations: `createOrReplaceInventoryItemGroup` + `publishOfferByInventoryItemGroup`.
7. Migration from Trading-API listings: `bulkMigrateListing`.

**Business policies are mandatory.** The seller must be opted in to business policies; do this via the Account API: `POST /sell/account/v1/program/opt_in` with `{"programType":"SELLING_POLICY_MANAGEMENT"}`, then `createFulfillmentPolicy`, `createPaymentPolicy`, `createReturnPolicy` (or read existing ones with `getFulfillmentPolicies?marketplace_id=EBAY_US`). Scope `sell.account`.

**Inventory API vs Trading API `AddItem`**: Inventory API is REST/JSON, SKU-centric, fixed-price GTC plus auction, and is where eBay's new features land (condition descriptors, compliance documents, Inventory Mapping). Trading API `AddItem`/`ReviseItem`/`EndItem` remain fully supported (no announced sunset for the Trading API as a whole as of the September 2026 deprecation-status page), but individual calls keep being decommissioned: `GetCategories` (15 Apr 2026), `GetCategoryFeatures` (4 Jun 2026), `UploadSiteHostedPictures` (30 Sep 2026 → Media API), `GetSellerDiscountProfiles`/`SetShippingDiscountProfiles` (19 Jan 2027). The Shopping and Finding APIs were decommissioned 4 Feb 2025 (→ Browse API). Recommendation: build on the Inventory API; use Trading API only for Best Offer response, which has no REST equivalent.

**Condition IDs** (official *Item condition ID and name values* page → `ConditionEnum`): 1000 NEW · 1500 NEW_OTHER · 1750 NEW_WITH_DEFECTS · 2000 CERTIFIED_REFURBISHED · 2010 EXCELLENT_REFURBISHED · 2020 VERY_GOOD_REFURBISHED · 2030 GOOD_REFURBISHED · 2500 SELLER_REFURBISHED · 2750 LIKE_NEW · 2990 PRE_OWNED_EXCELLENT · 3000 USED_EXCELLENT ("Used/Pre-owned") · 3010 PRE_OWNED_FAIR · 4000 USED_VERY_GOOD · 5000 USED_GOOD · 6000 USED_ACCEPTABLE · 7000 FOR_PARTS_OR_NOT_WORKING. Refurbished tiers (2000–2030) require seller qualification. **Condition descriptors** are mandatory in trading-card categories (2750 = Graded, 4000 = Ungraded, with descriptor IDs such as 400010 Near Mint or Better) and, since Q2 2026, in five US Coins categories. Per-category allowed conditions come from the Metadata API `getItemConditionPolicies`.

### 1.4 Category and aspects — Taxonomy API (`/commerce/taxonomy/v1`, application token, scope `api_scope`)

* `getDefaultCategoryTreeId?marketplace_id=EBAY_US` (US tree id is 0).
* `getCategorySuggestions?q=...` — keyword → leaf category suggestions.
* `getItemAspectsForCategory?category_id=...` — returns each aspect's `aspectConstraint` (`aspectRequired`, `aspectUsage` REQUIRED/RECOMMENDED/OPTIONAL, `aspectMode` FREE_TEXT/SELECTION_ONLY, `itemToAspectCardinality`, `aspectApplicableTo`) and allowed values. Since Nov 2025 "Country of Origin" is mandatory for US-bound imports; from Aug 2026 non-standard apparel/footwear sizes are blocked, so size values must come from Taxonomy.
* `fetchItemAspects` — bulk download of all leaf-category aspects.
* Default limit: 5,000 calls/day (cache aggressively).

### 1.5 Images — Media API (`https://apim.ebay.com/commerce/media/v1_beta`, scope `sell.inventory`)

* `createImageFromFile` — `POST /image/create_image_from_file`, `multipart/form-data` field `image`; returns `201` and a `Location` header with the `image_id`. `createImageFromUrl` accepts an HTTPS URL. `getImage /image/{image_id}` returns the EPS URL and its expiration (the EPS image expires if never attached to a listing; a 404 is returned for expired IDs).
* Formats: JPG, GIF, PNG, BMP, TIFF, AVIF, HEIC, WEBP; no animated GIF/multi-page files. Max original size 12 MB; height + width dimension limit (error 190202). Up to **24 images per listing** free; 12 per variation.
* Video: `createVideo` → `uploadVideo` → `getVideo`. Documents (GPSR, CPSC GCC/CPC, energy labels) via `createDocument`/`uploadDocument`.
* Limits: 1,000,000 calls/day for image/document resources; POST user-level limit 50 requests per 5 seconds; video 5,000/day.
* `UploadSiteHostedPictures` (Trading) is decommissioned 30 Sep 2026 — do not build on it.

### 1.6 Offers and negotiation

* **Seller-initiated offers — Negotiation API** (`/sell/negotiation/v1`): `findEligibleItems` (listings that watchers/cart-abandoners have shown interest in) and `sendOfferToInterestedBuyers` (percentage or fixed discount, message, quantity). Available to all sellers, no special approval; marketplaces AU/CA/FR/DE/GB/IT/ES/US. Since Q4 2025 only 4-day offer durations are supported in US/UK. Default limit 1,000,000 calls/day. Scope: the OpenAPI spec lists no scope on the operations; eBay's method pages state `sell.inventory` (**treat as sell.inventory**).
* **Buyer-initiated Best Offers**: enable per offer via `listingPolicies.bestOfferTerms` (with `autoAcceptPrice`/`autoDeclinePrice` to automate the extremes). There is **no REST API to read or answer incoming Best Offers**; use the Trading API: `GetBestOffers` (by `ItemID`, optional `BestOfferID`, `BestOfferStatus` Active/All) and `RespondToBestOffer` (`Action` = Accept | Counter | Decline, `CounterOfferPrice`, `CounterOfferQuantity`, `SellerResponse` ≤ 250 chars; only one offer can be accepted/countered per call, multiple can be declined). Neither call has a deprecation notice. Incoming offers can be detected via the Notification API's offer/auction topics (added Q4 2025) or Trading Platform Notification `BestOffer`; Trading default limit is 5,000 calls/day, so poll sparingly.

### 1.7 Buyer messages — Message API (new, Q4 2025)

`/commerce/message/v1`, scope `commerce.message`: `sendMessage` (new thread or reply; `messageText` required; up to 5 media attachments; `reference{referenceType: LISTING, referenceId}`), `getConversations` (paged, filterable; FROM_MEMBERS vs FROM_EBAY), `getConversation/{conversation_id}`, `updateConversation`, `bulkUpdateConversation` (ACTIVE / ARCHIVED / DELETED / READ / UNREAD). It replaces Trading `GetMemberMessages`, `AddMemberMessageRTQ`, `GetMyMessages`, etc. The Notification API topic `NEW_MESSAGE` and `BUYER_QUESTION` push new-message events. Note: since 26 Sep 2025 some notification payloads carry an immutable user ID instead of a username for US users.

### 1.8 Orders — Fulfillment API (`/sell/fulfillment/v1`, scope `sell.fulfillment`)

`getOrders` (filter by `creationdate`, `lastmodifieddate`, `orderfulfillmentstatus`), `getOrder/{orderId}`, `createShippingFulfillment` (tracking + carrier → marks shipped), `getShippingFulfillments`, `issueRefund`; payment-dispute resource (`sell.payment.dispute`). Only completed-checkout orders appear. Default limits: 100,000/day (orders), 250,000/day (disputes). "Mark sold" is implicit: a sale creates an order and reduces quantity; for local/off-platform sales end the listing with `withdrawOffer`. Notification topic `ORDER_CONFIRMATION` (Q4 2025) replaces polling.

### 1.9 Marketing API (`/sell/marketing/v1`, scope `sell.marketing`)

Promoted Listings campaigns (`createCampaign`, `bulkCreateAdsByListingId`/`ByInventoryReference`, `updateBiddingStrategy`, `updateAdRateStrategy`; priority-strategy campaigns opened to all sellers Q2 2026), promotions (`createItemPriceMarkdownPromotion`, `createItemPromotion`) and reports. Limits 100,000/day (promotions), 10,000/day (ads). Optional for MVP.

### 1.10 Comps — Browse API (`/buy/browse/v1`, application token, scope `api_scope`)

* `GET /item_summary/search` — `q`, `category_ids`, `gtin`, `epid`, `aspect_filter`, `fieldgroups` (ASPECT_REFINEMENTS, BUYING_OPTION_REFINEMENTS, CATEGORY_REFINEMENTS, CONDITION_REFINEMENTS, EXTENDED, MATCHING_ITEMS, FULL), `sort` (`price`, `-price`, `newlyListed`, `endingSoonest`, `distance`), `limit` ≤ 200, `offset`; max 10,000 results.
* `POST /item_summary/search_by_image` — **image search exists**: body `{"image": "<base64>"}`, same query params (`category_ids`, `aspect_filter`, `filter`, `fieldgroups`, `sort`, `limit`, `offset`, `charity_ids`). Only marketplaces US, DE, GB, AU; **not available in Sandbox**.
* `filter` fields (Buy API Field Filters page): `bidCount`, `buyingOptions:{FIXED_PRICE|AUCTION|BEST_OFFER|CLASSIFIED_AD}` (default returns only FIXED_PRICE), `charityOnly`, `conditionIds:{1000|3000}`, `conditions:{NEW|USED|UNSPECIFIED}`, `deliveryCountry`, `deliveryOptions`, `deliveryPostalCode`, `excludeCategoryIds`, `excludeSellers`, `itemEndDate`, `itemStartDate`, `itemLocationCountry`, `itemLocationRegion`, `maxDeliveryCost:0`, `paymentMethods`, `pickupCountry/PostalCode/Radius/RadiusUnit`, `price:[10..50]` (requires `priceCurrency:USD`), `qualifiedPrograms`, `returnsAccepted`, `searchInDescription`, `sellerAccountTypes`, `sellers` (≤ 250).
* `getItem/{item_id}`, `getItemByLegacyId`, `getItems` (needs `buy.item.bulk`), `getItemsByItemGroup`.
* Default 5,000 calls/day — the tightest limit in the stack; cache comps by normalized query/category.
* Browse returns **active** listings only. It does not return sold prices.

### 1.11 Sold data — Marketplace Insights API and alternatives

* `GET /buy/marketplace_insights/v1_beta/item_sales/search` — sold/completed items in the **last 90 days** by `q`, `category_ids`, `gtin`, `epid`; `filter` supports `buyingOptions`, `conditionIds`, `conditions`, `itemLocationCountry`, `lastSoldDate`, `price`, `priceCurrency`; `fieldgroups` for histograms; sort by price only; max 10,000 results. Scope `buy.marketplace.insights` (client credentials).
* Status: **Limited Release**, requires eBay business-unit approval; developer-community threads (2025–2026) consistently report denials and the message that eBay "no longer provides access besides for major partners". Assume **not obtainable** for a new product.
* Legitimate alternatives: (1) **Terapeak Product Research** inside Seller Hub — free to all sellers, up to 3 years of sold data, but UI-only, no API, and scraping it would breach the User Agreement; (2) infer "sold" from Browse `itemEndDate`/`endingSoonest` on active listings (weak); (3) third-party licensed datasets (e.g., SoldComps-type vendors) — evaluate their own sourcing/legal basis before use; (4) the seller's own sales history via Fulfillment API and Analytics API (`sell.analytics.readonly`, 5,000/day).

### 1.12 Feed, Notification, Sandbox, quotas

* **Sell Feed API** (`/sell/feed/v1`): async bulk tasks — `createTask`/`createInventoryTask` → `uploadFile` → `getTask` → `getResultFile`; LMS feed types `LMS_ADD_FIXED_PRICE_ITEM`, `LMS_REVISE_INVENTORY_STATUS`, `LMS_ORDER_REPORT`, `LMS_ACTIVE_INVENTORY_REPORT`; 100,000 calls/day. Useful for large catalogs only.
* **Notification API** (`/commerce/notification/v1`): create a `destination` (HTTPS endpoint that answers eBay's challenge) and `subscription`s per topic; payloads are signed (verify with `getPublicKey`). Topics include `MARKETPLACE_ACCOUNT_DELETION`, `AUTHORIZATION_REVOCATION`, `ITEM_AVAILABILITY` (ePN only), `ITEM_PRICE_REVISION`, `PRIORITY_LISTING_REVISION`, `FEEDBACK_STAR_RATING`, plus the Q4 2025 additions `ORDER_CONFIRMATION`, `NEW_MESSAGE`, `BUYER_QUESTION`, `FEEDBACK_LEFT` and offer/auction activity topics. Some topics are restricted (`LISTING` requires `sell.listing.read`). 10,000 calls/day.
* **Sandbox** (`api.sandbox.ebay.com`): free, separate keyset and test users. Known gaps (KB 684 and community): no `searchByImage`, no email, no cart, seller dashboard/Seller Hub absent, refurbished/credit-card flows unsupported, test-user login and business-policy opt-in are intermittently broken (opt in explicitly with `optInToProgram SELLING_POLICY_MANAGEMENT`), Browse/Marketplace Insights return synthetic data. Not intended for load testing.
* **Default daily limits** (official *API call limits*): Inventory 2,000,000 · Negotiation 1,000,000 · Media 1,000,000 (video 5,000) · Fulfillment 100,000 · Feed 100,000 · Marketing 100,000/10,000 · Account 25,000 · Notification 10,000 · Catalog 10,000 · Browse 5,000 · Taxonomy 5,000 · Trading 5,000 · Analytics 5,000. Use `getRateLimits`/`getUserRateLimits` (Analytics API) to monitor.
* **Prohibited automation**: the API License Agreement forbids scraping eBay sites, storing/redistributing data outside licensed uses, and circumventing limits; the User Agreement bans "robots, spiders, scrapers, data mining tools" on the site. Everything above is the sanctioned path.

---

## 2. Facebook Marketplace / Meta

### 2.1 Is there an API?

* **No public API exists to create, edit, delete or read peer-to-peer Marketplace listings, Marketplace messages or offers.** Meta's Graph API has never exposed the Marketplace "item for sale" object to third parties.
* **Commerce Platform / Catalog API** (`developers.facebook.com/docs/commerce-platform`): a Graph-API-based program for *sellers with Shops* and *platform partners* (Shopify, BigCommerce, etc.). It manages product catalogs (`/{catalog_id}/products`, batch feeds), commerce accounts and orders. Meta's docs still say catalog items can surface "across Meta technologies, including Shops, Marketplace, and Instagram Shopping", but that is business-catalog distribution into Marketplace's *shop/ad* surfaces, not the individual-seller listing flow, and partner onboarding is restricted (the partner page returns 404 as of this research). Third-party surveys as of mid-2026 describe Meta's Commerce Platform listing access as a "limited alpha" for approved partners. **UNVERIFIED** whether any current partner can push items into consumer Marketplace search.
* **Vehicles and real estate**: partner catalog feeds into Marketplace were discontinued 13 Sep 2021; business-Page vehicle/home listings ended 30 Jan 2023. Dealers and property managers now use paid Automotive/Home Inventory Ads (catalog + ads, `catalog_management` + `ads_management`), not organic listings. Nothing in 2025–2026 reversed this.
* **2025–2026 changes**: Meta moved Shops to website checkout (June–Aug 2025) and stopped being marketplace tax facilitator (26 Aug 2025); added Meta-AI listing creation, auto-replies, prepaid shipping labels and seller profile summaries (Mar 2026); launched the standalone **Seller** app for frequent Marketplace sellers (24 Jul 2026, US, 18+). None of these include a third-party API. Shopify's Meta channel syncs to Facebook/Instagram *Shops*, not to Marketplace.

### 2.2 Permissions, App Review, terms

* Relevant Facebook Login permissions all require **App Review** (and usually Business Verification) before non-role users can grant them: `catalog_management` (create/read/update/delete business-owned catalogs; depends on `business_management`), `commerce_account_manage_orders`, `commerce_account_read_orders`, `pages_manage_posts` (publish to a Page — not Marketplace), `pages_read_engagement`, `pages_show_list`, `business_management`. Standard Access covers only users with a role on the app.
* Meta **Platform Terms** (§3.a) prohibit selling/licensing Platform Data, building profiles without consent, surveillance, and circumventing/reverse-engineering; apps must resubmit if core functionality changes and must cooperate with reviews.
* Facebook **Terms of Service §3.2**: "You may not access or collect data from our Products using automated means (without our prior permission)" and you may not "do anything else that could disable, overburden, interfere with, or impair the proper working ... of our services". The **Automated Data Collection Terms** require written permission for any scraper/bot. Community reports (2025–2026) confirm Meta actively bans accounts that use posting bots, browser-automation cross-listers and duplicate-listing tricks.
* Conclusion: any headless-browser, cookie-reuse or "Marketplace bot" approach is a ToS violation and an account-loss risk for the *user*, not just the vendor.

### 2.3 Legitimate assisted routes

1. **Deep link into the create flow**: `https://www.facebook.com/marketplace/create/item` opens the "Item for sale" form on web (mobile deep link `fb://marketplace` variants exist but are undocumented). Meta does not document query-string pre-fill for Marketplace, so the form cannot be pre-populated by URL. **UNVERIFIED** as a stable, supported URL — it is a UI route, not an API, and may change without notice.
2. **Pre-filled clipboard + photo pack**: copy title/description/price to the clipboard and offer a one-tap download (or Web Share API on mobile) of the ordered, resized photo set; the user pastes and uploads in the Facebook form.
3. **Share dialog** (`https://www.facebook.com/sharer/sharer.php?u=...` or FB.ui `share`) can post a *link* to a listing hosted elsewhere to the user's feed/groups — not a Marketplace listing, but useful for a "Buy & Sell" group post.
4. **Shopify / Commerce Manager route** for business sellers with a catalog: sync products to a Facebook/Instagram Shop; eligible catalog items may appear in Marketplace's shop surfaces. Not applicable to casual sellers.

---

## 3. OfferUp

* **API**: none public. `offerup.com` has no developer portal. The only inbound-listing integration is the **OfferUp for Business / Verified Dealer** program (Motors) in which DMS and inventory vendors (Dealer Car Search, DealerCenter, AutoSweet, Auction123, DealerSync, LotVantage, etc.) push dealer vehicle feeds; enrolment is by partnership, not self-serve. OfferUp for Business also offers Storefronts and Services lead tools, again without an API.
* **Terms of Service** (effective **21 July 2026**), §7 Prohibited Conduct: users may not use "any type of automated means to utilize the OfferUp Services or to collect or extract data from OfferUp, such as a harvesting bot, robot, spider, script, crawler, or scraper, not provided by OfferUp"; may not "Develop or use any third-party applications that interact with the OfferUp Services without OfferUp's prior written consent"; may not reverse engineer or "bypass or circumvent measures employed to prevent or limit access"; and may not bypass the paywall shown after reaching a posting limit. The OfferUp for Business Seller Terms add a ban on "hacking, password mining, scraping or any other means". So even a user-operated browser extension that auto-fills OfferUp is a "third-party application that interacts with the Services" and needs written consent.
* **Listing model** (Help Center): up to 12 photos + 1 video, title, price, category/subcategory, condition, location; posting limits per account with paid tiers. Duplicate/spam posting is policed.
* **Deep links**: the web posting entry point is `https://offerup.com/post` (the "Post" button target) and the app is reachable via universal links on `offerup.com`; a custom `offerup://` scheme is not documented. Query-string pre-fill is **not** supported. **UNVERIFIED** — treat both as UI routes.
* Strategy: assisted publishing only (Section 8), and a partnership enquiry if a dealer/business vertical is ever targeted.

---

## 4. Nextdoor

### 4.1 Developer platform

`developer.nextdoor.com` (launched Dec 2023) hosts four API families: **Advertising APIs** (Ads API — GraphQL, plus Conversion API and Universal Pixel; for advertising partners, `ads-api@nextdoor.com`), **Display Content APIs** (Search API: `search posts`, `search FSF items`, events, businesses; Trending Posts; Public Agency Feed — read-only, beta, form approval), **Content Sharing** (Publish API and the open Share Plugin), and the older Public Agency Content API. The whole REST platform is described as "currently in closed BETA"; access is "granted on a case-by-case basis" and "approval isn't guaranteed" (page updated 4 Sep 2026).

### 4.2 Publish API — For Sale & Free listings **can** be created

Contrary to the common assumption that no listing API exists, Nextdoor documents:

* **Create FSF post** — `POST https://nextdoor.com/external/api/partner/v1/post/fsf/` (regional hosts: `ca.nextdoor.com`, `au.nextdoor.com`, `nextdoor.co.uk`). Body: `fsf{title, description, price (string, USD only), category, image_attachments[] (≤ 10 public HTTPS URLs)}` (all required), `body_text` (required, ≤ 8,192 chars), optional `hashtag`, `smartlink_url`. Returns `{"result":"success","share_link":"https://nextdoor.com/p/{post_share_id}"}`. Categories: `APPLIANCES, AUTOMOTIVE, BABY_AND_KIDS, BICYCLES, CLOTHING, ELECTRONICS, FURNITURE, GARAGE_SALES, GARDEN, HOME_DECOR, HOME_SALES, IN_SEARCH_OF, MUSICAL_INSTRUMENTS, NEIGHBOR_MADE, NEIGHBOR_SERVICES, OTHER, PET_SUPPLIES, PROPERTY_RENTALS, SPORTS_AND_OUTDOORS, ...`. Photos ≤ 10 MB each (gif/jpg/png/tif/webp); videos ≤ 500 MB.
* **Mark FSF post as sold** — `PUT .../post/fsf/` with `{classified_id, sold: true}`.
* Edit/delete post and "Get your posts" (`/me/profiles`) endpoints exist for general posts; there is no documented endpoint for reading buyer messages or offers on FSF listings.
* Requirement: "The posting must come from a Nextdoor user ... not from the partner platform directly" — i.e., each seller links their own Nextdoor account; the partner cannot post on their behalf from a service account.
* **OAuth 2.0**: authorize at `https://www.nextdoor.com/v3/authorize/?scope=openid%20post:write%20post:read%20comment:write&client_id=...&redirect_uri=...`; scopes `openid` (always), `publish_api` (super-scope), `post:write`, `post:read`, `comment:write`, `profile:read`, `profile`, `agency.boundary:read`. Exchange the code at `https://auth.nextdoor.com/v2/token` (HTTP Basic `client_id:client_secret`, `grant_type=authorization_code`), refresh with `grant_type=refresh_token`. Documented example `expires_in` values are 604,800 s (7 days) and 31,536,000 s (1 year) — exact lifetimes are **UNVERIFIED** beyond these examples. Rate limits are not published.
* Access: submit the "Publishing API request form" (Google Form); Nextdoor issues `client_id`/`client_secret` on approval. "Marketplaces where individuals can link their account to their inventory and auto-push each new listing into Nextdoor, in both the feed and the For Sale and Free marketplace" is an explicitly listed use case, so the product fits the program's stated intent.

### 4.3 Share Plugin (open, no approval)

The Share Plugin redirects the user to Nextdoor's post-creation form "with pre-filled content from your site"; the user logs in and submits manually. It supports neighbor, business and agency posts. Whether it can pre-fill an FSF listing (as opposed to a feed post) is **UNVERIFIED**; the reference page should be checked when implementing. The consumer entry point for a manual listing is Nextdoor → "Sell or give away an item" (the product is now branded *Nextdoor Finds*); a stable `nextdoor.com/for_sale_and_free/create` URL is **UNVERIFIED**.

### 4.4 Terms

Nextdoor's Member Agreement (UK 2026 text confirmed via search snippet; US text **UNVERIFIED** verbatim) prohibits "bots or other automations" and "developing, supporting or using software, devices, scripts, robots or any other means or processes (including crawlers, browser plugins and add-ons or any other technology) to scrape the Services". Only the Publish API and Share Plugin are sanctioned.

---

## 5. Secondary channels (brief)

| Channel | API? | Notes |
|---|---|---|
| **Etsy** | **Yes — Open API v3** (`https://openapi.etsy.com/v3`). | OAuth 2.0 Authorization Code **with PKCE mandatory**; authorize `https://www.etsy.com/oauth/connect`, token `https://api.etsy.com/v3/public/oauth/token`; access token 1 h, refresh token 90 days; every request also needs `x-api-key`. Scopes `listings_r`, `listings_w`, `listings_d`, `shops_r`, `shops_w`, `transactions_r`, `transactions_w`, `address_r/w`, `email_r`, `profile_r/w`. `createDraftListing` (`listings_w`) → upload images (`uploadListingImage`) → `updateListing` state `active`. Three tiers: Seller App (own shop, near-instant), Personal App (review), **Commercial Access** (serve other sellers; requires an approved Personal App then manual commercial review). Rate limits are per app (QPD/QPS sliding window), shown in the developer portal; raises via developer@etsy.com. Etsy is handmade/vintage/craft-supply only, so it fits a subset of inventory. |
| **Shopify** | **Yes — GraphQL Admin API** (`/admin/api/2025-07/graphql.json` or later). | Apps created in the Dev Dashboard, OAuth install with scopes (`write_products` implies `read_products`); `productCreate` costs 10 + 0.4×metafields + 1.9×media points against a 1,000-point bucket refilling at 50/s (higher on Plus). It is a *store* not a marketplace; useful only if the user runs a Shopify store. |
| **Depop** | **Private Selling API** (`partnerapi.depop.com`). | REST, versioned; API keys for direct partners managing their own shop, OAuth 2.0 for third-party tools used by many sellers (e.g., Vendoo runs on it). Access by request to Depop (email on the docs site); assume months of partner negotiation. |
| **Mercari (US)** | **No** public API. | `api.mercari-shops.com` is Mercari *Shops* Japan (B2B), irrelevant to US. Mercari US Prohibited Conduct bans "any robot, spambot, spider, crawler, scraper or other automated means or interface not provided by us". Assisted only. |
| **Poshmark** | **No** public API. | Only DSCO/exclusive partner integrations; terms prohibit third-party automation tools ("bots"). Assisted only. |
| **Craigslist** | **No** API; strongest anti-automation terms. | ToU: no "robots, spiders, scripts, scrapers, crawlers" and no software "that interact or interoperate with CL, e.g. for downloading, uploading, creating/accessing/using an account, posting, flagging, emailing, searching"; liquidated damages (e.g., $0.25/page beyond 1,000 requests/day, $25 per unsolicited email). Craigslist has litigated against posting tools (3Taps, Instamotor $31 M settlement). Assisted only; never pre-fill via automation. |

---

## 6. Integration Feasibility Matrix

Legend: **Official API** = documented endpoint usable under the platform's terms · **Assisted** = user completes the action in the platform's own UI with our pre-filled content, deep link and checklist · **Not possible** = no sanctioned path · **Gated** = official API exists but requires partner approval not guaranteed.

| Capability | eBay | Facebook Marketplace | OfferUp | Nextdoor | Etsy | Shopify | Depop | Mercari US | Poshmark | Craigslist |
|---|---|---|---|---|---|---|---|---|---|---|
| OAuth login / account link | Official API | Not possible for Marketplace (FB Login exists but grants nothing useful) | Not possible | Official API (closed beta) | Official API | Official API | Gated | Not possible | Not possible | Not possible |
| Create listing | Official API (Inventory `publishOffer`) | Assisted | Assisted | Official API — Gated (`POST /post/fsf/`) / Assisted via Share Plugin | Official API | Official API (product, not marketplace) | Gated | Assisted | Assisted | Assisted |
| Upload images | Official API (Media API) | Assisted (photo pack) | Assisted | Official API (public HTTPS URLs, ≤ 10) | Official API | Official API | Gated | Assisted | Assisted | Assisted |
| Modify listing | Official API (`updateOffer`) | Assisted | Assisted | Official API (edit post) — Gated | Official API | Official API | Gated | Assisted | Assisted | Assisted |
| End / delete listing | Official API (`withdrawOffer`/`deleteOffer`) | Assisted | Assisted | Official API (delete post) — Gated | Official API | Official API | Gated | Assisted | Assisted | Assisted |
| Read buyer messages | Official API (Message API) | Not possible | Not possible | Not possible | Official API (Conversations endpoints limited; **UNVERIFIED** scope) | n/a | Gated (**UNVERIFIED**) | Not possible | Not possible | Not possible |
| Manage offers / negotiation | Official API (Negotiation API + Trading Best Offer) | Not possible | Not possible | Not possible | Not possible | n/a | Gated ("offers automation") | Not possible | Not possible | Not possible |
| Read orders / mark sold | Official API (Fulfillment API) | Assisted (user marks sold) | Assisted | Official API (`PUT /post/fsf/ sold`) — Gated | Official API (`transactions_r`) | Official API | Gated | Assisted | Assisted | Assisted |
| Comps / pricing data | Official API (Browse incl. image search; sold data Gated) | Not possible | Not possible | Gated (Search FSF items, read-only beta) | Official API (`findAllListingsActive`) | n/a | Not possible | Not possible | Not possible | Not possible |
| Webhooks / notifications | Official API (Notification API) | Not possible | Not possible | Not possible | Not possible (polling) | Official API | **UNVERIFIED** | Not possible | Not possible | Not possible |

---

## 7. Recommended integration strategy per marketplace

**eBay (tier 1, build first).**
1. Register app; implement account-deletion notification endpoint (required to activate production keys). Complete the Application Growth Check early so limits and restricted APIs are not a launch blocker.
2. OAuth consent with the minimum scope set: `sell.inventory sell.account sell.fulfillment commerce.message commerce.notification.subscription commerce.identity.readonly` (add `sell.marketing` only when Promoted Listings ship). Use `api_scope` client-credentials tokens for Browse/Taxonomy so user tokens are never spent on comps.
3. On first connect: `commerce.identity` → `getPrivileges`/`getOptedInPrograms`; opt in `SELLING_POLICY_MANAGEMENT`; read or create default policies; create one inventory location.
4. Listing pipeline: Taxonomy suggestions → required aspects → condition (Metadata `getItemConditionPolicies`) → Media upload → `createOrReplaceInventoryItem` → `createOffer` (`bestOfferTerms` on by default for used goods) → `getListingFees` preview → `publishOffer`. Store `sku`, `offerId`, `listingId`.
5. Post-publish: Notification subscriptions for `ORDER_CONFIRMATION`, `NEW_MESSAGE`, `BUYER_QUESTION`, offer topics; fall back to `getOrders` polling at ≥ 15-minute intervals. Best-offer responses via Trading `GetBestOffers`/`RespondToBestOffer` under a strict per-user budget (Trading quota is 5,000/day app-wide).
6. Comps: Browse `search` + `searchByImage` (production only), filter `conditions/conditionIds`, `buyingOptions:{FIXED_PRICE|AUCTION|BEST_OFFER}`, `price`/`priceCurrency`, `itemLocationCountry:US`; cache 24 h; budget for 5,000/day. Do not plan on Marketplace Insights; expose Terapeak as a user-side link.

**Facebook Marketplace (assisted).** No API build. Ship the assisted flow (Section 8) with the create-item URL, clipboard copy, photo pack and "mark as published". Revisit only if Meta publishes a Marketplace listing API; do not touch Commerce Platform for consumer sellers.

**OfferUp (assisted).** Same assisted flow. Because §7 forbids third-party apps that "interact with" the service without written consent, do **not** ship a browser extension that auto-fills OfferUp; keep the interaction human-driven and on OfferUp's own pages.

**Nextdoor (apply + assisted fallback).** Submit the Publishing API request form immediately, describing the marketplace use case Nextdoor itself lists. On approval, implement the OAuth flow, `POST /post/fsf/`, edit/delete, and `PUT sold`; host listing photos on public HTTPS URLs (≤ 10). Until then, implement the Share Plugin or an assisted flow into "Sell or give away an item".

**Extras.** Etsy: worthwhile second API integration for handmade/vintage inventory; plan for the Personal → Commercial review path (months). Shopify: opportunistic connector for merchants. Depop: send a partner-access request; parked. Mercari/Poshmark/Craigslist: assisted only.

---

## 8. Assisted-publishing workflow (non-API marketplaces)

Design goal: the human performs every action on the target site; our product only prepares content and records state. Nothing we ship logs in as the user, submits forms, or reads pages on their behalf.

1. **Channel selection** — user picks e.g. Facebook, OfferUp, Craigslist for a listing already drafted in Clover.
2. **Marketplace-specific rendering** — generate a title (respecting each site's length norms), description with the site's conventions (no external links or "also on eBay" text for Facebook — flagged by moderation), price, condition mapping (e.g., eBay 3000 → OfferUp "Used (normal wear)"), category hint and a pickup/shipping statement. Show a side-by-side preview.
3. **Photo pack** — export the ordered photos resized to the site's limits (OfferUp 12 photos, Nextdoor 10, Facebook 10 per listing — **Facebook count UNVERIFIED**), as individual files or a ZIP; on mobile use the Web Share API so the OS share sheet can hand images straight to the marketplace app.
4. **One-tap copy** — clipboard buttons per field (title, description, price) and a "copy all" block.
5. **Deep link / handoff** — open the site's own create page in a new tab or via universal link: Facebook `https://www.facebook.com/marketplace/create/item`, OfferUp `https://offerup.com/post`, Nextdoor "Sell or give away an item", Craigslist `https://<city>.craigslist.org/` → "post to classifieds" (all UI routes; **UNVERIFIED** stability). No query-string pre-fill is attempted.
6. **Checklist** — an in-app checklist mirroring the site's form (photos uploaded, category chosen, price set, location confirmed, posted) that the user ticks off; an optional timer nudge if the tab is still open after N minutes.
7. **Mark as published** — user pastes the resulting listing URL (validated against the marketplace's domain pattern) or taps "I posted it"; we store `channel`, `externalUrl`, `publishedAt`, `status`. We never fetch or scrape that URL; if we show a preview it is only via the site's public oEmbed/Open Graph *if* the site's terms permit (Facebook: no; treat as text-only).
8. **Lifecycle** — "Mark sold everywhere" prompts the user to end each assisted listing manually (link out) and, for API channels, calls `withdrawOffer` / Nextdoor `sold`. Reminders to refresh or remove stale assisted listings after 30 days.
9. **Explicit disclosure** — UI copy states that these marketplaces do not offer an API and that the user is posting under their own account and that marketplace's terms.

---

## 9. Security guidance

* **Never store passwords or session cookies** for any marketplace. Only OAuth tokens issued to our registered app. No credential-stuffed logins, no cookie import, no headless browsers acting as the user, no CAPTCHA solving, no proxy rotation. These are ToS violations on every platform reviewed and, for Facebook/Craigslist, have been litigated.
* **Token storage**: encrypt refresh tokens at rest with envelope encryption (per-tenant data key wrapped by a KMS master key; AES-256-GCM), store access tokens only in memory/short-TTL cache, never in logs or analytics. Rotate the KMS key annually; re-encrypt on rotation. eBay refresh tokens are valid ~18 months and do not rotate, so a leaked token is long-lived — treat as a password-equivalent secret and support one-click disconnect that also revokes server-side where the platform allows (eBay: user revokes via account settings; we listen for `AUTHORIZATION_REVOCATION`).
* **Least privilege**: request only the scopes listed in Section 7; use `.readonly` variants where we only read; request `sell.marketing` and `sell.finances` incrementally when the feature is enabled. Use client-credentials tokens for public data so user tokens are not exposed to the comps service.
* **OAuth hygiene**: authorization-code flow with `state` (CSRF) and PKCE where supported (Etsy mandates it; use it everywhere it is accepted), exact-match registered redirect URIs (eBay RuName), TLS-only, short-lived state entries. Store `client_secret`/Cert ID in a secrets manager, never in the client app.
* **Webhook verification**: verify eBay notification signatures with the published public key and respond to challenge codes; verify Shopify HMAC; reject unsigned payloads.
* **Data minimisation and deletion**: honour eBay `MARKETPLACE_ACCOUNT_DELETION` within the required window by deleting the user's eBay-derived data; do not retain buyer PII from Message/Fulfillment beyond operational need; apply the same policy to Nextdoor data.
* **Rate-limit discipline**: per-tenant token buckets below platform limits, exponential backoff on 429/5xx with at most two retries on infrastructure errors (an explicit Application Growth Check criterion), and daily quota dashboards from `getRateLimits`.
* **Content and compliance**: enforce eBay's required aspects, condition descriptors and (from 8 Jul 2026) CPSC document uploads at listing time so the product never publishes non-compliant listings on the user's behalf.
* **Assisted channels**: the assisted flow must not inject scripts into third-party pages, must not read their DOM, and must not automate form submission — a plain link-out plus clipboard and file download is the boundary.

---

## 10. Sources

eBay (official unless noted)
- https://developer.ebay.com/api-docs/static/oauth-tokens.html (via edp.ebay.com mirror)
- https://developer.ebay.com/api-docs/static/oauth-scopes.html
- https://developer.ebay.com/develop/get-started/api-call-limits
- https://developer.ebay.com/api-docs/sell/static/inventory/publishing-offers.html
- https://developer.ebay.com/api-docs/sell/static/inventory/managing-image-media.html
- https://developer.ebay.com/api-docs/sell/static/metadata/condition-id-values.html
- https://developer.ebay.com/api-docs/buy/static/ref-buy-browse-filters.html
- https://developer.ebay.com/api-docs/buy/static/buy-requirements.html
- https://developer.ebay.com/api-docs/sell/negotiation/overview.html
- https://developer.ebay.com/api-docs/commerce/media/overview.html
- https://developer.ebay.com/api-docs/commerce/notification/overview.html
- https://developer.ebay.com/develop/api/buy/notification_events
- https://developer.ebay.com/api-docs/sell/fulfillment/overview.html
- https://developer.ebay.com/api-docs/sell/feed/overview.html
- https://developer.ebay.com/api-docs/sell/marketing/overview.html
- https://developer.ebay.com/develop/guides-v2/communications/sell-communications-guide
- https://developer.ebay.com/develop/api/sell/message_api
- https://developer.ebay.com/develop/get-started/api-deprecation-status
- https://developer.ebay.com/updates/newsletter/q4_2025 · /q1_2026 · /q2_2026
- https://developer.ebay.com/grow/application-growth-check and KB 1062, 5196
- https://developer.ebay.com/support/kb-article?KBid=684 (Sandbox unsupported features)
- https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion
- https://developer.ebay.com/devzone/xml/docs/reference/ebay/RespondToBestOffer.html · /GetBestOffers.html
- OpenAPI specs downloaded 15 Sep 2026: https://developer.ebay.com/develop/api/spec/{inventory_api,message_api,negotiation_api,media_api,browse_api,marketplace_insights_api,fulfillment_api}.json
- https://community.ebay.com/t5/eBay-APIs-Talk-to-your-fellow/Marketplace-Insights-API-access/td-p/34838736 (secondary)
- https://community.ebay.com/t5/eBay-APIs-Talk-to-your-fellow/About-API-limit-calls/td-p/34671615 (secondary)
- https://www.ebay.com/help/selling/selling-tools/terapeak-research?id=4853

Meta / Facebook
- https://developers.facebook.com/docs/commerce-platform/
- https://developers.facebook.com/docs/commerce-platform/platforms
- https://developers.facebook.com/docs/permissions/
- https://developers.facebook.com/docs/app-review/
- https://developers.facebook.com/terms/dfc_platform_terms/
- https://www.facebook.com/terms.php (§3.2)
- https://www.facebook.com/apps/site_scraping_tos_terms.php
- https://www.facebook.com/business/help/685696635352394 (vehicle catalogs)
- https://www.engadget.com/2222363/meta-launches-storefront-platform-facebook-marketplace-seller/ (Seller app, 24 Jul 2026)
- https://ppc.land/meta-phases-out-facebook-and-instagram-shops-checkout-by-august-2025/
- https://www.autosweet.com/blog/facebook-marketplace-questions-answered/ and https://bayeast.org/… (2021/2023 partner-feed shutdowns, secondary)
- https://api2cart.com/api-technology/facebook-marketplace-api/ (secondary, 2026 status)

OfferUp
- https://offerup.com/terms (effective 21 Jul 2026, §7)
- https://offerup.com/seller-terms (OfferUp for Business)
- https://help.offerup.com/hc/en-us/articles/360031987592-Post-an-item-to-sell
- https://support.dealercenter.net/hc/en-us/articles/4414917539348-OfferUp-Verified-Dealer-Program and https://www.prnewswire.com/news-releases/offerup-expands-nationwide-autos-program-to-include-dealer-inventory-and-marketing-partners-300866955.html (secondary)

Nextdoor
- https://developer.nextdoor.com/ and https://developer.nextdoor.com/llms.txt
- https://developer.nextdoor.com/docs/sharing-overview
- https://developer.nextdoor.com/reference/sharing-introduction
- https://developer.nextdoor.com/reference/sharing-get-authorization-code
- https://developer.nextdoor.com/reference/sharing-get-access-token · /sharing-refresh-access-token
- https://developer.nextdoor.com/reference/create-fsf-post-3
- https://developer.nextdoor.com/reference/mark-fsf-sold
- https://developer.nextdoor.com/reference/sharing-data-types
- https://developer.nextdoor.com/reference/sharing-availability
- https://developer.nextdoor.com/reference/applying-for-access
- https://developer.nextdoor.com/docs/overview-copy-1 (Search / Marketplace Listings API)
- https://help.nextdoor.com/s/article/Member-Agreement-UK-2026 (automation clause; US text UNVERIFIED)
- https://help.nextdoor.com/s/article/Best-practices-For-Sale-Free

Other channels
- https://developers.etsy.com/documentation/essentials/authentication/ · /rate-limits/
- https://vorplabs.com/agent-tools/etsy-api (access tiers, secondary)
- https://shopify.dev/docs/api/usage/limits · https://shopify.dev/docs/api/usage/access-scopes · https://shopify.dev/changelog/dynamic-complexity-cost-for-productcreate-and-productupdate-mutations
- https://partnerapi.depop.com/api-docs/ · /concepts/authentication/ · /terms/
- https://www.mercari.com/us/help_center/topics/account/policies/prohibited-conduct/
- https://blog.vendoo.co/poshmark-bots-what-you-need-to-know-about-using-bots and https://sellerchamp.com/integrations/market-places/sell-on-poshmark/ (secondary)
- https://www.craigslist.org/about/terms.of.use/en
- https://newmedialaw.proskauer.com/2017/08/24/ending-data-scraping-dispute-craigslist-reaches-31m-settlement-with-instamotor/
