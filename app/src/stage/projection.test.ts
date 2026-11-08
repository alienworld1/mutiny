import { describe, expect, it } from "vitest";
import {
  cellToScreen,
  screenToCell,
  ORIGIN_X,
  ORIGIN_Y,
  TILE_HEIGHT,
} from "./projection";
describe("shared stage projection", () => {
  it("keeps all 49 cell centers selectable", () => {
    for (let cell = 0; cell < 49; cell++) {
      const p = cellToScreen(cell);
      expect(screenToCell(p.x, p.y)).toBe(cell);
    }
  });
  it("rejects the scenery outside the board", () => {
    expect(screenToCell(ORIGIN_X - 1, ORIGIN_Y)).toBeNull();
    expect(screenToCell(ORIGIN_X, ORIGIN_Y - 1)).toBeNull();
    expect(screenToCell(600, 100)).toBeNull();
    expect(screenToCell(100, ORIGIN_Y + 7 * TILE_HEIGHT)).toBeNull();
  });
});
