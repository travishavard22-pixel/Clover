/** The declared step plan for ANALYZE_ITEM jobs. Labels name the action and the object (never "Analyzing…"). */
export const ANALYZE_STEPS = [
  { key: "prepare", label: "Preparing photos" },
  { key: "identify", label: "Identifying the item" },
  { key: "verify", label: "Checking brand and model" },
  { key: "condition", label: "Grading condition and defects" },
  { key: "comps", label: "Searching comparable listings" },
  { key: "price", label: "Calculating a price" },
  { key: "photos", label: "Preparing studio photos" },
  { key: "listing", label: "Writing the listing" },
  { key: "done", label: "Ready for review" },
] as const;

export type AnalyzeStepKey = (typeof ANALYZE_STEPS)[number]["key"];

export const STUDIO_STEPS = [
  { key: "load", label: "Loading the original photo" },
  { key: "segment", label: "Separating the item from its background" },
  { key: "background", label: "Rendering the background" },
  { key: "composite", label: "Placing the item and shadow" },
  { key: "qa", label: "Checking the item is unchanged" },
  { key: "save", label: "Saving the studio photo" },
] as const;

export const PUBLISH_STEPS = [
  { key: "prepare", label: "Preparing the listing" },
  { key: "photos", label: "Uploading photos" },
  { key: "category", label: "Mapping category and item specifics" },
  { key: "fees", label: "Previewing fees" },
  { key: "publish", label: "Publishing" },
] as const;
