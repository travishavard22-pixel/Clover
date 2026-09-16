import sharp from "sharp";
import { db, type Marketplace, type Prisma } from "../db";
import { auth } from "../auth";
import { createItem } from "../items/create";
import { storeUploadedPhoto } from "../photos/store";
import { enqueueJob } from "../jobs/queue";
import { drainQueue, registerAllHandlers } from "../jobs";
import { ANALYZE_STEPS } from "../analysis/steps";
import { DEMO_CATALOG, catalogBySlug } from "./catalog";
import { markSold } from "../inventory/sold";
import { estimateFees } from "../marketplaces/registry";
import { notify } from "../notifications";

export const DEMO_EMAIL = "demo@clover.local";
export const DEMO_PASSWORD = "clover-demo-2026";

/**
 * Seeds a complete demo account. Items are pushed through the real ANALYZE_ITEM pipeline (with the
 * Demo AI provider) so profiles, comps, estimates, drafts and studio renders come from production
 * code paths rather than hand-written rows. Idempotent: returns early if the account already has
 * items unless CLOVER_SEED_RESET=1.
 */
export async function seedDemoAccount(): Promise<{ email: string; items: number }> {
  const user = await ensureUser();
  const existing = await db.item.count({ where: { userId: user.id } });
  if (existing > 0 && process.env.CLOVER_SEED_RESET !== "1") return { email: DEMO_EMAIL, items: existing };
  if (existing > 0) {
    await db.item.deleteMany({ where: { userId: user.id } });
    await db.notification.deleteMany({ where: { userId: user.id } });
    await db.recommendation.deleteMany({ where: { userId: user.id } });
    await db.job.deleteMany({ where: { userId: user.id } });
  }

  registerAllHandlers();
  const now = Date.now();
  const day = 24 * 3600 * 1000;

  // slug, palette, plan
  const plan: Array<{ slug: string; status: "DRAFT" | "READY" | "LISTED" | "OFFER_RECEIVED" | "SOLD" | "ARCHIVED"; hue: number; cost: number; listedDaysAgo?: number; soldDaysAgo?: number; soldOn?: Marketplace; markets?: Marketplace[] }> = [
    { slug: "canon-ae1-program", status: "LISTED", hue: 30, cost: 9000, listedDaysAgo: 21, markets: ["EBAY", "FACEBOOK", "OFFERUP"] },
    { slug: "keychron-k2-v2", status: "OFFER_RECEIVED", hue: 210, cost: 4500, listedDaysAgo: 9, markets: ["EBAY", "FACEBOOK"] },
    { slug: "coach-tabby-26", status: "LISTED", hue: 340, cost: 12000, listedDaysAgo: 3, markets: ["EBAY"] },
    { slug: "trek-domane-al2", status: "LISTED", hue: 150, cost: 40000, listedDaysAgo: 34, markets: ["FACEBOOK", "OFFERUP", "NEXTDOOR"] },
    { slug: "kitchenaid-artisan", status: "SOLD", hue: 0, cost: 8000, listedDaysAgo: 40, soldDaysAgo: 28, soldOn: "EBAY", markets: ["EBAY", "FACEBOOK"] },
    { slug: "levis-type-iii-trucker", status: "READY", hue: 220, cost: 1500 },
    { slug: "nintendo-switch-oled", status: "SOLD", hue: 200, cost: 15000, listedDaysAgo: 18, soldDaysAgo: 6, soldOn: "FACEBOOK", markets: ["EBAY", "FACEBOOK"] },
    { slug: "mcm-teak-tripod-lamp", status: "LISTED", hue: 45, cost: 3000, listedDaysAgo: 52, markets: ["FACEBOOK", "NEXTDOOR"] },
    { slug: "dewalt-dcd771c2", status: "READY", hue: 60, cost: 5000 },
    { slug: "nike-pegasus-40", status: "SOLD", hue: 280, cost: 3500, listedDaysAgo: 60, soldDaysAgo: 49, soldOn: "OFFERUP", markets: ["OFFERUP"] },
    { slug: "lego-10264-corner-garage", status: "DRAFT", hue: 15, cost: 0 },
    { slug: "lodge-l10sk3", status: "ARCHIVED", hue: 20, cost: 1200 },
    { slug: "canon-ae1-program", status: "DRAFT", hue: 100, cost: 0 },
    { slug: "coach-tabby-26", status: "SOLD", hue: 320, cost: 14000, listedDaysAgo: 75, soldDaysAgo: 70, soldOn: "EBAY", markets: ["EBAY"] },
  ];

  let count = 0;
  for (const p of plan) {
    const entry = catalogBySlug(p.slug) ?? DEMO_CATALOG[0]!;
    const title = entry.profile.itemName.value;
    const item = await createItem(user.id, { title });
    const shots = p.status === "DRAFT" ? 2 : 4;
    for (let i = 0; i < shots; i++) {
      const bytes = await renderPlaceholder(p.hue + i * 12, i, entry.slug);
      await storeUploadedPhoto({ userId: user.id, itemId: item.id, bytes, label: ["Front", "Back", "Label", "Detail"][i] ?? null });
    }
    await db.item.update({ where: { id: item.id }, data: { acquisitionCost: p.cost || null, storageLocation: ["Shelf A", "Bin 3", "Closet", "Garage rack"][count % 4], acquiredAt: new Date(now - (90 + count * 3) * day) } });

    if (p.status !== "DRAFT") {
      await enqueueJob("ANALYZE_ITEM", { itemId: item.id }, { userId: user.id, itemId: item.id, steps: [...ANALYZE_STEPS] });
      await drainQueue(50);
    }

    if (p.markets?.length && (p.status === "LISTED" || p.status === "OFFER_RECEIVED" || p.status === "SOLD")) {
      const fresh = await db.item.findUniqueOrThrow({ where: { id: item.id } });
      const price = fresh.listPrice ?? fresh.estimatedValue ?? 5000;
      const listedAt = new Date(now - (p.listedDaysAgo ?? 7) * day);
      for (const [i, m] of p.markets.entries()) {
        const api = m === "EBAY";
        const requiresAction = !api && m === "OFFERUP" && i === p.markets.length - 1 && p.status === "LISTED";
        await db.publication.create({
          data: {
            itemId: item.id,
            userId: user.id,
            marketplace: m,
            mode: api ? "API" : "ASSISTED",
            status: requiresAction ? "REQUIRES_USER_ACTION" : "PUBLISHED",
            price,
            externalId: requiresAction ? null : `demo-${m.toLowerCase()}-${item.sku.toLowerCase()}`,
            externalUrl: requiresAction ? null : api ? `https://www.ebay.com/itm/demo-${item.sku.toLowerCase()}` : `https://www.facebook.com/marketplace/item/demo-${item.sku.toLowerCase()}`,
            feePreview: { fees: estimateFees(m, price), note: "Demo fee preview" } as Prisma.InputJsonValue,
            checklist: requiresAction
              ? ([
                  { key: "copy_title", label: "Copy the title", done: true },
                  { key: "copy_description", label: "Copy the description", done: true },
                  { key: "photos", label: "Download the photo pack (4 photos)", done: false },
                  { key: "open", label: "Open OfferUp's create page", done: false, href: "https://offerup.com/post" },
                  { key: "posted", label: "I posted it — paste the listing link", done: false },
                ] as Prisma.InputJsonValue)
              : ([] as Prisma.InputJsonValue),
            publishedAt: requiresAction ? null : listedAt,
            externalMeta: { demo: true } as Prisma.InputJsonValue,
          },
        });
      }
      await db.item.update({ where: { id: item.id }, data: { status: "LISTED", listedAt } });
    }

    if (p.status === "OFFER_RECEIVED") {
      const fresh = await db.item.findUniqueOrThrow({ where: { id: item.id } });
      const price = fresh.listPrice ?? 5000;
      const pub = await db.publication.findFirst({ where: { itemId: item.id, marketplace: "EBAY" } });
      await db.offer.createMany({
        data: [
          { userId: user.id, itemId: item.id, publicationId: pub?.id, marketplace: "EBAY", externalId: `demo-offer-${item.sku}-1`, buyerName: "j***n", amount: Math.round(price * 0.82), originalPrice: price, message: "Would you take this? Can pay today.", receivedAt: new Date(now - 2 * 3600 * 1000), expiresAt: new Date(now + 2 * day) },
          { userId: user.id, itemId: item.id, marketplace: "FACEBOOK", buyerName: "Priya S.", amount: Math.round(price * 0.7), originalPrice: price, message: "Is this still available? I can pick up tonight for this.", receivedAt: new Date(now - 26 * 3600 * 1000) },
        ],
      });
      await db.item.update({ where: { id: item.id }, data: { status: "OFFER_RECEIVED" } });
      await notify(user.id, { type: "offer", title: `New offer on ${title}`, body: "j***n offered 18% below your asking price on eBay.", href: "/offers" });
    }

    if (p.status === "SOLD" && p.soldOn) {
      const fresh = await db.item.findUniqueOrThrow({ where: { id: item.id } });
      const price = fresh.listPrice ?? 5000;
      const soldPrice = Math.round(price * 0.93);
      await markSold(user.id, item.id, { soldPriceCents: soldPrice, marketplace: p.soldOn, shippingCostCents: p.soldOn === "EBAY" ? 1250 : 0, local: p.soldOn !== "EBAY" } as never);
      await db.item.update({ where: { id: item.id }, data: { soldAt: new Date(now - (p.soldDaysAgo ?? 5) * day), status: (p.soldDaysAgo ?? 0) > 20 ? "COMPLETED" : "SOLD" } });
      // Sold-elsewhere guard leaves other publications requiring action; resolve the older ones so the feed isn't all guard rows.
      if ((p.soldDaysAgo ?? 0) > 20) await db.publication.updateMany({ where: { itemId: item.id, status: "REQUIRES_USER_ACTION" }, data: { status: "ENDED", endedAt: new Date(now - (p.soldDaysAgo ?? 5) * day + day) } });
    }

    if (p.status === "ARCHIVED") await db.item.update({ where: { id: item.id }, data: { status: "ARCHIVED", archivedAt: new Date(now - 10 * day) } });
    count++;
  }

  // Automation rules and a few open recommendations so the dashboard has "needs attention" rows.
  const rules: Array<{ type: Prisma.AutomationRuleCreateManyInput["type"]; mode: Prisma.AutomationRuleCreateManyInput["mode"] }> = [
    { type: "REPRICE_STALE", mode: "SUGGEST" },
    { type: "STALE_LISTING", mode: "SUGGEST" },
    { type: "OFFER_ALERT", mode: "AUTO" },
    { type: "DOUBLE_SELL_GUARD", mode: "ASK" },
    { type: "PENDING_ACTION_REMINDER", mode: "AUTO" },
  ];
  for (const r of rules) await db.automationRule.upsert({ where: { userId_type: { userId: user.id, type: r.type } }, create: { userId: user.id, ...r }, update: { mode: r.mode } });

  const stale = await db.item.findFirst({ where: { userId: user.id, status: "LISTED" }, orderBy: { listedAt: "asc" } });
  if (stale) {
    await db.recommendation.createMany({
      data: [
        { userId: user.id, itemId: stale.id, type: "REPRICE_STALE", title: `Lower ${stale.title} by 8%`, body: `Listed ${Math.round((now - (stale.listedAt?.getTime() ?? now)) / day)} days with no offers. A price closer to the quick-sale estimate usually sells within two weeks.`, proposal: { action: "reprice", itemId: stale.id, newPriceCents: Math.round(((stale.listPrice ?? 5000) * 0.92) / 100) * 100 } as Prisma.InputJsonValue },
        { userId: user.id, itemId: stale.id, type: "PHOTO_QUALITY", title: "Add a studio photo", body: "The cover photo is an unedited original. A clean studio cover raises click-through on eBay and Facebook.", proposal: { action: "studio", itemId: stale.id, mode: "CLEAN_STUDIO" } as Prisma.InputJsonValue },
      ],
    });
  }
  await notify(user.id, { type: "system", title: "Welcome to Clover", body: "This account is seeded with demo data. Everything you see was produced by the same pipeline your own photos go through.", href: "/home" });

  const items = await db.item.count({ where: { userId: user.id } });
  return { email: DEMO_EMAIL, items };
}

