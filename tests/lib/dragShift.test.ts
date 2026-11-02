import { describe, expect, it } from "vitest";
import { computeShifts, hitRow, translateYOf, type RowGeom } from "@/features/workspace/lib/dragShift";

/** Flat rows of height h with `gap` px between them */
function flat(keys: string[], h = 30, gap = 0): RowGeom[] {
  return keys.map((key, i) => {
    const top = i * (h + gap);
    return { key, rowTop: top, rowBottom: top + h, blockTop: top, blockBottom: top + h, parentKey: null };
  });
}

const obj = (m: Map<string, number>) => Object.fromEntries(m);

describe("computeShifts", () => {
  const rows = flat(["a", "b", "c", "d"]);

  it("moving down slides the rows in between up and drops the source into the gap", () => {
    expect(obj(computeShifts(rows, "a", { key: "c", place: "after" }))).toEqual({ a: 60, b: -30, c: -30, d: 0 });
    expect(obj(computeShifts(rows, "a", { key: "c", place: "before" }))).toEqual({ a: 30, b: -30, c: 0, d: 0 });
    // After the last row
    expect(obj(computeShifts(rows, "a", { key: "d", place: "after" }))).toEqual({ a: 90, b: -30, c: -30, d: -30 });
  });

  it("moving up slides the rows in between down", () => {
    expect(obj(computeShifts(rows, "d", { key: "b", place: "before" }))).toEqual({ a: 0, b: 30, c: 30, d: -60 });
    expect(obj(computeShifts(rows, "d", { key: "a", place: "after" }))).toEqual({ a: 0, b: 30, c: 30, d: -60 });
  });

  it("returns all zeros for a null gap, the source itself, or a no-op neighbour", () => {
    const zero = { a: 0, b: 0, c: 0, d: 0 };
    expect(obj(computeShifts(rows, "b", null))).toEqual(zero);
    expect(obj(computeShifts(rows, "b", { key: "b", place: "after" }))).toEqual(zero);
    expect(obj(computeShifts(rows, "b", { key: "a", place: "after" }))).toEqual(zero);
    expect(obj(computeShifts(rows, "b", { key: "c", place: "before" }))).toEqual(zero);
  });

  it("includes the spacing to the next row in the shift", () => {
    const spaced = flat(["a", "b", "c"], 30, 2);
    // a: 0-30, b: 32-62, c: 64-94
    expect(obj(computeShifts(spaced, "a", { key: "c", place: "after" }))).toEqual({ a: 64, b: -32, c: -32 });
    expect(obj(computeShifts(spaced, "c", { key: "a", place: "before" }))).toEqual({ a: 32, b: 32, c: -64 });
  });

  // Folder f (row 30-60) with children f1, f2 (60-120); its block spans 30-120
  const tree: RowGeom[] = [
    { key: "a", rowTop: 0, rowBottom: 30, blockTop: 0, blockBottom: 30, parentKey: null },
    { key: "f", rowTop: 30, rowBottom: 60, blockTop: 30, blockBottom: 120, parentKey: null },
    { key: "f1", rowTop: 60, rowBottom: 90, blockTop: 60, blockBottom: 90, parentKey: "f" },
    { key: "f2", rowTop: 90, rowBottom: 120, blockTop: 90, blockBottom: 120, parentKey: "f" },
    { key: "z", rowTop: 120, rowBottom: 150, blockTop: 120, blockBottom: 150, parentKey: null },
  ];

  it("a gap inside the source block (its own children) is a no-op", () => {
    const s = obj(computeShifts(tree, "f", { key: "f1", place: "after" }));
    expect(Object.values(s).every((v) => v === 0)).toBe(true);
  });

  it("dragging a folder moves its whole block; children stay relative to it", () => {
    // f (90px block) after z: z slides up 90, f moves down by z's height
    expect(obj(computeShifts(tree, "f", { key: "z", place: "after" }))).toEqual({ a: 0, f: 30, f1: 0, f2: 0, z: -90 });
  });

  it("after a folder means after its whole subtree", () => {
    expect(obj(computeShifts(tree, "a", { key: "f", place: "after" }))).toEqual({ a: 90, f: -30, f1: 0, f2: 0, z: 0 });
  });

  it("outputs nested shifts relative to the parent block", () => {
    // a dropped before f2: f's block slides up 30 (carrying f1 and f2); f2 must stay put, so it gets +30 relative
    expect(obj(computeShifts(tree, "a", { key: "f2", place: "before" }))).toEqual({ a: 60, f: -30, f1: 0, f2: 30, z: 0 });
    // f2 dragged above the folder: f's block slides down 30, f2's absolute -90 becomes -120 relative to f
    expect(obj(computeShifts(tree, "f2", { key: "f", place: "before" }))).toEqual({ a: 0, f: 30, f1: 0, f2: -90, z: 0 });
  });

  it("with the source outside the list, rows from the gap down make room", () => {
    expect(obj(computeShifts(rows, null, { key: "c", place: "before" }))).toEqual({ a: 0, b: 0, c: 30, d: 30 });
  });
});

describe("hitRow / translateYOf", () => {
  it("hits by original rect and tolerates thin gaps", () => {
    const rows = flat(["a", "b"], 30, 2);
    expect(hitRow(rows, 10)?.key).toBe("a");
    expect(hitRow(rows, 30.5)?.key).toBe("a");
    expect(hitRow(rows, 31.5)?.key).toBe("b");
    expect(hitRow(rows, 40)?.key).toBe("b");
    expect(hitRow(rows, 200)).toBeNull();
  });

  it("reads ty from computed transforms", () => {
    expect(translateYOf("none")).toBe(0);
    expect(translateYOf("matrix(1, 0, 0, 1, 0, -12.5)")).toBe(-12.5);
    expect(translateYOf("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 7, 0, 1)")).toBe(7);
  });
});
