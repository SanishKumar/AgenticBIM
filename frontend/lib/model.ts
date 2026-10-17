export type Quantity = {
  value: number;
  unit: "m" | "m²" | "m³";
  source: string;
  raw_value: number;
  raw_unit: string;
  factor: number;
  basis: "net" | "gross" | "declared";
};
export type ModelElement = {
  id: string;
  express_id: number;
  name: string;
  type: string;
  storey: string;
  elevation: number;
  materials: string[];
  quantities: Record<string, Quantity | null>;
  mesh: { vertices: number[]; faces: number[] } | null;
  geometry_hash: string | null;
  warnings: string[];
};
export type ModelSnapshot = {
  version: "1.0";
  filename: string;
  project_name: string;
  schema_name: string;
  model_hash: string;
  source: "ifc" | "demo";
  units: Record<string, string>;
  elements: ModelElement[];
  warnings: string[];
};
export type Rate = {
  material: string;
  value: number;
  unit: "m³" | "m²";
  source: string;
};
export type ReviewPolicy = { minDoorWidth: number; rates: Rate[] };
export type Finding = {
  id: string;
  elementId: string;
  severity: "blocker" | "review";
  title: string;
  detail: string;
  rule: string;
  action: string;
};
export type ReviewDecision = {
  status: "open" | "acknowledged";
  note: string;
  at: string;
};
export type Decisions = Record<string, ReviewDecision>;

export const defaultPolicy: ReviewPolicy = {
  minDoorWidth: 0.9,
  rates: [
    {
      material: "Concrete C30/37",
      value: 185,
      unit: "m³",
      source: "Illustrative material allowance · replace with a supplier quote",
    },
    {
      material: "Glazing",
      value: 210,
      unit: "m²",
      source: "Illustrative material allowance · replace with a supplier quote",
    },
    {
      material: "Structural steel",
      value: 7800,
      unit: "m³",
      source: "Illustrative material allowance · replace with a supplier quote",
    },
    {
      material: "Timber",
      value: 620,
      unit: "m³",
      source: "Illustrative material allowance · replace with a supplier quote",
    },
  ],
};

export const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
export const number = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(
    value,
  );
export const shortType = (type: string) =>
  type.replace(/^Ifc/, "").replace("StandardCase", "");
export const evidenceNumber = (value: number) =>
  new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: 12,
    notation:
      value !== 0 && (Math.abs(value) < 1e-6 || Math.abs(value) >= 1e12)
        ? "scientific"
        : "standard",
  }).format(value);

/** Exact material mapping only. No fuzzy match or first-layer pricing. */
export function priceElement(element: ModelElement, rates: Rate[]) {
  if (element.materials.length !== 1) return null;
  const rate = rates.find((r) => r.material === element.materials[0]);
  if (!rate || !Number.isFinite(rate.value) || rate.value < 0) return null;
  const quantity = element.quantities[rate.unit === "m³" ? "volume" : "area"];
  if (
    !quantity ||
    quantity.unit !== rate.unit ||
    !Number.isFinite(quantity.value) ||
    quantity.value <= 0
  )
    return null;
  const minorUnits = Math.round(quantity.value * rate.value * 100);
  // Preserve exact minor-unit aggregation, even at the maximum model size.
  if (
    !Number.isSafeInteger(minorUnits) ||
    minorUnits > Number.MAX_SAFE_INTEGER / 5000
  )
    return null;
  // Round each line to currency minor units before aggregation.
  return {
    cost: minorUnits / 100,
    quantity,
    rate,
  };
}

export function evaluateModel(model: ModelSnapshot, policy: ReviewPolicy) {
  const findings: Finding[] = [];
  const lines = model.elements.map((element) => ({
    element,
    price: priceElement(element, policy.rates),
  }));
  for (const { element: el, price } of lines) {
    const add = (
      rule: string,
      severity: Finding["severity"],
      title: string,
      detail: string,
      action: string,
    ) =>
      findings.push({
        id: `${el.id}:${rule}`,
        elementId: el.id,
        rule,
        severity,
        title,
        detail,
        action,
      });
    if (!el.materials.length)
      add(
        "MAT-01",
        "blocker",
        "Material is not assigned",
        "This element cannot be linked to a material rate. Its cost is excluded, not zero.",
        "Assign a material in the authoring model and re-export.",
      );
    else if (el.materials.length > 1)
      add(
        "MAT-02",
        "blocker",
        "Composite needs a measured breakdown",
        "Several materials share this element. Pricing its entire volume as one material would overstate the takeoff.",
        "Provide layer quantities or a composite assembly rate outside this review.",
      );
    else if (!policy.rates.some((r) => r.material === el.materials[0]))
      add(
        "RATE-01",
        "blocker",
        "No rate for this material",
        `No exact rate mapping for ${el.materials[0]}. This element is excluded from the known subtotal.`,
        "Add a documented material rate in Assumptions.",
      );
    const rate = policy.rates.find(
      (r) => el.materials.length === 1 && r.material === el.materials[0],
    );
    const key = rate?.unit === "m²" ? "area" : "volume";
    if (rate && el.quantities[key] && !price)
      add(
        "RATE-02",
        "blocker",
        "Allowance cannot be calculated safely",
        "The quantity or rate is invalid, or their product exceeds the supported monetary range. This line is excluded.",
        "Confirm the source units, quantity and rate before pricing this element.",
      );
    if (!el.quantities[key])
      add(
        "QTO-01",
        "blocker",
        `Declared ${key} is missing`,
        `No usable occurrence-level ${key} was found. Preview geometry is not used to invent a quantity.`,
        "Export base quantities from the source model, then review this element again.",
      );
    if (price?.quantity.basis === "gross")
      add(
        "QTO-02",
        "review",
        "Gross quantity used",
        "This line uses a declared gross quantity; openings or deductions may not be accounted for.",
        "Confirm the measurement basis before using this allowance.",
      );
    if (el.type === "IfcDoor") {
      const width = el.quantities.width;
      if (!width)
        add(
          "DOOR-01",
          "review",
          "Door width is unknown",
          "There is no declared width to compare with the project target.",
          "Confirm the door schedule and export the width.",
        );
      else if (width.value + 1e-6 < policy.minDoorWidth)
        add(
          "DOOR-01",
          "review",
          "Door below project width target",
          `${number(width.value)} m declared width against a ${number(policy.minDoorWidth)} m project target. Overall width is not clear opening width; this is not a code compliance verdict.`,
          "Check the door schedule and required clear opening with the design team.",
        );
    }
    if (el.warnings.length)
      add(
        "DATA-01",
        "review",
        "Source data needs attention",
        el.warnings.join(" "),
        "Inspect the source export. Missing preview geometry does not remove the element from the review.",
      );
  }
  const priced = lines.filter((line) => line.price !== null);
  return {
    findings,
    lines,
    total:
      Math.round(
        priced.reduce((sum, line) => sum + line.price!.cost, 0) * 100,
      ) / 100,
    pricedCount: priced.length,
    coverage: model.elements.length
      ? Math.round((priced.length / model.elements.length) * 100)
      : 0,
    excludedCount: model.elements.length - priced.length,
  };
}

