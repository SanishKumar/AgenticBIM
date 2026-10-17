"use client";
import { useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { defaultPolicy, type ReviewPolicy } from "@/lib/model";
import Dialog from "./dialog";
export default function AssumptionsDialog({
  policy,
  onApply,
  onClose,
}: {
  policy: ReviewPolicy;
  onApply: (policy: ReviewPolicy) => void;
  onClose: () => void;
}) {
  const [draftPolicy, setDraftPolicy] = useState(() => structuredClone(policy));
  return (
    <Dialog title="Make the assumptions explicit." wide onClose={onClose}>
      <p className="dialog-intro">
        Rates are material allowances in USD, not market quotes. Map the exact
        material name from your model. Composite assemblies remain excluded.
      </p>
      <div className="assumption-rates">
        <div className="rate-head">
          <span>MATERIAL IN IFC</span>
          <span>USD / UNIT</span>
          <span>BASIS</span>
          <span />
        </div>
        {draftPolicy.rates.map((rate, i) => (
          <div className="rate-row" key={i}>
            <input
              aria-label={`Material ${i + 1}`}
              value={rate.material}
              onChange={(e) =>
                setDraftPolicy((p) => ({
                  ...p,
                  rates: p.rates.map((r, j) =>
                    j === i ? { ...r, material: e.target.value } : r,
                  ),
                }))
              }
            />
            <input
              aria-label={`Rate ${i + 1}`}
              type="number"
              min="0"
              max="100000000"
              step="0.01"
              value={Number.isNaN(rate.value) ? "" : rate.value}
              onChange={(e) =>
                setDraftPolicy((p) => ({
                  ...p,
                  rates: p.rates.map((r, j) =>
                    j === i
                      ? {
                          ...r,
                          value:
                            e.target.value === ""
                              ? NaN
                              : Number(e.target.value),
                        }
                      : r,
                  ),
                }))
              }
            />
            <select
              aria-label={`Rate unit ${i + 1}`}
              value={rate.unit}
              onChange={(e) =>
                setDraftPolicy((p) => ({
                  ...p,
                  rates: p.rates.map((r, j) =>
                    j === i ? { ...r, unit: e.target.value as "m³" | "m²" } : r,
                  ),
                }))
              }
            >
              <option>m³</option>
              <option>m²</option>
            </select>
            <button
              className="icon-button"
              aria-label={`Remove rate ${i + 1}`}
              onClick={() =>
                setDraftPolicy((p) => ({
                  ...p,
                  rates: p.rates.filter((_, j) => j !== i),
                }))
              }
            >
              <X size={15} />
            </button>
            <input
              className="rate-source"
              aria-label={`Rate source ${i + 1}`}
              placeholder="Quote reference or assumption source"
              value={rate.source}
              onChange={(e) =>
                setDraftPolicy((p) => ({
                  ...p,
                  rates: p.rates.map((r, j) =>
                    j === i ? { ...r, source: e.target.value } : r,
                  ),
                }))
              }
            />
          </div>
        ))}
      </div>
      <button
        className="text-link add-rate"
        onClick={() =>
          setDraftPolicy((p) => ({
            ...p,
            rates: [
              ...p.rates,
              { material: "", value: 0, unit: "m³", source: "" },
            ],
          }))
        }
      >
        <Plus size={15} />
        Add material rate
      </button>
      <div className="door-policy">
        <div>
          <strong>Project door width target</strong>
          <p>
            A coordination check against declared width, not a clear-opening or
            statutory compliance check.
          </p>
        </div>
        <label>
          <input
            type="number"
            min="0.1"
            max="10"
            step="0.05"
            aria-label="Door width target"
            value={
              Number.isNaN(draftPolicy.minDoorWidth)
                ? ""
                : draftPolicy.minDoorWidth
            }
            onChange={(e) =>
              setDraftPolicy((p) => ({
                ...p,
                minDoorWidth:
                  e.target.value === "" ? NaN : Number(e.target.value),
              }))
            }
          />
          m
        </label>
      </div>
      <p className="muted small">
        Changing assumptions reopens acknowledgements so past decisions cannot
        silently approve new results.
      </p>
      <div className="dialog-actions">
        <button
          className="secondary-button"
          onClick={() => setDraftPolicy(structuredClone(defaultPolicy))}
        >
          Reset example rates
        </button>
        <button
          className="primary-button"
          disabled={
            !Number.isFinite(draftPolicy.minDoorWidth) ||
            draftPolicy.minDoorWidth < 0.1 ||
            draftPolicy.minDoorWidth > 10 ||
            draftPolicy.rates.some(
              (r) =>
                !r.material.trim() ||
                !r.source.trim() ||
                !Number.isFinite(r.value) ||
                r.value < 0 ||
                r.value > 1e8,
            ) ||
            new Set(draftPolicy.rates.map((r) => r.material.trim())).size !==
              draftPolicy.rates.length
          }
          onClick={() => {
            onApply({
              ...draftPolicy,
              rates: draftPolicy.rates.map((r) => ({
                ...r,
                material: r.material.trim(),
              })),
            });
          }}
        >
          Apply assumptions
          <ArrowRight size={15} />
        </button>
      </div>
    </Dialog>
  );
}
