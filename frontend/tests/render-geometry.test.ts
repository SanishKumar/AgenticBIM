import assert from "node:assert/strict";
import test from "node:test";
import { modelFrame, viewerPositions } from "../lib/render-geometry";
import type { ModelElement } from "../lib/model";

function element(vertices: number[]): ModelElement {
  return {
    id: "test",
    express_id: 1,
    name: "Surveyed element",
    type: "IfcWall",
    storey: "L1",
    elevation: 0,
    materials: [],
    quantities: {},
    mesh: { vertices, faces: [0, 1, 2] },
    geometry_hash: null,
    warnings: [],
  };
}

test("centimetre details survive GPU conversion at large survey coordinates", () => {
  const source = [
    617000, 5721000, 100, 617000.01, 5721000.01, 100.01, 617001, 5721001, 101,
  ];
  const { origin, size } = modelFrame([element(source)]);
  assert.deepEqual(origin, [617000.5, 5721000.5, 100]);
  assert.deepEqual(size, [1, 1, 1]);
  const positions = viewerPositions(source, origin);
  assert.ok(Math.abs(positions[3] - positions[0] - 0.01) < 1e-6);
  assert.ok(Math.abs(positions[5] - positions[2] + 0.01) < 1e-6);
  assert.ok(Math.abs(positions[4] - positions[1] - 0.01) < 1e-6);
  assert.equal(source[0], 617000); // Source evidence is never modified.
});

test("revision meshes share one origin, preserving their displacement", () => {
  const before = element([1000, 2000, 0, 1001, 2000, 0, 1000, 2001, 1]);
  const after = element([1000.2, 2000, 0, 1001.2, 2000, 0, 1000.2, 2001, 1]);
  const frame = modelFrame([before, after]);
  const a = viewerPositions(before.mesh!.vertices, frame.origin);
  const b = viewerPositions(after.mesh!.vertices, frame.origin);
  assert.ok(Math.abs(b[0] - a[0] - 0.2) < 1e-6);
  assert.deepEqual(modelFrame([after, before]), frame);
});
