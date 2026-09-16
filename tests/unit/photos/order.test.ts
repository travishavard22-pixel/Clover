import { describe, expect, it } from "vitest";
import { ancestorsOf, descendantsOf, moveBy, nextSortOrder, planReorder, rootOf, supersededIds, visiblePhotos, type OrderablePhoto } from "@/lib/photos/order";

const p = (id: string, sortOrder: number, kind: OrderablePhoto["kind"] = "ORIGINAL", sourcePhotoId: string | null = null): OrderablePhoto => ({ id, sortOrder, kind, sourcePhotoId });

describe("visibility", () => {
  it("hides the source of an edit but not the source of a studio render", () => {
    const photos = [p("a", 1000), p("a2", 0, "ENHANCED", "a"), p("b", 1), p("s", 2, "STUDIO", "b")];
    expect([...supersededIds(photos)]).toEqual(["a"]);
    expect(visiblePhotos(photos).map((x) => x.id)).toEqual(["a2", "b", "s"]);
  });

  it("hides every link of an edit chain", () => {
    const photos = [p("a", 1000), p("a2", 1000, "ENHANCED", "a"), p("a3", 0, "ENHANCED", "a2")];
    expect(visiblePhotos(photos).map((x) => x.id)).toEqual(["a3"]);
    expect(rootOf(photos[2]!, photos).id).toBe("a");
    expect(ancestorsOf(photos[2]!, photos).map((x) => x.id)).toEqual(["a2", "a"]);
    expect(descendantsOf(photos[0]!, photos).map((x) => x.id)).toEqual(["a2", "a3"]);
  });

  it("does not hide a photo whose derived edit is missing from the list", () => {
    const photos = [p("a", 0, "ORIGINAL"), p("x", 1, "ENHANCED", "missing")];
    expect(visiblePhotos(photos).map((x) => x.id)).toEqual(["a", "x"]);
  });

  it("next sort order is one past the last visible photo", () => {
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder([p("a", 0), p("b", 1)])).toBe(2);
    expect(nextSortOrder([p("a", 1000), p("a2", 0, "ENHANCED", "a")])).toBe(1);
  });
});

describe("planReorder", () => {
  const photos = [p("a", 0), p("b", 1), p("c", 2), p("hidden", 1000), p("h2", 3, "ENHANCED", "hidden")];

  it("accepts a permutation of the visible ids", () => {
    const r = planReorder(photos, ["c", "h2", "a", "b"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.updates).toEqual([{ id: "c", sortOrder: 0 }, { id: "h2", sortOrder: 1 }, { id: "a", sortOrder: 2 }, { id: "b", sortOrder: 3 }]);
  });

  it("rejects missing, duplicate and foreign ids", () => {
    expect(planReorder(photos, ["a", "b", "c"]).ok).toBe(false);
    expect(planReorder(photos, ["a", "a", "b", "c"]).ok).toBe(false);
    expect(planReorder(photos, ["a", "b", "c", "zzz"]).ok).toBe(false);
    expect(planReorder(photos, ["a", "b", "c", "hidden"]).ok).toBe(false);
  });
});

describe("moveBy", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("moves within bounds and clamps at the edges", () => {
    expect(moveBy(list, "a", 1).map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(moveBy(list, "c", -2).map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(moveBy(list, "a", -1).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(moveBy(list, "c", 5).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(moveBy(list, "nope", 1).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
