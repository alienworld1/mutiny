import { describe, expect, it } from "vitest";
import { cellToScreen, screenToCell } from "./projection";
describe("shared stage projection", () => {
  it("keeps all 49 cell centers selectable", () => {
    for (let cell = 0; cell < 49; cell++) {
      const p = cellToScreen(cell);
      expect(screenToCell(p.x, p.y)).toBe(cell);
    }
  });
  it("rejects the scenery outside the board", () => {
    expect(screenToCell(39, 64)).toBeNull();
    expect(screenToCell(40, 63)).toBeNull();
    expect(screenToCell(600, 100)).toBeNull();
    expect(screenToCell(100, 512)).toBeNull();
  });
});
