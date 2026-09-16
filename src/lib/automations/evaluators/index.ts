import type { AutomationType } from "../../db";
import type { AutomationConfigMap, EvaluationContext, Evaluator, Proposal } from "../types";
import { evaluateDoubleSellGuard } from "./double-sell-guard";
import { evaluateOfferAlert } from "./offer-alert";
import { evaluatePendingAction } from "./pending-action";
import { evaluatePhotoQuality } from "./photo-quality";
import { evaluateRepriceStale } from "./reprice-stale";
import { evaluateShippingPrep } from "./shipping-prep";
import { evaluateSoldSync } from "./sold-sync";
import { evaluateStaleListing } from "./stale-listing";
import { evaluateTitleQuality } from "./title-quality";

export const EVALUATORS: { [T in AutomationType]: Evaluator<T> } = {
  REPRICE_STALE: evaluateRepriceStale,
  STALE_LISTING: evaluateStaleListing,
  PHOTO_QUALITY: evaluatePhotoQuality,
  TITLE_QUALITY: evaluateTitleQuality,
  OFFER_ALERT: evaluateOfferAlert,
  SOLD_SYNC: evaluateSoldSync,
  DOUBLE_SELL_GUARD: evaluateDoubleSellGuard,
  SHIPPING_PREP: evaluateShippingPrep,
  PENDING_ACTION_REMINDER: evaluatePendingAction,
};

/** Runs one evaluator. Pure. */
export function evaluate<T extends AutomationType>(type: T, ctx: EvaluationContext, config: AutomationConfigMap[T]): Proposal[] {
  return (EVALUATORS[type] as Evaluator<T>)(ctx, config);
}

export { computeReprice, priceSince } from "./reprice-stale";
export { photoIssues } from "./photo-quality";
export { analyseTitle, titleLimitFor } from "./title-quality";
export { buildShippingNote } from "./shipping-prep";
export { orphanedPublications } from "./sold-sync";
