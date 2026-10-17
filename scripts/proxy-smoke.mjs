// Exercise Next's rewrite separately from the container gateway.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = process.argv[2] || "http://127.0.0.1:3000";
const fixture = process.argv[3] || "frontend/public/demo/northbank-r02.ifc";
const source = await readFile(fixture);
const file = new Blob([source, " ".repeat(11 * 1024 ** 2)]);
const body = new FormData();
body.append("file", file, "northbank.ifc");
const response = await fetch(`${base}/api/ifc`, {
  method: "POST",
  body,
  signal: AbortSignal.timeout(90_000),
});
const result = await response.json();
assert.equal(response.status, 200, JSON.stringify(result));
assert.equal(result.source, "ifc");
assert.equal(result.elements.length, 135);
assert.ok(result.elements.every((element) => element.mesh));
assert.equal(result.elements.filter((element) => !element.quantities.volume).length, 1);
console.log(`Next.js proxy passed: ${file.size} bytes, 135 source meshes, one undeclared volume.`);
