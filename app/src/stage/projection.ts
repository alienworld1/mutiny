export const WIDTH = 640,
  HEIGHT = 680;
export const TILE_WIDTH = 80,
  TILE_HEIGHT = 64;
export const ORIGIN_X = 40,
  ORIGIN_Y = 162;
export const cellToScreen = (cell: number) => ({
  x: ORIGIN_X + ((cell % 7) + 0.5) * TILE_WIDTH,
  y: ORIGIN_Y + (Math.floor(cell / 7) + 0.5) * TILE_HEIGHT,
});
export function screenToCell(x: number, y: number): number | null {
  const col = Math.floor((x - ORIGIN_X) / TILE_WIDTH),
    row = Math.floor((y - ORIGIN_Y) / TILE_HEIGHT);
  return col >= 0 && col < 7 && row >= 0 && row < 7 ? row * 7 + col : null;
}
