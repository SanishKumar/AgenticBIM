"use client";
import { useState } from "react";
import { MAX_TEXT } from "@/lib/workspace-backup";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  FileCheck2,
  Fingerprint,
  Focus,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  money,
  evidenceNumber,
  shortType,
  type Decisions,
  type Finding,
  type ModelSnapshot,
  type ModelElement,
  type evaluateModel,
  type priceElement,
} from "@/lib/model";

type Props = {
  model: ModelSnapshot;
  review: ReturnType<typeof evaluateModel>;
  selected: ModelElement | undefined;
  selectedFindings: Finding[];
  currentPrice: ReturnType<typeof priceElement> | undefined;
  activeDecisions: Decisions;
  onSelect: (id: string) => void;
  onClear: () => void;
  onAcknowledge: (finding: Finding, note: string) => void;
  onReopen: (finding: Finding) => void;
};
export default function EvidenceInspector({
  model,
  review,
  selected,
  selectedFindings,
  currentPrice,
  activeDecisions,
  onSelect,
  onClear,
  onAcknowledge,
  onReopen,
}: Props) {
  const [note, setNote] = useState("");
  return (
    <aside className="inspector">
      <div className="panel-heading">
        <div className="panel-title">
          <Focus size={16} />
          <strong>{selected ? "Element evidence" : "Review brief"}</strong>
        </div>
        {selected && (
          <button
            className="icon-button"
            aria-label="Clear selection"
            onClick={onClear}
          >
            <X size={15} />
          </button>
        )}
      </div>
      {selected ? (
        <div className="inspector-body">
          <span className="eyebrow">
            {shortType(selected.type).toUpperCase()} / {selected.storey}
          </span>
          <h2>{selected.name}</h2>
          <div className="element-id">
            <Fingerprint size={12} />
            <span title={selected.id}>{selected.id}</span>
          </div>
          <dl className="evidence-facts">
            <div>
              <dt>Material</dt>
              <dd>{selected.materials.join(" + ") || "Not assigned"}</dd>
            </div>
            <div>
              <dt>Known allowance</dt>
              <dd>
                {currentPrice ? money(currentPrice.cost) : "Excluded / unknown"}
              </dd>
            </div>
          </dl>
          <h3 className="section-label">SOURCE QUANTITIES</h3>
          <div className="quantity-evidence">
            {["volume", "area", "width"].map((key) => {
              const q = selected.quantities[key];
              return (
                <details key={key}>
                  <summary>
                    <span>{key[0].toUpperCase() + key.slice(1)}</span>
                    <strong>
                      {q
                        ? `${evidenceNumber(q.value)} ${q.unit}`
                        : "Not declared"}
                    </strong>
                    <ChevronDown size={12} />
                  </summary>
                  {q ? (
                    <div>
                      <code>{q.source}</code>
                      <p>
                        {evidenceNumber(q.raw_value)} {q.raw_unit} ×{" "}
                        {evidenceNumber(q.factor)} = {evidenceNumber(q.value)}{" "}
                        {q.unit}
                      </p>
                      <span>{q.basis} quantity · declared in source</span>
                    </div>
                  ) : (
                    <p>
                      Missing data stays unknown. Geometry is not a substitute
                      for an approved quantity.
                    </p>
                  )}
                </details>
              );
            })}
          </div>
          {selectedFindings.length ? (
            <div className="element-findings">
              {selectedFindings.map((f) => (
                <div key={f.id} className="element-finding">
                  <div className="finding-code">
                    {f.rule}
                    <span>
                      {activeDecisions[f.id]?.status === "acknowledged"
                        ? "Acknowledged"
                        : f.severity === "blocker"
                          ? "Cost gap"
                          : "Review"}
                    </span>
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.detail}</p>
                  <p className="next-action">
                    <ArrowRight size={13} />
                    {f.action}
                  </p>
                  {activeDecisions[f.id]?.status === "acknowledged" ? (
                    <div className="saved-note">
                      <CheckCheck size={15} />
                      <p>{activeDecisions[f.id].note}</p>
                      <button onClick={() => onReopen(f)}>Reopen</button>
                    </div>
                  ) : (
                    <>
                      <label className="note-label">
                        Review note
                        <textarea
                          maxLength={MAX_TEXT}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Record the decision or next action…"
                          rows={2}
                        />
                      </label>
                      <button
                        className="secondary-button full-width"
                        disabled={!note.trim()}
                        onClick={() => onAcknowledge(f, note)}
                      >
                        <Check size={14} />
                        Acknowledge with note
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="clean-state">
              <ShieldCheck size={22} />
              <strong>No findings in this rule set</strong>
              <p>This is a scoped data review, not approval of the design.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="inspector-body brief">
          <div className="brief-icon">
            <FileCheck2 size={25} />
            <span />
          </div>
          <span className="eyebrow">THE MODEL, AT A GLANCE</span>
          <h2>
            A good model tells you
            <br />
            what it doesn’t know.
          </h2>
          <p>
            {review.excludedCount
              ? `${review.excludedCount} ${review.excludedCount === 1 ? "element is" : "elements are"} outside the priced allowance. Resolve the data gaps before treating the subtotal as complete.`
              : "All elements have a mapped rate and quantity. Confirm the measurement basis and assumptions before using the allowance."}
          </p>
          <div className="brief-progress">
            <div>
              <span>Priced</span>
              <strong>
                {review.pricedCount} / {model.elements.length}
              </strong>
            </div>
            <div className="progress-track">
              <i style={{ width: `${review.coverage}%` }} />
            </div>
            <span>Coverage by element count, not value</span>
          </div>
          <div className="brief-check">
            <ShieldCheck size={17} />
            <div>
              <strong>Nothing filled in behind the scenes</strong>
              <p>
                Missing quantities stay missing. Every priced line keeps its IFC
                source.
              </p>
            </div>
          </div>
          <button
            className="text-link"
            onClick={() => {
              const first = review.findings[0];
              if (first) onSelect(first.elementId);
              else onSelect(model.elements[0].id);
            }}
          >
            Inspect{" "}
            {review.findings.length ? "the first finding" : "an element"}
            <ArrowRight size={16} />
          </button>
          <div className="brief-hint">
            <Focus size={16} />
            <span>Select a model element to follow its evidence.</span>
          </div>
        </div>
      )}
    </aside>
  );
}
