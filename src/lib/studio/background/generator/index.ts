import type { BackgroundGenerator } from "./types";

export * from "./types";

/**
 * Hook for a real generator. Two candidates are documented in docs/research/04 §3.2:
 *
 *  - Photoroom Image Editing API:  POST https://image-api.photoroom.com/v2/edit
 *      multipart `imageFile` + `background.prompt`, `shadow.mode`, `lighting.mode`; header `x-api-key`.
 *      (~$0.10/image). Would be `class PhotoroomEditGenerator implements BackgroundGenerator`.
 *  - FLUX.1 Fill [pro] (BFL / fal / Replicate): mask-based inpaint; pass the inverted alpha as the
 *      mask so item pixels are locked (~$0.05/MP). Would be `class FluxFillGenerator`.
 *
 * Neither is wired yet: there is no env key for them, and nothing here calls a network API without
 * one. Until then LIFESTYLE uses `renderBlurredOriginal` and says so on the photo.
 */
export function getBackgroundGenerator(): BackgroundGenerator | null {
  return null;
}
