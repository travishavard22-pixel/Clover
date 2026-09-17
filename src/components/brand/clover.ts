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
 * `scale` is in leaf-lengths: a leaf reaches ~19 units from its tip, so the mark spans roughly
 * `2 × 19 × scale`. At box 64, scale 1.38 fills the tile the way a store icon should; the Android
 * maskable variant uses less because its outer ring gets cropped.
 */
export function cloverLeafTransform(angle: number, scale: number, box = 64): string {
  const c = box / 2;
  return `translate(${c} ${c}) rotate(${angle}) scale(${scale}) translate(-12 -22)`;
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
  tile: 1.38,
  /** Android maskable: the OS may crop to a circle of 80% diameter, so stay well inside it. */
  maskable: 1.1,
} as const;
