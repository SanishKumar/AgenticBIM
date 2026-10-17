"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, ArrowUpRight, Box, Focus, Layers2 } from "lucide-react";
import {
  compareGeometry,
  evidenceNumber,
  priceElement,
  type ModelElement,
  type Quantity,
  type Rate,
  type RevisionChange,
} from "@/lib/model";

const ModelViewer = dynamic(() => import("./model-viewer"), { ssr: false });
const emptyIds: string[] = [];
const noSelection = () => {};
const currency = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
export type RevisionEntry = Omit<RevisionChange, "kind"> & {
  kind: RevisionChange["kind"] | "unverified";
};

function QuantityCell({ quantity }: { quantity: Quantity | null | undefined }) {
  if (!quantity) return <span className="evidence-unknown">Not declared</span>;
  return (
    <>
      <strong>
        {evidenceNumber(quantity.value)} {quantity.unit}
      </strong>
      <small>{quantity.basis} quantity</small>
      <code>{quantity.source}</code>
      <small>
        {evidenceNumber(quantity.raw_value)} {quantity.raw_unit} ×{" "}
        {evidenceNumber(quantity.factor)}
      </small>
    </>
  );
}

function Allowance({
  element,
  rates,
  label,
}: {
  element?: ModelElement;
  rates: Rate[];
  label: string;
}) {
  const price = element ? priceElement(element, rates) : null;
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <strong>
        {!element
          ? "Not in revision"
          : price
            ? currency(price.cost)
            : "Unknown"}
      </strong>
      {price ? (
        <>
          <small>
            {evidenceNumber(price.quantity.value)} {price.quantity.unit} ×{" "}
            {currency(price.rate.value)} / {price.rate.unit}
          </small>
          <small>{price.rate.source}</small>
        </>
      ) : (
        <small>
          {element
            ? "Missing usable quantity or exact material rate; excluded."
            : "No line item in this revision."}
        </small>
      )}
    </div>
  );
}

