import type { Decisions, ModelSnapshot, ReviewPolicy } from "./model";

export type Workspace = {
  model: ModelSnapshot;
  baseline: ModelSnapshot | null;
  policy: ReviewPolicy;
  decisions: Decisions;
  decisionContext: string;
};
export type WorkspaceBackup = {
  format: "trace-workspace/1.0";
  exported_at: string;
  workspace: Workspace;
};

export const MAX_BACKUP_BYTES = 128 * 1024 * 1024;
export const MAX_RATES = 1000;
export const MAX_TEXT = 16_000;
const MAX_TRIANGLES = 750_000;
const quantityUnits = {
  volume: "m³",
  area: "m²",
  width: "m",
  height: "m",
  length: "m",
};

export const workspaceContext = (model: ModelSnapshot, policy: ReviewPolicy) =>
  `${model.model_hash}:${JSON.stringify(policy)}`;

function requireValue(
  condition: unknown,
  path: string,
  reason: string,
): asserts condition {
  if (!condition) throw new Error(`${path}: ${reason}.`);
}
function object(
  value: unknown,
  path: string,
  keys?: string[],
): Record<string, unknown> {
  requireValue(
    value !== null && typeof value === "object" && !Array.isArray(value),
    path,
    "expected an object",
  );
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) {
    requireValue(
      !["__proto__", "constructor", "prototype"].includes(key),
      path,
      "unsupported field",
    );
    if (keys) requireValue(keys.includes(key), path, "unsupported field");
  }
  return result;
}
function text(
  value: unknown,
  path: string,
  max = MAX_TEXT,
  allowEmpty = true,
): asserts value is string {
  requireValue(
    typeof value === "string" &&
      value.length <= max &&
      (allowEmpty || value.trim().length > 0),
    path,
    "invalid or oversized text",
  );
}
function finite(value: unknown, path: string): asserts value is number {
  requireValue(
    typeof value === "number" && Number.isFinite(value),
    path,
    "expected a finite number",
  );
}
function list(value: unknown, path: string, max: number): unknown[] {
  requireValue(
    Array.isArray(value) && value.length <= max,
    path,
    `expected at most ${max.toLocaleString("en-US")} items`,
  );
  return value;
}
function strings(value: unknown, path: string, max: number) {
  list(value, path, max).forEach((item) => text(item, path));
}
function timestamp(value: unknown, path: string) {
  text(value, path, 32, false);
  requireValue(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    path,
    "expected a UTC timestamp",
  );
}

/** Validate data before it reaches the evaluator, renderer or persistent store. */
export function validateModelSnapshot(
  value: unknown,
  path = "Model",
): ModelSnapshot {
  const model = object(value, path, [
    "version",
    "filename",
    "project_name",
    "schema_name",
    "model_hash",
    "source",
    "units",
    "elements",
    "warnings",
  ]);
  requireValue(model.version === "1.0", path, "unsupported snapshot version");
  for (const key of ["filename", "project_name", "schema_name"])
    text(model[key], `${path}.${key}`, MAX_TEXT, false);
  text(model.model_hash, `${path}.model_hash`, 64, false);
  requireValue(
    /^[a-f0-9]{64}$/.test(model.model_hash),
    path,
    "invalid source fingerprint",
  );
  requireValue(
    model.source === "ifc" || model.source === "demo",
    path,
    "unsupported source",
  );
  const units = object(model.units, `${path}.units`);
  requireValue(
    Object.keys(units).length <= 16,
    path,
    "too many unit definitions",
  );
  Object.entries(units).forEach(([key, unit]) => {
    text(key, path, 64);
    text(unit, path);
  });
  strings(model.warnings, `${path}.warnings`, 10_000);
  const elements = list(model.elements, `${path}.elements`, 5000);
  requireValue(elements.length > 0, path, "the model has no elements");
  const identities = new Set<string>();
  const expressIds = new Set<number>();
  let triangles = 0,
    coordinates = 0;
  elements.forEach((item, index) => {
    const at = `${path}.elements[${index}]`;
    const element = object(item, at, [
      "id",
      "express_id",
      "name",
      "type",
      "storey",
      "elevation",
      "materials",
      "quantities",
      "mesh",
      "geometry_hash",
      "warnings",
    ]);
    text(element.id, `${at}.id`, 256, false);
    requireValue(!identities.has(element.id), at, "duplicate element identity");
    identities.add(element.id);
    finite(element.express_id, at);
    requireValue(
      Number.isSafeInteger(element.express_id) &&
        element.express_id > 0 &&
        !expressIds.has(element.express_id),
      at,
      "invalid or duplicate STEP identity",
    );
    expressIds.add(element.express_id);
    for (const key of ["name", "type", "storey"])
      text(element[key], `${at}.${key}`);
    finite(element.elevation, at);
    requireValue(
      Math.abs(element.elevation) <= 1e12,
      at,
      "elevation exceeds the preview range",
    );
    strings(element.materials, `${at}.materials`, 1000);
    strings(element.warnings, `${at}.warnings`, 1000);
    if (element.geometry_hash !== null)
      text(element.geometry_hash, `${at}.geometry_hash`, 256, false);
    const quantities = object(
      element.quantities,
      `${at}.quantities`,
      Object.keys(quantityUnits),
    );
    for (const [key, unit] of Object.entries(quantityUnits)) {
      const raw = quantities[key];
      if (raw === null) continue;
      const q = object(raw, `${at}.${key}`, [
        "value",
        "unit",
        "source",
        "raw_value",
        "raw_unit",
        "factor",
        "basis",
      ]);
      for (const name of ["value", "raw_value", "factor"]) {
        finite(q[name], `${at}.${key}.${name}`);
        requireValue(
          (q[name] as number) > 0,
          at,
          "quantities and conversion factors must be positive",
        );
      }
      requireValue(
        q.unit === unit,
        `${at}.${key}`,
        "quantity unit does not match its dimension",
      );
      const converted = (q.raw_value as number) * (q.factor as number);
      requireValue(
        Number.isFinite(converted) &&
          Math.abs(converted - (q.value as number)) <=
            Math.max(Math.abs(converted), q.value as number) * 1e-9,
        `${at}.${key}`,
        "converted quantity disagrees with its source value",
      );
      requireValue(
        ["net", "gross", "declared"].includes(q.basis as string),
        at,
        "unsupported quantity basis",
      );
      text(q.source, at, MAX_TEXT, false);
      text(q.raw_unit, at, MAX_TEXT, false);
    }
    if (element.mesh === null) return;
    const mesh = object(element.mesh, `${at}.mesh`, ["vertices", "faces"]);
    const vertices = list(mesh.vertices, `${at}.vertices`, MAX_TRIANGLES * 9);
    const faces = list(mesh.faces, `${at}.faces`, MAX_TRIANGLES * 3);
    requireValue(
      vertices.length >= 9 &&
        vertices.length % 3 === 0 &&
        faces.length >= 3 &&
        faces.length % 3 === 0,
      at,
      "incomplete mesh triangles",
    );
    triangles += faces.length / 3;
    coordinates += vertices.length;
    requireValue(
      triangles <= MAX_TRIANGLES && coordinates <= MAX_TRIANGLES * 9,
      path,
      "preview geometry exceeds the model budget",
    );
    vertices.forEach((coordinate) => {
      finite(coordinate, at);
      requireValue(
        Math.abs(coordinate) <= 1e12,
        at,
        "coordinate exceeds the preview range",
      );
    });
    faces.forEach((face) =>
      requireValue(
        typeof face === "number" &&
          Number.isInteger(face) &&
          face >= 0 &&
          face < vertices.length / 3,
        at,
        "mesh index is outside its vertices",
      ),
    );
  });
  return value as ModelSnapshot;
}

