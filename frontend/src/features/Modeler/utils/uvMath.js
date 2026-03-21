export const FACES = ['north', 'south', 'east', 'west', 'up', 'down'];

/**
 * Standard Minecraft CEM cross-pattern UV calculation.
 */
export function textureOffsetRects(u, v, w, h, d) {
  return {
    up: [u + d, v, u + d + w, v + d],
    down: [u + d + w, v, u + 2 * d + w, v + d],
    west: [u, v + d, u + d, v + d + h],
    south: [u + d, v + d, u + d + w, v + d + h],
    east: [u + d + w, v + d, u + 2 * d + w, v + d + h],
    north: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
  };
}

/**
 * Returns rects for all 6 faces regardless of whether the box uses offset or per-face UVs.
 */
export function getFaceRects(box) {
  if (!box) return {};
  if (box.textureOffset) {
    const [u, v] = box.textureOffset;
    const [, , , w, h, d] = box.coordinates;
    return textureOffsetRects(u, v, w, h, d);
  }
  return {
    north: box.uvNorth, south: box.uvSouth, east: box.uvEast,
    west: box.uvWest, up: box.uvUp, down: box.uvDown
  };
}
