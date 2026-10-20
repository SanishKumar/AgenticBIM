"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Fingerprint,
  FolderArchive,
  Focus,
  GitCompareArrows,
  Layers3,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X,
  TriangleAlert,
} from "lucide-react";
import {
  compareModels,
  csvCell,
  defaultPolicy,
  evaluateModel,
  revisionCoverage,
  money,
  type Decisions,
  type Finding,
  type ModelSnapshot,
  type ReviewPolicy,
} from "@/lib/model";
import { loadWorkspace, saveWorkspace } from "@/lib/storage";
import {
  validateModelSnapshot,
  workspaceContext,
  type Workspace as SavedWorkspace,
} from "@/lib/workspace-backup";
import BackupDialog from "./backup-dialog";
import Dialog from "./dialog";
import EvidenceInspector from "./evidence-inspector";
import AssumptionsDialog from "./assumptions-dialog";
import QuantityLedger from "./quantity-ledger";
import RevisionPanel from "./revision-panel";

const ModelViewer = dynamic(() => import("./model-viewer"), {
  ssr: false,
  loading: () => (
    <div className="viewer-loading">
      <LoaderCircle className="spin" size={25} />
      <span>Preparing model geometry</span>
    </div>
  ),
});
type Tab = "review" | "quantities" | "revisions";
type Modal = "import" | "assumptions" | "method" | "export" | "backup" | null;
const download = (name: string, value: string, type: string) => {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
async function demo(revision: number): Promise<ModelSnapshot> {
  const response = await fetch(`/demo/northbank-r0${revision}.json`);
  if (!response.ok)
    throw new Error(
      "The example model could not be loaded. Reload to try again.",
    );
  return response.json();
}
function scrollToReview(selector: string) {
  document.querySelector(selector)?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
}

export default function Workspace() {
  const [model, setModel] = useState<ModelSnapshot | null>(null);
  const [baseline, setBaseline] = useState<ModelSnapshot | null>(null);
  const [policy, setPolicy] = useState<ReviewPolicy>(defaultPolicy);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [decisionContext, setDecisionContext] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [tab, setTab] = useState<Tab>("review");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [level, setLevel] = useState("all");
  const [colorMode, setColorMode] = useState<"material" | "review">("material");
  const [exploded, setExploded] = useState(false);
  const [xray, setXray] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [importTarget, setImportTarget] = useState<"current" | "baseline">(
    "current",
  );
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importError, setImportError] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const autosaveBlocked = useRef(false);
  const pendingSection = useRef<string | null>(null);

  useEffect(() => {
    if (tab === "review" && pendingSection.current) {
      scrollToReview(pendingSection.current);
      pendingSection.current = null;
    }
  }, [tab]);

  function revealReviewSection(selector: string) {
    if (tab === "review") scrollToReview(selector);
    else pendingSection.current = selector;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved = null;
      try {
        saved = await loadWorkspace();
      } catch {
        // Do not overwrite an unreadable stored review with the example project.
        autosaveBlocked.current = true;
        setStorageError(true);
      }
      if (cancelled) return;
      if (saved?.model?.version === "1.0") {
        setModel(saved.model);
        setBaseline(saved.baseline);
        setPolicy(saved.policy);
        setDecisions(saved.decisions);
        setDecisionContext(saved.decisionContext);
      } else {
        const [current, previous] = await Promise.all([demo(2), demo(1)]);
        if (cancelled) return;
        setModel(current);
        setBaseline(previous);
      }
      setReady(true);
    })().catch((err) =>
      setError(
        err instanceof Error ? err.message : "Could not load the workspace.",
      ),
    );
    return () => {
      cancelled = true;
      request.current?.abort();
    };
  }, []);

  const context = model ? workspaceContext(model, policy) : "";
  const activeDecisions = useMemo(
    () => (decisionContext === context ? decisions : {}),
    [context, decisions, decisionContext],
  );
  useEffect(() => {
    if (ready && model && !autosaveBlocked.current)
      saveWorkspace({
        model,
        baseline,
        policy,
        decisions,
        decisionContext,
      }).then(
        () => setStorageError(false),
        () => setStorageError(true),
      );
  }, [ready, model, baseline, policy, decisions, decisionContext]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const review = useMemo(
    () => (model ? evaluateModel(model, policy) : null),
    [model, policy],
  );
  const changes = useMemo(
    () =>
      model && baseline ? compareModels(baseline, model, policy.rates) : [],
    [model, baseline, policy.rates],
  );
  const comparisonCoverage = useMemo(
    () => (model && baseline ? revisionCoverage(baseline, model) : null),
    [model, baseline],
  );
  const selected = model?.elements.find((element) => element.id === selectedId);
  const findingIds = useMemo(
    () => [...new Set(review?.findings.map((f) => f.elementId) ?? [])],
    [review],
  );
  const selectedFindings =
    review?.findings.filter((f) => f.elementId === selectedId) ?? [];
  const openFindings =
    review?.findings.filter(
      (f) => activeDecisions[f.id]?.status !== "acknowledged",
    ) ?? [];
  const blockers =
    review?.findings.filter((f) => f.severity === "blocker") ?? [];
  const levels = useMemo(
    () => [
      ...new Set(
        model?.elements
          .slice()
          .sort((a, b) => a.elevation - b.elevation)
          .map((e) => e.storey) ?? [],
      ),
    ],
    [model],
  );
  const selectElement = useCallback((id: string) => {
    setSelectedId(id);
  }, []);
  const revealElement = (id: string) => {
    selectElement(id);
    setLevel("all");
  };

  function openImport(target: "current" | "baseline") {
    setImportTarget(target);
    setImportError("");
    setFile(null);
    setModal("import");
  }
  function chooseFile(chosen: File | undefined) {
    if (!chosen) return;
    if (!chosen.name.toLowerCase().endsWith(".ifc")) {
      setImportError("Choose an .ifc model export.");
      return;
    }
    if (chosen.size > 25 * 1024 * 1024) {
      setImportError(
        "This model is larger than 25 MB. Export a smaller discipline model.",
      );
      return;
    }
    setFile(chosen);
    setImportError("");
  }
  async function importModel() {
    if (!file) return;
    setUploading(true);
    setImportError("");
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 180_000);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/ifc", {
        method: "POST",
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "The IFC service is unavailable. Start the backend using the README instructions, then retry.",
        );
      }
      const next = validateModelSnapshot(await response.json());
      if (importTarget === "baseline") setBaseline(next);
      else {
        setModel(next);
        setBaseline(null);
        setSelectedId(null);
        setLevel("all");
        setDecisions({});
        setResetKey((k) => k + 1);
      }
      setModal(null);
      setNotice(`${file.name} imported · ${next.elements.length} elements`);
    } catch (err) {
      setImportError(
        err instanceof Error && err.name === "AbortError"
          ? "Import stopped or exceeded three minutes. Try a smaller export."
          : err instanceof Error
            ? err.message
            : "Import failed. Check the local IFC service.",
      );
    } finally {
      clearTimeout(timeout);
      setUploading(false);
      request.current = null;
    }
  }
  async function resetDemo() {
    try {
      const [current, previous] = await Promise.all([demo(2), demo(1)]);
      setModel(current);
      setBaseline(previous);
      setPolicy(defaultPolicy);
      setDecisions({});
      setSelectedId(null);
      setLevel("all");
      setQuery("");
      setFilter("all");
      setTab("review");
      setModal(null);
      setNotice("Example workspace restored");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Example unavailable");
    }
  }
  async function restoreWorkspace(next: SavedWorkspace) {
    await saveWorkspace(next);
    autosaveBlocked.current = false;
    setStorageError(false);
    setModel(next.model);
    setBaseline(next.baseline);
    setPolicy(next.policy);
    setDecisions(next.decisions);
    setDecisionContext(next.decisionContext);
    setSelectedId(null);
    setLevel("all");
    setQuery("");
    setFilter("all");
    setTab("review");
    setExploded(false);
    setXray(false);
    setResetKey((key) => key + 1);
    setModal(null);
    setNotice("Workspace restored and saved on this device");
  }
  function acknowledge(finding: Finding, note: string) {
    if (!note.trim()) return;
    setDecisions({
      ...activeDecisions,
      [finding.id]: {
        status: "acknowledged",
        note: note.trim(),
        at: new Date().toISOString(),
      },
    });
    setDecisionContext(context);
    setNotice(
      "Review note saved. The source finding remains in the evidence record.",
    );
  }
  function reopen(finding: Finding) {
    setDecisions({
      ...activeDecisions,
      [finding.id]: {
        status: "open",
        note: activeDecisions[finding.id]?.note ?? "",
        at: new Date().toISOString(),
      },
    });
    setDecisionContext(context);
  }
  function exportJson() {
    if (!model || !review) return;
    const stripMeshes = (snapshot: ModelSnapshot) => ({
      ...snapshot,
      elements: snapshot.elements.map(({ mesh, ...element }) => ({
        ...element,
        preview_available: !!mesh,
      })),
    });
    download(
      "trace-evidence.json",
      JSON.stringify(
        {
          format: "trace-review/1.0",
          exported_at: new Date().toISOString(),
          scope:
            "Declared material allowances. Excludes labour, installation, tax, waste and unpriced elements. Project checks are not statutory compliance.",
          model: stripMeshes(model),
          baseline: baseline ? stripMeshes(baseline) : null,
          assumptions: policy,
          summary: {
            known_subtotal_usd: review.total,
            excluded_elements: review.excludedCount,
          },
          findings: review.findings,
          decisions: activeDecisions,
          changes: changes.map(({ id, kind, fields, costDelta }) => ({
            id,
            kind,
            fields,
            costDelta,
          })),
          comparison: baseline
            ? {
                ...revisionCoverage(baseline, model),
                method:
                  "IFC GlobalId; world-space triangle surfaces on a 1 micrometre grid. Vertex and triangle order are ignored; a different triangulation can still register a change.",
              }
            : null,
        },
        null,
        2,
      ),
      "application/json",
    );
    setNotice("Evidence record exported");
  }
  function exportCsv() {
    if (!review) return;
    const rows: unknown[][] = [
      [
        "IFC GlobalId",
        "Element",
        "Type",
        "Storey",
        "Material",
        "Quantity",
        "Unit",
        "Source",
        "Rate USD",
        "Known cost USD",
        "Status",
      ],
    ];
    for (const { element: e, price } of review.lines)
      rows.push([
        e.id,
        e.name,
        e.type,
        e.storey,
        e.materials.join(" + "),
        price?.quantity.value,
        price?.quantity.unit,
        price?.quantity.source,
        price?.rate.value,
        price?.cost,
        price ? "Priced allowance" : "Excluded / unknown",
      ]);
    download(
      "trace-quantities.csv",
      rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
      "text/csv;charset=utf-8",
    );
    setNotice("Quantity schedule exported");
  }

  if (!model || !review)
    return (
      <div className="app-loading">
        <span className="brand-symbol loading-symbol" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <h1>Trace</h1>
        <p>{error || "Opening your model review workspace…"}</p>
        {error ? (
          <button
            className="primary-button"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        ) : (
          <LoaderCircle className="spin" />
        )}
      </div>
    );
  const visibleFindings = review.findings.filter((f) => {
    const e = model.elements.find((e) => e.id === f.elementId)!;
    return (
      (filter === "all" ||
        (filter === "open" &&
          activeDecisions[f.id]?.status !== "acknowledged") ||
        (filter === "blocker" && f.severity === "blocker") ||
        (filter === "acknowledged" &&
          activeDecisions[f.id]?.status === "acknowledged")) &&
      `${e.name} ${f.title} ${f.rule}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  const currentPrice = review.lines.find(
    (l) => l.element.id === selectedId,
  )?.price;
  const knownDelta = changes.reduce(
    (sum, change) => sum + (change.costDelta ?? 0),
    0,
  );
  const unknownDeltas = changes.filter((c) => c.costDelta === null).length;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-main">
        Skip to workspace
      </a>
      <header className="app-header">
        <div className="header-inner">
          <Link className="brand" href="/" aria-label="Trace home">
            <span className="brand-symbol" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              trace<span className="brand-dot">.</span>
            </span>
            <small>MODEL REVIEW STUDIO</small>
          </Link>
          <nav className="workspace-nav" aria-label="Workspace navigation">
            <button
              className={tab === "review" ? "active" : ""}
              aria-pressed={tab === "review"}
              onClick={() => {
                setTab("review");
                setQuery("");
              }}
            >
              <Box size={18} />
              Model review
            </button>
            <button
              className={tab === "quantities" ? "active" : ""}
              aria-pressed={tab === "quantities"}
              onClick={() => {
                setTab("quantities");
                setQuery("");
              }}
            >
              <Layers3 size={18} />
              Quantity ledger
            </button>
            <button
              className={tab === "revisions" ? "active" : ""}
              aria-pressed={tab === "revisions"}
              onClick={() => {
                setTab("revisions");
                setQuery("");
              }}
            >
              <GitCompareArrows size={18} />
              Revision impact
              {baseline && <span className="nav-count">{changes.length}</span>}
            </button>
          </nav>
          <div className="header-actions">
            <button
              className="icon-button"
              onClick={() => setModal("backup")}
              aria-label="Workspace backups"
              title="Workspace backups"
            >
              <FolderArchive size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => setModal("method")}
              aria-label="Review methodology"
              title="Review methodology"
            >
              <CircleHelp size={18} />
            </button>
            <button
              className="dark-button"
              onClick={() => setModal("export")}
              aria-label="Export review"
            >
              <ArrowDownToLine size={15} />
              <span>
                Export<span className="export-label-detail"> review</span>
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className="main-shell">
        <main className="main-content" id="workspace-main">
          <div className="project-context">
            <div className="project-context-left">
              <button
                className="project-switch"
                onClick={() => openImport("current")}
              >
                <span className="project-icon">
                  <Box size={16} />
                </span>
                <span>{model.project_name}</span>
                <ChevronDown size={14} />
              </button>
              <span className="context-source">
                {model.source === "demo"
                  ? "Example project"
                  : "Local IFC project"}
              </span>
            </div>
            <span className="local-status">
              <ShieldCheck size={13} />
              {storageError ? "Session only" : "Local workspace"}
            </span>
          </div>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {tab === "review"
                  ? "THE MODEL REVIEW"
                  : tab === "quantities"
                    ? "THE QUANTITY LEDGER"
                    : "THE REVISION WORKBENCH"}
              </div>
              <h1>
                {tab === "review"
                  ? "See the whole picture."
                  : tab === "quantities"
                    ? "Every number, accounted for."
                    : "Make every change visible."}
              </h1>
              <p>
                {tab === "review"
                  ? "Inspect the source. Resolve the gaps. Review the next revision."
                  : tab === "quantities"
                    ? "Declared quantities, clear assumptions, and an allowance you can trace."
                    : "Two versions. One rate card. The evidence behind every difference."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="secondary-button"
                onClick={() => setModal("assumptions")}
              >
                <SlidersHorizontal size={15} />
                Assumptions
              </button>
              <button
                className="primary-button"
                onClick={() => openImport("current")}
              >
                <Plus size={17} />
                Import model
              </button>
            </div>
          </div>
          {model.warnings.length > 0 && (
            <div className="alert" role="status">
              {model.warnings.join(" ")}
            </div>
          )}
          {storageError && (
            <div className="alert">
              Local saving is unavailable or the saved review could not be read.
              Download a workspace backup before closing this session.{" "}
              <button className="text-link" onClick={() => setModal("backup")}>
                Open backups <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          <section className="metrics" aria-label="Model review summary">
            <div className="metric">
              <div className="metric-label">
                Known material allowance
                <Box size={15} />
              </div>
              <strong>
                {money(review.total)}
                <small>USD</small>
              </strong>
              <span>
                <span className="tiny-dot green" />
                {review.pricedCount} priced elements · {review.excludedCount}{" "}
                excluded
              </span>
            </div>
            <div className="metric">
              <div className="metric-label">
                Takeoff coverage
                <Layers3 size={15} />
              </div>
              <strong>
                {review.coverage}
                <small>%</small>
                <span className="mini-bars" aria-hidden="true">
                  {Array.from({ length: 16 }, (_, i) => (
                    <i
                      key={i}
                      className={
                        (i / 16) * 100 < review.coverage ? "filled" : ""
                      }
                    />
                  ))}
                </span>
              </strong>
              <span>Elements with a quantity and mapped rate</span>
            </div>
            <button
              className="metric metric-button"
              onClick={() => {
                setTab("review");
                setFilter("open");
                setQuery("");
                revealReviewSection("#review-list");
              }}
            >
              <div className="metric-label">
                Needs a closer look
                <ClipboardCheck size={16} />
              </div>
              <strong>
                {openFindings.length.toString().padStart(2, "0")}
                <span className="metric-pill">{blockers.length} cost gaps</span>
              </strong>
              <span>
                <span className="tiny-dot amber" />
                Open findings across the model
              </span>
            </button>
            <button
              className="metric metric-button"
              onClick={() => setTab("revisions")}
            >
              <div className="metric-label">
                Revision impact
                <ArrowUpRight size={16} />
              </div>
              <strong>
                {baseline
                  ? `${knownDelta >= 0 ? "+" : "−"}${money(Math.abs(knownDelta))}`
                  : "—"}
              </strong>
              <span>
                {baseline
                  ? `${changes.length} detected changes${comparisonCoverage?.unverified.length ? ` · ${comparisonCoverage.unverified.length} geometry unverified` : unknownDeltas ? ` · ${unknownDeltas} unpriced` : " · same rates applied"}`
                  : "Add a baseline model to compare"}
              </span>
            </button>
          </section>

          {tab === "review" && (
            <>
              <section className="review-grid">
                <div className="model-panel">
                  <div className="panel-heading">
                    <div className="panel-title">
                      <Box size={17} />
                      <strong>Model explorer</strong>
                      <span className="soft-tag">{model.schema_name}</span>
                    </div>
                    <span className="model-filename" title={model.filename}>
                      {model.filename}
                    </span>
                  </div>
                  <div className="model-stage">
                    <ModelViewer
                      elements={model.elements}
                      selectedId={selectedId}
                      onSelect={selectElement}
                      findingIds={findingIds}
                      level={level}
                      exploded={exploded}
                      xray={xray}
                      colorMode={colorMode}
                      resetKey={resetKey}
                    />
                    <div className="stage-top">
                      <div
                        className="segment-control"
                        aria-label="Model colors"
                      >
                        <button
                          className={colorMode === "material" ? "active" : ""}
                          aria-pressed={colorMode === "material"}
                          onClick={() => setColorMode("material")}
                        >
                          Materials
                        </button>
                        <button
                          className={colorMode === "review" ? "active" : ""}
                          aria-pressed={colorMode === "review"}
                          onClick={() => setColorMode("review")}
                        >
                          <span className="tiny-dot amber" />
                          Findings
                        </button>
                      </div>
                      <span className="stage-source">
                        <span className="status-dot" />
                        {model.source === "demo"
                          ? "SYNTHETIC IFC"
                          : "SOURCE GEOMETRY"}
                      </span>
                    </div>
                    <div className="view-tools">
                      <button
                        className={exploded ? "active" : ""}
                        onClick={() => setExploded(!exploded)}
                        title="Explode floors"
                        aria-label="Explode floors"
                        aria-pressed={exploded}
                      >
                        <Layers3 size={18} />
                      </button>
                      <button
                        className={xray ? "active" : ""}
                        onClick={() => setXray(!xray)}
                        title="X-ray model"
                        aria-label="X-ray model"
                        aria-pressed={xray}
                      >
                        <Box size={18} />
                      </button>
                      <span />
                      <button
                        onClick={() => setResetKey((k) => k + 1)}
                        title="Reset camera"
                        aria-label="Reset camera"
                      >
                        <Focus size={18} />
                      </button>
                    </div>
                    <div className="stage-bottom">
                      <label className="level-select">
                        <Layers3 size={15} />
                        <select
                          aria-label="Visible level"
                          value={level}
                          onChange={(e) => setLevel(e.target.value)}
                        >
                          <option value="all">All levels</option>
                          {levels.map((level) => (
                            <option key={level}>{level}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} />
                      </label>
                      <span>
                        Drag to orbit <i /> Scroll to zoom <i /> Click to
                        inspect
                      </span>
                    </div>
                  </div>
                  <div className="model-footer">
                    <span>
                      <span className="tiny-dot green" />
                      {model.elements.length}{" "}
                      {model.elements.length === 1 ? "element" : "elements"}{" "}
                      <b>·</b> {levels.length}{" "}
                      {levels.length === 1 ? "level" : "levels"}
                    </span>
                    <button onClick={() => setModal("method")}>
                      <Fingerprint size={13} />
                      Source-linked geometry
                    </button>
                  </div>
                </div>

                <EvidenceInspector
                  key={selectedId ?? "brief"}
                  model={model}
                  review={review}
                  selected={selected}
                  selectedFindings={selectedFindings}
                  currentPrice={currentPrice}
                  activeDecisions={activeDecisions}
                  onSelect={revealElement}
                  onClear={() => setSelectedId(null)}
                  onAcknowledge={acknowledge}
                  onReopen={reopen}
                />
              </section>
              <section className="findings-panel" id="review-list">
                <div className="list-heading">
                  <div>
                    <h2>
                      Review queue <span>{review.findings.length}</span>
                    </h2>
                    <p>
                      Small gaps in the model. Meaningful consequences
                      downstream.
                    </p>
                  </div>
                  <div className="list-controls">
                    <label className="search-field">
                      <Search size={15} />
                      <input
                        placeholder="Find an issue…"
                        aria-label="Search findings"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filter findings"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">All findings</option>
                      <option value="open">Open</option>
                      <option value="blocker">Cost gaps</option>
                      <option value="acknowledged">Acknowledged</option>
                    </select>
                  </div>
                </div>
                <div className="findings-table">
                  <div className="table-header finding-columns">
                    <span>FINDING / ELEMENT</span>
                    <span>LEVEL</span>
                    <span>IMPACT</span>
                    <span>STATUS</span>
                    <span />
                  </div>
                  {visibleFindings.map((f) => {
                    const e = model.elements.find((e) => e.id === f.elementId)!;
                    return (
                      <button
                        key={f.id}
                        className={`finding-row finding-columns ${selectedId === e.id ? "selected" : ""}`}
                        onClick={() => {
                          revealElement(e.id);
                          revealReviewSection(".review-grid");
                        }}
                      >
                        <span className="finding-main">
                          <span className={`finding-icon ${f.severity}`}>
                            <TriangleAlert size={16} />
                          </span>
                          <span>
                            <strong>{f.title}</strong>
                            <small>
                              {e.name} <b>·</b> {f.rule}
                            </small>
                            <span className="compact-row-state">
                              {f.severity === "blocker"
                                ? "Cost excluded"
                                : "Check design"}{" "}
                              ·{" "}
                              {activeDecisions[f.id]?.status === "acknowledged"
                                ? "Noted"
                                : "Open"}
                            </span>
                          </span>
                        </span>
                        <span>{e.storey}</span>
                        <span className={`impact-badge ${f.severity}`}>
                          {f.severity === "blocker"
                            ? "Cost excluded"
                            : "Check design"}
                        </span>
                        <span className="row-status">
                          <span
                            className={`tiny-dot ${activeDecisions[f.id]?.status === "acknowledged" ? "green" : "amber"}`}
                          />
                          {activeDecisions[f.id]?.status === "acknowledged"
                            ? "Noted"
                            : "Open"}
                        </span>
                        <ArrowUpRight size={16} />
                      </button>
                    );
                  })}
                  {!visibleFindings.length && (
                    <div className="empty-state">
                      <CheckCheck size={25} />
                      <h3>
                        {review.findings.length
                          ? "No findings match this view"
                          : "No findings in the current rule set"}
                      </h3>
                      <p>
                        {review.findings.length
                          ? "Try another filter or search."
                          : "Review the scope and assumptions before relying on the allowance."}
                      </p>
                    </div>
                  )}
                </div>
                <div className="list-footer">
                  <span>Deterministic checks · project rules v1.0</span>
                  <button onClick={() => setModal("method")}>
                    What’s being checked? <ArrowUpRight size={13} />
                  </button>
                </div>
              </section>
            </>
          )}

          {tab === "quantities" && (
            <QuantityLedger
              key={model.model_hash}
              model={model}
              review={review}
              query={query}
              setQuery={setQuery}
              onExport={exportCsv}
              onSelect={(id) => {
                revealElement(id);
                setTab("review");
                revealReviewSection(".review-grid");
              }}
            />
          )}

          {tab === "revisions" && (
            <RevisionPanel
              model={model}
              baseline={baseline}
              changes={changes}
              rates={policy.rates}
              onImport={() => openImport("baseline")}
              onSelect={(id) => {
                revealElement(id);
                setTab("review");
                revealReviewSection(".review-grid");
              }}
            />
          )}
          <footer className="page-footer">
            <span>
              TRACE <b>/</b> Evidence before estimates.
            </span>
            <span>
              {model.source === "demo"
                ? "Synthetic example · illustrative USD rates"
                : "Source declarations · user-reviewed assumptions"}
              <i />
              Not a construction estimate or code certification
            </span>
          </footer>
        </main>
      </div>

      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {modal === "import" && (
        <Dialog
          title={
            importTarget === "current"
              ? "Bring your model into focus."
              : "Add a revision baseline."
          }
          onClose={() => {
            request.current?.abort();
            setModal(null);
          }}
        >
          <p className="dialog-intro">
            {importTarget === "current"
              ? "Import an IFC export to start a new review. Your current workspace will be replaced after a successful import."
              : "Choose an earlier export of the same project. Stable GlobalIds make the comparison meaningful."}
          </p>
          <div
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!uploading) chooseFile(e.dataTransfer.files[0]);
            }}
          >
            <div className="upload-icon">
              <Upload size={27} />
            </div>
            <strong>{file ? file.name : "Drop your IFC model here"}</strong>
            <span>IFC2x3 or IFC4 · up to 25 MB / 5,000 elements</span>
            <button
              className="secondary-button"
              disabled={uploading}
              onClick={() => input.current?.click()}
            >
              {file ? "Choose a different file" : "Browse files"}
            </button>
            <input
              ref={input}
              type="file"
              accept=".ifc"
              aria-label="Choose IFC model"
              hidden
              disabled={uploading}
              onChange={(e) => chooseFile(e.target.files?.[0])}
            />
          </div>
          <div className="import-info">
            <ShieldCheck size={18} />
            <p>
              The local IFC service extracts the entire model. Files are deleted
              from the service after parsing; your review stays in this browser.
            </p>
          </div>
          {importError && (
            <p role="alert" className="alert">
              {importError}
            </p>
          )}
          {uploading && (
            <p className="import-progress" role="status">
              <LoaderCircle className="spin" size={17} />
              Reading source quantities and tessellating geometry…
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="text-link"
              disabled={uploading}
              onClick={resetDemo}
            >
              Use example project <ArrowUpRight size={14} />
            </button>
            <button
              className="primary-button"
              disabled={!file || uploading}
              onClick={importModel}
            >
              {uploading
                ? "Importing model…"
                : importTarget === "current"
                  ? "Open model review"
                  : "Compare revisions"}
              <ArrowRight size={16} />
            </button>
          </div>
          <a
            className="sample-download"
            href="/demo/northbank-r02.ifc"
            download
          >
            <ArrowDownToLine size={13} />
            Download the example IFC
          </a>
        </Dialog>
      )}

      {modal === "assumptions" && (
        <AssumptionsDialog
          policy={policy}
          onClose={() => setModal(null)}
          onApply={(next) => {
            setPolicy(next);
            setModal(null);
            setNotice(
              "Assumptions applied to every element and both revisions",
            );
          }}
        />
      )}

      {modal === "backup" && (
        <BackupDialog
          workspace={{ model, baseline, policy, decisions, decisionContext }}
          onClose={() => setModal(null)}
          onRestore={restoreWorkspace}
          onDownload={(content) => {
            download("trace-workspace.trace.json", content, "application/json");
            setNotice("Workspace backup downloaded");
          }}
        />
      )}

      {modal === "export" && (
        <Dialog
          title="A review you can hand over."
          onClose={() => setModal(null)}
        >
          <p className="dialog-intro">
            Keep the evidence attached to the decision. Exports include the
            current assumptions; missing values remain explicit.
          </p>
          <button className="export-option" onClick={exportJson}>
            <span className="export-icon">
              <Fingerprint size={23} />
            </span>
            <span>
              <strong>Evidence record</strong>
              <small>
                Source quantities, unit conversions, rules, notes and revision
                deltas.
              </small>
              <em>JSON · versioned & machine-readable</em>
            </span>
            <ArrowDownToLine size={18} />
          </button>
          <button className="export-option" onClick={exportCsv}>
            <span className="export-icon">
              <Layers3 size={23} />
            </span>
            <span>
              <strong>Quantity schedule</strong>
              <small>
                Every element, its source quantity, mapped rate and known
                allowance.
              </small>
              <em>CSV · spreadsheet-ready</em>
            </span>
            <ArrowDownToLine size={18} />
          </button>
          <div className="import-info">
            <ShieldCheck size={18} />
            <p>
              Review notes acknowledge a finding. They never change the IFC or
              turn missing data into verified data.
            </p>
          </div>
          <button className="text-link" onClick={() => setModal("backup")}>
            Need to reopen this review later? Workspace backups{" "}
            <ArrowUpRight size={14} />
          </button>
        </Dialog>
      )}

      {modal === "method" && (
        <Dialog
          title="Evidence first. Always."
          wide
          onClose={() => setModal(null)}
        >
          <p className="dialog-intro">
            Trace is a pre-estimate review desk for IFC models. It helps you
            explain what can be priced, what is missing, and what changed.
          </p>
          <div className="method-steps">
            <div>
              <span>01</span>
              <section>
                <h3>Read the source, preserve the gaps.</h3>
                <p>
                  IfcOpenShell reads every physical element. Occurrence
                  quantities retain their STEP entity, quantity-set name, raw
                  unit and conversion factor. Missing, ambiguous or invalid
                  values are excluded.
                </p>
              </section>
            </div>
            <div>
              <span>02</span>
              <section>
                <h3>Apply visible, repeatable assumptions.</h3>
                <p>
                  Exact material matches and declared quantities produce a
                  material allowance. Rates are illustrative until you replace
                  them. Labour, installation, waste, tax and unpriced elements
                  are outside the subtotal. Layered assemblies need separate
                  measurement.
                </p>
              </section>
            </div>
            <div>
              <span>03</span>
              <section>
                <h3>Make a decision with its evidence.</h3>
                <p>
                  Inspect findings in 3D, record a review note, and compare
                  revisions by GlobalId. A changed source or rate card reopens
                  notes. No language model calculates quantities, assigns prices
                  or issues compliance verdicts.
                </p>
              </section>
            </div>
          </div>
          <div className="method-scope">
            <h3>What this review does not establish</h3>
            <p>
              IFC quantity declarations are not independently verified
              measurements. Overall door width is not clear opening width. This
              tool does not perform clash detection, IDS validation, code
              certification or professional cost estimation.
            </p>
            <p>
              Models and review notes are stored in this browser. The local API
              deletes temporary uploads. Clearing browser data removes the
              workspace; download a workspace backup to reopen it later.
            </p>
          </div>
          <div className="dialog-actions">
            <button className="text-link" onClick={resetDemo}>
              Restore example project
              <ArrowUpRight size={14} />
            </button>
            <button className="primary-button" onClick={() => setModal(null)}>
              Back to the model
              <ArrowRight size={15} />
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