export function validateWorkspace(value: unknown): Workspace {
  const workspace = object(value, "Workspace", [
    "model",
    "baseline",
    "policy",
    "decisions",
    "decisionContext",
  ]);
  validateModelSnapshot(workspace.model);
  if (workspace.baseline !== null)
    validateModelSnapshot(workspace.baseline, "Baseline");
  const policy = object(workspace.policy, "Assumptions", [
    "minDoorWidth",
    "rates",
  ]);
  finite(policy.minDoorWidth, "Door width target");
  requireValue(
    policy.minDoorWidth >= 0.1 && policy.minDoorWidth <= 10,
    "Door width target",
    "expected 0.1–10 m",
  );
  const materials = new Set<string>();
  list(policy.rates, "Rates", MAX_RATES).forEach((value) => {
    const rate = object(value, "Rate", ["material", "value", "unit", "source"]);
    text(rate.material, "Rate material", MAX_TEXT, false);
    requireValue(
      rate.material === rate.material.trim() && !materials.has(rate.material),
      "Rate material",
      "duplicate or untrimmed material mapping",
    );
    materials.add(rate.material);
    text(rate.source, "Rate source", MAX_TEXT, false);
    finite(rate.value, "Rate value");
    requireValue(
      rate.value >= 0 &&
        rate.value <= 1e8 &&
        ["m²", "m³"].includes(rate.unit as string),
      "Rate",
      "unsupported amount or unit",
    );
  });
  const decisions = object(workspace.decisions, "Review notes");
  requireValue(
    Object.keys(decisions).length <= 40_000,
    "Review notes",
    "too many decisions",
  );
  for (const [id, value] of Object.entries(decisions)) {
    text(id, "Finding identity", 300, false);
    const decision = object(value, "Review note", ["status", "note", "at"]);
    requireValue(
      decision.status === "open" || decision.status === "acknowledged",
      "Review note",
      "unsupported status",
    );
    text(decision.note, "Review note", MAX_TEXT, decision.status === "open");
    timestamp(decision.at, "Review note date");
  }
  // Keep the original context, including stale notes. Never rebind it on restore.
  text(
    workspace.decisionContext,
    "Review context",
    MAX_RATES * (MAX_TEXT * 2 + 256),
  );
  return value as Workspace;
}

function checkSize(value: string) {
  requireValue(
    value.length <= MAX_BACKUP_BYTES &&
      new Blob([value]).size <= MAX_BACKUP_BYTES,
    "Backup",
    "file exceeds 128 MB; use a smaller discipline model",
  );
}
export function serializeWorkspace(workspace: Workspace): string {
  validateWorkspace(workspace);
  const result = JSON.stringify({
    format: "trace-workspace/1.0",
    exported_at: new Date().toISOString(),
    workspace,
  } satisfies WorkspaceBackup);
  checkSize(result);
  return result;
}
export function parseWorkspaceBackup(content: string): WorkspaceBackup {
  checkSize(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(
      "This file is not valid JSON. Choose a Trace workspace backup.",
    );
  }
  const backup = object(parsed, "Backup");
  requireValue(
    backup.format === "trace-workspace/1.0",
    "Backup",
    "choose a Trace workspace backup; evidence records and IFC files cannot be restored here",
  );
  object(backup, "Backup", ["format", "exported_at", "workspace"]);
  timestamp(backup.exported_at, "Backup date");
  validateWorkspace(backup.workspace);
  return backup as WorkspaceBackup;
}
