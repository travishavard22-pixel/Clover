/**
 * The clover mark's geometry, shared by the React component and the icon generator so the app's
 * logo and the store icons cannot drift apart.
 *
 * The mark it replaces was an "Aperture Clover": four camera-aperture blades rotated 45°, meant to
 * read as a lens and a clover at once. It read as neither — at icon size the blades look like a
 * pinwheel. This one commits to being a clover, because that is the app's name and the thing
 * someone has to recognise in a grid of app icons in under a second.
 *
 * One leaf primitive, a heart with its tip at the bottom of a 24-unit box, placed four times with
 * the tips meeting at the centre. Hearts rather than rounded squares: the lobed silhouette is what
 * makes a clover legible, and the notches between lobes survive being scaled to 20px.
 */

/** A heart in a 24×24 box: tip at (12,22), lobes at the top. */
export const CLOVER_LEAF_PATH =
  "M12 22C12 22 2 14.2 2 8.6 2 5.3 4.5 3 7.4 3 9.3 3 11 4 12 5.6 13 4 14.7 3 16.6 3 19.5 3 22 5.3 22 8.6 22 14.2 12 22 12 22z";

/** Leaves sit on the axes, not the diagonals — on the diagonals the lobes overlap into a blob. */
export const CLOVER_LEAF_ANGLES = [0, 90, 180, 270] as const;

/**
 * How far each leaf is pushed out along its own axis, in unscaled units.
 *
 * With the tips meeting exactly at the centre the four leaves merge into one silhouette: it reads
 * as a flower, or a blob, and you cannot count four leaves — which is the whole point of a
 * four-leaf clover. Pushing them out opens a cleft between neighbours. 3 is the value where the
 * leaves become countable while the mark stays one object; by 6 they read as four detached hearts
 * and the gap between them competes with the leaves themselves.
 */
export const CLOVER_LEAF_OFFSET = 3;

/**
 * Which leaf is the "lucky" one, rendered lighter than the other three.
 *
 * It is the whole idea of the mark: a four-leaf clover with one leaf picked out reads as luck
 * rather than as botany, and it is what makes the icon memorable next to competitors. Index 0 is
 * the top leaf — off-axis positions look accidental rather than chosen.
 */
export const CLOVER_LUCKY_LEAF = 0;

/**
 * Places a leaf's tip at the centre of a `box`-unit square with its lobes pointing along `angle`.
 *
 * `scale` is in leaf-lengths: a leaf reaches ~19 units from its tip, so with the offset the mark
 * reaches `19 × scale + CLOVER_LEAF_OFFSET` from the centre — see `cloverReach`. The Android
 * maskable variant uses less because its outer ring gets cropped.
 */
export function cloverLeafTransform(angle: number, scale: number, box = 64): string {
  const c = box / 2;
  // Right to left: place the heart's tip at the origin, scale it, push it out along its axis, aim
  // it, then move the whole thing to the centre of the tile.
  return `translate(${c} ${c}) rotate(${angle}) translate(0 ${-CLOVER_LEAF_OFFSET}) scale(${scale}) translate(-12 -22)`;
}

/** How far the mark reaches from the tile's centre, which is what decides clipping. */
export function cloverReach(scale: number): number {
  return 19 * scale + CLOVER_LEAF_OFFSET;
}

/** The four leaf paths as SVG markup. `lucky` styles the one leaf that differs, if anything should. */
export function cloverLeaves(scale: number, box = 64, lucky?: { attrs: string }): string {
  return CLOVER_LEAF_ANGLES.map((angle, i) => {
    const attrs = i === CLOVER_LUCKY_LEAF && lucky ? ` ${lucky.attrs}` : "";
    return `<path d="${CLOVER_LEAF_PATH}"${attrs} transform="${cloverLeafTransform(angle, scale, box)}"/>`;
  }).join("");
}

/** How much of the tile the mark fills, per surface. */
export const CLOVER_SCALE = {
  /** Store and launcher icons: as large as the tile allows. */
  tile: 1.3,
  /** Android maskable: the OS may crop to a circle of 80% diameter, so stay well inside it. */
  maskable: 1.1,
  /**
   * Android adaptive icon, the foreground layer handed to `@capacitor/assets`.
   *
   * Three numbers decide this one. The adaptive canvas is 108dp; `@capacitor/assets` insets both
   * layers by 16.7%, so our square lands on the central 72dp; and Android's guidance is to keep
   * key content inside a 66dp circle, because a launcher's mask may be no larger than that. So the
   * mark may span 66/72 — 91.6% — of the image we generate. At this scale it spans 86.6%, which is
   * 62.3dp of the 66dp allowed. Raising it past ~1.38 starts clipping the leaf tips on round masks.
   */
  adaptive: 1.3,
} as const;

/**
 * How wide the mark is drawn on a launch screen, as a fraction of the canvas.
 *
 * Modest on purpose: the launch screen is a full-bleed square that the phone tooling centre-crops
 * to every device aspect, and it wants a small mark in a lot of space rather than an app icon
 * blown up to fill the phone. A fifth of the square lands at roughly 30% of the width of a
 * portrait phone screen.
 */
export const CLOVER_SPLASH_FRACTION = 0.2;

/**
 * The factor that shrinks a finished mark to span `fraction` of its box, keeping the proportions
 * it has on an icon.
 *
 * Use this rather than lowering `scale` to make a small mark. `CLOVER_LEAF_OFFSET` is measured in
 * tile units, outside the per-leaf scale, so a smaller `scale` shrinks the leaves while the cleft
 * between them stays the same width: by scale 0.2 the gap is wider than the leaves and the mark
 * reads as four loose hearts rather than a clover. Scaling the assembled group moves the clefts
 * with the leaves.
 */
export function cloverFit(fraction: number, scale: number = CLOVER_SCALE.tile, box = 64): number {
  return (fraction * box) / (2 * cloverReach(scale));
}

/** Wraps mark markup in a scale about the centre of the box — see `cloverFit`. */
export function cloverScaled(fraction: number, body: string, scale: number = CLOVER_SCALE.tile, box = 64): string {
  const c = box / 2;
  return `<g transform="translate(${c} ${c}) scale(${cloverFit(fraction, scale, box)}) translate(${-c} ${-c})">${body}</g>`;
}
