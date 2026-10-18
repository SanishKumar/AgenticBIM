import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  compareModels,
  defaultPolicy,
  evaluateModel,
  type ModelSnapshot,
} from "../lib/model";
import {
  parseWorkspaceBackup,
  serializeWorkspace,
  validateModelSnapshot,
  validateWorkspace,
  workspaceContext,
  type Workspace,
} from "../lib/workspace-backup";

function workspace(): Workspace {
  const model: ModelSnapshot = JSON.parse(
    readFileSync(
      new URL("../public/demo/northbank-r02.json", import.meta.url),
      "utf8",
    ),
  );
  const baseline: ModelSnapshot = JSON.parse(
    readFileSync(
      new URL("../public/demo/northbank-r01.json", import.meta.url),
      "utf8",
    ),
  );
  const policy = structuredClone(defaultPolicy);
  const finding = evaluateModel(model, policy).findings[0];
  return {
    model,
    baseline,
    policy,
    decisions: {
      [finding.id]: {
        status: "acknowledged",
        note: "Request corrected quantity export from the coordinator.",
        at: "2026-10-18T08:00:00.000Z",
      },
    },
    decisionContext: workspaceContext(model, policy),
  };
}

test("backup round trip retains geometry, baseline, assumptions, notes and exact results", () => {
  const original = workspace();
  const restored = parseWorkspaceBackup(serializeWorkspace(original)).workspace;
  assert.deepEqual(restored, original);
  assert.deepEqual(
    evaluateModel(restored.model, restored.policy),
    evaluateModel(original.model, original.policy),
  );
  assert.deepEqual(
    compareModels(restored.baseline!, restored.model, restored.policy.rates),
    compareModels(original.baseline!, original.model, original.policy.rates),
  );
});

test("stale review notes survive without becoming active under changed assumptions", () => {
  const original = workspace();
  original.policy.rates[0].value += 1;
  const restored = parseWorkspaceBackup(serializeWorkspace(original)).workspace;
  assert.deepEqual(restored.decisions, original.decisions);
  assert.equal(restored.decisionContext, original.decisionContext);
  assert.notEqual(
    restored.decisionContext,
    workspaceContext(restored.model, restored.policy),
  );
});

test("backups without baseline and with missing source data preserve the gaps", () => {
  const original = workspace();
  original.baseline = null;
  original.model.elements[0].mesh = null;
  original.model.elements[0].geometry_hash = null;
  original.model.elements[0].quantities.volume = null;
  const restored = parseWorkspaceBackup(serializeWorkspace(original)).workspace;
  assert.equal(restored.baseline, null);
  assert.equal(restored.model.elements[0].mesh, null);
  assert.equal(
    evaluateModel(restored.model, restored.policy).lines[0].price,
    null,
  );
});

test("restore rejects malformed JSON, evidence exports and unsupported versions", () => {
  assert.throws(() => parseWorkspaceBackup("{"), /not valid JSON/);
  assert.throws(
    () => parseWorkspaceBackup('{"format":"trace-review/1.0"}'),
    /workspace backup/,
  );
  const data = JSON.parse(serializeWorkspace(workspace()));
  data.format = "trace-workspace/2.0";
  assert.throws(
    () => parseWorkspaceBackup(JSON.stringify(data)),
    /workspace backup/,
  );
  data.format = "trace-workspace/1.0";
  data.exported_at = "2026-02-30T08:00:00.000Z";
  assert.throws(() => parseWorkspaceBackup(JSON.stringify(data)), /timestamp/);
});

test("restore rejects truncated models, duplicate identities and oversized element counts", () => {
  for (const mutate of [
    (data: Workspace) => {
      data.model.elements[1].id = data.model.elements[0].id;
    },
    (data: Workspace) => {
      data.model.elements[1].express_id = data.model.elements[0].express_id;
    },
    (data: Workspace) => {
      data.model.elements = Array(5001).fill(data.model.elements[0]);
    },
    (data: Workspace) => {
      data.model.elements = [];
    },
    (data: Workspace) => {
      delete (
        data.model.elements[0] as Partial<ModelSnapshot["elements"][number]>
      ).quantities;
    },
  ]) {
    const data = workspace();
    mutate(data);
    assert.throws(() => validateWorkspace(data));
  }
});

test("mesh validation bounds index values, coordinates and total geometry", () => {
  for (const mutate of [
    (data: Workspace) => {
      data.model.elements[0].mesh!.faces[0] = -1;
    },
    (data: Workspace) => {
      data.model.elements[0].mesh!.faces[0] = 0.5;
    },
    (data: Workspace) => {
      data.model.elements[0].mesh!.faces[0] = 1e9;
    },
    (data: Workspace) => {
      data.model.elements[0].mesh!.vertices[0] = Infinity;
    },
    (data: Workspace) => {
      data.model.elements[0].mesh!.vertices[0] = 1e30;
    },
    (data: Workspace) => {
      data.model.elements[0].mesh!.vertices.pop();
    },
    (data: Workspace) => {
      data.model.elements[0].mesh!.faces = Array(750_000 * 3).fill(0);
    },
  ]) {
    const data = workspace();
    mutate(data);
    assert.throws(() => validateWorkspace(data));
  }
});

test("quantity validation enforces dimensions and source conversion consistency", () => {
  for (const mutate of [
    (data: Workspace) => {
      data.model.elements[0].quantities.volume!.unit = "m²";
    },
    (data: Workspace) => {
      data.model.elements[0].quantities.volume!.value *= 2;
    },
    (data: Workspace) => {
      data.model.elements[0].quantities.volume!.factor = 0;
    },
    (data: Workspace) => {
      data.model.elements[0].quantities.volume!.raw_value = NaN;
    },
  ]) {
    const data = workspace();
    mutate(data);
    assert.throws(() => validateWorkspace(data));
  }
});

test("invalid rates, empty acknowledgements and unsupported fields are rejected", () => {
  for (const mutate of [
    (data: Workspace) => {
      data.policy.rates.push(data.policy.rates[0]);
    },
    (data: Workspace) => {
      data.policy.rates[0].value = -1;
    },
    (data: Workspace) => {
      data.policy.minDoorWidth = NaN;
    },
    (data: Workspace) => {
      Object.values(data.decisions)[0].note = " ";
    },
    (data: Workspace) => {
      Object.values(data.decisions)[0].at = "yesterday";
    },
    (data: Workspace) => {
      data.model.units = JSON.parse('{"__proto__":{"polluted":true}}');
    },
    (data: Workspace) => {
      Object.assign(data.model, { unexpected: {} });
    },
  ]) {
    const data = workspace();
    mutate(data);
    assert.throws(() => validateWorkspace(data));
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("valid survey coordinates and older fingerprints stay usable but unverified", () => {
  const data = workspace();
  data.model.elements[0].mesh!.vertices =
    data.model.elements[0].mesh!.vertices.map((value) => value + 5_000_000);
  data.model.elements[0].geometry_hash = "legacy-fingerprint";
  assert.equal(validateModelSnapshot(data.model), data.model);
});