async function ensureUser() {
  const existing = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
  let id = existing?.id;
  if (!id) {
    const res = await auth.api.signUpEmail({ body: { name: "Demo Seller", email: DEMO_EMAIL, password: DEMO_PASSWORD } });
    id = res.user.id;
  }
  await db.userPreferences.upsert({
    where: { userId: id },
    create: { userId: id, onboardingComplete: true, onboardingStep: 8, city: "Austin", region: "TX", postalCode: "78704", pricingStrategy: "BALANCED", defaultShippingNote: "Ships within 1 business day. Local pickup in South Austin." },
    update: { onboardingComplete: true, onboardingStep: 8, city: "Austin", region: "TX", postalCode: "78704" },
  });
  return { id };
}

/** Abstract "product" placeholder: a soft shape on the studio background, distinct per item and shot. */
async function renderPlaceholder(hue: number, shot: number, slug: string): Promise<Buffer> {
  const w = 1600;
  const h = shot % 2 === 0 ? 1200 : 1600;
  const seed = [...slug].reduce((a, c) => a + c.charCodeAt(0), 0) + shot * 17;
  const rx = 0.28 + ((seed % 7) / 7) * 0.12;
  const ry = 0.22 + ((seed % 5) / 5) * 0.14;
  const rot = (seed % 40) - 20;
  const l1 = `hsl(${hue} 42% 46%)`;
  const l2 = `hsl(${(hue + 25) % 360} 38% 30%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f4ee"/><stop offset="1" stop-color="#e6e2d8"/></linearGradient>
      <linearGradient id="obj" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${l1}"/><stop offset="1" stop-color="${l2}"/></linearGradient>
      <filter id="blur"><feGaussianBlur stdDeviation="28"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <ellipse cx="${w / 2}" cy="${h * 0.74}" rx="${w * rx * 1.1}" ry="${h * 0.05}" fill="#000" opacity="0.18" filter="url(#blur)"/>
    <g transform="rotate(${rot} ${w / 2} ${h / 2})">
      <rect x="${w / 2 - w * rx}" y="${h / 2 - h * ry}" width="${w * rx * 2}" height="${h * ry * 2}" rx="${w * 0.06}" fill="url(#obj)"/>
      <rect x="${w / 2 - w * rx * 0.7}" y="${h / 2 - h * ry * 0.55}" width="${w * rx * 1.4}" height="${h * ry * 0.18}" rx="${w * 0.02}" fill="#fff" opacity="0.18"/>
      <circle cx="${w / 2 + w * rx * 0.55}" cy="${h / 2 + h * ry * 0.45}" r="${w * 0.035}" fill="#fff" opacity="0.35"/>
    </g>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}
