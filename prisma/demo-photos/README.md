# Demo product photos

Seller-style photographs for the demo catalogue (`src/lib/demo/catalog.ts`). The seed
(`pnpm db:seed`) uploads `<slug>/<shot>.jpg` for each item when the file exists and falls back to an
abstract placeholder when it does not, so a checkout without the full set still seeds cleanly.

- Shots: `front`, `back`, `label`, `detail` — the same order as the seed's photo labels, and the
  order the catalogue's condition notes reference as evidence images 1–4.
- Generated with Higgsfield (`gpt_image_2_5`, medium quality, 1k) from the prompts in
  `prompts.json`, then resized to 1400 px on the long edge as JPEG quality 82.
- Every image is synthetic. They exist only to demonstrate the product; nothing here is a
  photograph of a real seller's item.

To regenerate or complete the set, run the prompts through the image model of your choice, save
each result as `<slug>/<shot>.jpg`, and reseed with `CLOVER_SEED_RESET=1 pnpm db:seed`.
