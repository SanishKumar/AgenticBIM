"use client";
import { ArrowDownToLine, Box, Search } from "lucide-react";
import {
  money,
  evidenceNumber,
  type ModelSnapshot,
  type evaluateModel,
} from "@/lib/model";
type Props = {
  model: ModelSnapshot;
  review: ReturnType<typeof evaluateModel>;
  query: string;
  setQuery: (value: string) => void;
  onSelect: (id: string) => void;
  onExport: () => void;
};
export default function QuantityLedger({
  model,
  review,
  query,
  setQuery,
  onSelect,
  onExport,
}: Props) {
  const visibleLines = review.lines.filter(({ element }) =>
    `${element.name} ${element.type} ${element.materials.join(" ")} ${element.id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="ledger-panel">
      <div className="list-heading">
        <div>
          <h2>
            Quantity ledger <span>{model.elements.length}</span>
          </h2>
          <p>
            Declared quantities × exact material rates. Click a row to inspect
            its source.
          </p>
        </div>
        <div className="list-controls">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search elements"
              placeholder="Search name, type or material…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button className="secondary-button" onClick={onExport}>
            <ArrowDownToLine size={14} />
            CSV
          </button>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>ELEMENT</th>
              <th>LEVEL</th>
              <th>MATERIAL</th>
              <th>QUANTITY</th>
              <th>RATE / UNIT</th>
              <th>ALLOWANCE</th>
            </tr>
          </thead>
          <tbody>
            {visibleLines.map(({ element: e, price }) => (
              <tr key={e.id}>
                <td>
                  <button
                    className="table-element"
                    onClick={() => {
                      onSelect(e.id);
                    }}
                  >
                    <span className="table-type">
                      <Box size={15} />
                    </span>
                    <span>
                      <strong>{e.name}</strong>
                      <small>
                        {e.type} · #{e.express_id}
                      </small>
                    </span>
                  </button>
                </td>
                <td>{e.storey}</td>
                <td>
                  {e.materials.join(" + ") || (
                    <span className="warning-text">Not assigned</span>
                  )}
                </td>
                <td>
                  {price
                    ? `${evidenceNumber(price.quantity.value)} ${price.quantity.unit}`
                    : "—"}
                </td>
                <td>
                  {price
                    ? `${money(price.rate.value)} / ${price.rate.unit}`
                    : "—"}
                </td>
                <td className={price ? "tabular" : "warning-text"}>
                  {price ? money(price.cost) : "Excluded"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visibleLines.length && (
          <div className="empty-state">No elements match your search.</div>
        )}
      </div>
      <div className="ledger-total">
        <span>
          Known material allowance{" "}
          <small>
            {review.excludedCount} elements excluded · no labour, tax or
            installation
          </small>
        </span>
        <strong>
          {money(review.total)} <small>USD</small>
        </strong>
      </div>
    </section>
  );
}