export default function RevisionDetail({
  entry,
  rates,
  onSelect,
}: {
  entry: RevisionEntry;
  rates: Rate[];
  onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState<"overlay" | "baseline" | "current">(
    "overlay",
  );
  const [resetKey, setResetKey] = useState(0);
  const { before, after } = entry;
  const geometry = before && after ? compareGeometry(before, after) : null;
  const elements = useMemo(
    () => [
      ...(before
        ? [
            {
              ...before,
              id: `${before.id}:baseline`,
              previewRole: "baseline" as const,
            },
          ]
        : []),
      ...(after
        ? [
            {
              ...after,
              id: `${after.id}:current`,
              previewRole: "current" as const,
            },
          ]
        : []),
    ],
    [before, after],
  );
  const quantityKeys = [
    ...new Set([
      ...Object.keys(before?.quantities ?? {}),
      ...Object.keys(after?.quantities ?? {}),
    ]),
  ].filter(
    (key) =>
      entry.fields.includes(key) ||
      ((!before || !after) &&
        (before?.quantities[key] || after?.quantities[key])),
  );
  const metadata = ["name", "type", "storey", "material"].filter(
    (key) =>
      entry.fields.includes(key) || ((!before || !after) && key !== "name"),
  );
  const metadataValue = (element: ModelElement | undefined, field: string) =>
    !element
      ? "Not in revision"
      : field === "material"
        ? element.materials.join(" + ") || "Not assigned"
        : element[field as "name" | "type" | "storey"];
  const activeElement =
    mode === "baseline" ? before : mode === "current" ? after : null;
  const missingPreview =
    mode === "overlay"
      ? (before && !before.mesh) || (after && !after.mesh)
      : !activeElement?.mesh;
  return (
    <section
      className="revision-detail"
      aria-label="Selected revision evidence"
    >
      <div className="revision-detail-heading">
        <div>
          <span className="eyebrow">
            {(after ?? before)?.storey} /{" "}
            {(after ?? before)?.type.replace(/^Ifc/, "")}
          </span>
          <h3>{after?.name ?? before?.name}</h3>
          <code>{entry.id}</code>
        </div>
        {after && (
          <button className="text-button" onClick={() => onSelect(entry.id)}>
            Open review <ArrowUpRight size={14} />
          </button>
        )}
      </div>
      <div className="revision-preview">
        <ModelViewer
          elements={elements}
          selectedId={null}
          onSelect={noSelection}
          findingIds={emptyIds}
          level="all"
          exploded={false}
          xray={false}
          colorMode="material"
          resetKey={resetKey}
          revisionMode={mode}
        />
        <div className="revision-preview-toolbar">
          <span>
            <Layers2 size={14} /> Shared coordinates
          </span>
          <div
            className="revision-modes"
            aria-label="Geometry revision display"
          >
            {(["baseline", "overlay", "current"] as const).map((value) => (
              <button
                key={value}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <button
            className="icon-button"
            title="Reset comparison camera"
            aria-label="Reset comparison camera"
            onClick={() => setResetKey((key) => key + 1)}
          >
            <Focus size={16} />
          </button>
        </div>
        <div className="revision-preview-legend">
          <span className="baseline">
            <i />
            Baseline
          </span>
          <span className="current">
            <i />
            Current
          </span>
          <small>Drag to orbit · scroll to zoom</small>
        </div>
        {missingPreview && (
          <div className="revision-preview-notice">
            {mode !== "overlay" && !activeElement
              ? "This identity is absent from this revision."
              : "Some source geometry is unavailable. The preview is incomplete."}
          </div>
        )}
      </div>
      <div className="revision-geometry-status">
        <Box size={15} />
        <span>
          {geometry === "unavailable"
            ? "Geometry unverified — compatible fingerprints are unavailable."
            : geometry === "different"
              ? "Surface fingerprints differ. Inspect the overlay and source evidence."
              : geometry === "same"
                ? "Surface fingerprints match at the recorded precision."
                : entry.kind === "added"
                  ? "Identity appears only in the current model."
                  : "Identity appears only in the baseline model."}
        </span>
      </div>
      <div className="revision-allowances">
        <Allowance label="BASELINE ALLOWANCE" element={before} rates={rates} />
        <ArrowRight size={19} />
        <Allowance label="CURRENT ALLOWANCE" element={after} rates={rates} />
        <div className="allowance-impact">
          <span className="eyebrow">
            {entry.kind === "unverified" ? "COMPARISON" : "LINE IMPACT"}
          </span>
          <strong>
            {entry.kind === "unverified"
              ? "Incomplete"
              : entry.costDelta === null
                ? "Unknown"
                : `${entry.costDelta >= 0 ? "+" : "−"}${currency(Math.abs(entry.costDelta))}`}
          </strong>
          <small>Same current rate card</small>
        </div>
      </div>
      {metadata.length || quantityKeys.length ? (
        <div className="table-scroll revision-evidence-table">
          <table>
            <thead>
              <tr>
                <th>CHANGED EVIDENCE</th>
                <th>BASELINE</th>
                <th>CURRENT</th>
              </tr>
            </thead>
            <tbody>
              {metadata.map((field) => (
                <tr key={field}>
                  <th scope="row">{field}</th>
                  <td>{metadataValue(before, field)}</td>
                  <td>{metadataValue(after, field)}</td>
                </tr>
              ))}
              {quantityKeys.map((key) => (
                <tr key={key}>
                  <th scope="row">{key}</th>
                  <td>
                    {before ? (
                      <QuantityCell quantity={before.quantities[key]} />
                    ) : (
                      "Not in revision"
                    )}
                  </td>
                  <td>
                    {after ? (
                      <QuantityCell quantity={after.quantities[key]} />
                    ) : (
                      "Not in revision"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="revision-evidence-note">
          The compared quantity, material and metadata values match.{" "}
          {geometry === "unavailable"
            ? "Geometry still needs verification."
            : "Declared quantities can remain unchanged even when the surface fingerprint differs."}
        </p>
      )}
    </section>
  );
}
