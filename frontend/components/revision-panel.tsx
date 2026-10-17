"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCheck,
  FileBox,
  FileCheck2,
  GitCompareArrows,
  Plus,
  Upload,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  money,
  revisionCoverage,
  type ModelSnapshot,
  type Rate,
  type RevisionChange,
} from "@/lib/model";
import RevisionDetail, { type RevisionEntry } from "./revision-detail";

type Props = {
  model: ModelSnapshot;
  baseline: ModelSnapshot | null;
  changes: RevisionChange[];
  rates: Rate[];
  onSelect: (id: string) => void;
  onImport: () => void;
};
const signed = (value: number) =>
  `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;

export default function RevisionPanel({
  model,
  baseline,
  changes,
  rates,
  onSelect,
  onImport,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const coverage = useMemo(
    () => (baseline ? revisionCoverage(baseline, model) : null),
    [baseline, model],
  );
  const entries = useMemo<RevisionEntry[]>(() => {
    const result: RevisionEntry[] = [...changes];
    if (!baseline || !coverage) return result;
    const changedIds = new Set(changes.map((c) => c.id));
    const before = new Map(baseline.elements.map((e) => [e.id, e]));
    const after = new Map(model.elements.map((e) => [e.id, e]));
    for (const item of coverage.unverified) {
      if (!changedIds.has(item.id))
        result.push({
          id: item.id,
          kind: "unverified",
          fields: [],
          before: before.get(item.id),
          after: after.get(item.id),
          costDelta: null,
        });
    }
    return result;
  }, [baseline, model, changes, coverage]);
  const visible = entries.filter(
    (entry) =>
      filter === "all" ||
      (filter === "unverified"
        ? coverage?.unverified.some((item) => item.id === entry.id)
        : entry.kind === filter),
  );
  const selected =
    visible.find((entry) => entry.id === selectedId) ?? visible[0];
  const knownDelta = changes.reduce((sum, c) => sum + (c.costDelta ?? 0), 0);
  const unknownDeltas = changes.filter((c) => c.costDelta === null).length;
  const kinds = ["all", "changed", "added", "removed", "unverified"];
  return (
    <section className="revision-panel">
      <div className="list-heading">
        <div>
          <h2>Revision comparison</h2>
          <p>
            Follow each change from source evidence to its material allowance.
          </p>
        </div>
        <button className="secondary-button" onClick={onImport}>
          <Upload size={15} />
          {baseline ? "Replace baseline" : "Add baseline"}
        </button>
      </div>
      {baseline && coverage ? (
        <>
          <div className="revision-flow">
            <div>
              <span className="eyebrow">BASELINE</span>
              <strong>
                <FileBox size={20} />
                {baseline.filename}
              </strong>
              <small>
                {baseline.elements.length} elements ·{" "}
                {baseline.model_hash.slice(0, 12)}
              </small>
            </div>
            <ArrowRight size={24} />
            <div>
              <span className="eyebrow">CURRENT MODEL</span>
              <strong>
                <FileCheck2 size={20} />
                {model.filename}
              </strong>
              <small>
                {model.elements.length} elements ·{" "}
                {model.model_hash.slice(0, 12)}
              </small>
            </div>
            <div className="revision-delta">
              <span className="eyebrow">KNOWN NET CHANGE</span>
              <strong>{signed(knownDelta)}</strong>
              <small>
                {unknownDeltas
                  ? `${unknownDeltas} deltas unknown; excluded from net`
                  : "Material allowance · same current rates"}
              </small>
            </div>
          </div>
          <div
            className={`comparison-coverage ${coverage.unverified.length || !coverage.matched ? "incomplete" : ""}`}
          >
            {coverage.unverified.length || !coverage.matched ? (
              <TriangleAlert size={18} />
            ) : (
              <ShieldCheck size={18} />
            )}
            <div>
              <strong>
                {coverage.matched} identities matched <span>/</span>{" "}
                {coverage.geometryCompared} geometry comparisons available
              </strong>
              <p>
                {!coverage.matched
                  ? "No paired elements are available for a field-by-field comparison."
                  : coverage.unverified.length
                    ? `${coverage.unverified.length} matched elements have unverified geometry. “No measured change” does not establish that their geometry is unchanged.`
                    : "Normalized quantities, material and metadata compared. Geometry uses world-space surface fingerprints."}
              </p>
            </div>
          </div>
          {!coverage.matched && (
            <div className="alert">
              No shared GlobalIds. These models may be unrelated or re-exported
              with new identities. Changes cannot be reliably paired.
            </div>
          )}
          <div
            className="revision-filters"
            aria-label="Filter revision entries"
          >
            {kinds.map((kind) => {
              const count =
                kind === "all"
                  ? entries.length
                  : kind === "unverified"
                    ? coverage.unverified.length
                    : entries.filter((entry) => entry.kind === kind).length;
              return (
                <button
                  key={kind}
                  aria-pressed={filter === kind}
                  onClick={() => setFilter(kind)}
                >
                  {kind === "all"
                    ? "All entries"
                    : kind === "changed"
                      ? "Modified"
                      : kind === "unverified"
                        ? "Unverified geometry"
                        : kind}
                  <span>{count}</span>
                </button>
              );
            })}
          </div>
          {selected ? (
            <div className="revision-workbench">
              <nav
                className="revision-list"
                aria-label="Elements in revision comparison"
              >
                <div className="revision-list-label">
                  SELECT AN ELEMENT <span>{visible.length}</span>
                </div>
                {visible.map((entry) => (
                  <button
                    key={entry.id}
                    className={selected.id === entry.id ? "selected" : ""}
                    aria-pressed={selected.id === entry.id}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <span className="revision-list-top">
                      <span className={`change-tag ${entry.kind}`}>
                        {entry.kind === "unverified"
                          ? "Unverified"
                          : entry.kind}
                      </span>
                      <span>
                        {entry.kind === "unverified"
                          ? "Check geometry"
                          : entry.costDelta === null
                            ? "Δ unknown"
                            : signed(entry.costDelta)}
                      </span>
                    </span>
                    <strong>{entry.after?.name ?? entry.before?.name}</strong>
                    <small>
                      {entry.kind === "unverified"
                        ? "Other compared fields match"
                        : entry.fields.join(" · ") ||
                          (entry.kind === "added"
                            ? "New identity in current model"
                            : "Absent from current model")}
                    </small>
                  </button>
                ))}
              </nav>
              <RevisionDetail
                key={selected.id}
                entry={selected}
                rates={rates}
                onSelect={onSelect}
              />
            </div>
          ) : (
            <div className="empty-state">
              <CheckCheck size={28} />
              <h3>
                {filter === "all"
                  ? "No measured changes"
                  : "No entries in this filter"}
              </h3>
              <p>
                {filter === "all"
                  ? "Supported source fields and compatible surface fingerprints match."
                  : "Choose another filter to inspect the revision."}
              </p>
            </div>
          )}
          <details className="comparison-method">
            <summary>What does this comparison establish?</summary>
            <p>
              Elements are paired by IFC GlobalId. Both revisions use the
              current rate card. Unknown prices are excluded from the net
              change. A missing identity is not proof of a physical addition or
              demolition.
            </p>
            <p>
              Geometry fingerprints compare world-space triangles on a 1
              micrometre grid, ignoring vertex order, triangle order and
              winding. Different triangulations can still register a difference.
              Models must share a coordinate system; this review does not align
              them automatically or inspect every IFC property.
            </p>
          </details>
        </>
      ) : (
        <div className="empty-state large">
          <GitCompareArrows size={42} />
          <h3>Make the next revision explain itself.</h3>
          <p>
            Import an earlier IFC export to inspect added, removed and changed
            elements, with the material allowance impact attached.
          </p>
          <button className="primary-button" onClick={onImport}>
            <Plus size={16} />
            Import baseline IFC
          </button>
        </div>
      )}
    </section>
  );
}