export type RevisionChange = {
  id: string;
  kind: "added" | "removed" | "changed";
  before?: ModelElement;
  after?: ModelElement;
  fields: string[];
  costDelta: number | null;
};
export type GeometryComparison = "same" | "different" | "unavailable";
export function compareGeometry(
  a: ModelElement,
  b: ModelElement,
): GeometryComparison {
  const supported = /^mesh-v2-1um:[a-f0-9]{64}$/;
  if (
    !a.geometry_hash ||
    !b.geometry_hash ||
    !supported.test(a.geometry_hash) ||
    !supported.test(b.geometry_hash)
  )
    return "unavailable";
  return a.geometry_hash === b.geometry_hash ? "same" : "different";
}

export function revisionCoverage(before: ModelSnapshot, after: ModelSnapshot) {
  const old = new Map(before.elements.map((e) => [e.id, e]));
  let matched = 0,
    geometryCompared = 0;
  const unverified: { id: string; reason: string }[] = [];
  for (const element of after.elements) {
    const previous = old.get(element.id);
    if (!previous) continue;
    matched++;
    if (compareGeometry(previous, element) !== "unavailable")
      geometryCompared++;
    else
      unverified.push({
        id: element.id,
        reason:
          !previous.geometry_hash || !element.geometry_hash
            ? "Geometry is unavailable in one or both revisions."
            : "Geometry fingerprints use an older or incompatible method. Re-import both IFC files.",
      });
  }
  return { matched, geometryCompared, unverified };
}
const sameNumber = (a: number | undefined, b: number | undefined) =>
  a === b || (a !== undefined && b !== undefined && Math.abs(a - b) < 1e-6);
export function compareModels(
  before: ModelSnapshot,
  after: ModelSnapshot,
  rates: Rate[],
): RevisionChange[] {
  const old = new Map(before.elements.map((e) => [e.id, e]));
  const current = new Map(after.elements.map((e) => [e.id, e]));
  const changes: RevisionChange[] = [];
  for (const id of new Set([...old.keys(), ...current.keys()])) {
    const a = old.get(id),
      b = current.get(id);
    const pa = a ? priceElement(a, rates) : null,
      pb = b ? priceElement(b, rates) : null;
    const fields: string[] = [];
    if (a && b) {
      for (const key of ["name", "type", "storey"] as const)
        if (a[key] !== b[key]) fields.push(key);
      if (compareGeometry(a, b) === "different") fields.push("geometry");
      if (
        JSON.stringify([...a.materials].sort()) !==
        JSON.stringify([...b.materials].sort())
      )
        fields.push("material");
      for (const key of new Set([
        ...Object.keys(a.quantities),
        ...Object.keys(b.quantities),
      ])) {
        if (
          !sameNumber(a.quantities[key]?.value, b.quantities[key]?.value) ||
          a.quantities[key]?.unit !== b.quantities[key]?.unit ||
          a.quantities[key]?.basis !== b.quantities[key]?.basis
        )
          fields.push(key);
      }
      // Even a sub-tolerance quantity difference may matter at a high unit rate.
      if (pa && pb && pa.cost !== pb.cost) {
        const key = pb.rate.unit === "m³" ? "volume" : "area";
        if (!fields.includes(key)) fields.push(key);
      }
      if (!fields.length) continue;
    }
    // A missing price is unknown, never silently treated as zero in a delta.
    const costDelta =
      (a && !pa) || (b && !pb)
        ? null
        : Math.round(((pb?.cost ?? 0) - (pa?.cost ?? 0)) * 100) / 100;
    changes.push({
      id,
      kind: !a ? "added" : !b ? "removed" : "changed",
      before: a,
      after: b,
      fields,
      costDelta,
    });
  }
  return changes;
}

export function csvCell(value: unknown) {
  const text = String(value ?? "");
  // Neutralize spreadsheet formulas in untrusted model names and notes.
  return `"${(/^\s*[=+@-]|^[\t\r]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`;
}
