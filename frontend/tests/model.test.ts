import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  compareModels,
  csvCell,
  defaultPolicy,
  evaluateModel,
  priceElement,
  compareGeometry,
  revisionCoverage,
  evidenceNumber,
  type ModelSnapshot,
} from "../lib/model";

const fixture = (revision: number): ModelSnapshot =>
  JSON.parse(
    readFileSync(
      new URL(`../public/demo/northbank-r0${revision}.json`, import.meta.url),
      "utf8",
    ),
  );

test("all sample elements are evaluated, missing quantities are excluded rather than zeroed", () => {
  const model = fixture(2),
    result = evaluateModel(model, defaultPolicy);
  assert.equal(result.lines.length, 135);
  assert.equal(result.excludedCount, 2);
  assert.equal(result.findings.length, 3);
  assert.deepEqual(result.findings.map((f) => f.rule).sort(), [
    "DOOR-01",
    "MAT-01",
    "QTO-01",
  ]);
  assert.ok(
    result.lines.filter((l) => !l.price).every((l) => l.price === null),
  );
  assert.equal(model.elements.filter((e) => e.mesh !== null).length, 135);
});

test("rates require an exact single-material mapping and a finite positive quantity", () => {
  const element = structuredClone(fixture(2).elements[0]);
  assert.ok(priceElement(element, defaultPolicy.rates));
  element.materials = ["Concrete C30/37", "Timber"];
  assert.equal(priceElement(element, defaultPolicy.rates), null);
  element.materials = ["concrete c30/37"];
  assert.equal(priceElement(element, defaultPolicy.rates), null);
  element.materials = ["Concrete C30/37"];
  element.quantities.volume!.value = Number.NaN;
  assert.equal(priceElement(element, defaultPolicy.rates), null);
});

test("door threshold handles equality and numerical noise without passing a real shortfall", () => {
  const model = fixture(2);
  const door = model.elements.find((e) => e.type === "IfcDoor")!;
  model.elements = [door];
  for (const value of [0.9, 0.8999999]) {
    door.quantities.width!.value = value;
    assert.ok(
      !evaluateModel(model, defaultPolicy).findings.some(
        (f) => f.rule === "DOOR-01",
      ),
    );
  }
  door.quantities.width!.value = 0.89;
  assert.ok(
    evaluateModel(model, defaultPolicy).findings.some(
      (f) => f.rule === "DOOR-01",
    ),
  );
});

test("revision comparison matches stable identities and detects added, removed and changed elements", () => {
  const changes = compareModels(fixture(1), fixture(2), defaultPolicy.rates);
  assert.deepEqual(changes.map((c) => c.kind).sort(), [
    "added",
    "changed",
    "changed",
    "removed",
  ]);
  assert.ok(
    changes.some(
      (c) => c.fields.includes("volume") && c.fields.includes("geometry"),
    ),
  );
  assert.deepEqual(
    compareModels(fixture(2), fixture(2), defaultPolicy.rates),
    [],
  );
});

test("unknown revision prices cannot become a zero-dollar delta", () => {
  const before = fixture(1),
    after = fixture(1);
  after.elements[0].quantities.volume = null;
  const changes = compareModels(before, after, defaultPolicy.rates);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].costDelta, null);
});

test("changing the rate card reprices both revisions on the same basis", () => {
  const before = fixture(1),
    after = fixture(2);
  const doubled = defaultPolicy.rates.map((r) => ({
    ...r,
    value: r.value * 2,
  }));
  const base = compareModels(before, after, defaultPolicy.rates).reduce(
    (sum, c) => sum + (c.costDelta ?? 0),
    0,
  );
  const next = compareModels(before, after, doubled).reduce(
    (sum, c) => sum + (c.costDelta ?? 0),
    0,
  );
  assert.ok(Math.abs(next - base * 2) < 0.05); // line rounding in minor currency units
});

test("CSV quotes fields and neutralizes spreadsheet formula injection", () => {
  assert.equal(csvCell('Wall, "North"'), '"Wall, ""North"""');
  assert.equal(csvCell("=HYPERLINK(1)"), '"\'=HYPERLINK(1)"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell("  =1+1"), '"\'  =1+1"');
});

test("a hand-calculated allowance rounds in cents and never prices an overflow", () => {
  const element = structuredClone(fixture(2).elements[0]);
  element.quantities.volume!.value = 2.25;
  const rates = [
    {
      material: element.materials[0],
      value: 180,
      unit: "m³" as const,
      source: "Test quote",
    },
  ];
  assert.equal(priceElement(element, rates)?.cost, 405);
  element.quantities.volume!.value = 1e300;
  assert.equal(priceElement(element, rates), null);
});

test("missing and incompatible geometry never count as equal or a measured change", () => {
  const before = fixture(1),
    after = fixture(1);
  before.elements = before.elements.slice(0, 2);
  after.elements = after.elements.slice(0, 2);
  before.elements[0].geometry_hash = null;
  after.elements[0].geometry_hash = null;
  before.elements[1].geometry_hash = "legacy-hash";
  assert.equal(
    compareGeometry(before.elements[0], after.elements[0]),
    "unavailable",
  );
  assert.equal(
    compareGeometry(before.elements[1], after.elements[1]),
    "unavailable",
  );
  assert.equal(compareModels(before, after, defaultPolicy.rates).length, 0);
  const coverage = revisionCoverage(before, after);
  assert.equal(coverage.matched, 2);
  assert.equal(coverage.geometryCompared, 0);
  assert.equal(coverage.unverified.length, 2);
  after.elements[0].quantities.volume!.value += 1;
  const changes = compareModels(before, after, defaultPolicy.rates);
  assert.deepEqual(changes[0].fields, ["volume"]);
});

test("revision comparison reports quantity units and basis even if numbers match", () => {
  const before = fixture(1),
    after = fixture(1);
  after.elements[0].quantities.volume!.basis = "gross";
  after.elements[0].quantities.area!.unit = "m³";
  const changes = compareModels(before, after, defaultPolicy.rates);
  assert.deepEqual(changes[0].fields.sort(), ["area", "volume"]);
});

test("small quantities remain visible and financially meaningful changes are retained", () => {
  assert.equal(evidenceNumber(1e-12), "1E-12");
  assert.equal(evidenceNumber(0.00004), "0.00004");
  const before = fixture(1),
    after = fixture(1);
  before.elements = before.elements.slice(0, 1);
  after.elements = after.elements.slice(0, 1);
  after.elements[0].quantities.volume!.value += 1e-7;
  const rates = [{ ...defaultPolicy.rates[0], value: 100_000_000 }];
  const changes = compareModels(before, after, rates);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].costDelta, 10);
  assert.deepEqual(changes[0].fields, ["volume"]);
  after.elements[0].quantities.volume!.unit = "m²";
  assert.equal(priceElement(after.elements[0], rates), null);
});
