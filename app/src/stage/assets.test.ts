import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { characterSlots } from "./assets";
import manifest from "../../public/assets/art/manifest.json";
import { HEIGHT, ORIGIN_Y, TILE_HEIGHT, WIDTH } from "./projection";

function dimensions(file: string) {
  const data = readFileSync(
    new URL(`../../public/assets/art/${file}.webp`, import.meta.url),
  );
  const kind = data.toString("ascii", 12, 16);
  if (kind === "VP8X")
    return [1 + data.readUIntLE(24, 3), 1 + data.readUIntLE(27, 3)];
  if (kind === "VP8 ")
    return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
  throw new Error(`Unsupported WebP header in ${file}`);
}

it("keeps every identity and complete pose inside its shipped atlas", () => {
  const sources = {
    idle: "characters",
    portraits: "portraits",
    walk: "character-poses",
    action: "character-poses",
    refuse: "character-poses",
    hit: "responses",
    defeated: "responses",
    props: "props",
  };
  expect(manifest.identityOrder).toHaveLength(8);
  manifest.identityOrder.forEach((name, i) =>
    expect(characterSlots[name]).toBe(i),
  );
  for (const [kind, file] of Object.entries(sources)) {
    const [width, height] = dimensions(file);
    const frames = manifest.frames[kind as keyof typeof manifest.frames];
    expect(frames).toHaveLength(8);
    for (const {
      rect: [x, y, w, h],
      pivot,
    } of frames) {
      expect(x! + w!).toBeLessThanOrEqual(width!);
      expect(y! + h!).toBeLessThanOrEqual(height!);
      expect(pivot[0]).toBe(0.5);
      expect(pivot[1]).toBeGreaterThan(0);
      expect(pivot[1]).toBeLessThan(1);
    }
  }
});

it("fits all three scene layers exactly around the same seven board rows", () => {
  const { backdrop, ground, foreground } = manifest.sceneLayers;
  expect(backdrop).toEqual([0, 0, WIDTH, ORIGIN_Y]);
  expect(ground).toEqual([0, ORIGIN_Y, WIDTH, 7 * TILE_HEIGHT]);
  expect(foreground[1]! + foreground[3]!).toBe(HEIGHT);
  expect(foreground[1]).toBe(ORIGIN_Y + 7 * TILE_HEIGHT);
  for (const place of ["dock", "bridge", "town"])
    expect(dimensions(place)).toEqual([1280, 1280]);
});
