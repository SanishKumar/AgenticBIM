import type { ModelElement } from "./model";

type Point = [number, number, number];
/** Shared IFC-space origin for every mesh, computed before Float32 conversion. */
export function modelFrame(elements: ModelElement[]) {
  const min: Point = [Infinity, Infinity, Infinity];
  const max: Point = [-Infinity, -Infinity, -Infinity];
  for (const element of elements) {
    const vertices = element.mesh?.vertices ?? [];
    for (let i = 0; i < vertices.length; i += 3) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], vertices[i + axis]);
        max[axis] = Math.max(max[axis], vertices[i + axis]);
      }
    }
  }
  if (!min.every(Number.isFinite) || !max.every(Number.isFinite))
    return { origin: [0, 0, 0] as Point, size: [10, 10, 10] as Point };
  return {
    origin: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]] as Point,
    // Viewer coordinates are X, Z, -Y (IFC is Z-up).
    size: [max[0] - min[0], max[2] - min[2], max[1] - min[1]] as Point,
  };
}

export function viewerPositions(vertices: number[], origin: Point) {
  const result = new Float32Array(vertices.length);
  for (let i = 0; i < vertices.length; i += 3) {
    result[i] = vertices[i] - origin[0];
    result[i + 1] = vertices[i + 2] - origin[2];
    result[i + 2] = -(vertices[i + 1] - origin[1]);
  }
  return result;
}
