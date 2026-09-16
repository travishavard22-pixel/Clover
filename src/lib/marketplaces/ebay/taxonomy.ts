import { db } from "../../db";
import { env } from "../../env";
import { getEbayAppToken } from "./app-token";
import { ebayRequestWithToken } from "./client";

const TTL_MS = 24 * 3600 * 1000;

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const full = `ebay-taxonomy:${key}`;
  const hit = await db.compCache.findUnique({ where: { key: full } });
  if (hit && hit.expiresAt > new Date()) return hit.data as unknown as T;
  const data = await fn();
  await db.compCache.upsert({ where: { key: full }, create: { key: full, data: data as never, expiresAt: new Date(Date.now() + TTL_MS) }, update: { data: data as never, expiresAt: new Date(Date.now() + TTL_MS) } });
  return data;
}

async function get<T>(path: string, query?: Record<string, string>): Promise<T> {
  const token = await getEbayAppToken();
  const res = await ebayRequestWithToken(token, { path, query });
  return (await res.json()) as T;
}

export async function getDefaultCategoryTreeId(): Promise<string> {
  const mp = env.EBAY_MARKETPLACE_ID;
  return cached(`tree:${mp}`, async () => {
    const data = await get<{ categoryTreeId: string }>("/commerce/taxonomy/v1/get_default_category_tree_id", { marketplace_id: mp });
    return data.categoryTreeId;
  });
}

export type CategorySuggestion = { categoryId: string; categoryName: string; path: string[]; relevancy?: string };

export async function getCategorySuggestions(q: string): Promise<CategorySuggestion[]> {
  const norm = q.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
  if (!norm) return [];
  const treeId = await getDefaultCategoryTreeId();
  return cached(`suggest:${treeId}:${norm}`, async () => {
    const data = await get<{ categorySuggestions?: Array<{ category: { categoryId: string; categoryName: string }; categoryTreeNodeAncestors?: Array<{ categoryName: string }>; relevancy?: string }> }>(
      `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions`,
      { q: norm },
    );
    return (data.categorySuggestions ?? []).map((s) => ({
      categoryId: s.category.categoryId,
      categoryName: s.category.categoryName,
      path: [...(s.categoryTreeNodeAncestors ?? []).map((a) => a.categoryName).reverse(), s.category.categoryName],
      relevancy: s.relevancy,
    }));
  });
}

export type CategoryAspect = { name: string; required: boolean; usage: "REQUIRED" | "RECOMMENDED" | "OPTIONAL"; mode: "FREE_TEXT" | "SELECTION_ONLY"; values: string[]; multi: boolean };

export async function getItemAspectsForCategory(categoryId: string): Promise<CategoryAspect[]> {
  const treeId = await getDefaultCategoryTreeId();
  return cached(`aspects:${treeId}:${categoryId}`, async () => {
    const data = await get<{
      aspects?: Array<{ localizedAspectName: string; aspectConstraint: { aspectRequired?: boolean; aspectUsage?: string; aspectMode?: string; itemToAspectCardinality?: string }; aspectValues?: Array<{ localizedValue: string }> }>;
    }>(`/commerce/taxonomy/v1/category_tree/${treeId}/get_item_aspects_for_category`, { category_id: categoryId });
    return (data.aspects ?? []).map((a) => ({
      name: a.localizedAspectName,
      required: !!a.aspectConstraint.aspectRequired,
      usage: (a.aspectConstraint.aspectUsage as CategoryAspect["usage"]) ?? "OPTIONAL",
      mode: (a.aspectConstraint.aspectMode as CategoryAspect["mode"]) ?? "FREE_TEXT",
      values: (a.aspectValues ?? []).map((v) => v.localizedValue).slice(0, 500),
      multi: a.aspectConstraint.itemToAspectCardinality === "MULTI",
    }));
  });
}
